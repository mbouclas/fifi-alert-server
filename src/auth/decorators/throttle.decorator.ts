import { SetMetadata } from '@nestjs/common';

export const THROTTLE_LIMIT_KEY = 'throttle_limit';
export const THROTTLE_TTL_KEY = 'throttle_ttl';

/**
 * Custom throttle decorator for specific endpoints
 * @param limit - Number of requests allowed
 * @param ttl - Time window in seconds
 */
export const CustomThrottle = (limit: number, ttl: number = 60) =>
  SetMetadata(THROTTLE_LIMIT_KEY, { limit, ttl });
