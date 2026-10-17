import { randomBytes } from 'crypto';
import { hashToken } from '../auth/services/token.service';

/** Longest raw token we accept from clients (`inviteToken`, accept path). */
export const INVITE_TOKEN_MAX_LENGTH = 256;

/** 32 random bytes, base64url (43 chars, no padding). Appears only in the email. */
export function mintInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex — what we store and look up. */
export function hashInviteToken(rawToken: string): string {
  return hashToken(rawToken);
}

/**
 * Defensive check for tokens arriving from clients. `/auth/signup` has no
 * ValidationPipe, so this is the only guard on that path.
 */
export function isPlausibleInviteToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= INVITE_TOKEN_MAX_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}
