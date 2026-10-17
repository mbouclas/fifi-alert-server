/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
/**
 * Smoke test for the invitations feature against a running server.
 * Covers BACKEND_WORK_ORDER_INVITATIONS.md §4 end to end, INCLUDING the email:
 * this script runs a tiny SMTP sink on 127.0.0.1:2599 that accepts everything,
 * so point the server's SMTP at it and the script can read the invite links
 * (and the signup verification links) out of the captured messages.
 *
 * Usage (two terminals):
 *   INVITE_BASE_URL=http://localhost:4173 CLIENT_API_KEYS=devkey PORT=3199 \
 *   SMTP_PROVIDER= SMTP_HOST=127.0.0.1 SMTP_PORT=2599 SMTP_SECURE=false SMTP_USER= SMTP_PASSWORD= \
 *   bun run src/main.ts
 *
 *   API_URL=http://localhost:3199 CLIENT_KEY=devkey bun run scripts/smoke-invitations.ts
 *
 * Disabled mode (server started WITHOUT INVITE_BASE_URL):
 *   EXPECT_DISABLED=1 API_URL=http://localhost:3199 CLIENT_KEY=devkey bun run scripts/smoke-invitations.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import net from 'net';
import { PrismaClient } from '../src/generated/prisma';

const API = process.env.API_URL ?? 'http://localhost:3199';
const CLIENT_KEY = process.env.CLIENT_KEY ?? 'devkey';
const SMTP_PORT = Number(process.env.SMOKE_SMTP_PORT ?? 2599);
const EXPECT_DISABLED = process.env.EXPECT_DISABLED === '1';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const STAMP = Date.now();
const PASSWORD = 'SmokeTest123!';

let failed = 0;
const check = (n: string, ok: boolean, d?: unknown) => {
  if (!ok) failed++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + JSON.stringify(d)}`,
  );
};

// ---------------------------------------------------------------------------
// SMTP sink
// ---------------------------------------------------------------------------
interface CapturedMail {
  to: string[];
  raw: string;
  text: string;
}
const mails: CapturedMail[] = [];

function decodeQp(s: string): string {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
}
/** Best-effort: decode every MIME part to text so we can regex links out. */
function decodeMime(raw: string): string {
  const parts = raw.split(/\r?\n--[^\r\n]+\r?\n/);
  const out: string[] = [];
  for (const part of parts) {
    const sep = part.search(/\r?\n\r?\n/);
    const headers = sep >= 0 ? part.slice(0, sep) : '';
    const body = sep >= 0 ? part.slice(sep).trim() : part;
    const cte = /content-transfer-encoding:\s*([\w-]+)/i
      .exec(headers)?.[1]
      ?.toLowerCase();
    if (cte === 'base64') {
      out.push(
        Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8'),
      );
    } else if (cte === 'quoted-printable') {
      out.push(Buffer.from(decodeQp(body), 'latin1').toString('utf8'));
    } else {
      out.push(body);
    }
  }
  return out.join('\n');
}

function startSmtpSink(): Promise<net.Server> {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => {
      let buf = '';
      let inData = false;
      let data = '';
      let rcpts: string[] = [];
      sock.write('220 smoke-sink ESMTP\r\n');
      sock.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        for (;;) {
          if (inData) {
            const end = buf.indexOf('\r\n.\r\n');
            if (end < 0) return;
            data = buf.slice(0, end);
            buf = buf.slice(end + 5);
            inData = false;
            const raw = data;
            mails.push({ to: rcpts, raw, text: decodeMime(raw) });
            rcpts = [];
            sock.write('250 OK queued\r\n');
            continue;
          }
          const nl = buf.indexOf('\r\n');
          if (nl < 0) return;
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const cmd = line.split(' ')[0].toUpperCase();
          if (cmd === 'EHLO' || cmd === 'HELO')
            sock.write(
              '250-smoke-sink\r\n250-8BITMIME\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n',
            );
          else if (cmd === 'AUTH') sock.write('235 ok\r\n');
          else if (cmd === 'MAIL') sock.write('250 OK\r\n');
          else if (cmd === 'RCPT') {
            rcpts.push(/<([^>]+)>/.exec(line)?.[1] ?? line);
            sock.write('250 OK\r\n');
          } else if (cmd === 'DATA') {
            inData = true;
            sock.write('354 go\r\n');
          } else if (cmd === 'QUIT') {
            sock.write('221 bye\r\n');
            sock.end();
          } else if (cmd === 'RSET' || cmd === 'NOOP') sock.write('250 OK\r\n');
          else sock.write('250 OK\r\n');
        }
      });
      sock.on('error', () => undefined);
    });
    server.listen(SMTP_PORT, '127.0.0.1', () => resolve(server));
  });
}

async function waitForMail(
  to: string,
  re: RegExp,
  timeoutMs = 10000,
): Promise<CapturedMail | undefined> {
  const deadline = Date.now() + timeoutMs;
  const lower = to.toLowerCase();
  while (Date.now() < deadline) {
    const m = mails.find(
      (x) => x.to.some((t) => t.toLowerCase() === lower) && re.test(x.text),
    );
    if (m) return m;
    await new Promise((r) => setTimeout(r, 150));
  }
  return undefined;
}
const inviteTokenOf = (m?: CapturedMail) =>
  m ? /accept-invite\?token=([A-Za-z0-9_-]+)/.exec(m.text)?.[1] : undefined;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
let ipCounter = 10;
async function call(
  method: string,
  path: string,
  body?: unknown,
  opts: { token?: string; clientKey?: string; ip?: string } = {},
) {
  const r = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.clientKey ? { 'X-Client-Key': opts.clientKey } : {}),
      ...(opts.ip ? { 'X-Forwarded-For': opts.ip } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let j: any;
  try {
    j = JSON.parse(t);
  } catch {
    /* not json */
  }
  return { status: r.status, body: j ?? t };
}
const KEY = { clientKey: CLIENT_KEY };

async function signup(
  email: string,
  inviteToken?: string,
  first = 'Smoke',
  last = 'Invite',
) {
  return call(
    'POST',
    '/auth/signup',
    {
      email,
      password: PASSWORD,
      firstName: first,
      lastName: last,
      inviteToken,
    },
    { ...KEY, ip: `10.9.${ipCounter++}.1` },
  );
}
async function verifiedUser(email: string, first: string, last: string) {
  const r = await signup(email, undefined, first, last);
  if (r.status !== 201)
    throw new Error(
      `signup ${email} failed: ${r.status} ${JSON.stringify(r.body)}`,
    );
  await prisma.user.update({ where: { email }, data: { emailVerified: true } });
  const login = await call(
    'POST',
    '/auth/login',
    { email, password: PASSWORD },
    { ...KEY, ip: `10.9.${ipCounter++}.1` },
  );
  if (!login.body?.accessToken)
    throw new Error(
      `login ${email} failed: ${login.status} ${JSON.stringify(login.body)}`,
    );
  return login.body.accessToken as string;
}

const DTO_KEYS = [
  'id',
  'recipientEmail',
  'recipientName',
  'locale',
  'status',
  'createdAt',
  'sentAt',
  'expiresAt',
  'acceptedAt',
  'acceptedVia',
].sort();
const FORBIDDEN = [
  'subject',
  'body',
  'message',
  'token',
  'tokenHash',
  'convertedUserId',
  'senderUserId',
];
const isDto = (x: any) =>
  x &&
  Object.keys(x).sort().join() === DTO_KEYS.join() &&
  FORBIDDEN.every((k) => !(k in x));

const greekBody = (name: string) =>
  `Γεια σας ${name},\n\nΟ/Η Maria Papa πιστεύει ότι θα σας αρέσει το FiFi Alert.\n\nΔημιουργήστε δωρεάν λογαριασμό εδώ:\n{inviteLink}\n\nΤα λέμε εκεί,\nΗ ομάδα του FiFi Alert`;
const invite = (
  recipientEmail: string,
  extra: Record<string, unknown> = {},
) => ({
  recipientEmail,
  recipientName: 'Nikos',
  message: 'Έλα κι εσύ!',
  locale: 'el',
  subject: 'Ο/Η Maria Papa σας προσκαλεί στο FiFi Alert',
  body: greekBody('Nikos'),
  ...extra,
});

const createdEmails: string[] = [];
const rcpt = (tag: string) => {
  const e = `smoke-inv-${tag.toLowerCase()}-${STAMP}@example.test`;
  createdEmails.push(e);
  return e;
};

// ---------------------------------------------------------------------------
async function main() {
  const sink = await startSmtpSink();
  console.log(`SMTP sink on 127.0.0.1:${SMTP_PORT}; API ${API}`);

  // Swagger ---------------------------------------------------------------
  const spec = (await call('GET', '/api/openapi.json')).body;
  const p = spec.paths ?? {};
  check(
    'swagger: all six invitation paths present',
    !!p['/invitations']?.post &&
      !!p['/invitations']?.get &&
      !!p['/invitations/stats']?.get &&
      !!p['/invitations/accept/{token}']?.get &&
      !!p['/invitations/{id}']?.delete &&
      !!p['/invitations/{id}/resend']?.post,
    Object.keys(p).filter((k) => k.startsWith('/invitations')),
  );
  const accSec = JSON.stringify(
    p['/invitations/accept/{token}']?.get?.security ?? [],
  );
  check(
    'swagger: accept uses client-key security, not bearer',
    accSec.includes('client-key') && !accSec.includes('bearer'),
    accSec,
  );
  check(
    'swagger: POST /invitations bearer',
    JSON.stringify(p['/invitations']?.post?.security ?? []).includes('bearer'),
  );
  check(
    'swagger: POST /invitations documents 201/400/401/409/429/503',
    ['201', '400', '401', '409', '429', '503'].every(
      (c) => !!p['/invitations']?.post?.responses?.[c],
    ),
    Object.keys(p['/invitations']?.post?.responses ?? {}),
  );
  const schemas = spec.components?.schemas ?? {};
  check(
    'swagger: InvitationDto / CreateInvitationDto / InvitationPreviewDto / InvitationStatsDto schemas',
    [
      'InvitationDto',
      'CreateInvitationDto',
      'InvitationPreviewDto',
      'InvitationStatsDto',
    ].every((s) => !!schemas[s]),
  );
  check(
    'swagger: InvitationDto has no subject/body/token',
    FORBIDDEN.every((k) => !schemas.InvitationDto?.properties?.[k]),
  );
  check(
    'swagger: SignupDto.inviteToken optional',
    !!schemas.SignupDto?.properties?.inviteToken &&
      !(schemas.SignupDto?.required ?? []).includes('inviteToken'),
  );
  check(
    'swagger: SocialLoginDto.inviteToken optional',
    !!schemas.SocialLoginDto?.properties?.inviteToken &&
      !(schemas.SocialLoginDto?.required ?? []).includes('inviteToken'),
  );

  const senderEmail = rcpt('sender-a');
  const tokenA = await verifiedUser(senderEmail, 'Maria', 'Papa');
  const tokenB = await verifiedUser(rcpt('sender-b'), 'Bob', 'Second');
  const existingEmail = rcpt('existing');
  await verifiedUser(existingEmail, 'Already', 'Here');
  const auth = (token: string) => ({ token });

  if (EXPECT_DISABLED) {
    check(
      'disabled: POST /invitations -> 503',
      (await call('POST', '/invitations', invite(rcpt('x')), auth(tokenA)))
        .status === 503,
    );
    check(
      'disabled: GET /invitations -> 503',
      (await call('GET', '/invitations', undefined, auth(tokenA))).status ===
        503,
    );
    check(
      'disabled: GET /invitations/stats -> 503',
      (await call('GET', '/invitations/stats', undefined, auth(tokenA)))
        .status === 503,
    );
    check(
      'disabled: GET /invitations/accept/x -> 503',
      (await call('GET', '/invitations/accept/abc', undefined, KEY)).status ===
        503,
    );
    check(
      'disabled: DELETE /invitations/1 -> 503',
      (await call('DELETE', '/invitations/1', undefined, auth(tokenA)))
        .status === 503,
    );
    check(
      'disabled: POST /invitations/1/resend -> 503',
      (await call('POST', '/invitations/1/resend', undefined, auth(tokenA)))
        .status === 503,
    );
    const r = await call(
      'POST',
      '/invitations',
      invite(rcpt('y')),
      auth(tokenA),
    );
    check(
      'disabled: body is { message: "Invitations not configured" }',
      r.body?.message === 'Invitations not configured',
      r.body,
    );
    return sink;
  }

  // Validation ------------------------------------------------------------
  check(
    'POST no bearer -> 401',
    (await call('POST', '/invitations', invite(rcpt('anon')))).status === 401,
  );
  let r = await call(
    'POST',
    '/invitations',
    invite(rcpt('v1'), { body: 'no link here' }),
    auth(tokenA),
  );
  check(
    'body without {inviteLink} -> 400 with explicit message',
    r.status === 400 &&
      JSON.stringify(r.body.message).includes('exactly one {inviteLink}'),
    r.body,
  );
  r = await call(
    'POST',
    '/invitations',
    invite(rcpt('v2'), { body: 'a {inviteLink} b {inviteLink}' }),
    auth(tokenA),
  );
  check(
    'body with two placeholders -> 400',
    r.status === 400 && JSON.stringify(r.body.message).includes('exactly one'),
    r.body,
  );
  r = await call(
    'POST',
    '/invitations',
    invite(rcpt('v3'), {
      body: 'Click <a href="http://evil">here</a> {inviteLink}',
    }),
    auth(tokenA),
  );
  check(
    'body with <a href> -> 400 plain-text message',
    r.status === 400 && JSON.stringify(r.body.message).includes('plain text'),
    r.body,
  );
  r = await call(
    'POST',
    '/invitations',
    invite(rcpt('v4'), { subject: 'x'.repeat(201) }),
    auth(tokenA),
  );
  check('subject 201 chars -> 400', r.status === 400, r.body);
  r = await call(
    'POST',
    '/invitations',
    invite(rcpt('v5'), { body: 'x'.repeat(3989) + ' {inviteLink}' }),
    auth(tokenA),
  );
  check('body 4001 chars -> 400', r.status === 400, r.body);
  r = await call(
    'POST',
    '/invitations',
    invite(rcpt('v6'), { locale: 'xx' }),
    auth(tokenA),
  );
  check(
    'unsupported locale -> 400',
    r.status === 400 && JSON.stringify(r.body.message).includes('locale'),
    r.body,
  );
  r = await call(
    'POST',
    '/invitations',
    invite(rcpt('v7'), { body: 'bad\ttab {inviteLink}' }),
    auth(tokenA),
  );
  check('control character (tab) in body -> 400', r.status === 400, r.body);
  r = await call(
    'POST',
    '/invitations',
    invite(rcpt('v8'), {
      subject: 'Probe\nBcc: victim@example.test\nX-Injected: yes',
    }),
    auth(tokenA),
  );
  check(
    'newline in subject (header injection probe) -> 400 single line',
    r.status === 400 && JSON.stringify(r.body.message).includes('single line'),
    r.body,
  );
  r = await call(
    'POST',
    '/invitations',
    invite(rcpt('v9'), { subject: 'Probe\r\nBcc: victim@example.test' }),
    auth(tokenA),
  );
  check('CRLF in subject -> 400', r.status === 400, r.body);
  r = await call(
    'POST',
    '/invitations',
    invite(senderEmail.toUpperCase()),
    auth(tokenA),
  );
  check('recipient = own email -> 400', r.status === 400, r.body);
  r = await call('POST', '/invitations', invite(existingEmail), auth(tokenA));
  check(
    'recipient already a user -> 409 already_registered',
    r.status === 409 && r.body.code === 'already_registered',
    r.body,
  );

  // Create + email --------------------------------------------------------
  const r1 = rcpt('R1');
  const mixedCase = r1.replace('smoke', 'SMOKE');
  r = await call('POST', '/invitations', invite(mixedCase), auth(tokenA));
  check(
    'POST valid -> 201 with DTO',
    r.status === 201 && isDto(r.body),
    r.body,
  );
  check(
    'DTO: pending, lower-cased email, acceptedAt/acceptedVia null',
    r.body.status === 'pending' &&
      r.body.recipientEmail === r1 &&
      r.body.acceptedAt === null &&
      r.body.acceptedVia === null,
    r.body,
  );
  check(
    'DTO: expiresAt = sentAt + 30 days',
    Math.abs(
      new Date(r.body.expiresAt).getTime() -
        new Date(r.body.sentAt).getTime() -
        30 * 86400000,
    ) < 2000,
    r.body,
  );
  const inv1 = r.body;
  const mail1 = await waitForMail(mixedCase, /accept-invite\?token=/);
  check(
    'one email arrives at the recipient (original casing on To:)',
    !!mail1,
    mails.map((m) => m.to),
  );
  const T1 = inviteTokenOf(mail1);
  check(
    'email contains a link to INVITE_BASE_URL/accept-invite?token=…',
    !!T1 && mail1!.text.includes('/accept-invite?token=' + T1),
    mail1?.text.slice(0, 300),
  );
  check(
    'email is in Greek (body text) and has the subject',
    !!mail1 &&
      mail1.text.includes('Δημιουργήστε δωρεάν λογαριασμό') &&
      /Subject:.*(προσκαλεί|=\?UTF-8\?)/i.test(mail1.raw),
    mail1?.raw.slice(0, 400),
  );
  check(
    'email has no raw {inviteLink} and no unsubscribe link',
    !!mail1 &&
      !mail1.text.includes('{inviteLink}') &&
      !/unsubscribe/i.test(mail1.text),
  );
  check(
    'email HTML names the sender in the footer',
    !!mail1 && mail1.text.includes('Maria Papa'),
  );
  check(
    'email HTML has the link as an anchor',
    !!mail1 &&
      mail1.text.includes(
        `href="http://localhost:4173/accept-invite?token=${T1}"`,
      ),
    mail1?.text.match(/href="[^"]*accept-invite[^"]*"/)?.[0],
  );
  const dbRow1 = await prisma.invitation.findUnique({
    where: { id: Number(inv1.id) },
  });
  check(
    'DB stores the body template WITH {inviteLink} and a 64-hex token hash',
    !!dbRow1 &&
      dbRow1.body.includes('{inviteLink}') &&
      /^[0-9a-f]{64}$/.test(dbRow1.tokenHash) &&
      !dbRow1.body.includes(T1 ?? '@@'),
  );
  const log1 = await prisma.invitationSendLog.findMany({
    where: { invitationId: Number(inv1.id) },
  });
  check(
    'send log row with outcome sent',
    log1.length === 1 && log1[0].outcome === 'sent',
    log1,
  );

  r = await call('POST', '/invitations', invite(r1), auth(tokenA));
  check(
    'second pending invite to same address -> 409 invite_pending',
    r.status === 409 && r.body.code === 'invite_pending',
    r.body,
  );
  r = await call('POST', '/invitations', invite(r1), auth(tokenB));
  check(
    'another sender may invite the same address -> 201',
    r.status === 201,
    r.body,
  );
  const invB = r.body;

  // Accept preview --------------------------------------------------------
  check(
    'accept without X-Client-Key -> 401',
    (await call('GET', `/invitations/accept/${T1}`)).status === 401,
  );
  check(
    'accept with wrong key -> 401',
    (
      await call('GET', `/invitations/accept/${T1}`, undefined, {
        clientKey: 'nope',
      })
    ).status === 401,
  );
  r = await call('GET', `/invitations/accept/${T1}`, undefined, {
    ...KEY,
    ip: '10.1.1.1',
  });
  check(
    'accept with key + pending token -> 200 exactly five fields',
    r.status === 200 &&
      Object.keys(r.body).sort().join() ===
        ['valid', 'recipientEmail', 'recipientName', 'locale', 'senderName']
          .sort()
          .join(),
    r.body,
  );
  check(
    'accept: valid true, senderName "Maria Papa", recipient data',
    r.body.valid === true &&
      r.body.senderName === 'Maria Papa' &&
      r.body.recipientEmail === r1 &&
      r.body.recipientName === 'Nikos' &&
      r.body.locale === 'el',
    r.body,
  );
  check(
    'accept unknown token -> 404',
    (await call('GET', '/invitations/accept/doesnotexist', undefined, KEY))
      .status === 404,
  );
  const after = await prisma.invitation.findUnique({
    where: { id: Number(inv1.id) },
  });
  check('accept is read-only (still pending)', after?.status === 'PENDING');

  // List / stats ----------------------------------------------------------
  r = await call('GET', '/invitations', undefined, auth(tokenA));
  check(
    'GET /invitations -> only my rows, DTO shape',
    r.status === 200 &&
      Array.isArray(r.body) &&
      r.body.length === 1 &&
      r.body.every(isDto) &&
      r.body[0].id === inv1.id,
    r.body,
  );
  r = await call('GET', '/invitations', undefined, auth(tokenB));
  check(
    "GET /invitations as B -> only B's row",
    r.status === 200 && r.body.length === 1 && r.body[0].id === invB.id,
    r.body,
  );
  check(
    'GET /invitations?limit=101 -> 400',
    (await call('GET', '/invitations?limit=101', undefined, auth(tokenA)))
      .status === 400,
  );
  r = await call('GET', '/invitations/stats', undefined, auth(tokenA));
  check(
    'GET /invitations/stats -> { sent:1, accepted:0, pending:1 }',
    r.status === 200 &&
      r.body.sent === 1 &&
      r.body.accepted === 0 &&
      r.body.pending === 1,
    r.body,
  );

  // Resend ----------------------------------------------------------------
  r = await call(
    'POST',
    `/invitations/${inv1.id}/resend`,
    undefined,
    auth(tokenA),
  );
  check('resend within cooldown -> 429', r.status === 429, r.body);
  await prisma.invitation.update({
    where: { id: Number(inv1.id) },
    data: { sentAt: new Date(Date.now() - 2 * 3600000) },
  });
  const mailsBefore = mails.length;
  r = await call(
    'POST',
    `/invitations/${inv1.id}/resend`,
    undefined,
    auth(tokenA),
  );
  check(
    'resend after cooldown -> 200 DTO pending with fresh sentAt',
    r.status === 200 &&
      isDto(r.body) &&
      r.body.status === 'pending' &&
      Date.now() - new Date(r.body.sentAt).getTime() < 60000,
    r.body,
  );
  for (let i = 0; i < 60 && mails.length <= mailsBefore; i++)
    await new Promise((res) => setTimeout(res, 150));
  const mail1b = mails
    .slice(mailsBefore)
    .find((m) => m.to.some((t) => t.toLowerCase() === r1));
  const T1b = inviteTokenOf(mail1b);
  check('resend sends a NEW token', !!T1b && T1b !== T1, { T1, T1b });
  check(
    'old token -> 404',
    (await call('GET', `/invitations/accept/${T1}`, undefined, KEY)).status ===
      404,
  );
  check(
    'new token -> 200',
    (await call('GET', `/invitations/accept/${T1b}`, undefined, KEY)).status ===
      200,
  );
  check(
    'resend by non-owner -> 404',
    (
      await call(
        'POST',
        `/invitations/${inv1.id}/resend`,
        undefined,
        auth(tokenB),
      )
    ).status === 404,
  );

  // Delete ----------------------------------------------------------------
  check(
    "DELETE another user's row -> 404",
    (await call('DELETE', `/invitations/${inv1.id}`, undefined, auth(tokenB)))
      .status === 404,
  );
  check(
    'DELETE pending -> 204',
    (await call('DELETE', `/invitations/${inv1.id}`, undefined, auth(tokenA)))
      .status === 204,
  );
  check(
    'after DELETE: token -> 404',
    (await call('GET', `/invitations/accept/${T1b}`, undefined, KEY)).status ===
      404,
  );
  check(
    'DELETE again (revoked) -> 422',
    (await call('DELETE', `/invitations/${inv1.id}`, undefined, auth(tokenA)))
      .status === 422,
  );
  check(
    'resend revoked -> 422',
    (
      await call(
        'POST',
        `/invitations/${inv1.id}/resend`,
        undefined,
        auth(tokenA),
      )
    ).status === 422,
  );
  r = await call('POST', '/invitations', invite(r1), auth(tokenA));
  check(
    'after revoke, a new invite to the same address -> 201',
    r.status === 201,
    r.body,
  );

  // Conversion by token ---------------------------------------------------
  const r2 = rcpt('R2');
  r = await call(
    'POST',
    '/invitations',
    invite(r2, {
      locale: 'en',
      subject: 'Join FiFi Alert',
      body: 'Hi,\n\nJoin here:\n{inviteLink}\n\nBye',
    }),
    auth(tokenA),
  );
  const inv2 = r.body;
  const T2 = inviteTokenOf(await waitForMail(r2, /accept-invite\?token=/));
  check('English invite created and emailed', r.status === 201 && !!T2);
  r = await signup(r2, T2);
  check('signup with valid inviteToken -> 201', r.status === 201, r.body);
  await new Promise((res) => setTimeout(res, 500));
  const row2 = await prisma.invitation.findUnique({
    where: { id: Number(inv2.id) },
  });
  const user2 = await prisma.user.findUnique({ where: { email: r2 } });
  check(
    'invitation accepted via token, convertedUserId = new user',
    row2?.status === 'ACCEPTED' &&
      row2?.acceptedVia === 'TOKEN' &&
      !!row2?.acceptedAt &&
      row2?.convertedUserId === user2?.id,
    row2,
  );
  r = await call('GET', '/invitations', undefined, auth(tokenA));
  check(
    'list shows acceptedVia "token" (lower-case) and no convertedUserId',
    r.body.some(
      (x: any) =>
        x.id === inv2.id &&
        x.status === 'accepted' &&
        x.acceptedVia === 'token',
    ) && r.body.every(isDto),
    r.body,
  );
  check(
    'accepted token -> 404',
    (await call('GET', `/invitations/accept/${T2}`, undefined, KEY)).status ===
      404,
  );
  check(
    'DELETE accepted -> 422',
    (await call('DELETE', `/invitations/${inv2.id}`, undefined, auth(tokenA)))
      .status === 422,
  );
  check(
    'resend accepted -> 422',
    (
      await call(
        'POST',
        `/invitations/${inv2.id}/resend`,
        undefined,
        auth(tokenA),
      )
    ).status === 422,
  );

  // Conversion by email match (two senders), only after verification ------
  const r3 = rcpt('R3');
  const a3 = (await call('POST', '/invitations', invite(r3), auth(tokenA)))
    .body;
  const b3 = (await call('POST', '/invitations', invite(r3), auth(tokenB)))
    .body;
  r = await signup(r3);
  check('signup without token -> 201', r.status === 201, r.body);
  await new Promise((res) => setTimeout(res, 500));
  let rows3 = await prisma.invitation.findMany({
    where: { id: { in: [Number(a3.id), Number(b3.id)] } },
  });
  check(
    'unverified signup does NOT accept by email (decision: wait for verification)',
    rows3.every((x) => x.status === 'PENDING'),
    rows3.map((x) => x.status),
  );
  const verifyMail = await waitForMail(r3, /verify-email\?token=/);
  const verifyJwt = verifyMail
    ? /verify-email\?token=([A-Za-z0-9._-]+)/.exec(verifyMail.text)?.[1]
    : undefined;
  check('signup verification email captured', !!verifyJwt);
  r = await call(
    'GET',
    `/api/auth/verify-email?token=${verifyJwt}`,
    undefined,
    { ...KEY, ip: '10.3.3.3' },
  );
  check('GET /api/auth/verify-email -> 2xx/3xx', r.status < 400, {
    status: r.status,
    body: r.body,
  });
  await new Promise((res) => setTimeout(res, 800));
  rows3 = await prisma.invitation.findMany({
    where: { id: { in: [Number(a3.id), Number(b3.id)] } },
  });
  const user3 = await prisma.user.findUnique({ where: { email: r3 } });
  check(
    "after verification: BOTH senders' rows accepted via email",
    rows3.length === 2 &&
      rows3.every(
        (x) =>
          x.status === 'ACCEPTED' &&
          x.acceptedVia === 'EMAIL' &&
          x.convertedUserId === user3?.id,
      ),
    rows3,
  );
  r = await call('GET', '/invitations/stats', undefined, auth(tokenB));
  check(
    'stats B: sent 2, accepted 1, pending 1',
    r.body.sent === 2 && r.body.accepted === 1 && r.body.pending === 1,
    r.body,
  );

  // Revoked token at signup ------------------------------------------------
  const r4 = rcpt('R4');
  const inv4 = (await call('POST', '/invitations', invite(r4), auth(tokenA)))
    .body;
  const T4 = inviteTokenOf(await waitForMail(r4, /accept-invite\?token=/));
  check(
    'DELETE inv4 -> 204',
    (await call('DELETE', `/invitations/${inv4.id}`, undefined, auth(tokenA)))
      .status === 204,
  );
  r = await signup(r4, T4);
  check(
    'signup with revoked token -> account still created (201)',
    r.status === 201,
    r.body,
  );
  await new Promise((res) => setTimeout(res, 500));
  const row4 = await prisma.invitation.findUnique({
    where: { id: Number(inv4.id) },
  });
  check(
    'revoked invitation stays revoked',
    row4?.status === 'REVOKED' && row4?.convertedUserId === null,
    row4,
  );

  // Lazy expiry sweep --------------------------------------------------------
  const r5 = rcpt('R5');
  const inv5 = (await call('POST', '/invitations', invite(r5), auth(tokenA)))
    .body;
  const T5 = inviteTokenOf(await waitForMail(r5, /accept-invite\?token=/));
  await prisma.invitation.update({
    where: { id: Number(inv5.id) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  check(
    'expired-by-time token -> 404',
    (await call('GET', `/invitations/accept/${T5}`, undefined, KEY)).status ===
      404,
  );
  r = await call('GET', '/invitations', undefined, auth(tokenA));
  check(
    'list sweeps pending past expiresAt -> expired',
    r.body.find((x: any) => x.id === inv5.id)?.status === 'expired',
    r.body.find((x: any) => x.id === inv5.id),
  );
  await prisma.invitation.update({
    where: { id: Number(inv5.id) },
    data: { sentAt: new Date(Date.now() - 2 * 3600000) },
  });
  r = await call(
    'POST',
    `/invitations/${inv5.id}/resend`,
    undefined,
    auth(tokenA),
  );
  check(
    'resend of expired -> 200 pending',
    r.status === 200 && r.body.status === 'pending',
    r.body,
  );

  // Stats = list ------------------------------------------------------------
  const listA = (await call('GET', '/invitations', undefined, auth(tokenA)))
    .body as any[];
  const statsA = (
    await call('GET', '/invitations/stats', undefined, auth(tokenA))
  ).body;
  check(
    'stats match the list',
    statsA.sent === listA.length &&
      statsA.accepted === listA.filter((x) => x.status === 'accepted').length &&
      statsA.pending === listA.filter((x) => x.status === 'pending').length,
    { statsA, n: listA.length },
  );
  check(
    'list is newest first',
    listA.every(
      (x, i) =>
        i === 0 || new Date(listA[i - 1].createdAt) >= new Date(x.createdAt),
    ),
  );

  // Frontend review fixes ------------------------------------------------------
  // (a) resend re-checks registration; (b) failed send does not lock the cooldown;
  // (c) failed sends do not count toward the daily limit.
  const r6 = rcpt('R6');
  const inv6 = (await call('POST', '/invitations', invite(r6), auth(tokenA)))
    .body;
  await waitForMail(r6, /accept-invite\?token=/);
  await signup(r6); // registers (unverified) after the invite went out
  await prisma.invitation.update({
    where: { id: Number(inv6.id) },
    data: { sentAt: new Date(Date.now() - 2 * 3600000) },
  });
  r = await call(
    'POST',
    `/invitations/${inv6.id}/resend`,
    undefined,
    auth(tokenA),
  );
  check(
    'resend after recipient registered -> 409 already_registered',
    r.status === 409 && r.body.code === 'already_registered',
    r.body,
  );

  const r7 = rcpt('R7');
  const inv7 = (await call('POST', '/invitations', invite(r7), auth(tokenA)))
    .body;
  await waitForMail(r7, /accept-invite\?token=/);
  // Simulate a provider failure on the latest send: row expired, log failed, sentAt = now.
  await prisma.$transaction([
    prisma.invitation.update({
      where: { id: Number(inv7.id) },
      data: { status: 'EXPIRED', sentAt: new Date() },
    }),
    prisma.invitationSendLog.updateMany({
      where: { invitationId: Number(inv7.id) },
      data: { outcome: 'failed', error: 'simulated' },
    }),
  ]);
  r = await call(
    'POST',
    `/invitations/${inv7.id}/resend`,
    undefined,
    auth(tokenA),
  );
  check(
    'resend right after a FAILED send -> 200 (no cooldown lock-out)',
    r.status === 200 && r.body.status === 'pending',
    r.body,
  );
  const failedCount = await prisma.invitationSendLog.count({
    where: { sender: { email: senderEmail }, outcome: 'failed' },
  });
  check(
    'a failed send log row exists for the daily-limit check below',
    failedCount >= 1,
    failedCount,
  );

  // Daily limit --------------------------------------------------------------
  const sentSoFar = await prisma.invitationSendLog.count({
    where: { sender: { email: senderEmail }, outcome: { not: 'failed' } },
  });
  let lastStatus = 0;
  for (let i = sentSoFar; i < 20; i++) {
    lastStatus = (
      await call('POST', '/invitations', invite(rcpt(`bulk${i}`)), auth(tokenA))
    ).status;
    if (lastStatus !== 201) break;
  }
  check(
    `sends up to the 20th non-failed within 24h succeed (had ${sentSoFar}, failed sends excluded)`,
    lastStatus === 201,
    lastStatus,
  );
  r = await call('POST', '/invitations', invite(rcpt('bulk21')), auth(tokenA));
  check('21st send within 24h -> 429', r.status === 429, r.body);
  check(
    '…and the resend of a pending row is also refused by the daily limit',
    (
      await (async () => {
        await prisma.invitation.update({
          where: { id: Number(inv5.id) },
          data: { sentAt: new Date(Date.now() - 2 * 3600000) },
        });
        return call(
          'POST',
          `/invitations/${inv5.id}/resend`,
          undefined,
          auth(tokenA),
        );
      })()
    ).status === 429,
  );

  return sink;
}

main()
  .then(async (sink) => {
    sink.close();
    console.log(
      `\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}  (${mails.length} emails captured)`,
    );
  })
  .catch((e) => {
    failed++;
    console.error('FATAL', e);
  })
  .finally(async () => {
    // Cleanup: users created here cascade to invitations and send logs.
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
    await pool.end();
    process.exit(failed ? 1 : 0);
  });
