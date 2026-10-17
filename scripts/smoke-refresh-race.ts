/**
 * Smoke test: concurrent presentation of the SAME refresh token.
 *
 * With in-grace replay (see TokenService.rotateRefreshToken) every racer must
 * get 200 with a byte-identical body, and the replayed refresh token must be
 * usable for the next rotation. Run against a live server:
 *
 *   API_URL=http://localhost:3199 bun run scripts/smoke-refresh-race.ts
 *
 * /auth/refresh-token is throttled to 10 requests per minute per IP, so keep
 * RACERS (default 5) low and wait a minute between runs, or you will see 429s
 * that have nothing to do with the replay logic.
 */
import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';

const API = process.env.API_URL ?? 'http://localhost:3000';
const EMAIL = `race-${Date.now()}@example.com`;
const PASSWORD = 'RaceTest123!';
const RACERS = Number(process.env.RACERS ?? 5);

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
  console.log(`Refresh race smoke test against ${API}\n`);
  const signup = await post('/auth/signup', {
    email: EMAIL,
    password: PASSWORD,
    firstName: 'Race',
    lastName: 'Test',
  });
  check('signup succeeds', signup.status === 201, signup.text);
  await prisma.user.update({
    where: { email: EMAIL },
    data: { emailVerified: true },
  });
  const login = await post('/auth/login', { email: EMAIL, password: PASSWORD });
  check('login succeeds', login.status === 200, login.text);
  const refresh1 = (JSON.parse(login.text) as { refreshToken: string })
    .refreshToken;

  console.log(`\nFiring ${RACERS} concurrent refreshes with the same token`);
  const results = await Promise.all(
    Array.from({ length: RACERS }, () =>
      post('/auth/refresh-token', { refreshToken: refresh1 }),
    ),
  );
  const statuses = results.map((r) => r.status);
  console.log('  statuses:', statuses.join(','));
  check(
    'every racer gets 200',
    statuses.every((s) => s === 200),
    results.map((r) => r.text.slice(0, 120)),
  );
  const bodies = new Set(results.map((r) => r.text));
  check('every racer gets the byte-identical body', bodies.size === 1, [
    ...bodies,
  ]);

  const refresh2 = (JSON.parse(results[0].text) as { refreshToken: string })
    .refreshToken;
  const next = await post('/auth/refresh-token', { refreshToken: refresh2 });
  check(
    'the replayed refresh token rotates normally afterwards',
    next.status === 200,
    next.text,
  );

  const stale = await post('/auth/refresh-token', { refreshToken: refresh1 });
  check(
    'the ORIGINAL token is dead once its child has been rotated away',
    stale.status === 401,
    stale.text,
  );
}

try {
  await main();
} finally {
  await prisma.user.delete({ where: { email: EMAIL } }).catch(() => undefined);
  await pool.end();
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
