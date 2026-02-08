import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MIN_USER_LEVEL_KEY } from '../decorators/min-user-level.decorator';
import { ALLOW_ANONYMOUS_KEY } from '../decorators/allow-anonymous.decorator';
import { UserService } from '../../user/user.service';
import type { ITokenUser } from '../services/token.service';

/**
 * Guard that checks if the authenticated user has a role with at least the minimum level
 * Must be used after BearerTokenGuard (which attaches user to request)
 *
 * Level hierarchy: lower level = higher privileges (e.g., 10 > 50)
 * If a user has multiple roles, only ONE needs to meet the minimum level
 *
 * @example
 * ```typescript
 * @UseGuards(BearerTokenGuard, MinUserLevelGuard)
 * @MinUserLevel(50)
 * @Get('admin/users')
 * async listUsers() {
 *   // Only users with role level <= 50 can access this
 * }
 * ```
 */
@Injectable()
export class MinUserLevelGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        // Check if route is marked as anonymous
        const isAnonymous = this.reflector.getAllAndOverride<boolean>(
            ALLOW_ANONYMOUS_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (isAnonymous) {
            return true;
        }

        // Get minimum required level from @MinUserLevel() decorator
        // getAllAndOverride checks method first, then class (method overrides class)
        const minLevel = this.reflector.getAllAndOverride<number>(
            MIN_USER_LEVEL_KEY,
            [context.getHandler(), context.getClass()],
        );

        // If no minimum level is specified, allow access
        if (minLevel === undefined || minLevel === null) {
            return true;
        }

        // Get user from request (attached by BearerTokenGuard)
        const request = context.switchToHttp().getRequest();
        const user: ITokenUser = request.user;

        if (!user) {
            throw new ForbiddenException('User not authenticated');
        }

        // Check if user has at least one role with the minimum level
        // Note: The ITokenUser from token already includes roles array
        const hasMinLevel = UserService.userHasMinLevel(user, minLevel);

        if (!hasMinLevel) {
            throw new ForbiddenException(
                `Insufficient permissions. Minimum role level required: ${minLevel}`,
            );
        }

        return true;
    }
}
