/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
/**
 * Smoke test for POST /alerts/:id/cancel against a running server.
 * Usage: API_URL=http://localhost:3113 bun run scripts/smoke-alert-cancel.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma';

const API = process.env.API_URL ?? 'http://localhost:3113';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const EMAIL = `smoke-cancel-${Date.now()}@example.com`;
let failed = 0;
const check = (n: string, ok: boolean, d?: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + JSON.stringify(d)}`);
};
async function call(method: string, path: string, body?: unknown, token?: string) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let j: any; try { j = JSON.parse(t); } catch {}
  return { status: r.status, body: j ?? t };
}

try {
  // Swagger
  const spec = (await call('GET', '/api/openapi.json')).body;
  const cancelPath = spec.paths['/alerts/{id}/cancel']?.post;
  check('swagger: POST /alerts/{id}/cancel exists', !!cancelPath);
  check('swagger: cancel has 200/401/403/404/422', ['200','401','403','404','422'].every(c => cancelPath?.responses?.[c]), Object.keys(cancelPath?.responses ?? {}));
  check('swagger: CancelAlertDto.reason', !!spec.components.schemas.CancelAlertDto?.properties?.reason);
  check('swagger: AlertStatus includes CANCELLED', JSON.stringify(spec.components.schemas.AlertStatus ?? {}).includes('CANCELLED'), spec.components.schemas.AlertStatus);
  check('swagger: AlertResponseDto.cancelledAt', !!spec.components.schemas.AlertResponseDto?.properties?.cancelledAt);
  const listStatus = spec.paths['/alerts']?.get?.parameters?.find((p: any) => p.name === 'status');
  check('swagger: list ?status references AlertStatus', JSON.stringify(listStatus?.schema ?? {}).includes('AlertStatus'), listStatus?.schema);

  // Flow
  await call('POST', '/auth/signup', { email: EMAIL, password: 'SmokeTest123!', firstName: 'Smoke', lastName: 'Cancel' });
  await prisma.user.update({ where: { email: EMAIL }, data: { emailVerified: true } });
  const token = (await call('POST', '/auth/login', { email: EMAIL, password: 'SmokeTest123!' })).body.accessToken;
  check('login', !!token);

  const created = await call('POST', '/alerts', {
    pet: { name: 'Smokey', species: 'DOG', description: 'Smoke test dog' },
    location: { lat: 35.17, lon: 33.36, lastSeenTime: new Date().toISOString(), radiusKm: 1 },
    contact: { isPhonePublic: false },
  }, token);
  check('create alert', created.status === 201, created.body);
  const id = created.body.id;

  const cancelled = await call('POST', `/alerts/${id}/cancel`, { reason: 'Posted by mistake' }, token);
  check('cancel -> 200', cancelled.status === 200, cancelled.body);
  check('status CANCELLED', cancelled.body.status === 'CANCELLED', cancelled.body.status);
  check('cancelledAt set', !!cancelled.body.cancelledAt, cancelled.body.cancelledAt);
  check('notes = reason', cancelled.body.notes === 'Posted by mistake', cancelled.body.notes);

  const again = await call('POST', `/alerts/${id}/cancel`, {}, token);
  check('cancel again -> 422', again.status === 422, again);
  const renew = await call('POST', `/alerts/${id}/renew`, undefined, token);
  check('renew cancelled -> 422', renew.status === 422, renew);
  const anon = await call('POST', `/alerts/${id}/cancel`, {});
  check('cancel without token -> 401', anon.status === 401, anon.status);

  const listed = await call('GET', `/alerts?lat=35.17&lon=33.36&radiusKm=5&status=CANCELLED`, undefined, token);
  check('list ?status=CANCELLED accepted', listed.status === 200, listed.body);
} finally {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
  await pool.end();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
}
