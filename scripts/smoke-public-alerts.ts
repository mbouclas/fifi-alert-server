/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
/**
 * Smoke test for the public active-alerts endpoints against a running server.
 * Covers BACKEND_WORK_ORDER_PUBLIC_ALERTS.md §4.
 *
 * Usage:
 *   CLIENT_API_KEYS=devkey PORT=3199 bun run src/main.ts   (in another terminal)
 *   API_URL=http://localhost:3199 CLIENT_KEY=devkey bun run scripts/smoke-public-alerts.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma';

const API = process.env.API_URL ?? 'http://localhost:3199';
const CLIENT_KEY = process.env.CLIENT_KEY ?? 'devkey';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const EMAIL = `smoke-pubalert-${Date.now()}@example.com`;
const EMAIL2 = `smoke-pubalert2-${Date.now()}@example.com`;
let failed = 0;
const check = (n: string, ok: boolean, d?: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + JSON.stringify(d)}`);
};
async function call(
  method: string,
  path: string,
  body?: unknown,
  opts: { token?: string; clientKey?: string } = {},
) {
  const r = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.clientKey ? { 'X-Client-Key': opts.clientKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let j: any;
  try { j = JSON.parse(t); } catch {}
  return { status: r.status, body: j ?? t };
}
async function user(email: string) {
  await call('POST', '/auth/signup', { email, password: 'SmokeTest123!', firstName: 'Smoke', lastName: 'Alert' });
  await prisma.user.update({ where: { email }, data: { emailVerified: true } });
  return (await call('POST', '/auth/login', { email, password: 'SmokeTest123!' })).body.accessToken as string;
}
const PRIVATE_FIELDS = ['creatorId', 'contactEmail', 'notes', 'affectedPostalCodes'];
const hasNoPrivate = (a: any) => PRIVATE_FIELDS.every((f) => a[f] === undefined);

const KEY = { clientKey: CLIENT_KEY };
let alertId: number | undefined;
let alertId2: number | undefined;

try {
  // Swagger
  const spec = (await call('GET', '/api/openapi.json')).body;
  const sec = (p: string) => JSON.stringify(spec.paths[p]?.get?.security ?? []);
  check('swagger: /alerts GET security client-key+bearer', sec('/alerts').includes('client-key') && sec('/alerts').includes('bearer'), sec('/alerts'));
  check('swagger: /alerts/{id} GET security client-key+bearer', sec('/alerts/{id}').includes('client-key') && sec('/alerts/{id}').includes('bearer'), sec('/alerts/{id}'));
  check('swagger: /alerts/by-tag/{tagId} path with 200/404/429', !!spec.paths['/alerts/by-tag/{tagId}']?.get && ['200', '404', '429'].every((c) => !!spec.paths['/alerts/by-tag/{tagId}'].get.responses[c]), Object.keys(spec.paths['/alerts/by-tag/{tagId}']?.get?.responses ?? {}));
  const tagProp = spec.components.schemas.AlertResponseDto?.properties?.tagId;
  check('swagger: AlertResponseDto.tagId nullable string', tagProp?.type === 'string' && tagProp?.nullable === true, tagProp);
  check('swagger: AlertResponseDto.creatorId not required', !(spec.components.schemas.AlertResponseDto?.required ?? []).includes('creatorId'));

  // Credentials gate
  check('GET /alerts no creds -> 401', (await call('GET', '/alerts')).status === 401);
  check('GET /alerts wrong key -> 401', (await call('GET', '/alerts', undefined, { clientKey: 'nope' })).status === 401);
  check('GET /alerts/1 no creds -> 401', (await call('GET', '/alerts/1')).status === 401);
  check('GET /alerts/by-tag/LUNA2M4PQ no creds -> 401', (await call('GET', '/alerts/by-tag/LUNA2M4PQ')).status === 401);

  // Fixture: owner with a registered pet and an ACTIVE alert; a second pet with a RESOLVED alert only
  const token = await user(EMAIL);
  const token2 = await user(EMAIL2);
  check('login', !!token && !!token2);
  const petType = await prisma.petType.findFirst({ select: { id: true } });
  check('a pet type exists', !!petType);
  const pet = await call('POST', '/pets', { petTypeId: petType!.id, name: 'Luna', gender: 'FEMALE', size: 'SMALL' }, { token });
  check('POST /pets -> 201 with tagId', pet.status === 201 && typeof pet.body.tagId === 'string', pet.body);
  const tagId: string = pet.body.tagId;
  const pet2 = await call('POST', '/pets', { petTypeId: petType!.id, name: 'Rex', gender: 'MALE', size: 'LARGE' }, { token });
  const tagId2: string = pet2.body.tagId;

  const alertBody = (petId: number, name: string, lat: number, lon: number) => ({
    petId,
    pet: { name, species: 'CAT', description: 'Grey tabby, shy' },
    location: { lat, lon, address: 'Strovolos, Nicosia', lastSeenTime: new Date().toISOString(), radiusKm: 5 },
    contact: { phone: '+35799123456', email: EMAIL, isPhonePublic: true },
    reward: { offered: true, amount: 100 },
    notes: 'private note for members',
  });
  const created = await call('POST', '/alerts', alertBody(pet.body.id, 'Luna', 35.1712345, 33.3698765), { token });
  check('POST /alerts -> 201', created.status === 201, created.body);
  alertId = created.body.id;
  check('POST /alerts response carries tagId', created.body.tagId === tagId, created.body.tagId);
  const created2 = await call('POST', '/alerts', alertBody(pet2.body.id, 'Rex', 35.2, 33.4), { token });
  alertId2 = created2.body.id;
  const resolved = await call('POST', `/alerts/${alertId2}/resolve`, { outcome: 'FOUND_SAFE' }, { token });
  check('resolve second alert -> 200 RESOLVED', (resolved.status === 200 || resolved.status === 201) && resolved.body.status === 'RESOLVED', resolved.body);

  // Public list
  const list = await call('GET', '/alerts?limit=100', undefined, KEY);
  check('GET /alerts with key -> 200 array', list.status === 200 && Array.isArray(list.body), list.body);
  const mine = list.body.find?.((a: any) => a.id === alertId);
  check('public list contains the new alert', !!mine, list.body?.length);
  check('public list: only ACTIVE', list.body.every?.((a: any) => a.status === 'ACTIVE'), [...new Set(list.body.map?.((a: any) => a.status))]);
  check('public list: every item has tagId key', list.body.every?.((a: any) => 'tagId' in a));
  check('public list: new alert tagId matches pet', mine?.tagId === tagId, mine?.tagId);
  check('public list: no private fields', list.body.every?.(hasNoPrivate), mine && Object.fromEntries(PRIVATE_FIELDS.map((f) => [f, mine[f]])));
  check('public list: coordinates rounded to 3 decimals', mine?.lastSeenLat === 35.171 && mine?.lastSeenLon === 33.37, [mine?.lastSeenLat, mine?.lastSeenLon]);
  check('public list: public phone visible', mine?.contactPhone === '+35799123456', mine?.contactPhone);
  check('public list: newest first', (() => { const ts = list.body.map((a: any) => +new Date(a.createdAt)); return ts.every((t: number, i: number) => i === 0 || ts[i - 1] >= t); })());

  const forced = await call('GET', '/alerts?status=RESOLVED&limit=100', undefined, KEY);
  check('GET /alerts?status=RESOLVED with key -> only ACTIVE', forced.status === 200 && forced.body.every?.((a: any) => a.status === 'ACTIVE') && !forced.body.some?.((a: any) => a.id === alertId2), [...new Set(forced.body.map?.((a: any) => a.status))]);

  const near = await call('GET', '/alerts?lat=35.17&lon=33.36&radiusKm=25&limit=100', undefined, KEY);
  const dists = near.body.map?.((a: any) => a.distanceKm);
  check('GET /alerts near-me -> distanceKm ascending', near.status === 200 && dists.every((d: any) => typeof d === 'number') && dists.every((d: number, i: number) => i === 0 || dists[i - 1] <= d), dists);
  check('near-me contains the new alert', near.body.some?.((a: any) => a.id === alertId));

  // Public detail
  const detail = await call('GET', `/alerts/${alertId}`, undefined, KEY);
  check('GET /alerts/:id with key -> 200', detail.status === 200, detail.body);
  check('public detail: tagId + no private fields + sightingCount', detail.body.tagId === tagId && hasNoPrivate(detail.body) && typeof detail.body.sightingCount === 'number', detail.body);
  check('public detail: coordinates rounded', detail.body.lastSeenLat === 35.171 && detail.body.lastSeenLon === 33.37);

  // By tag
  const byTag = await call('GET', `/alerts/by-tag/${tagId}`, undefined, KEY);
  check('GET /alerts/by-tag/:tagId (missing pet) -> 200 same alert', byTag.status === 200 && byTag.body.id === alertId && byTag.body.tagId === tagId, byTag.body);
  check('by-tag: no private fields', hasNoPrivate(byTag.body));
  check('by-tag: lowercase tag accepted', (await call('GET', `/alerts/by-tag/${tagId.toLowerCase()}`, undefined, KEY)).status === 200);
  check('GET /alerts/by-tag (resolved pet) -> 404', (await call('GET', `/alerts/by-tag/${tagId2}`, undefined, KEY)).status === 404);
  check('GET /alerts/by-tag/ZZZZZZZZZ -> 404', (await call('GET', '/alerts/by-tag/ZZZZZZZZZ', undefined, KEY)).status === 404);
  check('GET /alerts/by-tag/BAD -> 400', (await call('GET', '/alerts/by-tag/BAD', undefined, KEY)).status === 400);
  check('GET /alerts/by-tag/LUNA0M4PQ (0 not in alphabet) -> 400', (await call('GET', '/alerts/by-tag/LUNA0M4PQ', undefined, KEY)).status === 400);

  // Bearer callers keep today's payload
  const asCreator = await call('GET', `/alerts/${alertId}`, undefined, { token });
  check('bearer creator: creatorId + contactEmail + notes + tagId', asCreator.status === 200 && typeof asCreator.body.creatorId === 'number' && asCreator.body.contactEmail === EMAIL && asCreator.body.notes === 'private note for members' && asCreator.body.tagId === tagId, asCreator.body);
  check('bearer creator: exact coordinates', asCreator.body.lastSeenLat === 35.1712345);
  const asOther = await call('GET', `/alerts/${alertId}`, undefined, { token: token2 });
  check('bearer non-creator: creatorId yes, contactEmail no', typeof asOther.body.creatorId === 'number' && asOther.body.contactEmail === undefined && Array.isArray(asOther.body.affectedPostalCodes), asOther.body);
  const bearerList = await call('GET', '/alerts?status=RESOLVED&limit=100', undefined, { token });
  check('bearer list: status filter honoured', bearerList.status === 200 && bearerList.body.some?.((a: any) => a.id === alertId2) && bearerList.body.every?.((a: any) => a.status === 'RESOLVED'), [...new Set(bearerList.body.map?.((a: any) => a.status))]);
  const bearerByTag = await call('GET', `/alerts/by-tag/${tagId}`, undefined, { token });
  check('bearer by-tag without client key -> 200 full payload', bearerByTag.status === 200 && typeof bearerByTag.body.creatorId === 'number', bearerByTag.body);
} finally {
  const owner = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (owner) {
    await prisma.alert.deleteMany({ where: { creator_id: owner.id } });
    await prisma.pet.deleteMany({ where: { userId: owner.id } });
  }
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, EMAIL2] } } });
  await prisma.$disconnect();
  await pool.end();
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
