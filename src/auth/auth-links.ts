import { buildWebAppUrl } from '@config/web-app.config';

/**
 * Pure helpers that turn the API-facing URLs better-auth generates into web
 * app links for emails. Kept separate from src/auth.ts so they can be unit
 * tested without instantiating better-auth or Prisma.
 */

export function getEmailVerificationCallbackURL(): string {
  return (
    process.env.EMAIL_VERIFICATION_CALLBACK_URL ||
    process.env.MOBILE_EMAIL_VERIFICATION_URL ||
    'fifi-alert://verify-email'
  );
}

export function extractCallbackURL(betterAuthUrl: string): string | null {
  try {
    return new URL(betterAuthUrl).searchParams.get('callbackURL');
  } catch {
    return null;
  }
}

/**
 * Better-auth generates `${baseURL}/verify-email?token=…&callbackURL=…`, which
 * points at this API server. Emails must link to the web app instead; the web
 * page forwards the token to `GET /api/auth/verify-email`.
 *
 * The same endpoint (and therefore the same web page) also completes both
 * steps of an email change, so `sendChangeEmailConfirmation` reuses this.
 */
export function buildWebVerificationUrl(
  betterAuthUrl: string,
  token: string,
): string {
  return buildWebAppUrl('/verify-email', {
    token,
    callbackURL:
      extractCallbackURL(betterAuthUrl) || getEmailVerificationCallbackURL(),
  });
}

/**
 * Better-auth generates `${baseURL}/reset-password/${token}?callbackURL=…`.
 * When the client passed `redirectTo` (its own reset page) we honour it and
 * append the token; otherwise we fall back to the web app's `/reset-password`
 * page documented in docs/WEB_APP_EMAIL_LINKS.md.
 */
export function buildWebResetPasswordUrl(
  betterAuthUrl: string,
  token: string,
): string {
  const redirectTo = extractCallbackURL(betterAuthUrl);

  if (redirectTo) {
    try {
      const target = new URL(redirectTo);
      target.searchParams.set('token', token);
      return target.toString();
    } catch {
      // Not an absolute URL (e.g. a relative path). Treat it as a web-app path.
      if (redirectTo.startsWith('/')) {
        return buildWebAppUrl(redirectTo, { token });
      }
    }
  }

  return buildWebAppUrl('/reset-password', { token });
}

/**
 * Better-auth generates `${baseURL}/delete-user/callback?token=…`. The web
 * page at `/confirm-delete-account` collects the token and calls
 * `POST /auth/delete-account/confirm` with the user's bearer token.
 */
export function buildWebDeleteAccountUrl(token: string): string {
  return buildWebAppUrl('/confirm-delete-account', { token });
}
