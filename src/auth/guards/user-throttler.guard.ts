import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

interface TrackedRequest {
  user?: { id?: number };
  headers?: Record<string, string | string[] | undefined>;
  ips?: string[];
  ip?: string;
}

/**
 * Throttler guard that tracks requests per user, then per client key, then per IP.
 *
 * Client apps (e.g. the SvelteKit server) call the API server-side, so every
 * end user arrives from the same IP. Keying on the user id gives each user their
 * own bucket. Anonymous client-key reads (public pages) share one bucket per
 * client key. Everything else (login, signup) falls back to the IP.
 *
 * Must be registered after BearerTokenGuard so `req.user` is populated.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: TrackedRequest): Promise<string> {
    if (req.user?.id) {
      return Promise.resolve(`user:${req.user.id}`);
    }
    const clientKey = req.headers?.['x-client-key'];
    if (typeof clientKey === 'string' && clientKey.length > 0) {
      // Hash so the raw key never lands in the throttler store or logs.
      const digest = createHash('sha256').update(clientKey).digest('hex');
      return Promise.resolve(`client:${digest.slice(0, 16)}`);
    }
    return Promise.resolve(req.ips?.length ? req.ips[0] : (req.ip ?? ''));
  }
}
