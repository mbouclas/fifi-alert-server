/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
/**
 * Smoke test for POST /auth/social (Google / Facebook sign-in).
 *
 * Runs against a live server:
 *   API_URL=http://localhost:3113 bun run scripts/smoke-social-login.ts
 *
 * Without provider tokens it only checks validation and rejection paths.
 * Supply real tokens to exercise the full round trip:
 *   GOOGLE_TEST_ID_TOKEN=<id token from the web app / GIS one-tap>
 *   FACEBOOK_TEST_ACCESS_TOKEN=<user access token from the Graph API Explorer for our app>
 *   SOCIAL_TEST_EMAIL=<email of the Google/Facebook test account>  (optional, enables the
 *     "links to an existing credentials user" check: the script pre-creates a password user
 *     with that email and expects the social sign-in to reuse it)
 *
 * Rows created for the test email are deleted at the end unless KEEP_TEST_USER=1.
 */
import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';

const API = (process.env.API_URL || 'http://localhost:3113').replace(/\/$/, '');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const GOOGLE_TOKEN = process.env.GOOGLE_TEST_ID_TOKEN;
const FACEBOOK_TOKEN = process.env.FACEBOOK_TEST_ACCESS_TOKEN;
const TEST_EMAIL = process.env.SOCIAL_TEST_EMAIL?.toLowerCase();

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
    json = text;
  }
  return { status: res.status, json };
}

async function get(path: string, token?: string) {
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  let json: any = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function providerConfigured(provider: string): Promise<boolean> {
  // A garbage token on a configured provider is 401; unconfigured is 503.
  const r = await post('/auth/social', {
    provider,
    token: 'definitely-not-a-valid-token',
  });
  return r.status !== 503;
}

async function fullRoundTrip(
  provider: 'google' | 'facebook',
  body: Record<string, unknown>,
) {
  console.log(`\n${provider}: full round trip`);

  let preExistingUserId: number | undefined;
  if (TEST_EMAIL) {
    const existing = await prisma.user.findUnique({
      where: { email: TEST_EMAIL },
    });
    if (!existing) {
      const signup = await post('/auth/signup', {
        email: TEST_EMAIL,
        password: 'SmokeTest123!',
        firstName: 'Smoke',
        lastName: 'Social',
      });
      check(
        'pre-created credentials user for linking check',
        signup.status === 201 || signup.status === 200,
        signup.json,
      );
    }
    preExistingUserId = (
      await prisma.user.findUnique({ where: { email: TEST_EMAIL } })
    )?.id;
  }

  const first = await post('/auth/social', { provider, ...body });
  check(
    'returns 200 with JWT pair',
    first.status === 200 &&
      !!first.json?.accessToken &&
      !!first.json?.refreshToken,
    first.json,
  );
  if (first.status !== 200) return;

  const userId = Number(first.json.user.id);
  const email = String(first.json.user.email).toLowerCase();
  check(
    'response omits better-auth session token',
    first.json.session === undefined,
  );

  const account = await prisma.account.findFirst({
    where: { userId, providerId: provider },
  });
  check(`account row exists for ${provider}`, !!account, account);

  const roles = await prisma.userRole.findMany({ where: { user_id: userId } });
  check('user has at least one role (default role assigned)', roles.length > 0);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  check(
    'user emailVerified is true',
    user?.emailVerified === true,
    user?.emailVerified,
  );

  if (preExistingUserId !== undefined) {
    check(
      'linked to the pre-existing credentials user (no duplicate)',
      userId === preExistingUserId,
      { userId, preExistingUserId },
    );
    const cred = await prisma.account.findFirst({
      where: { userId, providerId: 'credential' },
    });
    check('credential account still attached', !!cred);
  }

  const me = await get('/auth/me', first.json.accessToken);
  check(
    'JWT works against /auth/me',
    me.status === 200 &&
      String(me.json?.email ?? me.json?.user?.email).toLowerCase() === email,
    me.json,
  );

  const second = await post('/auth/social', { provider, ...body });
  check(
    'second sign-in reuses the same user',
    second.status === 200 && Number(second.json?.user?.id) === userId,
    second.json,
  );
  const accounts = await prisma.account.count({
    where: { providerId: provider, accountId: account?.accountId },
  });
  check(
    'still exactly one account row for this provider identity',
    accounts === 1,
    accounts,
  );

  if (!process.env.KEEP_TEST_USER) {
    await prisma.user.delete({ where: { id: userId } });
    console.log(`  cleaned up user ${userId}`);
  }
}

async function main() {
  console.log(`Social login smoke test against ${API}\n`);

  console.log('1. Validation');
  const badProvider = await post('/auth/social', {
    provider: 'github',
    token: 'x'.repeat(20),
  });
  check(
    'unknown provider -> 400',
    badProvider.status === 400,
    badProvider.json,
  );
  const noToken = await post('/auth/social', { provider: 'google' });
  check('missing token -> 400', noToken.status === 400, noToken.json);

  console.log('\n2. Rejection of invalid tokens');
  for (const provider of ['google', 'facebook'] as const) {
    const configured = await providerConfigured(provider);
    if (!configured) {
      console.log(`  SKIP  ${provider} not configured on server (503)`);
      continue;
    }
    const garbage = await post('/auth/social', {
      provider,
      token: 'garbage.token.value',
    });
    check(
      `${provider}: garbage JWT -> 401`,
      garbage.status === 401,
      garbage.json,
    );
    const opaque = await post('/auth/social', {
      provider,
      token: 'EAAB' + 'x'.repeat(40),
      accessToken: 'EAAB' + 'x'.repeat(40),
    });
    check(
      `${provider}: bogus opaque token -> 401`,
      opaque.status === 401,
      opaque.json,
    );
    check(
      `${provider}: error body never echoes the token`,
      !JSON.stringify(garbage.json).includes('garbage.token'),
    );
  }

  if (GOOGLE_TOKEN) {
    await fullRoundTrip('google', { token: GOOGLE_TOKEN });
  } else {
    console.log('\n  SKIP  google round trip (set GOOGLE_TEST_ID_TOKEN)');
  }
  if (FACEBOOK_TOKEN) {
    await fullRoundTrip('facebook', {
      token: FACEBOOK_TOKEN,
      accessToken: FACEBOOK_TOKEN,
    });
  } else {
    console.log('  SKIP  facebook round trip (set FACEBOOK_TEST_ACCESS_TOKEN)');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
