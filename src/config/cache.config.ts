import { CacheModuleOptions } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

/**
 * Redis Cache Configuration for FiFi Alert
 * 
 * Caching Strategy:
 * - Alert Zones: Cache active zones for fast notification matching
 * - TTL: 5 minutes (300 seconds)
 * - Max Keys: 10,000 (prevent memory bloat)
 * 
 * Cache Keys:
 * - `alert-zones:active` - All active alert zones with location data
 * - `user:{userId}:zones` - User-specific alert zones (optional future optimization)
 */

export const cacheConfig = async (): Promise<CacheModuleOptions> => {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    return {
        store: await redisStore({
            url: redisUrl,
            ttl: 300000, // 5 minutes in milliseconds
            // Connection options
            socket: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
                connectTimeout: 5000,
                reconnectStrategy: (retries: number) => {
                    // Exponential backoff: 100ms, 200ms, 400ms, 800ms, max 3s
                    const delay = Math.min(100 * Math.pow(2, retries), 3000);
                    console.log(`Redis reconnection attempt ${retries}, delay: ${delay}ms`);
                    return delay;
                },
            },
            password: process.env.REDIS_PASSWORD,
            database: parseInt(process.env.REDIS_DB || '0', 10),
        }),
    };
};

/**
 * Cache key patterns for consistent naming
 */
export const CacheKeys = {
    /**
     * All active alert zones (includes lat, lon, radius, user_id, priority)
     * TTL: 5 minutes
     * Invalidated on: Alert zone CREATE, UPDATE, DELETE
     */
    ACTIVE_ALERT_ZONES: 'alert-zones:active',

    /**
     * User-specific alert zones
     * TTL: 5 minutes
     * Invalidated on: User's alert zone CREATE, UPDATE, DELETE
     */
    userAlertZones: (userId: number) => `user:${userId}:zones`,
} as const;

/**
 * Cache TTL values (in seconds)
 */
export const CacheTTL = {
    ALERT_ZONES: 300, // 5 minutes
    USER_ZONES: 300, // 5 minutes
    SHORT: 60, // 1 minute
    LONG: 900, // 15 minutes
} as const;
