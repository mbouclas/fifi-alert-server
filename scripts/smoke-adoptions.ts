/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
/**
 * Smoke test for the adoption board (/adoptions) against a running server.
 *
 * Usage:
 *   CLIENT_API_KEYS=devkey PORT=3199 bun run src/main.ts   (in another terminal)
 *   API_URL=http://localhost:3199 CLIENT_KEY=devkey bun run scripts/smoke-adoptions.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma';

const API = process.env.API_URL ?? 'http://localhost:3199';
const CLIENT_KEY = process.env.CLIENT_KEY ?? 'devkey';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const EMAIL = `smoke-adopt-${Date.now()}@example.com`;
const EMAIL2 = `smoke-adopt2-${Date.now()}@example.com`;
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
  await call('POST', '/auth/signup', { email, password: 'SmokeTest123!', firstName: 'Smoke', lastName: 'Adopt' });
  await prisma.user.update({ where: { email }, data: { emailVerified: true } });
  return (await call('POST', '/auth/login', { email, password: 'SmokeTest123!' })).body.accessToken as string;
}

try {
  // Swagger
  const spec = (await call('GET', '/api/openapi.json')).body;
  const paths = Object.keys(spec.paths).filter((p) => p.startsWith('/adoptions'));
  check('swagger: 7 /adoptions paths', paths.length === 7, paths);
  check('swagger: client-key security scheme', !!spec.components.securitySchemes?.['client-key'], Object.keys(spec.components.securitySchemes ?? {}));
  check('swagger: GET /adoptions uses client-key', JSON.stringify(spec.paths['/adoptions'].get.security ?? []).includes('client-key'), spec.paths['/adoptions'].get.security);
  check('swagger: Adoptions tag', spec.tags?.some((t: any) => t.name === 'Adoptions'));
  check('swagger: AdoptionListingResponseDto schema', !!spec.components.schemas.AdoptionListingResponseDto);
  const listParams = (spec.paths['/adoptions'].get.parameters ?? []).map((p: any) => p.name);
  check('swagger: list filters documented', ['lat', 'lon', 'radiusKm', 'petTypeId', 'gender', 'size', 'minAgeMonths', 'maxAgeMonths', 'limit', 'offset', 'lang'].every((n) => listParams.includes(n)), listParams);

  // Client key gate
  check('GET /adoptions no key -> 401', (await call('GET', '/adoptions')).status === 401);
  check('GET /adoptions wrong key -> 401', (await call('GET', '/adoptions', undefined, { clientKey: 'nope' })).status === 401);
  const empty = await call('GET', '/adoptions', undefined, { clientKey: CLIENT_KEY });
  check('GET /adoptions with key -> 200 paginated', empty.status === 200 && Array.isArray(empty.body.data) && typeof empty.body.total === 'number', empty.body);
  check('GET /adoptions lat without lon -> 400', (await call('GET', '/adoptions?lat=35', undefined, { clientKey: CLIENT_KEY })).status === 400);
  check('GET /adoptions bad limit -> 400', (await call('GET', '/adoptions?limit=999', undefined, { clientKey: CLIENT_KEY })).status === 400);

  // Users
  const token = await user(EMAIL);
  const token2 = await user(EMAIL2);
  check('login', !!token && !!token2);
  const petType = await prisma.petType.findFirst({ select: { id: true } });
  check('a pet type exists', !!petType);
  const petTypeId = petType!.id;

  // Create
  const created = await call('POST', '/adoptions', {
    petTypeId, name: 'Smokey', gender: 'MALE', size: 'SMALL',
    birthday: new Date(Date.now() - 400 * 86400000).toISOString(), // ~13 months
    lat: 35.17, lon: 33.36, locationAddress: 'Nicosia', description: 'Smoke pet',
  }, { token });
  check('POST /adoptions -> 201', created.status === 201, created.body);
  const id = created.body.id;
  const petId = created.body.petId;
  check('created has pet + owner without email', created.body.pet?.name === 'Smokey' && created.body.owner?.id && !('email' in created.body.owner), created.body.owner);
  check('created status AVAILABLE', created.body.status === 'AVAILABLE');
  check('POST /adoptions no auth -> 401', (await call('POST', '/adoptions', { petTypeId, name: 'x', lat: 0, lon: 0 })).status === 401);
  check('POST /adoptions missing lat -> 400', (await call('POST', '/adoptions', { petTypeId, name: 'x' }, { token })).status === 400);

  // Separation from personal pets
  const myPets = await call('GET', '/pets', undefined, { token });
  check('GET /pets excludes adoption pet', myPets.status === 200 && !myPets.body.some((p: any) => p.id === petId), myPets.body);
  const mine = await call('GET', '/adoptions/mine', undefined, { token });
  check('GET /adoptions/mine includes it', mine.status === 200 && mine.body.some((l: any) => l.id === id), mine.body);

  // Browse + filters
  const near = await call('GET', '/adoptions?lat=35.17&lon=33.36&radiusKm=5', undefined, { clientKey: CLIENT_KEY });
  const hit = near.body.data?.find((l: any) => l.id === id);
  check('radius search finds it with distanceKm', !!hit && typeof hit.distanceKm === 'number' && hit.distanceKm < 1, hit);
  const far = await call('GET', '/adoptions?lat=40.0&lon=20.0&radiusKm=5', undefined, { clientKey: CLIENT_KEY });
  check('radius search elsewhere excludes it', !far.body.data?.some((l: any) => l.id === id));
  const g = await call('GET', '/adoptions?gender=FEMALE', undefined, { clientKey: CLIENT_KEY });
  check('gender=FEMALE excludes MALE pet', !g.body.data?.some((l: any) => l.id === id));
  const t = await call('GET', `/adoptions?petTypeId=${petTypeId}&size=SMALL&gender=MALE`, undefined, { clientKey: CLIENT_KEY });
  check('type+size+gender includes it', t.body.data?.some((l: any) => l.id === id), t.body);
  const age1 = await call('GET', '/adoptions?minAgeMonths=6&maxAgeMonths=24', undefined, { clientKey: CLIENT_KEY });
  check('age 6-24 months includes it', age1.body.data?.some((l: any) => l.id === id), age1.body);
  const age2 = await call('GET', '/adoptions?minAgeMonths=36', undefined, { clientKey: CLIENT_KEY });
  check('minAge 36 excludes it', !age2.body.data?.some((l: any) => l.id === id));
  const el = await call('GET', `/adoptions/${id}?lang=el`, undefined, { clientKey: CLIENT_KEY });
  check('GET /adoptions/:id public -> 200 with localised petType', el.status === 200 && !!el.body.pet?.petType?.name, el.body);

  // Update
  const upd = await call('PATCH', `/adoptions/${id}`, { name: 'Smokey II', lat: 34.7, lon: 33.0, description: 'moved' }, { token });
  check('PATCH -> 200 pet+listing updated', upd.status === 200 && upd.body.pet.name === 'Smokey II' && upd.body.lat === 34.7 && upd.body.description === 'moved', upd.body);
  const nearNew = await call('GET', '/adoptions?lat=34.7&lon=33.0&radiusKm=2', undefined, { clientKey: CLIENT_KEY });
  check('point moved: found at new location', nearNew.body.data?.some((l: any) => l.id === id));
  check('PATCH by other user -> 403', (await call('PATCH', `/adoptions/${id}`, { description: 'x' }, { token: token2 })).status === 403);
  check('PATCH lat only -> 400', (await call('PATCH', `/adoptions/${id}`, { lat: 1 }, { token })).status === 400);

  // Status transitions
  check('relist AVAILABLE -> 409', (await call('PATCH', `/adoptions/${id}/relist`, undefined, { token })).status === 409);
  const wd = await call('PATCH', `/adoptions/${id}/withdraw`, undefined, { token });
  check('withdraw -> WITHDRAWN', wd.status === 200 && wd.body.status === 'WITHDRAWN', wd.body);
  check('withdrawn hidden from public GET /:id -> 404', (await call('GET', `/adoptions/${id}`, undefined, { clientKey: CLIENT_KEY })).status === 404);
  check('withdrawn visible to owner GET /:id -> 200', (await call('GET', `/adoptions/${id}`, undefined, { clientKey: CLIENT_KEY, token })).status === 200);
  check('withdrawn hidden from other user -> 404', (await call('GET', `/adoptions/${id}`, undefined, { clientKey: CLIENT_KEY, token: token2 })).status === 404);
  check('withdrawn not in board', !(await call('GET', '/adoptions', undefined, { clientKey: CLIENT_KEY })).body.data.some((l: any) => l.id === id));
  check('adopted from WITHDRAWN -> 409', (await call('PATCH', `/adoptions/${id}/adopted`, undefined, { token })).status === 409);
  const rl = await call('PATCH', `/adoptions/${id}/relist`, undefined, { token });
  check('relist -> AVAILABLE', rl.status === 200 && rl.body.status === 'AVAILABLE');
  const ad = await call('PATCH', `/adoptions/${id}/adopted`, undefined, { token });
  check('adopted -> ADOPTED with adoptedAt', ad.status === 200 && ad.body.status === 'ADOPTED' && !!ad.body.adoptedAt, ad.body);
  check('adopted by other user -> 403', (await call('PATCH', `/adoptions/${id}/adopted`, undefined, { token: token2 })).status === 403);

  // Delete
  check('DELETE by other user -> 403', (await call('DELETE', `/adoptions/${id}`, undefined, { token: token2 })).status === 403);
  check('DELETE -> 204', (await call('DELETE', `/adoptions/${id}`, undefined, { token })).status === 204);
  check('pet row gone', (await prisma.pet.findUnique({ where: { id: petId } })) === null);
  check('GET deleted -> 404', (await call('GET', `/adoptions/${id}`, undefined, { clientKey: CLIENT_KEY, token })).status === 404);
} finally {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, EMAIL2] } } });
  await prisma.$disconnect();
  await pool.end();
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
