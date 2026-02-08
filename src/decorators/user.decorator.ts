import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * User Decorator
 *
 * Extracts the authenticated user from the request object
 * The user is attached to request by BearerTokenGuard after JWT validation
 *
 * Usage:
 *   @Get('/profile')
 *   @UseGuards(BearerTokenGuard)
 *   getProfile(@User() user: any) {
 *     return user;
 *   }
 *
 *   // Get specific property
 *   @Post('/alerts')
 *   @UseGuards(BearerTokenGuard)
 *   createAlert(@User('userId') userId: number) {
 *     // ...
 *   }
 */
export const User = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
