import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import { TokenService } from './token.service';
import { AuthResponseDto } from '../dto';
import { AUDIT_EVENT_NAMES } from '../../audit/audit-event-names';
import { IAuditEventPayload } from '../../audit/interfaces/audit-event-payload.interface';

/** User shape TokenService needs: User with roles + gates relations loaded. */
export type LoginUser = Parameters<TokenService['generateAccessToken']>[0];

export type LoginMethod = 'password' | 'google' | 'facebook' | 'passkey';

export interface IssueLoginOptions {
  /** How the user authenticated; recorded in the audit metadata. */
  method: LoginMethod;
  /** Extra audit metadata (e.g. `newUser` for social sign-ups). */
  extraMetadata?: Record<string, unknown>;
}

/**
 * LoginIssuerService
 *
 * The single place that turns an authenticated user into the JWT pair the
 * clients consume. Password login, social login and passkey login all end
 * here so the success body, Session bookkeeping and LOGIN audit event cannot
 * drift between methods.
 */
@Injectable()
export class LoginIssuerService {
  private readonly logger = new Logger(LoginIssuerService.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async issueTokens(
    user: LoginUser,
    req: Request,
    options: IssueLoginOptions,
  ): Promise<AuthResponseDto> {
    const ipAddress = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const accessTokenData = await this.tokenService.generateAccessToken(
      user,
      ipAddress,
      userAgent,
    );
    const refreshTokenData = await this.tokenService.generateRefreshToken(
      user,
      ipAddress,
      userAgent,
    );

    // NOTE: the better-auth session cookie token is deliberately NOT
    // returned to clients. Bearer clients only need the JWT pair.
    const via = options.method === 'password' ? '' : ` via ${options.method}`;
    this.logger.log(`User logged in${via}: ${user.email}`);

    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'LOGIN',
        entityType: 'SESSION',
        userId: user.id,
        action: 'user_login',
        description: `User logged in${via}: ${user.email}`,
        metadata: {
          email: user.email,
          method: options.method,
          ipAddress,
          userAgent,
          ...(options.extraMetadata ?? {}),
        },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.USER.LOGIN, auditPayload);
    } catch (error) {
      this.logger.error('Failed to emit audit event for login:', error);
    }

    return {
      message: 'Login successful',
      user: {
        id: String(user.id),
        email: user.email,
        name: user.name,
      },
      accessToken: accessTokenData.token,
      refreshToken: refreshTokenData.token,
      expiresAt: accessTokenData.expiresAt.toISOString(),
      refreshExpiresAt: refreshTokenData.expiresAt.toISOString(),
    };
  }
}
