import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler guard that tracks authenticated requests per user instead of per IP.
 *
 * Client apps (e.g. the SvelteKit server) call the API server-side, so every
 * end user arrives from the same IP. Keying on the user id gives each user their
 * own bucket. Unauthenticated requests (login, signup) fall back to the IP.
 *
 * Must be registered after BearerTokenGuard so `req.user` is populated.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    return req.ips?.length ? req.ips[0] : req.ip;
  }
}
