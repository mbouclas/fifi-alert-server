import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';

export type PasskeyChallengeType = 'register' | 'login';

export interface StoredPasskeyChallenge {
  challenge: string;
  type: PasskeyChallengeType;
  /** Set for `register` only; `login` is anonymous (discoverable credential). */
  userId?: number;
}

export const PASSKEY_CHALLENGE_TTL_SECONDS = 5 * 60;
export const PASSKEY_CHALLENGE_KEY_PREFIX = 'passkey:challenge:';

/**
 * Short-lived, single-use WebAuthn challenge store backed by Redis.
 *
 * The browser is never trusted with the challenge: the API mints it, keeps it
 * here for 5 minutes, and `consume()` removes it atomically (GETDEL) the first
 * time it is read, success or failure. Redis (rather than process memory) so
 * the ceremony survives a restart and works under pm2 cluster mode.
 */
@Injectable()
export class PasskeyChallengeStore implements OnModuleDestroy {
  private readonly logger = new Logger(PasskeyChallengeStore.name);
  private readonly redis: Redis;

  constructor(configService: ConfigService) {
    // Same connection parameters as the other ioredis clients in the app
    // (alert/rate-limit.service.ts), plus REDIS_DB so a smoke run against a
    // different DB number does not share challenge keys with production.
    this.redis = new Redis({
      host: configService.get<string>('REDIS_HOST', 'localhost'),
      port: Number(configService.get('REDIS_PORT', 6379)),
      password: configService.get<string>('REDIS_PASSWORD') || undefined,
      db: Number(configService.get('REDIS_DB', 0)),
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 1000, 3000);
      },
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  /** Stores the challenge and returns the opaque id the client echoes back. */
  async create(entry: StoredPasskeyChallenge): Promise<string> {
    const challengeId = `c_${randomBytes(16).toString('base64url')}`;
    await this.redis.set(
      PASSKEY_CHALLENGE_KEY_PREFIX + challengeId,
      JSON.stringify(entry),
      'EX',
      PASSKEY_CHALLENGE_TTL_SECONDS,
    );
    return challengeId;
  }

  /**
   * Reads AND deletes the challenge in one round trip. Returns null when the
   * id is unknown, expired or already consumed.
   */
  async consume(challengeId: string): Promise<StoredPasskeyChallenge | null> {
    if (typeof challengeId !== 'string' || challengeId.length === 0) {
      return null;
    }
    const raw = await this.redis.getdel(
      PASSKEY_CHALLENGE_KEY_PREFIX + challengeId,
    );
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredPasskeyChallenge;
    } catch {
      this.logger.warn(`Discarding malformed challenge entry ${challengeId}`);
      return null;
    }
  }
}
