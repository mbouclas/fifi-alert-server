import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../services/token.service';
import { ALLOW_ANONYMOUS_KEY } from '../decorators/allow-anonymous.decorator';

/**
 * Guard that validates JWT bearer tokens from Authorization header
 * Extracts user data with roles and gates and attaches to request
 * Respects @AllowAnonymous() decorator for public routes
 */
@Injectable()
export class BearerTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as anonymous
    const isAnonymous = this.reflector.getAllAndOverride<boolean>(
      ALLOW_ANONYMOUS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    // If anonymous route, try to attach user if token exists, but don't fail
    if (isAnonymous) {
      if (token) {
        try {
          const user = await this.tokenService.validateAccessToken(token);
          request.user = user;
        } catch (error) {
          // Silently ignore token errors on anonymous routes
        }
      }
      return true;
    }

    // For protected routes, token is required
    if (!token) {
      throw new UnauthorizedException('No authorization token provided');
    }

    try {
      // Validate token and get user data with roles and gates
      const user = await this.tokenService.validateAccessToken(token);

      // Attach user to request for use in route handlers
      request.user = user;

      // Also set request.session for compatibility with @Session() decorator
      request.session = {
        userId: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        gates: user.gates,
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Invalid authorization token',
      );
    }
  }

  /**
   * Extract JWT token from Authorization header
   * Supports "Bearer <token>" format
   * @param request - Express request object
   * @returns Token string or undefined
   */
  private extractTokenFromHeader(request: any): string | undefined {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      return undefined;
    }

    return token;
  }
}
