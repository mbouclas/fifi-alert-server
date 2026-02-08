import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for min user level decorator
 */
export const MIN_USER_LEVEL_KEY = 'minUserLevel';

/**
 * Decorator to specify minimum required role level for a route or controller
 * Used in conjunction with MinUserLevelGuard
 *
 * Lower level numbers = higher privileges (e.g., level 10 is more privileged than level 50)
 * If user has multiple roles, only ONE needs to meet the minimum level requirement
 *
 * @param level - The minimum role level required (lower = higher privilege)
 *
 * @example
 * ```typescript
 * // Controller level - all routes require level <= 50
 * @MinUserLevel(50)
 * @Controller('admin')
 * export class AdminController { ... }
 *
 * // Route level - specific route requires level <= 10
 * @MinUserLevel(10)
 * @Get('super-admin/settings')
 * async getSettings() {
 *   // Only users with role level <= 10 can access this
 * }
 * ```
 */
export const MinUserLevel = (level: number) =>
    SetMetadata(MIN_USER_LEVEL_KEY, level);
