import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { CLIENT_KEY_HEADER, isValidClientKey } from './client-key.guard';

interface TrackedRequest {
  user?: { id?: number };
  headers?: Record<string, string | string[] | undefined>;
  ips?: string[];
  ip?: string;
}

/** Header a trusted client app (BFF) uses to pass the end user's IP through. */
export const FORWARDED_FOR_HEADER = 'x-forwarded-for';

/**
 * Throttler guard that tracks requests per user, then per end user behind a
 * trusted client app, then per client key, then per IP.
 *
 * Client apps (e.g. the SvelteKit server) call the API server-side, so every
 * end user arrives from the same IP. Keying on the user id gives each signed-in
 * user their own bucket. For anonymous calls (signup, login, password reset) a
 * client that presents a *valid* `X-Client-Key` may also send `X-Forwarded-For`;
 * the first hop is then part of the bucket so one visitor cannot exhaust the
 * limit for everyone else on the site. The forwarded header is ignored when
 * the key is missing or wrong, because anyone can set it.
 *
 * Must be registered after BearerTokenGuard so `req.user` is populated.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: TrackedRequest): Promise<string> {
    if (req.user?.id) {
      return Promise.resolve(`user:${req.user.id}`);
    }

    const clientKey = firstHeader(req.headers?.[CLIENT_KEY_HEADER]);
    if (clientKey) {
      // Hash so the raw key never lands in the throttler store or logs.
      const digest = createHash('sha256').update(clientKey).digest('hex');
      const bucket = `client:${digest.slice(0, 16)}`;

      const forwarded = isValidClientKey(clientKey)
        ? firstForwardedIp(req.headers?.[FORWARDED_FOR_HEADER])
        : undefined;

      return Promise.resolve(forwarded ? `${bucket}:ip:${forwarded}` : bucket);
    }

    return Promise.resolve(req.ips?.length ? req.ips[0] : (req.ip ?? ''));
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/** First address in an `X-Forwarded-For` list, trimmed; undefined when absent or blank. */
export function firstForwardedIp(
  value: string | string[] | undefined,
): string | undefined {
  const raw = firstHeader(value);
  if (!raw) {
    return undefined;
  }
  const first = raw.split(',')[0]?.trim();
  return first && first.length <= 64 ? first : undefined;
}
