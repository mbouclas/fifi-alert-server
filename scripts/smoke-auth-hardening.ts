/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
/**
 * End-to-end smoke test for the auth hardening release.
 *
 * Verifies against a RUNNING server (default http://localhost:3000):
 *   1. login returns the four token fields and no `session`
 *   2. the access token works on /auth/me
 *   3. refresh rotates: new access AND new refresh token
 *   4. the old refresh token is rejected (401)
 *   5. the new access token still works
 *   6. logout revokes both tokens
 *   7. logout-all revokes every session
 *   8. changing the password revokes other devices but not the current one
 *   9. access/refresh rows in the DB hold a SHA-256 hash, never the raw JWT
 *
 * Usage:
 *   bun run scripts/smoke-auth-hardening.ts
 *   API_URL=https://staging.example.com bun run scripts/smoke-auth-hardening.ts
 *
 * Requires DATABASE_URL for the direct DB assertions (step 9) and to mark the
 * throwaway test user's email as verified.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';

const API = process.env.API_URL ?? 'http://localhost:3000';

// The generated client requires a driver adapter, same as PrismaService.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAIL = `smoke-auth-${Date.now()}@example.com`;
const PASSWORD = 'SmokeTest123!';
const NEW_PASSWORD = 'SmokeTest456!';

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

async function main() {
  console.log(`Auth hardening smoke test against ${API}`);
  console.log(`Test user: ${EMAIL}\n`);

  // ---------------------------------------------------------------- signup
  console.log('1. Signup + login');
  const signup = await post('/auth/signup', {
    email: EMAIL,
    password: PASSWORD,
    firstName: 'Smoke',
    lastName: 'Test',
  });
  check('signup succeeds', signup.status === 201, signup.body ?? signup.raw);

  // Login is blocked until the email is verified; flip the flag directly.
  await prisma.user.update({
    where: { email: EMAIL },
    data: { emailVerified: true },
  });

  const login = await post('/auth/login', { email: EMAIL, password: PASSWORD });
  check('login succeeds', login.status === 200, login.body ?? login.raw);
  check('login returns accessToken', !!login.body?.accessToken);
  check('login returns refreshToken', !!login.body?.refreshToken);
  check('login returns expiresAt', !!login.body?.expiresAt);
  check('login returns refreshExpiresAt', !!login.body?.refreshExpiresAt);
  check(
    'login does NOT return session.token',
    login.body?.session === undefined,
    login.body?.session,
  );

  if (!login.body?.accessToken) {
    console.error('\nCannot continue without tokens.');
    return;
  }

  const access1: string = login.body.accessToken;
  const refresh1: string = login.body.refreshToken;

  // ------------------------------------------------------------- hashing
  console.log('\n2. Tokens are hashed at rest');
  const rawRow = await prisma.session.findFirst({
    where: { token: access1 },
  });
  check('raw access JWT is NOT present in session.token', rawRow === null);

  const hashedRow = await prisma.session.findUnique({
    where: { token: createHash('sha256').update(access1).digest('hex') },
  });
  check('SHA-256 hash of the access token IS present', hashedRow !== null);
  check(
    'stored token is 64-char hex',
    /^[0-9a-f]{64}$/.test(hashedRow?.token ?? ''),
    hashedRow?.token,
  );

  // ------------------------------------------------------------------ me
  console.log('\n3. Access token works');
  const me1 = await get('/auth/me', access1);
  check('GET /auth/me returns 200', me1.status === 200, me1.body);
  check('GET /auth/me returns the right user', me1.body?.email === EMAIL);

  // ------------------------------------------------------------- rotation
  console.log('\n4. Refresh rotates the token pair');
  const refreshed = await post('/auth/refresh-token', {
    refreshToken: refresh1,
  });
  check('refresh returns 200', refreshed.status === 200, refreshed.body);
  check('refresh returns a new accessToken', !!refreshed.body?.accessToken);
  check('refresh returns a new refreshToken', !!refreshed.body?.refreshToken);
  check(
    'the returned refreshToken DIFFERS from the one sent',
    refreshed.body?.refreshToken !== refresh1,
  );
  check('refresh returns refreshExpiresAt', !!refreshed.body?.refreshExpiresAt);

  const access2: string = refreshed.body?.accessToken;
  const refresh2: string = refreshed.body?.refreshToken;

  console.log('\n5. Old refresh token is dead, new one works');
  const reuse = await post('/auth/refresh-token', { refreshToken: refresh1 });
  check('reusing the old refresh token returns 401', reuse.status === 401, {
    status: reuse.status,
    body: reuse.body,
  });

  const me2 = await get('/auth/me', access2);
  check('the new access token works', me2.status === 200, me2.body);

  // --------------------------------------------------------------- logout
  console.log('\n6. Logout revokes both tokens');
  const logout = await post(
    '/auth/logout',
    { refreshToken: refresh2 },
    access2,
  );
  check('logout returns 200', logout.status === 200, logout.body);

  const meAfterLogout = await get('/auth/me', access2);
  check(
    'access token is rejected after logout',
    meAfterLogout.status === 401,
    meAfterLogout.status,
  );

  const refreshAfterLogout = await post('/auth/refresh-token', {
    refreshToken: refresh2,
  });
  check(
    'refresh token is rejected after logout',
    refreshAfterLogout.status === 401,
    refreshAfterLogout.status,
  );

  // ----------------------------------------------------------- logout-all
  console.log('\n7. Logout-all revokes every session');
  const loginA = await post('/auth/login', {
    email: EMAIL,
    password: PASSWORD,
  });
  const loginB = await post('/auth/login', {
    email: EMAIL,
    password: PASSWORD,
  });
  check(
    'two fresh logins succeed',
    loginA.status === 200 && loginB.status === 200,
  );

  const logoutAll = await post(
    '/auth/logout-all',
    undefined,
    loginA.body?.accessToken,
  );
  check('logout-all returns 200', logoutAll.status === 200, logoutAll.body);
  check(
    'logout-all reports a revokedCount',
    typeof logoutAll.body?.revokedCount === 'number',
    logoutAll.body,
  );

  const meA = await get('/auth/me', loginA.body?.accessToken);
  const meB = await get('/auth/me', loginB.body?.accessToken);
  check('session A is revoked', meA.status === 401, meA.status);
  check('session B is revoked too', meB.status === 401, meB.status);

  // ------------------------------------------------------ password change
  console.log('\n8. Password change signs out other devices only');
  const deviceA = await post('/auth/login', {
    email: EMAIL,
    password: PASSWORD,
  });
  const deviceB = await post('/auth/login', {
    email: EMAIL,
    password: PASSWORD,
  });
  check(
    'two devices logged in',
    deviceA.status === 200 && deviceB.status === 200,
  );

  const change = await post(
    '/auth/update-password',
    { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    deviceA.body?.accessToken,
  );
  check('password change returns 200', change.status === 200, change.body);
  check(
    'password change reports revokedSessions',
    typeof change.body?.revokedSessions === 'number',
    change.body,
  );

  const meDeviceA = await get('/auth/me', deviceA.body?.accessToken);
  const meDeviceB = await get('/auth/me', deviceB.body?.accessToken);
  check(
    'the device that changed the password stays signed in',
    meDeviceA.status === 200,
    meDeviceA.status,
  );
  check(
    'the other device is signed out',
    meDeviceB.status === 401,
    meDeviceB.status,
  );

  // -------------------------------------------------------------- cleanup
  console.log('\nCleaning up test user');
  await prisma.user.deleteMany({ where: { email: EMAIL } });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error('Smoke test crashed:', e);
    await prisma.user.deleteMany({ where: { email: EMAIL } }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
