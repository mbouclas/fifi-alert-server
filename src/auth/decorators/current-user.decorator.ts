import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ITokenUser } from '../services/token.service';

/**
 * Decorator to extract the current authenticated user from the request
 * User is attached to the request by BearerTokenGuard
 *
 * @example
 * ```typescript
 * @Get('profile')
 * async getProfile(@CurrentUser() user: ITokenUser) {
 *   return user;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ITokenUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
