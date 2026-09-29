/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
/**
 * End-to-end smoke test for the better-auth hooks (password reset, password
 * changed, email change, account deletion).
 *
 * Verifies against a RUNNING server (default http://localhost:3000):
 *   1. request-password-reset creates a `reset-password:<token>` verification row
 *   2. reset-password with that token succeeds, revokes the old access token
 *      and every better-auth session, and the new password logs in
 *   3. update-password still works and revokes the other device
 *   4. change-email (bearer) is accepted, leaves the email unchanged until
 *      confirmed, and leaves no temporary better-auth session behind
 *   5. delete-account (bearer) creates a `delete-account-<token>` row;
 *      delete-account/confirm removes the user and every session row
 *   6. request-password-reset is throttled at 3 per hour (expects a 429
 *      within the next three calls — rerunning within an hour may trip
 *      this earlier, that is fine)
 *
 * Emails themselves are not asserted; watch the server log (or the mail
 * provider) for `forgotPassword`, `passwordChanged`, `emailChangeConfirmation`
 * and `accountDeletionVerification` sends.
 *
 * Usage:
 *   bun run scripts/smoke-auth-emails.ts
 *   API_URL=https://staging.example.com bun run scripts/smoke-auth-emails.ts
 *
 * Requires DATABASE_URL for the direct DB assertions and to mark the
 * throwaway test user's email as verified.
 */
import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';

const API = process.env.API_URL ?? 'http://localhost:3000';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAIL = `smoke-emails-${Date.now()}@example.com`;
const NEW_EMAIL = `smoke-emails-${Date.now()}-new@example.com`;
const PASSWORD = 'SmokeTest123!';
const RESET_PASSWORD = 'SmokeReset456!';
const CHANGED_PASSWORD = 'SmokeChanged789!';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}`);
    if (detail !== undefined)
      console.error(`        ${JSON.stringify(detail)}`);
  }
}

async function post(path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body: json, raw: text };
}

async function get(path: string, token?: string) {
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json().catch(() => undefined) };
}

async function findVerificationToken(prefix: string, userId: number) {
  const row = await prisma.verification.findFirst({
    where: { identifier: { startsWith: prefix }, value: String(userId) },
    orderBy: { createdAt: 'desc' },
    select: { identifier: true },
  });
  return row ? row.identifier.slice(prefix.length) : undefined;
}

async function betterAuthSessionCount(userId: number) {
  return prisma.session.count({ where: { userId, tokenType: 'session' } });
}

async function cleanup() {
  await prisma.user.deleteMany({
    where: { email: { in: [EMAIL, NEW_EMAIL] } },
  });
}

async function main() {
  console.log(`Auth email hooks smoke test against ${API}`);
  console.log(`Test user: ${EMAIL}\n`);

  // ---------------------------------------------------------------- signup
  console.log('0. Signup + login');
  const signup = await post('/auth/signup', {
    email: EMAIL,
    password: PASSWORD,
    firstName: 'Smoke',
    lastName: 'Emails',
  });
  check('signup succeeds', signup.status === 201, signup.body ?? signup.raw);

  const user = await prisma.user.update({
    where: { email: EMAIL },
    data: { emailVerified: true },
    select: { id: true },
  });
  const userId = user.id;

  const login = await post('/auth/login', { email: EMAIL, password: PASSWORD });
  check('login succeeds', login.status === 200, login.body ?? login.raw);
  if (!login.body?.accessToken) {
    console.error('Cannot continue without an access token');
    await cleanup();
    process.exitCode = 1;
    return;
  }
  const access1: string = login.body.accessToken;

  // ------------------------------------------------------- password reset
  console.log('\n1. Request password reset');
  const reqReset = await post('/auth/request-password-reset', {
    email: EMAIL,
    redirectTo: 'http://localhost:5173/reset-password',
  });
  check(
    'request-password-reset returns 200',
    reqReset.status === 200,
    reqReset.body ?? reqReset.raw,
  );
  const resetToken = await findVerificationToken('reset-password:', userId);
  check('a reset-password verification row exists for the user', !!resetToken);

  console.log('\n2. Reset password with the token');
  const doReset = await post('/auth/reset-password', {
    token: resetToken ?? 'missing',
    newPassword: RESET_PASSWORD,
  });
  check('reset-password returns 200', doReset.status === 200, doReset.body);
  check(
    'the reset token is consumed',
    (await findVerificationToken('reset-password:', userId)) === undefined,
  );
  const reuse = await post('/auth/reset-password', {
    token: resetToken ?? 'missing',
    newPassword: 'Reused999!',
  });
  check('the reset token cannot be reused', reuse.status === 400, reuse.status);
  const meAfterReset = await get('/auth/me', access1);
  check(
    'the old access token is revoked after reset',
    meAfterReset.status === 401,
    meAfterReset.status,
  );
  check(
    'better-auth sessions are revoked after reset',
    (await betterAuthSessionCount(userId)) === 0,
  );
  const oldLogin = await post('/auth/login', {
    email: EMAIL,
    password: PASSWORD,
  });
  check(
    'the old password no longer logs in',
    oldLogin.status === 401,
    oldLogin.status,
  );
  const login2 = await post('/auth/login', {
    email: EMAIL,
    password: RESET_PASSWORD,
  });
  check(
    'the new password logs in',
    login2.status === 200,
    login2.body ?? login2.raw,
  );
  const access2: string = login2.body?.accessToken;

  // ------------------------------------------------------ update password
  console.log('\n3. Update password (authenticated)');
  const login3 = await post('/auth/login', {
    email: EMAIL,
    password: RESET_PASSWORD,
  });
  const accessOther: string = login3.body?.accessToken;
  const update = await post(
    '/auth/update-password',
    { currentPassword: RESET_PASSWORD, newPassword: CHANGED_PASSWORD },
    access2,
  );
  check('update-password returns 200', update.status === 200, update.body);
  check(
    'update-password keeps the current device signed in',
    (await get('/auth/me', access2)).status === 200,
  );
  check(
    'update-password signs out the other device',
    (await get('/auth/me', accessOther)).status === 401,
  );

  // ---------------------------------------------------------- change email
  console.log('\n4. Change email (bearer client)');
  // Each /auth/login above created a better-auth cookie session row; only
  // assert that change-email leaves that number unchanged.
  const sessionsBeforeChange = await betterAuthSessionCount(userId);
  const changeEmail = await post(
    '/auth/change-email',
    { newEmail: NEW_EMAIL },
    access2,
  );
  check(
    'change-email returns 200',
    changeEmail.status === 200,
    changeEmail.body ?? changeEmail.raw,
  );
  const afterChange = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  check(
    'email is unchanged until the confirmation link is used',
    afterChange?.email === EMAIL,
    afterChange,
  );
  check(
    'no temporary better-auth session is left behind',
    (await betterAuthSessionCount(userId)) === sessionsBeforeChange,
  );
  const sameEmail = await post(
    '/auth/change-email',
    { newEmail: EMAIL },
    access2,
  );
  check(
    'change-email to the same address is rejected',
    sameEmail.status === 400,
    sameEmail.status,
  );
  const anon = await post('/auth/change-email', { newEmail: NEW_EMAIL });
  check(
    'change-email without auth is rejected',
    anon.status === 401,
    anon.status,
  );

  // -------------------------------------------------------- delete account
  console.log('\n5. Delete account (bearer client)');
  const reqDelete = await post('/auth/delete-account', {}, access2);
  check(
    'delete-account returns 200',
    reqDelete.status === 200,
    reqDelete.body ?? reqDelete.raw,
  );
  const deleteToken = await findVerificationToken('delete-account-', userId);
  check('a delete-account verification row exists for the user', !!deleteToken);
  check(
    'the user still exists before confirmation',
    (await prisma.user.count({ where: { id: userId } })) === 1,
  );

  const badConfirm = await post(
    '/auth/delete-account/confirm',
    { token: 'not-a-real-token' },
    access2,
  );
  check(
    'confirm with a bad token is rejected',
    badConfirm.status === 400,
    badConfirm.status,
  );
  check(
    'a bad confirm does not delete the user',
    (await prisma.user.count({ where: { id: userId } })) === 1,
  );

  const confirm = await post(
    '/auth/delete-account/confirm',
    { token: deleteToken ?? 'missing' },
    access2,
  );
  check(
    'delete-account/confirm returns 200',
    confirm.status === 200,
    confirm.body ?? confirm.raw,
  );
  check(
    'the user row is gone',
    (await prisma.user.count({ where: { id: userId } })) === 0,
  );
  check(
    'every session row for the user is gone',
    (await prisma.session.count({ where: { userId } })) === 0,
  );
  check(
    'the deleted user cannot log in',
    (await post('/auth/login', { email: EMAIL, password: CHANGED_PASSWORD }))
      .status === 401,
  );

  // ------------------------------------------------------------- throttle
  console.log('\n6. request-password-reset throttling (3/hour)');
  const statuses: number[] = [];
  for (let i = 0; i < 3; i++) {
    statuses.push(
      (await post('/auth/request-password-reset', { email: EMAIL })).status,
    );
  }
  check(
    'a 429 is returned once the hourly limit is reached',
    statuses.includes(429),
    statuses,
  );

  // -------------------------------------------------------------- cleanup
  console.log('\nCleaning up test user');
  await cleanup();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error('Smoke test crashed:', e);
    await cleanup().catch(() => {});
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
