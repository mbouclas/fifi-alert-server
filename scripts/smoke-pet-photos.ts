/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
/**
 * Smoke test for pet photos: MAX_PET_PHOTOS limit and primaryPhoto handling.
 * Run the server with MAX_PET_PHOTOS=2 first, then:
 *   API_URL=http://localhost:3113 bun run scripts/smoke-pet-photos.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma';

const API = process.env.API_URL ?? 'http://localhost:3113';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const EMAIL = `smoke-pet-photos-${Date.now()}@example.com`;
const A = 'https://example.com/a.jpg';
const B = 'https://example.com/b.jpg';
const C = 'https://example.com/c.jpg';
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
  const spec = (await call('GET', '/api/openapi.json')).body;
  check('swagger: PetResponseDto.primaryPhoto', !!spec.components?.schemas?.PetResponseDto?.properties?.primaryPhoto);
  check('swagger: CreatePetDto.primaryPhoto', !!spec.components?.schemas?.CreatePetDto?.properties?.primaryPhoto);

  await call('POST', '/auth/signup', { email: EMAIL, password: 'SmokeTest123!', firstName: 'Smoke', lastName: 'Photos' });
  await prisma.user.update({ where: { email: EMAIL }, data: { emailVerified: true } });
  const token = (await call('POST', '/auth/login', { email: EMAIL, password: 'SmokeTest123!' })).body.accessToken;
  check('login', !!token);
  const petType = await prisma.petType.findFirst({ select: { id: true } });
  check('a pet type exists', !!petType);
  const base = { petTypeId: petType!.id, name: 'Smoke' };

  // Two photos, no primary -> primary resolves to first
  const created = await call('POST', '/pets', { ...base, photos: [A, B] }, token);
  check('create with 2 photos -> 201', created.status === 201, created);
  check('primaryPhoto defaults to photos[0]', created.body.primaryPhoto === A, created.body.primaryPhoto);
  const id = created.body.id;

  // Alert linked to the pet: its snapshot must follow pet photo/name changes
  const alert = await call('POST', '/alerts', {
    petId: id,
    pet: { name: 'Smoke', species: 'DOG', description: 'Smoke snapshot dog', photos: [A] },
    location: { lat: 35.17, lon: 33.36, lastSeenTime: new Date().toISOString(), radiusKm: 1 },
    contact: { isPhonePublic: false },
  }, token);
  check('create alert for pet -> 201', alert.status === 201, alert.body);
  const alertId = alert.body.id;

  // Three photos exceeds MAX_PET_PHOTOS=2 -> 422 (DTO ArrayMaxSize or service)
  const tooMany = await call('POST', '/pets', { ...base, photos: [A, B, C] }, token);
  check('create with 3 photos -> 422', tooMany.status === 422, tooMany);

  // Primary not in photos -> 422
  const badPrimary = await call('POST', '/pets', { ...base, photos: [A], primaryPhoto: C }, token);
  check('create with primary not in photos -> 422', badPrimary.status === 422, badPrimary);

  // Set explicit primary to B
  const setB = await call('PUT', `/pets/${id}`, { primaryPhoto: B }, token);
  check('update primaryPhoto=B -> 200', setB.status === 200 && setB.body.primaryPhoto === B, setB);
  const snapB = await call('GET', `/alerts/${alertId}`, undefined, token);
  check('alert snapshot has primary first after primary change', JSON.stringify(snapB.body.petPhotos) === JSON.stringify([B, A]), snapB.body.petPhotos);

  // Update primary to URL not stored -> 422
  const badUpd = await call('PUT', `/pets/${id}`, { primaryPhoto: C }, token);
  check('update primary not in photos -> 422', badUpd.status === 422, badUpd);

  // Remove B from photos -> stored primary reset, response falls back to A
  const dropB = await call('PUT', `/pets/${id}`, { photos: [A] }, token);
  check('remove primary from photos -> falls back to first', dropB.status === 200 && dropB.body.primaryPhoto === A, dropB);
  const row = await prisma.pet.findUnique({ where: { id }, select: { primaryPhoto: true } });
  check('db primary_photo reset to null', row?.primaryPhoto === null, row);
  const snapA = await call('GET', `/alerts/${alertId}`, undefined, token);
  check('alert snapshot follows photo removal', JSON.stringify(snapA.body.petPhotos) === JSON.stringify([A]), snapA.body.petPhotos);
  const renamed = await call('PUT', `/pets/${id}`, { name: 'Smoke Renamed' }, token);
  const snapN = await call('GET', `/alerts/${alertId}`, undefined, token);
  check('alert snapshot follows pet rename', renamed.status === 200 && snapN.body.petName === 'Smoke Renamed', snapN.body.petName);

  // Upload endpoint: 3 multipart files exceed the limit -> 400 (multer LIMIT_UNEXPECTED_FILE)
  const form = new FormData();
  for (const n of ['a', 'b', 'c']) form.append('photos', new Blob([new Uint8Array(64)], { type: 'image/png' }), `${n}.png`);
  const up = await fetch(`${API}/pets/${id}/photos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  check('upload 3 files with limit 2 -> 400', up.status === 400, { status: up.status, body: await up.text() });

  await prisma.alert.deleteMany({ where: { creator_id: created.body.userId } });
  await prisma.pet.deleteMany({ where: { userId: created.body.userId } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
} catch (e) {
  failed++;
  console.error('ERROR', e);
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
