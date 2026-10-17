/**
 * Smoke: refresh-token reuse grace window.
 *
 * Rotates once, waits WAIT_SECONDS (default 90, i.e. past the old 60 s
 * default and inside the 300 s default), then presents the consumed token
 * again. Expects 200 with the SAME pair and no revoke-all.
 *
 *   API_URL=http://localhost:3199 bun run scripts/smoke-refresh-grace.ts
 *
 * /auth/refresh-token is throttled to 10 requests per minute per IP.
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3000';
const WAIT_SECONDS = Number(process.env.WAIT_SECONDS ?? 90);
const EMAIL = `grace-${Date.now()}@example.com`;
const PASSWORD = 'GraceTest123!';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function post(path: string, body: unknown) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, text: await r.text() };
}

let failed = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    failed++;
    if (extra !== undefined) console.log('        ', extra);
  }
}

async function main() {
  console.log(`Refresh grace smoke test against ${API} (wait ${WAIT_SECONDS}s)\n`);
  const signup = await post('/auth/signup', {
    email: EMAIL,
    password: PASSWORD,
    firstName: 'Grace',
    lastName: 'Test',
  });
  check('signup succeeds', signup.status === 201, signup.text);
  await prisma.user.update({
    where: { email: EMAIL },
    data: { emailVerified: true },
  });
  const login = await post('/auth/login', { email: EMAIL, password: PASSWORD });
  check('login succeeds', login.status === 200, login.text);
  const old = (JSON.parse(login.text) as { refreshToken: string }).refreshToken;

  const first = await post('/auth/refresh-token', { refreshToken: old });
  check('first rotation 200', first.status === 200, first.text);

  console.log(`  ...waiting ${WAIT_SECONDS}s`);
  await new Promise((r) => setTimeout(r, WAIT_SECONDS * 1000));

  const replay = await post('/auth/refresh-token', { refreshToken: old });
  check('late replay 200', replay.status === 200, replay.text);
  check('late replay returns the same pair', replay.text === first.text);

  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  const live = await prisma.session.count({
    where: { userId: user!.id, tokenType: 'refresh', revoked: false },
  });
  check('exactly one live refresh row (no revoke-all)', live === 1, live);

  await prisma.user.delete({ where: { email: EMAIL } });
  await prisma.$disconnect();
  await pool.end();
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
