import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for anonymous access decorator
 */
export const ALLOW_ANONYMOUS_KEY = 'allowAnonymous';

/**
 * Decorator to mark routes as publicly accessible (no authentication required)
 * Bypasses BearerTokenGuard when applied to a route or controller
 *
 * @example
 * ```typescript
 * @Post('login')
 * @AllowAnonymous()
 * async login(@Body() loginDto: LoginDto) {
 *   // This route is publicly accessible
 * }
 * ```
 */
export const AllowAnonymous = () => SetMetadata(ALLOW_ANONYMOUS_KEY, true);
