/**
 * Google / Facebook provider wiring for better-auth.
 *
 * Why custom `verifyIdToken` functions (better-auth 1.4.5):
 * - Google's built-in check accepts a single `aud`. Web, iOS and Android each
 *   sign in under their own client ID, so we verify against the full allow-list.
 * - Facebook's built-in check only validates OIDC JWTs (iOS Limited Login).
 *   A plain Graph access token (web JS SDK, Android) is accepted *unverified*,
 *   which would let a token minted for another Facebook app log in as its
 *   owner. We call Graph `debug_token` and require `app_id` to match ours.
 *
 * Pure functions, no Nest DI: `src/auth.ts` builds better-auth at module load.
 */
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import type {
  IFacebookSocialConfig,
  IGoogleSocialConfig,
  ISocialAuthConfig,
} from '@config/social-auth.config';

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
];
export const FACEBOOK_JWKS_URL =
  'https://limited.facebook.com/.well-known/oauth/openid/jwks/';
export const FACEBOOK_ISSUER = 'https://www.facebook.com';
export const FACEBOOK_DEBUG_TOKEN_URL =
  'https://graph.facebook.com/debug_token';

/** Minimal shape of the Graph `debug_token` response we rely on. */
export interface IFacebookDebugTokenResponse {
  data?: {
    app_id?: string;
    is_valid?: boolean;
    user_id?: string;
    error?: { message?: string };
  };
  error?: { message?: string };
}

export type FetchLike = (
  input: string,
  init?: Record<string, unknown>,
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface IVerifierDeps {
  /** Injected for tests; defaults to `jose.createRemoteJWKSet`. */
  getJwks?: (url: string) => ReturnType<typeof createRemoteJWKSet>;
  fetch?: FetchLike;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function defaultGetJwks(url: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

export function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

/**
 * Verify a Google ID token: signature via Google's JWKS, issuer, expiry and
 * `aud` in our allow-list. Nonce is checked only when the client sent one.
 */
export async function verifyGoogleIdToken(
  token: string,
  nonce: string | undefined,
  allowedClientIds: string[],
  deps: IVerifierDeps = {},
): Promise<boolean> {
  if (!token || !looksLikeJwt(token) || allowedClientIds.length === 0) {
    return false;
  }
  const getJwks = deps.getJwks ?? defaultGetJwks;
  try {
    const { payload } = await jwtVerify(token, getJwks(GOOGLE_JWKS_URL), {
      issuer: GOOGLE_ISSUERS,
      audience: allowedClientIds,
    });
    if (nonce && payload.nonce !== nonce) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify a Facebook token.
 * - OIDC JWT (iOS Limited Login): signature via Facebook JWKS, issuer, aud.
 * - Graph access token (web / Android): `debug_token` must report the token
 *   as valid and issued for *our* app.
 */
export async function verifyFacebookToken(
  token: string,
  nonce: string | undefined,
  config: IFacebookSocialConfig,
  deps: IVerifierDeps = {},
): Promise<boolean> {
  if (!token) {
    return false;
  }

  if (looksLikeJwt(token)) {
    const getJwks = deps.getJwks ?? defaultGetJwks;
    try {
      const { payload } = await jwtVerify(token, getJwks(FACEBOOK_JWKS_URL), {
        algorithms: ['RS256'],
        issuer: FACEBOOK_ISSUER,
        audience: config.appId,
      });
      if (nonce && payload.nonce !== nonce) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  const fetchImpl = deps.fetch ?? (globalThis.fetch as unknown as FetchLike);
  try {
    const url = new URL(FACEBOOK_DEBUG_TOKEN_URL);
    url.searchParams.set('input_token', token);
    url.searchParams.set('access_token', `${config.appId}|${config.appSecret}`);
    const response = await fetchImpl(url.toString());
    if (!response.ok) {
      return false;
    }
    const body = (await response.json()) as IFacebookDebugTokenResponse;
    return Boolean(
      body.data &&
      body.data.is_valid === true &&
      body.data.app_id === config.appId &&
      !body.data.error,
    );
  } catch {
    return false;
  }
}

interface IGoogleProfile {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

interface IFacebookProfile {
  id: string;
  name?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

/** Extra user columns better-auth is allowed to set (see `user.additionalFields`). */
interface IMappedUserFields {
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
}

function splitName(full?: string): { first?: string; last?: string } {
  const parts = String(full ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return {};
  return { first: parts[0], last: parts.slice(1).join(' ') || undefined };
}

export function mapGoogleProfile(profile: IGoogleProfile): IMappedUserFields {
  const fallback = splitName(profile.name);
  return {
    firstName: profile.given_name ?? fallback.first,
    lastName: profile.family_name ?? fallback.last,
  };
}

export function mapFacebookProfile(
  profile: IFacebookProfile | { sub?: string; name?: string },
): IMappedUserFields {
  const fb = profile as IFacebookProfile;
  const fallback = splitName(profile.name);
  return {
    firstName: fb.first_name ?? fallback.first,
    lastName: fb.last_name ?? fallback.last,
    // Facebook only shares an email after the user confirmed it, and the
    // token itself has been verified against our app. Without this a
    // Facebook-created user would be stuck behind the "verify your email"
    // gate used by the credentials login.
    emailVerified: true,
  };
}

/**
 * Pull a stable provider account id out of a Facebook token so the caller
 * can log/debug without a second Graph call. Returns undefined for opaque
 * access tokens.
 */
export function decodeFacebookJwtSubject(token: string): string | undefined {
  if (!looksLikeJwt(token)) return undefined;
  try {
    return decodeJwt(token).sub;
  } catch {
    return undefined;
  }
}

/**
 * Build the `socialProviders` block for `betterAuth()`. Returns undefined
 * when no provider is configured so the key can be omitted entirely.
 */
export function buildSocialProviders(
  config: ISocialAuthConfig,
  deps: IVerifierDeps = {},
): Record<string, unknown> | undefined {
  const providers: Record<string, unknown> = {};

  if (config.google) {
    const google: IGoogleSocialConfig = config.google;
    providers.google = {
      clientId: google.clientId,
      clientSecret: google.clientSecret,
      verifyIdToken: (token: string, nonce?: string) =>
        verifyGoogleIdToken(token, nonce, google.allowedClientIds, deps),
      mapProfileToUser: mapGoogleProfile,
      // Keep names the user edited in-app; only fill them on first sign-in.
      overrideUserInfoOnSignIn: false,
    };
  }

  if (config.facebook) {
    const facebook: IFacebookSocialConfig = config.facebook;
    providers.facebook = {
      clientId: facebook.appId,
      clientSecret: facebook.appSecret,
      // Extra Graph `/me` fields on top of id,name,email,picture.
      fields: ['first_name', 'last_name'],
      verifyIdToken: (token: string, nonce?: string) =>
        verifyFacebookToken(token, nonce, facebook, deps),
      mapProfileToUser: mapFacebookProfile,
      overrideUserInfoOnSignIn: false,
    };
  }

  return Object.keys(providers).length > 0 ? providers : undefined;
}
