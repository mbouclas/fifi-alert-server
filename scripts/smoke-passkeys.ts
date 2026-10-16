/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
/**
 * Live end-to-end test for the passkey (WebAuthn) endpoints: the acceptance
 * checklist from BACKEND_WORK_ORDER_PASSKEYS.md §4 PLUS a real ceremony.
 *
 * A software ES256 authenticator (WebCrypto, hand-rolled CBOR) performs a
 * genuine registration and sign-in, so these are proven against a RUNNING
 * server, not mocks:
 *   3.1  register/options: bearer only, residentKey "required", rp.id = RP_ID
 *   3.2  register/verify: real attestation -> 201; same credential again ->
 *        409; replayed challengeId -> 400; another user's / login-type /
 *        unknown / EXPIRED challengeId -> 400; wrong origin or RP ID -> 400
 *   3.3  login/options: public, allowCredentials always []
 *   3.4  login/verify: real assertion -> 200 with the /auth/login body,
 *        counter bumped, lastUsedAt set; wrong origin / wrong RP ID / counter
 *        regression / bad signature -> 401; unknown credential -> 401;
 *        register-type / replayed / expired challenge -> 400; unverified
 *        email -> 403 with counter and lastUsedAt UNTOUCHED; 11th request
 *        from one visitor -> 429
 *   3.5  GET lists newest first, never leaks key material
 *   3.6  PATCH trims, 400 on bad name, 404 for another user's id
 *   3.7  DELETE 204 then 404, 404 for another user's id
 *   3.8  /auth/me.passkeyCount
 *   3.9  /api/openapi.json documents the paths
 *
 * Challenge expiry is forced through Redis (DEL of the stored key) rather than
 * by waiting 5 minutes, so REDIS_HOST/PORT/PASSWORD/DB must point at the same
 * Redis the server uses. DATABASE_URL is needed to verify the user's email and
 * to read the counter back.
 *
 * Usage:
 *   RP_ID=localhost RP_NAME="FiFi Alert" RP_ORIGINS=http://localhost:4173 \
 *     CLIENT_API_KEYS=devkey PORT=3199 bun run src/main.ts        (terminal 1)
 *   API_URL=http://localhost:3199 CLIENT_KEY=devkey RP_ID=localhost \
 *     RP_ORIGIN=http://localhost:4173 bun run scripts/smoke-passkeys.ts
 */
import 'dotenv/config';
import { createHash, webcrypto } from 'node:crypto';
import Redis from 'ioredis';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';

const API = process.env.API_URL ?? 'http://localhost:3000';
const CLIENT_KEY = process.env.CLIENT_KEY ?? 'devkey';
const EXPECTED_RP_ID = process.env.RP_ID ?? 'localhost';
const ORIGIN = process.env.RP_ORIGIN ?? 'http://localhost:4173';
const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB ?? 0),
});
const CHALLENGE_KEY_PREFIX = 'passkey:challenge:';

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

// --------------------------------------------------------- authenticator
// Minimal software authenticator: one ES256 key, UP flag only, counter under
// test control. Produces the exact JSON shapes @simplewebauthn/browser would.

const subtle = webcrypto.subtle;

function b64url(bytes: Uint8Array | ArrayBuffer | Buffer): string {
  return Buffer.from(bytes as Uint8Array).toString('base64url');
}
function sha256(data: Uint8Array | string): Buffer {
  return createHash('sha256').update(data).digest();
}
function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
/** CBOR byte string (length < 65536). */
function cborBstr(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 24)
    return concat(new Uint8Array([0x40 + bytes.length]), bytes);
  if (bytes.length < 256)
    return concat(new Uint8Array([0x58, bytes.length]), bytes);
  return concat(
    new Uint8Array([0x59, bytes.length >> 8, bytes.length & 0xff]),
    bytes,
  );
}
/** CBOR text string (< 24 chars). */
function cborTstr(text: string): Uint8Array {
  const b = new TextEncoder().encode(text);
  return concat(new Uint8Array([0x60 + b.length]), b);
}
/** COSE_Key for an EC2 P-256 public key: {1:2, 3:-7, -1:1, -2:x, -3:y}. */
function coseEc2Key(x: Uint8Array, y: Uint8Array): Uint8Array {
  return concat(
    new Uint8Array([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21]),
    cborBstr(x),
    new Uint8Array([0x22]),
    cborBstr(y),
  );
}
/** WebCrypto returns raw r||s; WebAuthn signatures are DER SEQUENCE(r, s). */
function rawToDer(sig: ArrayBuffer): Uint8Array {
  const raw = new Uint8Array(sig);
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if (v[0] & 0x80) v = concat(new Uint8Array([0]), v);
    return concat(new Uint8Array([0x02, v.length]), v);
  };
  const body = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

class SoftAuthenticator {
  private key!: CryptoKeyPair;
  readonly credId = webcrypto.getRandomValues(new Uint8Array(16));
  readonly credIdB64 = b64url(this.credId);
  cose!: Uint8Array;
  counter = 0;

  async init() {
    this.key = await subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign'],
    );
    const jwk = await subtle.exportKey('jwk', this.key.publicKey);
    this.cose = coseEc2Key(
      Buffer.from(jwk.x!, 'base64url'),
      Buffer.from(jwk.y!, 'base64url'),
    );
    return this;
  }

  /** navigator.credentials.create() with attestation "none". */
  attest(challenge: string, opts: { origin?: string; rpId?: string } = {}) {
    const authData = concat(
      sha256(opts.rpId ?? EXPECTED_RP_ID),
      new Uint8Array([0x41]), // UP | AT
      u32be(0),
      new Uint8Array(16), // aaguid
      new Uint8Array([0, this.credId.length]),
      this.credId,
      this.cose,
    );
    const attObj = concat(
      new Uint8Array([0xa3]),
      cborTstr('fmt'),
      cborTstr('none'),
      cborTstr('attStmt'),
      new Uint8Array([0xa0]),
      cborTstr('authData'),
      cborBstr(authData),
    );
    const clientData = new TextEncoder().encode(
      JSON.stringify({
        type: 'webauthn.create',
        challenge,
        origin: opts.origin ?? ORIGIN,
        crossOrigin: false,
      }),
    );
    return {
      id: this.credIdB64,
      rawId: this.credIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(clientData),
        attestationObject: b64url(attObj),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  /** navigator.credentials.get(). `counter` overrides the auto-increment. */
  async assert(
    challenge: string,
    opts: {
      origin?: string;
      rpId?: string;
      counter?: number;
      corruptSignature?: boolean;
    } = {},
  ) {
    const counter = opts.counter ?? ++this.counter;
    const authData = concat(
      sha256(opts.rpId ?? EXPECTED_RP_ID),
      new Uint8Array([0x01]),
      u32be(counter),
    );
    const clientData = new TextEncoder().encode(
      JSON.stringify({
        type: 'webauthn.get',
        challenge,
        origin: opts.origin ?? ORIGIN,
        crossOrigin: false,
      }),
    );
    const signed = concat(authData, sha256(clientData));
    const sig = rawToDer(
      await subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        this.key.privateKey,
        signed,
      ),
    );
    if (opts.corruptSignature) sig[sig.length - 1] ^= 0xff;
    return {
      id: this.credIdB64,
      rawId: this.credIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(clientData),
        authenticatorData: b64url(authData),
        signature: b64url(sig),
        userHandle: null,
      },
      clientExtensionResults: {},
    };
  }
}

/** Force a challenge to expire now (instead of waiting 5 minutes). Returns the TTL it had. */
async function expireChallenge(challengeId: string): Promise<number> {
  const ttl = await redis.ttl(CHALLENGE_KEY_PREFIX + challengeId);
  await redis.del(CHALLENGE_KEY_PREFIX + challengeId);
  return ttl;
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

  // ---- real ceremony: software authenticator
  console.log('\n3.2b real registration with a software ES256 authenticator');
  const authn = await new SoftAuthenticator().init();

  const expOpts = await call('POST', '/auth/passkeys/register/options', {
    token: a.token,
    body: {},
  });
  const ttlBefore = await expireChallenge(expOpts.body.challengeId);
  check(
    'challenge is stored in Redis with a ~5 minute TTL',
    ttlBefore > 280 && ttlBefore <= 300,
    ttlBefore,
  );
  const vExp = await call('POST', '/auth/passkeys/register/verify', {
    token: a.token,
    body: {
      challengeId: expOpts.body.challengeId,
      response: authn.attest(expOpts.body.options.challenge),
    },
  });
  check(
    'EXPIRED challenge with an otherwise valid attestation -> 400 unknown challenge',
    vExp.status === 400 &&
      vExp.body?.message === 'unknown or expired challenge',
    vExp.body,
  );

  const badOriginOpts = await call('POST', '/auth/passkeys/register/options', {
    token: a.token,
    body: {},
  });
  const vBadOrigin = await call('POST', '/auth/passkeys/register/verify', {
    token: a.token,
    body: {
      challengeId: badOriginOpts.body.challengeId,
      response: authn.attest(badOriginOpts.body.options.challenge, {
        origin: 'https://evil.example',
      }),
    },
  });
  check(
    'valid attestation from the WRONG ORIGIN -> 400 "verification failed"',
    vBadOrigin.status === 400 &&
      vBadOrigin.body?.message === 'verification failed',
    vBadOrigin.body,
  );

  const badRpOpts = await call('POST', '/auth/passkeys/register/options', {
    token: a.token,
    body: {},
  });
  const vBadRp = await call('POST', '/auth/passkeys/register/verify', {
    token: a.token,
    body: {
      challengeId: badRpOpts.body.challengeId,
      response: authn.attest(badRpOpts.body.options.challenge, {
        rpId: 'evil.example',
      }),
    },
  });
  check(
    'valid attestation for the WRONG RP ID -> 400 "verification failed"',
    vBadRp.status === 400 && vBadRp.body?.message === 'verification failed',
    vBadRp.body,
  );

  const okOpts = await call('POST', '/auth/passkeys/register/options', {
    token: a.token,
    body: {},
  });
  const attestation = authn.attest(okOpts.body.options.challenge);
  const reg = await call('POST', '/auth/passkeys/register/verify', {
    token: a.token,
    body: {
      challengeId: okOpts.body.challengeId,
      name: '  My laptop  ',
      response: attestation,
    },
  });
  check('real attestation -> 201', reg.status === 201, reg.body ?? reg.raw);
  check(
    '201 body is the Passkey DTO with trimmed name',
    reg.body?.name === 'My laptop' &&
      reg.body?.deviceType === 'singleDevice' &&
      reg.body?.backedUp === false &&
      JSON.stringify(reg.body?.transports) === '["internal"]',
    reg.body,
  );
  check(
    '201 body never leaks key material',
    !('publicKey' in (reg.body ?? {})) &&
      !('counter' in (reg.body ?? {})) &&
      !('credentialId' in (reg.body ?? {})),
  );
  const regRow = await prisma.passkey.findUnique({
    where: { credentialId: authn.credIdB64 },
  });
  check(
    'DB row stores the COSE public key and counter 0',
    !!regRow &&
      Buffer.compare(Buffer.from(regRow.publicKey), Buffer.from(authn.cose)) ===
        0 &&
      regRow.counter === BigInt(0),
    regRow && { counter: String(regRow.counter) },
  );

  const replay = await call('POST', '/auth/passkeys/register/verify', {
    token: a.token,
    body: { challengeId: okOpts.body.challengeId, response: attestation },
  });
  check(
    'REPLAY of the successful body -> 400 unknown challenge',
    replay.status === 400 &&
      replay.body?.message === 'unknown or expired challenge',
    replay.body,
  );

  const dupOpts = await call('POST', '/auth/passkeys/register/options', {
    token: a.token,
    body: {},
  });
  check(
    'register/options now excludes the real credential',
    (dupOpts.body?.options?.excludeCredentials ?? []).some(
      (c: any) => c.id === authn.credIdB64,
    ),
    dupOpts.body?.options?.excludeCredentials,
  );
  const dup = await call('POST', '/auth/passkeys/register/verify', {
    token: a.token,
    body: {
      challengeId: dupOpts.body.challengeId,
      response: authn.attest(dupOpts.body.options.challenge),
    },
  });
  check(
    'same credential registered again (fresh challenge) -> 409',
    dup.status === 409 && dup.body?.message === 'credential already registered',
    dup.body,
  );

  const me1 = await call('GET', '/auth/me', { token: a.token });
  check(
    'me.passkeyCount is 1 after the real registration',
    me1.body?.passkeyCount === 1,
    me1.body?.passkeyCount,
  );

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

  // ---- real sign-in with the software authenticator
  console.log('\n3.4b real sign-in');
  async function loginOptions() {
    const res = await call('POST', '/auth/passkeys/login/options', {
      body: {},
      visitor: freshVisitor(),
    });
    if (res.status !== 200)
      throw new Error(`login/options ${res.status} ${res.raw}`);
    return res.body as { challengeId: string; options: { challenge: string } };
  }
  async function loginVerify(challengeId: string, response: unknown) {
    return call('POST', '/auth/passkeys/login/verify', {
      body: { challengeId, response },
      visitor: freshVisitor(),
    });
  }
  const realRow = async () =>
    prisma.passkey.findUnique({ where: { credentialId: authn.credIdB64 } });

  let o1 = await loginOptions();
  let r = await loginVerify(
    o1.challengeId,
    await authn.assert(o1.options.challenge, {
      origin: 'https://evil.example',
    }),
  );
  check(
    'valid assertion from the WRONG ORIGIN -> 401 "verification failed"',
    r.status === 401 && r.body?.message === 'verification failed',
    r.body,
  );

  o1 = await loginOptions();
  r = await loginVerify(
    o1.challengeId,
    await authn.assert(o1.options.challenge, { rpId: 'evil.example' }),
  );
  check(
    'valid assertion for the WRONG RP ID -> 401',
    r.status === 401 && r.body?.message === 'verification failed',
    r.body,
  );

  o1 = await loginOptions();
  r = await loginVerify(
    o1.challengeId,
    await authn.assert(o1.options.challenge, { corruptSignature: true }),
  );
  check(
    'corrupted signature -> 401',
    r.status === 401 && r.body?.message === 'verification failed',
    r.body,
  );

  o1 = await loginOptions();
  const otherChallenge = (await loginOptions()).options.challenge;
  r = await loginVerify(o1.challengeId, await authn.assert(otherChallenge));
  check(
    'assertion signed over a DIFFERENT challenge than challengeId refers to -> 401',
    r.status === 401,
    r.body,
  );

  o1 = await loginOptions();
  await expireChallenge(o1.challengeId);
  r = await loginVerify(
    o1.challengeId,
    await authn.assert(o1.options.challenge),
  );
  check(
    'EXPIRED login challenge with a valid assertion -> 400 unknown challenge',
    r.status === 400 && r.body?.message === 'unknown or expired challenge',
    r.body,
  );
  let row = await realRow();
  check(
    'no failed attempt touched counter or lastUsedAt',
    row?.counter === BigInt(0) && row?.lastUsedAt === null,
    row && { counter: String(row.counter), lastUsedAt: row.lastUsedAt },
  );

  // unverified email: valid assertion -> 403 and the row must stay untouched
  await prisma.user.update({
    where: { id: a.userId },
    data: { emailVerified: false },
  });
  o1 = await loginOptions();
  const gatedAssertion = await authn.assert(o1.options.challenge, {
    counter: 10,
  });
  r = await loginVerify(o1.challengeId, gatedAssertion);
  check(
    'UNVERIFIED EMAIL with a valid assertion -> 403',
    r.status === 403,
    r.body,
  );
  check(
    '403 message matches /auth/login',
    /verify your email/i.test(r.body?.message ?? ''),
    r.body?.message,
  );
  row = await realRow();
  check(
    '403 left counter and lastUsedAt untouched',
    row?.counter === BigInt(0) && row?.lastUsedAt === null,
    row && { counter: String(row.counter), lastUsedAt: row.lastUsedAt },
  );
  r = await loginVerify(o1.challengeId, gatedAssertion);
  check(
    'the gated attempt still consumed its challenge (replay -> 400)',
    r.status === 400,
    r.body,
  );
  await prisma.user.update({
    where: { id: a.userId },
    data: { emailVerified: true },
  });

  // success
  o1 = await loginOptions();
  const okAssertion = await authn.assert(o1.options.challenge, { counter: 10 });
  const ok = await loginVerify(o1.challengeId, okAssertion);
  check('real assertion -> 200', ok.status === 200, ok.body ?? ok.raw);
  check(
    '200 body is the /auth/login shape',
    ok.body?.message === 'Login successful' &&
      ['accessToken', 'refreshToken', 'expiresAt', 'refreshExpiresAt'].every(
        (k) => typeof ok.body?.[k] === 'string',
      ) &&
      ok.body?.user?.email === EMAIL_A &&
      ok.body?.session === undefined,
    ok.body,
  );
  const meViaPasskey = await call('GET', '/auth/me', {
    token: ok.body?.accessToken,
  });
  check(
    'the passkey-issued access token works on /auth/me',
    meViaPasskey.status === 200 && meViaPasskey.body?.email === EMAIL_A,
    meViaPasskey.body,
  );
  row = await realRow();
  check(
    'success stored newCounter (10) and lastUsedAt',
    row?.counter === BigInt(10) && row?.lastUsedAt instanceof Date,
    row && { counter: String(row.counter), lastUsedAt: row.lastUsedAt },
  );
  const listAfterLogin = await call('GET', '/auth/passkeys', {
    token: a.token,
  });
  check(
    'GET /auth/passkeys shows lastUsedAt after sign-in',
    typeof listAfterLogin.body?.find((p: any) => p.id === reg.body.id)
      ?.lastUsedAt === 'string',
    listAfterLogin.body,
  );

  r = await loginVerify(o1.challengeId, okAssertion);
  check('REPLAY of the successful login body -> 400', r.status === 400, r.body);

  // counter regression = cloned authenticator
  o1 = await loginOptions();
  r = await loginVerify(
    o1.challengeId,
    await authn.assert(o1.options.challenge, { counter: 10 }),
  );
  check(
    'COUNTER REGRESSION (same counter 10 again) -> 401 "verification failed"',
    r.status === 401 && r.body?.message === 'verification failed',
    r.body,
  );
  o1 = await loginOptions();
  r = await loginVerify(
    o1.challengeId,
    await authn.assert(o1.options.challenge, { counter: 4 }),
  );
  check(
    'COUNTER REGRESSION (lower counter 4) -> 401',
    r.status === 401,
    r.body,
  );
  row = await realRow();
  check(
    'regressions did not change the stored counter',
    row?.counter === BigInt(10),
    row && String(row.counter),
  );

  o1 = await loginOptions();
  r = await loginVerify(
    o1.challengeId,
    await authn.assert(o1.options.challenge, { counter: 11 }),
  );
  check('next monotonic counter (11) -> 200 again', r.status === 200, r.body);

  // removing the passkey makes the credential unknown on the next sign-in
  const removeReal = await call('DELETE', `/auth/passkeys/${reg.body.id}`, {
    token: a.token,
  });
  check(
    'DELETE the real passkey -> 204',
    removeReal.status === 204,
    removeReal.status,
  );
  o1 = await loginOptions();
  r = await loginVerify(
    o1.challengeId,
    await authn.assert(o1.options.challenge, { counter: 12 }),
  );
  check(
    'sign-in with a deleted passkey -> 401 "unknown credential"',
    r.status === 401 && r.body?.message === 'unknown credential',
    r.body,
  );

  // throttle: 11 login/options from ONE visitor inside a minute -> 429
  // Unique per run: the in-memory throttle bucket survives between runs.
  const visitor = `198.51.${(STAMP >> 8) % 250}.${STAMP % 250}`;
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
  await redis.quit();
  await pool.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.user
    .deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } })
    .catch(() => undefined);
  await redis.quit().catch(() => undefined);
  await pool.end();
  process.exit(1);
});
