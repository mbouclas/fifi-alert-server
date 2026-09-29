import { randomBytes } from 'node:crypto';
import { serializeSignedCookie } from 'better-call';
import { PrismaSingleton } from '@services/prisma-singleton.service';
import { auth } from '../../auth';

/** How long a temporary session stays valid; only needs to outlive one call. */
const TEMPORARY_SESSION_TTL_MS = 5 * 60 * 1000;

/** Marker stored in `session.userAgent` so these rows are recognisable. */
export const TEMPORARY_SESSION_USER_AGENT =
  'fifi-alert-server/temporary-session';

/**
 * better-auth runs here with no bearer plugin, so `auth.api.*` endpoints that
 * need an authenticated caller (`changeEmail`, `deleteUser`, …) only accept
 * better-auth's own signed session cookie. Our clients authenticate with JWTs.
 *
 * This helper mints a short-lived better-auth session for the already
 * authenticated user, builds the signed cookie header, runs the callback and
 * deletes the session again regardless of outcome. The row is written straight
 * through Prisma (better-auth's `internalAdapter` only works inside one of its
 * own endpoint contexts) into the shared `session` table with
 * `token_type = 'session'`, exactly like a cookie login.
 */
export async function withTemporaryBetterAuthSession<T>(
  userId: number | string,
  fn: (headers: Headers) => Promise<T>,
): Promise<T> {
  const prisma = PrismaSingleton.getInstance();
  const token = randomBytes(32).toString('base64url');

  const session = await prisma.session.create({
    data: {
      token,
      userId: Number(userId),
      tokenType: 'session',
      expiresAt: new Date(Date.now() + TEMPORARY_SESSION_TTL_MS),
      userAgent: TEMPORARY_SESSION_USER_AGENT,
    },
    select: { id: true },
  });

  try {
    const headers = new Headers();
    headers.set('Cookie', await buildSessionCookie(token));
    return await fn(headers);
  } finally {
    // `deleteMany` so a row already removed by the endpoint (deleteUser wipes
    // all sessions, Prisma cascades on user delete) is not an error.
    await prisma.session
      .deleteMany({ where: { id: session.id } })
      .catch(() => undefined);
  }
}

/**
 * Build the `Cookie` header value better-auth expects: the session cookie name
 * followed by the token signed the same way `setSessionCookie` signs it.
 */
export async function buildSessionCookie(
  sessionToken: string,
): Promise<string> {
  const ctx = await auth.$context;
  const { name, options } = ctx.authCookies.sessionToken;
  const setCookie = await serializeSignedCookie(
    name,
    sessionToken,
    ctx.secret,
    options,
  );
  // `serializeSignedCookie` returns a full Set-Cookie string; the request
  // header only needs the `name=value` pair.
  return setCookie.split(';')[0];
}
