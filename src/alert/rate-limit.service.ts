import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Rate Limiting Service using Redis Sorted Sets
 * Task 2.9
 * 
 * Enforces the following limits per user:
 * - 5 alerts per hour
 * - 20 alerts per 24 hours  
 * - 50 alerts per 7 days
 */
@Injectable()
export class RateLimitService {
    private readonly logger = new Logger(RateLimitService.name);
    private readonly redis: Redis;

    // Rate limit configurations (from NOTIFICATION_PLAYBOOK.md)
    private readonly limits = {
        hourly: { count: 5, windowMs: 60 * 60 * 1000 }, // 1 hour
        daily: { count: 20, windowMs: 24 * 60 * 60 * 1000 }, // 24 hours
        weekly: { count: 50, windowMs: 7 * 24 * 60 * 60 * 1000 }, // 7 days
    };

    constructor(private readonly configService: ConfigService) {
        // Initialize Redis client with same config as BullMQ
        this.redis = new Redis({
            host: this.configService.get('REDIS_HOST', 'localhost'),
            port: this.configService.get('REDIS_PORT', 6379),
            password: this.configService.get('REDIS_PASSWORD'),
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

        this.redis.on('connect', () => {
            this.logger.log('Connected to Redis for rate limiting');
        });
    }

    /**
     * Check if user has exceeded any rate limits for alert creation
     * Throws HttpException with 429 status if limit exceeded
     * 
     * @param userId - User ID to check rate limits for
     * @throws HttpException - 429 Too Many Requests if limit exceeded
     */
    async checkAlertCreationLimit(userId: number): Promise<void> {
        const now = Date.now();
        const key = `rate_limit:alert:user:${userId}`;

        try {
            // Get all alert creation timestamps for this user
            const timestamps = await this.redis.zrangebyscore(key, '-inf', '+inf');
            const timestampNumbers = timestamps.map(t => parseInt(t, 10));

            // Check each rate limit
            const hourlyCount = this.countInWindow(timestampNumbers, now, this.limits.hourly.windowMs);
            const dailyCount = this.countInWindow(timestampNumbers, now, this.limits.daily.windowMs);
            const weeklyCount = this.countInWindow(timestampNumbers, now, this.limits.weekly.windowMs);

            this.logger.debug(
                `Rate limits for user ${userId}: ${hourlyCount}/hr, ${dailyCount}/day, ${weeklyCount}/week`,
            );

            // Check limits and throw if exceeded
            if (hourlyCount >= this.limits.hourly.count) {
                throw new HttpException(
                    {
                        error_code: 'RATE_LIMIT_EXCEEDED',
                        message: `Alert creation limit exceeded: ${this.limits.hourly.count} alerts per hour`,
                        retry_after_seconds: this.getRetryAfter(timestampNumbers, now, this.limits.hourly.windowMs),
                    },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }

            if (dailyCount >= this.limits.daily.count) {
                throw new HttpException(
                    {
                        error_code: 'RATE_LIMIT_EXCEEDED',
                        message: `Alert creation limit exceeded: ${this.limits.daily.count} alerts per 24 hours`,
                        retry_after_seconds: this.getRetryAfter(timestampNumbers, now, this.limits.daily.windowMs),
                    },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }

            if (weeklyCount >= this.limits.weekly.count) {
                throw new HttpException(
                    {
                        error_code: 'RATE_LIMIT_EXCEEDED',
                        message: `Alert creation limit exceeded: ${this.limits.weekly.count} alerts per 7 days`,
                        retry_after_seconds: this.getRetryAfter(timestampNumbers, now, this.limits.weekly.windowMs),
                    },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }

            // If all checks pass, record this request
            await this.recordAlertCreation(userId, now);
        } catch (error) {
            // Re-throw HttpException as-is
            if (error instanceof HttpException) {
                throw error;
            }

            // Log and re-throw other errors
            this.logger.error(`Rate limit check failed for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Record an alert creation timestamp in Redis
     * Uses sorted set with timestamp as both score and member
     */
    private async recordAlertCreation(userId: number, timestamp: number): Promise<void> {
        const key = `rate_limit:alert:user:${userId}`;

        // Add timestamp to sorted set
        await this.redis.zadd(key, timestamp, timestamp.toString());

        // Remove timestamps older than 7 days (our longest window)
        const cutoff = timestamp - this.limits.weekly.windowMs;
        await this.redis.zremrangebyscore(key, '-inf', cutoff);

        // Set expiry on the key (8 days to be safe)
        await this.redis.expire(key, Math.ceil(this.limits.weekly.windowMs / 1000) + 86400);

        this.logger.debug(`Recorded alert creation for user ${userId} at ${timestamp}`);
    }

    /**
     * Count how many timestamps fall within the time window
     */
    private countInWindow(timestamps: number[], now: number, windowMs: number): number {
        const cutoff = now - windowMs;
        return timestamps.filter(t => t >= cutoff).length;
    }

    /**
     * Calculate seconds until the oldest timestamp expires from the window
     */
    private getRetryAfter(timestamps: number[], now: number, windowMs: number): number {
        const cutoff = now - windowMs;
        const relevantTimestamps = timestamps.filter(t => t >= cutoff).sort((a, b) => a - b);

        if (relevantTimestamps.length === 0) {
            return 0;
        }

        // Oldest timestamp + window = when it expires
        const oldestExpiry = relevantTimestamps[0] + windowMs;
        const retryAfterMs = oldestExpiry - now;

        return Math.max(0, Math.ceil(retryAfterMs / 1000));
    }

    /**
     * Get current usage stats for a user (for debugging/monitoring)
     */
    async getUserStats(userId: number): Promise<{
        hourly: number;
        daily: number;
        weekly: number;
    }> {
        const now = Date.now();
        const key = `rate_limit:alert:user:${userId}`;

        const timestamps = await this.redis.zrangebyscore(key, '-inf', '+inf');
        const timestampNumbers = timestamps.map(t => parseInt(t, 10));

        return {
            hourly: this.countInWindow(timestampNumbers, now, this.limits.hourly.windowMs),
            daily: this.countInWindow(timestampNumbers, now, this.limits.daily.windowMs),
            weekly: this.countInWindow(timestampNumbers, now, this.limits.weekly.windowMs),
        };
    }

    /**
     * Clear rate limit data for a user (for testing or admin reset)
     */
    async resetUserLimits(userId: number): Promise<void> {
        const key = `rate_limit:alert:user:${userId}`;
        await this.redis.del(key);
        this.logger.log(`Reset rate limits for user ${userId}`);
    }

    /**
     * Cleanup on module destroy
     */
    async onModuleDestroy() {
        await this.redis.quit();
    }
}
