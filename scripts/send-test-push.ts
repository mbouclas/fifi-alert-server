/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
/**
 * Send a test push notification to every registered device that has a push token.
 * Uses the real FCMService / APNsService / WebPushService so it exercises the
 * same delivery path as production. Reads credentials from .env.
 *
 *   bun run scripts/send-test-push.ts                     # dry run: list targets only
 *   bun run scripts/send-test-push.ts --send              # actually send
 *   bun run scripts/send-test-push.ts --send --platform WEB
 *   bun run scripts/send-test-push.ts --send --email foo@bar.com
 *   bun run scripts/send-test-push.ts --send --title "Hi" --body "Testing 123"
 *   bun run scripts/send-test-push.ts --send --prune      # clear tokens the provider reports dead
 */
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma';
import { FCMService } from '../src/notification/fcm.service';
import { APNsService } from '../src/notification/apns.service';
import { WebPushService } from '../src/notification/webpush.service';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const SEND = flag('send');
const PRUNE = flag('prune');
const PLATFORM = arg('platform')?.toUpperCase();
const EMAIL = arg('email');
const TITLE = arg('title') ?? 'FiFi Alert test notification';
const BODY =
  arg('body') ?? `Test push sent at ${new Date().toLocaleTimeString()}`;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const devices = await prisma.device.findMany({
    where: {
      push_token: { not: null },
      push_enabled: true,
      ...(PLATFORM ? { platform: PLATFORM as any } : {}),
      ...(EMAIL ? { user: { email: EMAIL } } : {}),
    },
    select: {
      id: true,
      platform: true,
      push_token: true,
      device_uuid: true,
      app_version: true,
      user: { select: { id: true, email: true } },
    },
    orderBy: { id: 'asc' },
  });

  console.log(`Found ${devices.length} device(s) with a push token`);
  for (const d of devices) {
    console.log(
      `  #${d.id} ${d.platform.padEnd(7)} user=${d.user.email} uuid=${d.device_uuid.slice(0, 8)} app=${d.app_version ?? '-'}`,
    );
  }
  if (!SEND) {
    console.log('\nDry run. Re-run with --send to deliver.');
    return;
  }
  if (devices.length === 0) return;

  const config = new ConfigService();
  const fcm = new FCMService(config);
  const apns = new APNsService(config);
  const webpush = new WebPushService(config);
  await Promise.all([fcm.onModuleInit(), apns.onModuleInit(), webpush.onModuleInit()]);

  const payload = {
    title: TITLE,
    body: BODY,
    data: { type: 'TEST', sentAt: new Date().toISOString() },
  };

  let ok = 0;
  let failed = 0;
  const dead: number[] = [];

  for (const d of devices) {
    const token = d.push_token!;
    let r: { success: boolean; error?: string; invalidToken?: boolean };
    if (d.platform === 'ANDROID') r = await fcm.sendNotification(token, payload);
    else if (d.platform === 'IOS') r = await apns.sendNotification(token, payload);
    else r = await webpush.sendNotification(token, payload);

    if (r.success) {
      ok++;
      console.log(`  OK   #${d.id} ${d.platform} ${d.user.email}`);
    } else {
      failed++;
      console.log(
        `  FAIL #${d.id} ${d.platform} ${d.user.email}: ${r.error}${r.invalidToken ? ' (dead token)' : ''}`,
      );
      if (r.invalidToken) dead.push(d.id);
    }
  }

  console.log(`\nSent: ${ok}  Failed: ${failed}  Dead tokens: ${dead.length}`);

  if (PRUNE && dead.length) {
    await prisma.device.updateMany({
      where: { id: { in: dead } },
      data: { push_token: null, push_token_updated_at: new Date() },
    });
    console.log(`Cleared push_token on ${dead.length} device(s)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
