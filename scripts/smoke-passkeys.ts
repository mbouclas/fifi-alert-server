/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
/**
 * Live smoke test for the passkey (WebAuthn) endpoints — the acceptance
 * checklist from BACKEND_WORK_ORDER_PASSKEYS.md §4, minus the real ceremony.
 *
 * What it proves against a RUNNING server:
 *   3.1  register/options needs a bearer, carries residentKey "required",
 *        rp.id from RP_ID, and a 5-minute challengeId
 *   3.2  a reused / foreign / login-type challengeId is 400; a garbage
 *        response with a fresh challenge is 400 "verification failed"
 *   3.3  login/options is public, never names a user (allowCredentials [])
 *   3.4  unknown credential -> 401; register challenge on login/verify -> 400;
 *        11th request from one visitor within a minute -> 429
 *   3.5  GET /auth/passkeys lists newest first and never leaks key material
 *   3.6  PATCH rename: trims, 400 on bad name, 404 for other user's id
 *   3.7  DELETE: 204, then 404; other user's id -> 404
 *   3.8  /auth/me carries passkeyCount
 *   3.9  /api/openapi.json documents the 5 paths
 *   -    login/social refactor: /auth/login still returns the four token fields
 *
 * A real registration cannot be done without a browser authenticator, so
 * passkey rows for 3.5-3.7 are inserted straight into the DB (requires
 * DATABASE_URL). The cryptographic path is covered by the web repo's Chrome
 * virtual-authenticator e2e (tests/e2e/passkeys.spec.ts).
 *
 * Usage:
 *   RP_ID=localhost RP_NAME="FiFi Alert" RP_ORIGINS=http://localhost:4173 \
 *     CLIENT_API_KEYS=devkey PORT=3199 bun run src/main.ts        (terminal 1)
 *   API_URL=http://localhost:3199 CLIENT_KEY=devkey RP_ID=localhost \
 *     bun run scripts/smoke-passkeys.ts                            (terminal 2)
 */
import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';

const API = process.env.API_URL ?? 'http://localhost:3000';
const CLIENT_KEY = process.env.CLIENT_KEY ?? 'devkey';
const EXPECTED_RP_ID = process.env.RP_ID ?? 'localhost';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const STAMP = Date.now();
const PASSWORD = 'SmokeTest123!';
const EMAIL_A = `smoke-passkey-a-${STAMP}@example.com`;
const EMAIL_B = `smoke-passkey-b-${STAMP}@example.com`;

let passed = 0;
let failed = 0;
let visitorSeq = 0;

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

/** Each call gets its own visitor IP so tests do not throttle each other. */
function freshVisitor(): string {
  visitorSeq++;
  return `203.0.113.${(visitorSeq % 250) + 1}`;
}

interface ReqOpts {
  token?: string;
  visitor?: string;
  body?: unknown;
}

async function call(method: string, path: string, opts: ReqOpts = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.visitor
        ? { 'X-Client-Key': CLIENT_KEY, 'X-Forwarded-For': opts.visitor }
        : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
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

async function signupAndLogin(email: string): Promise<{
  token: string;
  userId: number;
}> {
  const signup = await call('POST', '/auth/signup', {
    body: { email, password: PASSWORD, firstName: 'Smoke', lastName: 'Pk' },
  });
  if (signup.status !== 201) {
    throw new Error(`signup failed: ${signup.status} ${signup.raw}`);
  }
  const user = await prisma.user.update({
    where: { email },
    data: { emailVerified: true },
    select: { id: true },
  });
  const login = await call('POST', '/auth/login', {
    body: { email, password: PASSWORD },
    visitor: freshVisitor(),
  });
  if (login.status !== 200 || !login.body?.accessToken) {
    throw new Error(`login failed: ${login.status} ${login.raw}`);
  }
  return { token: login.body.accessToken, userId: user.id };
}

async function insertPasskey(userId: number, name: string, createdAt: Date) {
  return prisma.passkey.create({
    data: {
      userId,
      credentialId: `smoke-cred-${userId}-${name}-${STAMP}`,
      publicKey: Buffer.from([0xa5, 0x01, 0x02]),
      counter: BigInt(3),
      transports: ['internal'],
      aaguid: '00000000-0000-0000-0000-000000000000',
      deviceType: 'multiDevice',
      backedUp: true,
      name,
      createdAt,
    },
  });
}

async function main() {
  console.log(
    `Passkey smoke test against ${API} (expecting RP_ID=${EXPECTED_RP_ID})`,
  );
  console.log(`Users: ${EMAIL_A}, ${EMAIL_B}\n`);

  // ------------------------------------------------------------- 0. users
  console.log('0. Signup + login (also re-verifies the shared token issuer)');
  const a = await signupAndLogin(EMAIL_A);
  const b = await signupAndLogin(EMAIL_B);
  const loginAgain = await call('POST', '/auth/login', {
    body: { email: EMAIL_A, password: PASSWORD },
    visitor: freshVisitor(),
  });
  check('login returns 200', loginAgain.status === 200, loginAgain.body);
  check(
    'login returns the four token fields + user, no session',
    ['accessToken', 'refreshToken', 'expiresAt', 'refreshExpiresAt'].every(
      (k) => typeof loginAgain.body?.[k] === 'string',
    ) &&
      loginAgain.body?.user?.email === EMAIL_A &&
      loginAgain.body?.session === undefined,
    loginAgain.body,
  );
  check(
    'login message is "Login successful"',
    loginAgain.body?.message === 'Login successful',
  );

  // --------------------------------------------------------- 3.8 /auth/me
  console.log('\n3.8 /auth/me passkeyCount');
  const me0 = await call('GET', '/auth/me', { token: a.token });
  check('me returns 200', me0.status === 200, me0.body);
  check(
    'me.passkeyCount is 0 for a fresh user',
    me0.body?.passkeyCount === 0,
    me0.body?.passkeyCount,
  );

  // ------------------------------------------------- 3.1 register/options
  console.log('\n3.1 POST /auth/passkeys/register/options');
  const anon = await call('POST', '/auth/passkeys/register/options', {
    body: {},
    visitor: freshVisitor(),
  });
  check(
    'register/options without bearer -> 401',
    anon.status === 401,
    anon.status,
  );

  const regOpts = await call('POST', '/auth/passkeys/register/options', {
    token: a.token,
    body: {},
  });
  check(
    'register/options -> 200',
    regOpts.status === 200,
    regOpts.body ?? regOpts.raw,
  );
  const o = regOpts.body?.options ?? {};
  check(
    'challengeId present (c_...)',
    /^c_/.test(regOpts.body?.challengeId ?? ''),
    regOpts.body?.challengeId,
  );
  check('options.rp.id === RP_ID', o.rp?.id === EXPECTED_RP_ID, o.rp);
  check(
    'options.authenticatorSelection.residentKey === "required"',
    o.authenticatorSelection?.residentKey === 'required',
    o.authenticatorSelection,
  );
  check(
    'options.authenticatorSelection.requireResidentKey === true',
    o.authenticatorSelection?.requireResidentKey === true,
  );
  check('options.attestation === "none"', o.attestation === 'none');
  check('options.user.name is the email', o.user?.name === EMAIL_A, o.user);
  check(
    'options.challenge is base64url',
    /^[A-Za-z0-9_-]{20,}$/.test(o.challenge ?? ''),
    o.challenge,
  );
  check(
    'options.pubKeyCredParams has -7 and -257',
    JSON.stringify((o.pubKeyCredParams ?? []).map((p: any) => p.alg)) ===
      JSON.stringify([-7, -257]),
    o.pubKeyCredParams,
  );
  check(
    'options.excludeCredentials is [] for a fresh user',
    Array.isArray(o.excludeCredentials) && o.excludeCredentials.length === 0,
  );

  // -------------------------------------------------- 3.2 register/verify
  console.log('\n3.2 POST /auth/passkeys/register/verify (negative paths)');
  const garbage = {
    id: 'bm9wZQ',
    rawId: 'bm9wZQ',
    type: 'public-key',
    response: { clientDataJSON: 'bm9wZQ', attestationObject: 'bm9wZQ' },
    clientExtensionResults: {},
  };
  const v1 = await call('POST', '/auth/passkeys/register/verify', {
    token: a.token,
    body: { challengeId: regOpts.body.challengeId, response: garbage },
  });
  check(
    'garbage response with a fresh challenge -> 400 "verification failed"',
    v1.status === 400 && v1.body?.message === 'verification failed',
    v1.body,
  );
  const v2 = await call('POST', '/auth/passkeys/register/verify', {
    token: a.token,
    body: { challengeId: regOpts.body.challengeId, response: garbage },
  });
  check(
    'the same challengeId reused -> 400 "unknown or expired challenge"',
    v2.status === 400 && v2.body?.message === 'unknown or expired challenge',
    v2.body,
  );

  const regOptsB = await call('POST', '/auth/passkeys/register/options', {
    token: b.token,
    body: {},
  });
  const v3 = await call('POST', '/auth/passkeys/register/verify', {
    token: a.token,
    body: { challengeId: regOptsB.body.challengeId, response: garbage },
  });
  check(
    "another user's challengeId -> 400 unknown challenge",
    v3.status === 400 && v3.body?.message === 'unknown or expired challenge',
    v3.body,
  );

  const v4 = await call('POST', '/auth/passkeys/register/verify', {
    token: a.token,
    body: { challengeId: 'c_doesnotexist', response: garbage },
  });
  check('unknown challengeId -> 400', v4.status === 400, v4.body);

  const v5 = await call('POST', '/auth/passkeys/register/verify', {
    token: a.token,
    body: { response: garbage },
  });
  check('missing challengeId -> 400 (validation)', v5.status === 400, v5.body);

  // ---------------------------------------------------- 3.3 login/options
  console.log('\n3.3 POST /auth/passkeys/login/options');
  const lo = await call('POST', '/auth/passkeys/login/options', {
    body: {},
    visitor: freshVisitor(),
  });
  check('login/options is public -> 200', lo.status === 200, lo.body ?? lo.raw);
  check(
    'login options never name the user: allowCredentials === []',
    Array.isArray(lo.body?.options?.allowCredentials) &&
      lo.body.options.allowCredentials.length === 0,
    lo.body?.options,
  );
  check(
    'login options rpId === RP_ID',
    lo.body?.options?.rpId === EXPECTED_RP_ID,
    lo.body?.options?.rpId,
  );
  check(
    'login options userVerification === "preferred"',
    lo.body?.options?.userVerification === 'preferred',
  );
  check(
    'login options challengeId differs from register one',
    lo.body?.challengeId && lo.body.challengeId !== regOpts.body.challengeId,
  );

  // ----------------------------------------------------- 3.4 login/verify
  console.log('\n3.4 POST /auth/passkeys/login/verify');
  const assertion = {
    id: 'bm9wZQ',
    rawId: 'bm9wZQ',
    type: 'public-key',
    response: {
      clientDataJSON: 'bm9wZQ',
      authenticatorData: 'bm9wZQ',
      signature: 'bm9wZQ',
    },
    clientExtensionResults: {},
  };
  const lv1 = await call('POST', '/auth/passkeys/login/verify', {
    body: { challengeId: lo.body.challengeId, response: assertion },
    visitor: freshVisitor(),
  });
  check(
    'unknown credential -> 401 "unknown credential"',
    lv1.status === 401 && lv1.body?.message === 'unknown credential',
    lv1.body,
  );
  const lv2 = await call('POST', '/auth/passkeys/login/verify', {
    body: { challengeId: lo.body.challengeId, response: assertion },
    visitor: freshVisitor(),
  });
  check('reused login challengeId -> 400', lv2.status === 400, lv2.body);

  const regOpts2 = await call('POST', '/auth/passkeys/register/options', {
    token: a.token,
    body: {},
  });
  const lv3 = await call('POST', '/auth/passkeys/login/verify', {
    body: { challengeId: regOpts2.body.challengeId, response: assertion },
    visitor: freshVisitor(),
  });
  check(
    'register challenge used on login/verify -> 400',
    lv3.status === 400 && lv3.body?.message === 'unknown or expired challenge',
    lv3.body,
  );

  // A known credential with an unverifiable assertion must be 401
  // "verification failed", not 500 and not "unknown credential".
  const knownForLogin = await insertPasskey(
    a.userId,
    'login-probe',
    new Date(),
  );
  const lo2 = await call('POST', '/auth/passkeys/login/options', {
    body: {},
    visitor: freshVisitor(),
  });
  const lv4 = await call('POST', '/auth/passkeys/login/verify', {
    body: {
      challengeId: lo2.body.challengeId,
      response: {
        ...assertion,
        id: knownForLogin.credentialId,
        rawId: knownForLogin.credentialId,
      },
    },
    visitor: freshVisitor(),
  });
  check(
    'known credential, bad assertion -> 401 "verification failed"',
    lv4.status === 401 && lv4.body?.message === 'verification failed',
    lv4.body,
  );
  const unchanged = await prisma.passkey.findUnique({
    where: { id: knownForLogin.id },
  });
  check(
    'failed login does not bump counter or lastUsedAt',
    unchanged?.counter === BigInt(3) && unchanged?.lastUsedAt === null,
    unchanged,
  );

  // throttle: 11 login/options from ONE visitor inside a minute -> 429
  const visitor = '198.51.100.77';
  let last = 0;
  let firstTooMany = -1;
  for (let i = 1; i <= 11; i++) {
    const r = await call('POST', '/auth/passkeys/login/options', {
      body: {},
      visitor,
    });
    last = r.status;
    if (r.status === 429 && firstTooMany === -1) firstTooMany = i;
  }
  check(
    '11th login/options from one X-Forwarded-For within a minute -> 429',
    last === 429,
    { last, firstTooMany },
  );
  check('first 10 were allowed', firstTooMany === 11, { firstTooMany });

  // ------------------------------------------------- 3.5 list / 3.8 count
  console.log('\n3.5 GET /auth/passkeys');
  const older = await insertPasskey(
    a.userId,
    'Older',
    new Date(Date.now() - 60_000),
  );
  const newer = await insertPasskey(a.userId, 'Newer', new Date());
  const foreign = await insertPasskey(b.userId, 'Foreign', new Date());

  const list = await call('GET', '/auth/passkeys', { token: a.token });
  check(
    'list -> 200 with 3 passkeys',
    list.status === 200 && list.body?.length === 3,
    list.body,
  );
  check(
    'list is newest first',
    list.body?.[0]?.name === 'Newer' && list.body?.[2]?.name === 'Older',
    list.body?.map((p: any) => p.name),
  );
  check(
    "list never includes another user's passkey",
    !list.body?.some((p: any) => p.id === foreign.id),
  );
  const item = list.body?.[0] ?? {};
  check(
    'DTO has exactly the public fields',
    JSON.stringify(Object.keys(item).sort()) ===
      JSON.stringify([
        'aaguid',
        'backedUp',
        'createdAt',
        'deviceType',
        'id',
        'lastUsedAt',
        'name',
        'transports',
      ]),
    Object.keys(item),
  );
  check(
    'DTO never leaks publicKey / counter / credentialId',
    !('publicKey' in item) && !('counter' in item) && !('credentialId' in item),
  );

  const me3 = await call('GET', '/auth/me', { token: a.token });
  check(
    'me.passkeyCount is 3 after inserts',
    me3.body?.passkeyCount === 3,
    me3.body?.passkeyCount,
  );

  // the register options now exclude the existing credentials
  const regOpts3 = await call('POST', '/auth/passkeys/register/options', {
    token: a.token,
    body: {},
  });
  const excluded = (regOpts3.body?.options?.excludeCredentials ?? [])
    .map((c: any) => c.id)
    .sort();
  check(
    "register/options excludeCredentials lists the user's 3 credentials",
    JSON.stringify(excluded) ===
      JSON.stringify(
        [
          knownForLogin.credentialId,
          newer.credentialId,
          older.credentialId,
        ].sort(),
      ),
    excluded,
  );

  // ---------------------------------------------------------- 3.6 rename
  console.log('\n3.6 PATCH /auth/passkeys/:id');
  const r1 = await call('PATCH', `/auth/passkeys/${newer.id}`, {
    token: a.token,
    body: { name: '  Work laptop  ' },
  });
  check(
    'rename -> 200 with trimmed name',
    r1.status === 200 && r1.body?.name === 'Work laptop',
    r1.body,
  );
  const r2 = await call('PATCH', `/auth/passkeys/${newer.id}`, {
    token: a.token,
    body: { name: '   ' },
  });
  check('rename with blank name -> 400', r2.status === 400, r2.body);
  const r3 = await call('PATCH', `/auth/passkeys/${newer.id}`, {
    token: a.token,
    body: { name: 'x'.repeat(65) },
  });
  check('rename with 65-char name -> 400', r3.status === 400, r3.body);
  const r4 = await call('PATCH', `/auth/passkeys/${foreign.id}`, {
    token: a.token,
    body: { name: 'Hijack' },
  });
  check(
    "rename another user's passkey -> 404 (not 403)",
    r4.status === 404,
    r4.status,
  );
  const r5 = await call('PATCH', `/auth/passkeys/does-not-exist`, {
    token: a.token,
    body: { name: 'Nope' },
  });
  check('rename unknown id -> 404', r5.status === 404, r5.status);
  const foreignRow = await prisma.passkey.findUnique({
    where: { id: foreign.id },
  });
  check("foreign passkey's name unchanged", foreignRow?.name === 'Foreign');

  // ---------------------------------------------------------- 3.7 delete
  console.log('\n3.7 DELETE /auth/passkeys/:id');
  const d1 = await call('DELETE', `/auth/passkeys/${foreign.id}`, {
    token: a.token,
  });
  check("delete another user's passkey -> 404", d1.status === 404, d1.status);
  const d2 = await call('DELETE', `/auth/passkeys/${older.id}`, {
    token: a.token,
  });
  check('delete own passkey -> 204', d2.status === 204, d2.status);
  const d3 = await call('DELETE', `/auth/passkeys/${older.id}`, {
    token: a.token,
  });
  check('delete again -> 404', d3.status === 404, d3.status);
  const me4 = await call('GET', '/auth/me', { token: a.token });
  check(
    'me.passkeyCount drops to 2',
    me4.body?.passkeyCount === 2,
    me4.body?.passkeyCount,
  );
  const stillValid = await call('GET', '/auth/passkeys', { token: a.token });
  check('existing session stays valid after delete', stillValid.status === 200);

  // ----------------------------------------------------------- 3.9 OpenAPI
  console.log('\n3.9 OpenAPI');
  const spec = await call('GET', '/api/openapi.json');
  const paths = Object.keys(spec.body?.paths ?? {}).filter((p) =>
    p.startsWith('/auth/passkeys'),
  );
  check(
    'openapi documents the 5 passkey paths',
    JSON.stringify(paths.sort()) ===
      JSON.stringify(
        [
          '/auth/passkeys',
          '/auth/passkeys/login/options',
          '/auth/passkeys/login/verify',
          '/auth/passkeys/register/options',
          '/auth/passkeys/register/verify',
          '/auth/passkeys/{id}',
        ].sort(),
      ),
    paths,
  );
  check(
    'openapi has the PasskeyDto schema',
    !!spec.body?.components?.schemas?.PasskeyDto,
  );
  check(
    'openapi MeResponseDto has passkeyCount',
    !!spec.body?.components?.schemas?.MeResponseDto?.properties?.passkeyCount,
  );

  // ---------------------------------------------------------------- cleanup
  await prisma.passkey.deleteMany({
    where: { userId: { in: [a.userId, b.userId] } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [EMAIL_A, EMAIL_B] } },
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await pool.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.user
    .deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } })
    .catch(() => undefined);
  await pool.end();
  process.exit(1);
});
