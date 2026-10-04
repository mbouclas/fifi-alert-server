/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
/**
 * Smoke test for the "pet found" thank-you flow against a running server.
 * Covers BACKEND_WORK_ORDER_THANK_YOU.md §4.
 *
 * Usage:
 *   CLIENT_API_KEYS=devkey PORT=3199 bun run src/main.ts   (in another terminal, Redis up)
 *   API_URL=http://localhost:3199 CLIENT_KEY=devkey bun run scripts/smoke-thank-you.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma';

const API = process.env.API_URL ?? 'http://localhost:3199';
const CLIENT_KEY = process.env.CLIENT_KEY ?? 'devkey';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const RUN = Date.now();
const OWNER = `smoke-thanks-owner-${RUN}@example.com`;
const HELPER_NOTIFIED = `smoke-thanks-notified-${RUN}@example.com`;
const HELPER_SIGHTING = `smoke-thanks-sighting-${RUN}@example.com`;
let failed = 0;
const check = (n: string, ok: boolean, d?: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + JSON.stringify(d)}`);
};
async function call(method: string, path: string, body?: unknown, opts: { token?: string; clientKey?: string } = {}) {
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
  const signup = await call('POST', '/auth/signup', { email, password: 'SmokeTest123!', firstName: 'Smoke', lastName: 'Thanks' });
  if (signup.status >= 400) throw new Error(`signup ${email} -> ${signup.status} ${JSON.stringify(signup.body)}`);
  const row = await prisma.user.update({ where: { email }, data: { emailVerified: true }, select: { id: true } });
  const token = (await call('POST', '/auth/login', { email, password: 'SmokeTest123!' })).body.accessToken as string;
  return { id: row.id, token };
}
async function device(userId: number, platform: 'WEB' | 'ANDROID', token: string | null, enabled = true) {
  return prisma.device.create({
    data: { user_id: userId, device_uuid: `smoke-thanks-${RUN}-${userId}-${platform}-${Math.random().toString(36).slice(2, 8)}`, platform, push_token: token, push_enabled: enabled },
    select: { id: true },
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const KEY = { clientKey: CLIENT_KEY };
const SNAPSHOT_KEYS = ['tagId', 'alertId', 'petName', 'petPhotoUrl', 'thankYouMessage', 'resolvedAt', 'neighboursNotified', 'sightingsReported', 'expiresAt'].sort();

const alertBody = (petId: number, name: string) => ({
  petId,
  pet: { name, species: 'DOG', description: 'Golden retriever, friendly' },
  // Remote South Atlantic spot so no real dev user's zones match and the live HIGH wave stays empty.
  location: { lat: -40.1234567, lon: -20.7654321, address: 'Middle of nowhere', lastSeenTime: new Date().toISOString(), radiusKm: 5 },
  contact: { phone: '+35799123456', email: OWNER, isPhonePublic: true },
  notes: 'private note',
});

const userIds: number[] = [];
try {
  // Swagger
  const spec = (await call('GET', '/api/openapi.json')).body;
  const reunionPath = spec.paths?.['/alerts/by-tag/{tagId}/reunion']?.get;
  check('swagger: reunion path documented with client-key security and 200/401/404/429', !!reunionPath && JSON.stringify(reunionPath.security ?? []).includes('client-key') && ['200', '401', '404', '429'].every((c) => !!reunionPath.responses[c]), reunionPath && Object.keys(reunionPath.responses));
  check('swagger: reunion 200 references ReunionSnapshotDto', JSON.stringify(reunionPath?.responses?.['200'] ?? {}).includes('ReunionSnapshotDto'));
  const snapSchema = spec.components?.schemas?.ReunionSnapshotDto?.properties ?? {};
  check('swagger: ReunionSnapshotDto has exactly the §3.1 fields', Object.keys(snapSchema).sort().join() === SNAPSHOT_KEYS.join(), Object.keys(snapSchema));
  const resolveSchema = spec.components?.schemas?.ResolveAlertDto?.properties ?? {};
  check('swagger: ResolveAlertDto.thankYouMessage string maxLength 500', resolveSchema.thankYouMessage?.type === 'string' && resolveSchema.thankYouMessage?.maxLength === 500, resolveSchema.thankYouMessage);
  check('swagger: resolve documents 400', !!spec.paths?.['/alerts/{id}/resolve']?.post?.responses?.['400']);

  // Fixture: owner + pet + ACTIVE alert; one helper who "received" the alert, one who reported a sighting
  const owner = await user(OWNER);
  const notified = await user(HELPER_NOTIFIED);
  const reporter = await user(HELPER_SIGHTING);
  userIds.push(owner.id, notified.id, reporter.id);
  check('login x3', !!owner.token && !!notified.token && !!reporter.token);
  const petType = await prisma.petType.findFirst({ select: { id: true } });
  const pet = await call('POST', '/pets', { petTypeId: petType!.id, name: 'Bella', gender: 'FEMALE', size: 'MEDIUM', photos: ['https://cdn.example.test/pets/bella/a.jpg', 'https://cdn.example.test/pets/bella/b.jpg'] }, { token: owner.token });
  check('POST /pets -> 201 with tagId', pet.status === 201 && typeof pet.body.tagId === 'string', pet.body);
  const tagId: string = pet.body.tagId;
  await prisma.pet.update({ where: { id: pet.body.id }, data: { primaryPhoto: 'https://cdn.example.test/pets/bella/b.jpg' } });

  const created = await call('POST', '/alerts', alertBody(pet.body.id, 'Bella'), { token: owner.token });
  check('POST /alerts -> 201 ACTIVE', created.status === 201 && created.body.status === 'ACTIVE', created.body);
  const alertId: number = created.body.id;

  // Devices: owner (must never be pushed), notified helper with two devices (one disabled), reporter with one
  const ownerDev = await device(owner.id, 'WEB', `owner-${RUN}`);
  const notifiedDevA = await device(notified.id, 'WEB', `notified-a-${RUN}`);
  const notifiedDevB = await device(notified.id, 'ANDROID', `notified-b-${RUN}`);
  const notifiedDevOff = await device(notified.id, 'WEB', `notified-off-${RUN}`, false);
  const reporterDev = await device(reporter.id, 'ANDROID', `reporter-${RUN}`);

  // Notification log: the alert reached the notified helper (SENT on A, FAILED on B) and the owner (should still be excluded)
  await prisma.notification.createMany({
    data: [
      { alert_id: alertId, device_id: notifiedDevA.id, confidence: 'HIGH', match_reason: 'FRESH_GPS', status: 'SENT', sent_at: new Date() },
      { alert_id: alertId, device_id: notifiedDevB.id, confidence: 'HIGH', match_reason: 'FRESH_GPS', status: 'FAILED', failed_at: new Date(), failure_reason: 'WEB_PUSH_NOT_INITIALIZED' },
      { alert_id: alertId, device_id: ownerDev.id, confidence: 'HIGH', match_reason: 'FRESH_GPS', status: 'SENT', sent_at: new Date() },
    ],
  });
  // Sightings: one live, one dismissed, both by the reporter (counted once as a helper, twice in sightingsReported)
  for (const dismissed of [false, true]) {
    await prisma.$executeRaw`INSERT INTO sighting (alert_id, reporter_id, sighting_lat, sighting_lon, location_point, sighting_time, dismissed, created_at, updated_at)
      VALUES (${alertId}, ${reporter.id}, 35.17, 33.37, ST_SetSRID(ST_MakePoint(33.37, 35.17), 4326), NOW(), ${dismissed}, NOW(), NOW())`;
  }

  // Before resolve: no reunion yet
  check('GET reunion before resolve -> 404', (await call('GET', `/alerts/by-tag/${tagId}/reunion`, undefined, KEY)).status === 404);

  // Validation
  const tooLong = await call('POST', `/alerts/${alertId}/resolve`, { outcome: 'FOUND_SAFE', shareSuccessStory: true, thankYouMessage: 'a'.repeat(501) }, { token: owner.token });
  check('resolve with 501-char thankYouMessage -> 400', tooLong.status === 400, tooLong.body);
  check('alert still ACTIVE after 400', (await prisma.alert.findUnique({ where: { id: alertId }, select: { status: true } }))?.status === 'ACTIVE');
  const notOwner = await call('POST', `/alerts/${alertId}/resolve`, { outcome: 'FOUND_SAFE' }, { token: notified.token });
  check('resolve by non-owner -> 403', notOwner.status === 403, notOwner.body);

  // Resolve with HTML in the note
  const message = '<b>Thanks</b> everyone\u0007 who   looked for <i>Bella</i>!';
  const resolved = await call('POST', `/alerts/${alertId}/resolve`, { outcome: 'FOUND_SAFE', shareSuccessStory: true, thankYouMessage: message }, { token: owner.token });
  check('resolve -> 200 RESOLVED', resolved.status === 200 && resolved.body.status === 'RESOLVED', { status: resolved.status, body: resolved.body });

  const snapRow = await prisma.reunionSnapshot.findUnique({ where: { tagId } });
  check('snapshot row exists for the tag', !!snapRow && snapRow.alertId === alertId, snapRow);
  check('snapshot thankYouMessage sanitised', snapRow?.thankYouMessage === 'Thanks everyone who looked for Bella!', snapRow?.thankYouMessage);
  check('snapshot petPhotoUrl = pet.primaryPhoto', snapRow?.petPhotoUrl === 'https://cdn.example.test/pets/bella/b.jpg', snapRow?.petPhotoUrl);
  check('snapshot neighboursNotified = 2 distinct delivered users (owner + notified; FAILED row ignored)', snapRow?.neighboursNotified === 2, snapRow?.neighboursNotified);
  check('snapshot sightingsReported = 2 (dismissed included)', snapRow?.sightingsReported === 2, snapRow?.sightingsReported);
  check('snapshot expiresAt ≈ resolvedAt + 30d', !!snapRow && Math.abs(snapRow.expiresAt.getTime() - snapRow.resolvedAt.getTime() - 30 * 86400_000) < 1000);

  // Public read
  check('GET reunion without key -> 401', (await call('GET', `/alerts/by-tag/${tagId}/reunion`)).status === 401);
  const pub = await call('GET', `/alerts/by-tag/${tagId}/reunion`, undefined, KEY);
  check('GET reunion with key -> 200', pub.status === 200, pub.body);
  check('GET reunion: exactly the §3.1 fields', Object.keys(pub.body ?? {}).sort().join() === SNAPSHOT_KEYS.join(), Object.keys(pub.body ?? {}));
  check('GET reunion: values', pub.body?.tagId === tagId && pub.body?.alertId === alertId && pub.body?.petName === 'Bella' && pub.body?.thankYouMessage === 'Thanks everyone who looked for Bella!' && typeof pub.body?.resolvedAt === 'string' && typeof pub.body?.expiresAt === 'string', pub.body);
  check('GET reunion with bearer only -> 200 (bearer ignored, key not needed)', (await call('GET', `/alerts/by-tag/${tagId}/reunion`, undefined, { token: notified.token })).status === 200);
  check('GET reunion unknown tag -> 404', (await call('GET', '/alerts/by-tag/ZZZZZZZZZ/reunion', undefined, KEY)).status === 404);
  check('GET reunion malformed tag -> 400', (await call('GET', '/alerts/by-tag/bad!/reunion', undefined, KEY)).status === 400);
  check('GET /alerts/by-tag/{tag} (live) -> 404 after resolve', (await call('GET', `/alerts/by-tag/${tagId}`, undefined, KEY)).status === 404);

  // Second resolve -> 422, no second fan-out
  const again = await call('POST', `/alerts/${alertId}/resolve`, { outcome: 'FOUND_SAFE', shareSuccessStory: true, thankYouMessage: 'again' }, { token: owner.token });
  check('second resolve -> 422', again.status === 422, again.body);

  // Fan-out: wait for BullMQ
  let rows: any[] = [];
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    rows = await prisma.notification.findMany({ where: { alert_id: alertId, match_reason: 'SUCCESS_STORY' }, select: { device_id: true, status: true, failure_reason: true, meta: true } });
    if (rows.length >= 3 && rows.every((r) => r.status !== 'QUEUED')) break;
  }
  const targeted = rows.filter((r) => (r.meta as any)?.channel !== 'EMAIL').map((r) => r.device_id).sort((a, b) => a - b);
  const expectedDevices = [notifiedDevA.id, notifiedDevB.id, reporterDev.id].sort((a, b) => a - b);
  check('fan-out: one SUCCESS_STORY row per enabled helper device (notified A+B, reporter)', expectedDevices.every((d) => targeted.includes(d)), { targeted, expectedDevices });
  // Any extra device must belong to a user the live wave actually reached (zone match on the dev DB), never a stranger.
  const extra = targeted.filter((d) => !expectedDevices.includes(d));
  if (extra.length) {
    const extraUsers = new Set((await prisma.device.findMany({ where: { id: { in: extra } }, select: { user_id: true } })).map((d) => d.user_id));
    const reached = new Set((await prisma.notification.findMany({ where: { alert_id: alertId, match_reason: { not: 'SUCCESS_STORY' }, status: { in: ['SENT', 'DELIVERED', 'OPENED'] } }, select: { device: { select: { user_id: true } } } })).map((n) => n.device.user_id));
    check('fan-out: extra devices belong to users the live wave reached', [...extraUsers].every((u) => reached.has(u)), { extraUsers: [...extraUsers], reached: [...reached] });
  }
  check('fan-out: owner device not targeted', !targeted.includes(ownerDev.id));
  check('fan-out: disabled device not targeted', !targeted.includes(notifiedDevOff.id));
  check('fan-out: rows carry meta.kind alert_resolved', rows.every((r) => (r.meta as any)?.kind === 'alert_resolved'), rows.map((r) => r.meta));
  check('fan-out: rows left QUEUED state (push attempted)', rows.every((r) => r.status !== 'QUEUED'), rows.map((r) => [r.status, r.failure_reason]));
  // Email pass: both helpers are emailVerified so both get a thank-you email, logged once per user on one of their devices.
  const emailRows = await prisma.notification.findMany({ where: { alert_id: alertId, match_reason: 'SUCCESS_STORY', meta: { path: ['channel'], equals: 'EMAIL' } }, select: { device_id: true, status: true, failure_reason: true, meta: true } });
  const emailUsers = new Set((await prisma.device.findMany({ where: { id: { in: emailRows.map((r) => r.device_id) } }, select: { user_id: true } })).map((d) => d.user_id));
  check('email: one EMAIL row per helper user (notified + reporter), owner excluded', emailUsers.has(notified.id) && emailUsers.has(reporter.id) && !emailUsers.has(owner.id) && emailRows.length === emailUsers.size, { emailRows, emailUsers: [...emailUsers] });
  check('email: rows carry meta.kind alert_resolved', emailRows.every((r) => (r.meta as any)?.kind === 'alert_resolved'));
  check('email: rows are SENT or FAILED (never QUEUED)', emailRows.every((r) => r.status === 'SENT' || r.status === 'FAILED'), emailRows.map((r) => [r.status, r.failure_reason]));
  const pushRows = rows.filter((r) => (r.meta as any)?.channel !== 'EMAIL');
  check('push rows unaffected by email pass (3 push rows)', pushRows.length === 3, pushRows.length);
  const sentAt = (await prisma.alert.findUnique({ where: { id: alertId }, select: { success_story_sent_at: true } }))?.success_story_sent_at;
  check('alert.success_story_sent_at set', !!sentAt);
  check('fan-out: no device pushed twice (422 resolve did not re-send)', new Set(targeted).size === targeted.length, targeted);

  // Expiry: push expiresAt into the past -> 404 and row deleted
  await prisma.reunionSnapshot.update({ where: { tagId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  check('GET reunion after expiresAt -> 404', (await call('GET', `/alerts/by-tag/${tagId}/reunion`, undefined, KEY)).status === 404);
  check('expired snapshot deleted lazily', (await prisma.reunionSnapshot.findUnique({ where: { tagId } })) === null);

  // FALSE_ALARM: no snapshot
  const pet2 = await call('POST', '/pets', { petTypeId: petType!.id, name: 'Rex', gender: 'MALE', size: 'LARGE' }, { token: owner.token });
  const created2 = await call('POST', '/alerts', alertBody(pet2.body.id, 'Rex'), { token: owner.token });
  const falseAlarm = await call('POST', `/alerts/${created2.body.id}/resolve`, { outcome: 'FALSE_ALARM', shareSuccessStory: true, thankYouMessage: 'oops' }, { token: owner.token });
  check('FALSE_ALARM resolve -> 200', falseAlarm.status === 200 && falseAlarm.body.status === 'RESOLVED', falseAlarm.body);
  check('FALSE_ALARM: no snapshot written', (await prisma.reunionSnapshot.findUnique({ where: { tagId: pet2.body.tagId } })) === null);
  await sleep(1500);
  check('FALSE_ALARM: no fan-out', (await prisma.notification.count({ where: { alert_id: created2.body.id, match_reason: 'SUCCESS_STORY' } })) === 0);
  check('FALSE_ALARM: success_story_sent_at stays null', (await prisma.alert.findUnique({ where: { id: created2.body.id }, select: { success_story_sent_at: true } }))?.success_story_sent_at === null);

  // Resolve without a message on a tagged pet -> snapshot with null message, no fan-out when shareSuccessStory is false
  const pet3 = await call('POST', '/pets', { petTypeId: petType!.id, name: 'Milo', gender: 'MALE', size: 'SMALL' }, { token: owner.token });
  const created3 = await call('POST', '/alerts', alertBody(pet3.body.id, 'Milo'), { token: owner.token });
  const quiet = await call('POST', `/alerts/${created3.body.id}/resolve`, { outcome: 'RETURNED_HOME', shareSuccessStory: false, thankYouMessage: '   <br/>  ' }, { token: owner.token });
  check('RETURNED_HOME without story -> 200', quiet.status === 200, quiet.body);
  const snap3 = await prisma.reunionSnapshot.findUnique({ where: { tagId: pet3.body.tagId } });
  check('snapshot written with null thankYouMessage (whitespace/HTML-only note dropped)', !!snap3 && snap3.thankYouMessage === null && snap3.petPhotoUrl === null, snap3);
  await sleep(1000);
  check('shareSuccessStory=false: no fan-out', (await prisma.notification.count({ where: { alert_id: created3.body.id, match_reason: 'SUCCESS_STORY' } })) === 0);
} finally {
  const owner = await prisma.user.findUnique({ where: { email: OWNER }, select: { id: true } });
  if (owner) {
    await prisma.alert.deleteMany({ where: { creator_id: owner.id } });
    await prisma.pet.deleteMany({ where: { userId: owner.id } });
  }
  await prisma.user.deleteMany({ where: { email: { in: [OWNER, HELPER_NOTIFIED, HELPER_SIGHTING] } } });
  await prisma.$disconnect();
  await pool.end();
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
