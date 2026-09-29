import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { REQUIRE_CLIENT_KEY_KEY } from '../decorators/require-client-key.decorator';

export const CLIENT_KEY_HEADER = 'x-client-key';
export const CLIENT_API_KEYS_ENV = 'CLIENT_API_KEYS';

/**
 * Guard for endpoints that client apps call without a logged-in user.
 *
 * Only active on routes/controllers decorated with `@RequireClientKey()`.
 * Validates the `X-Client-Key` header against the comma-separated list in
 * the `CLIENT_API_KEYS` env var using a timing-safe comparison.
 *
 * Fails closed: if no keys are configured every guarded request is rejected.
 */
@Injectable()
export class ClientKeyGuard implements CanActivate {
  private readonly logger = new Logger(ClientKeyGuard.name);

  constructor(private readonly reflector: Reflector) {
    if (this.getConfiguredKeys().length === 0) {
      this.logger.warn(
        `${CLIENT_API_KEYS_ENV} is not set - routes guarded by @RequireClientKey() will reject all requests`,
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_CLIENT_KEY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const presented = this.extractHeader(request);

    if (!presented) {
      throw new UnauthorizedException('Missing client key');
    }

    const keys = this.getConfiguredKeys();
    if (keys.length === 0) {
      throw new UnauthorizedException('Client API keys not configured');
    }

    if (!keys.some((key) => this.safeEquals(key, presented))) {
      throw new UnauthorizedException('Invalid client key');
    }

    return true;
  }

  /**
   * Parse CLIENT_API_KEYS (comma-separated) into a list of non-empty keys.
   * Read on every call so tests and rotations do not need a restart.
   */
  private getConfiguredKeys(): string[] {
    const raw = process.env[CLIENT_API_KEYS_ENV] ?? '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private extractHeader(request: any): string | undefined {
    const value = request?.headers?.[CLIENT_KEY_HEADER];
    if (Array.isArray(value)) {
      return value[0];
    }
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private safeEquals(expected: string, actual: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(actual);
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  }
}
