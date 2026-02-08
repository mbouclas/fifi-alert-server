import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for roles decorator
 */
export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for a route
 * Used in conjunction with RolesGuard
 *
 * @example
 * ```typescript
 * @Roles('admin', 'moderator')
 * @Get('admin/users')
 * async listUsers() {
 *   // Only users with 'admin' or 'moderator' role can access this
 * }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
