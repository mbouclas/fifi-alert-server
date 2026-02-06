import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ALLOW_ANONYMOUS_KEY } from '../decorators/allow-anonymous.decorator';
import type { ITokenUser } from '../services/token.service';

/**
 * Guard that checks if the authenticated user has one of the required roles
 * Must be used after BearerTokenGuard (which attaches user to request)
 * 
 * Role hierarchy is respected: lower level = higher privileges
 * If a user has multiple roles, the check passes if ANY role matches
 * 
 * @example
 * ```typescript
 * @UseGuards(BearerTokenGuard, RolesGuard)
 * @Roles('admin', 'moderator')
 * @Get('admin/users')
 * async listUsers() {
 *   // Only users with 'admin' or 'moderator' role can access this
 * }
 * ```
 */
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        // Check if route is marked as anonymous (shouldn't happen with RolesGuard, but check anyway)
        const isAnonymous = this.reflector.getAllAndOverride<boolean>(
            ALLOW_ANONYMOUS_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (isAnonymous) {
            return true;
        }

        // Get required roles from @Roles() decorator
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
        );

        // If no roles are required, allow access
        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        // Get user from request (attached by BearerTokenGuard)
        const request = context.switchToHttp().getRequest();
        const user: ITokenUser = request.user;

        if (!user) {
            throw new ForbiddenException('User not authenticated');
        }

        // Check if user has at least one of the required roles
        const hasRole = user.roles.some((role) =>
            requiredRoles.includes(role.slug),
        );

        if (!hasRole) {
            throw new ForbiddenException(
                `Insufficient permissions. Required roles: ${requiredRoles.join(', ')}`,
            );
        }

        return true;
    }
}
