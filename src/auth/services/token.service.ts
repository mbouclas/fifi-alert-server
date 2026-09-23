import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../services/prisma.service';
import type { User, Role, Gate } from '../../generated/prisma';

/**
 * Default token lifetimes used when the corresponding environment variable is
 * not set. Access tokens are short-lived. Refresh tokens are long-lived and
 * ROTATING: every successful refresh revokes the presented refresh token and
 * issues a new access + refresh pair (see {@link TokenService.rotateRefreshToken}).
 */
export const DEFAULT_ACCESS_EXPIRATION = '15m';
export const DEFAULT_REFRESH_EXPIRATION = '30d';

/**
 * Default grace window (seconds) after a refresh token has been rotated during
 * which presenting the OLD token is treated as a benign duplicate (mobile
 * retry, racing tabs) rather than theft. Outside this window a reuse revokes
 * every session of the user.
 */
export const DEFAULT_REFRESH_REUSE_GRACE_SECONDS = 30;

/**
 * Hash a JWT for storage/lookup in the Session table.
 *
 * Access and refresh tokens are persisted as a SHA-256 hex digest so a leaked
 * database snapshot does not contain usable credentials. better-auth's own
 * `tokenType = 'session'` rows are NOT hashed (better-auth reads them raw).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Thrown when a refresh token that was already rotated (or otherwise revoked)
 * is presented again outside the grace window. The controller uses this to
 * emit a security audit event. All other sessions of the user have already
 * been revoked when this is thrown.
 */
export class RefreshTokenReuseError extends UnauthorizedException {
  constructor(public readonly userId: number) {
    super('Refresh token reuse detected; all sessions have been revoked');
  }
}

/**
 * Result of a successful refresh token rotation.
 */
export interface IRotatedTokens {
  userId: number;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * JWT token payload structure
 */
export interface IJwtPayload {
  sub: number; // User ID
  email: string;
  roles: Array<{ id: number; slug: string; level: number }>;
  gates: Array<{ id: number; slug: string }>;
  type: 'access' | 'refresh';
  /**
   * Unique token id. Without it, two tokens minted for the same user within
   * the same second are byte-identical — which would make a fast rotation
   * reissue the very token it just revoked, and collide on Session.token.
   */
  jti: string;
  iat?: number;
  exp?: number;
}

/**
 * User data structure returned after token validation
 */
export interface ITokenUser {
  id: number;
  email: string;
  name: string;
  roles: Array<{ id: number; slug: string; name: string; level: number }>;
  gates: Array<{ id: number; slug: string; name: string }>;
}

/**
 * Service for handling JWT token generation, validation, and storage
 * Tokens are stored in the Session table for revocation capability
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate an access token (short-lived, for API requests)
   * @param user - User entity with roles and gates
   * @param ipAddress - Optional IP address for audit trail
   * @param userAgent - Optional user agent for audit trail
   * @returns Access token string and expiration date
   */
  async generateAccessToken(
    user: User & {
      roles: Array<{ role: Role }>;
      gates: Array<{ gate: Gate }>;
    },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const expirationTime =
      process.env.JWT_ACCESS_EXPIRATION || DEFAULT_ACCESS_EXPIRATION;
    // Validate the configured duration once and derive both the JWT `exp`
    // claim and the Session.expiresAt from the SAME number of seconds so they
    // stay aligned (no drift between the token and its DB record).
    const expiresInSeconds = this.durationToSeconds(expirationTime);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const payload: IJwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles.map((ur) => ({
        id: ur.role.id,
        slug: ur.role.slug,
        level: ur.role.level,
      })),
      gates: user.gates.map((ug) => ({
        id: ug.gate.id,
        slug: ug.gate.slug,
      })),
      type: 'access',
      jti: randomUUID(),
    };

    // Sign explicitly with the validated duration rather than relying on any
    // module-wide `expiresIn`. This guarantees the access token uses its own
    // access expiration regardless of JwtModule configuration.
    const token = this.jwtService.sign(payload as any, {
      expiresIn: expiresInSeconds,
    });

    // Store token in Session table for revocation capability
    await this.storeTokenInSession(
      token,
      user.id,
      'access',
      expiresAt,
      ipAddress,
      userAgent,
    );

    return { token, expiresAt };
  }

  /**
   * Generate a refresh token (long-lived, for obtaining new access tokens)
   * @param user - User entity
   * @param ipAddress - Optional IP address for audit trail
   * @param userAgent - Optional user agent for audit trail
   * @returns Refresh token string and expiration date
   */
  async generateRefreshToken(
    user: User,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const expirationTime =
      process.env.JWT_REFRESH_EXPIRATION || DEFAULT_REFRESH_EXPIRATION;
    // Validate the configured duration once and derive both the JWT `exp`
    // claim and the Session.expiresAt from the SAME number of seconds.
    const expiresInSeconds = this.durationToSeconds(expirationTime);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const payload: IJwtPayload = {
      sub: user.id,
      email: user.email,
      roles: [], // Minimal payload for refresh tokens
      gates: [],
      type: 'refresh',
      jti: randomUUID(),
    };

    // Sign explicitly with the refresh duration. Without this, the refresh
    // token would inherit the module-wide (access) `expiresIn`, causing its
    // JWT `exp` to disagree with the Session.expiresAt persisted below.
    const token = this.jwtService.sign(payload as any, {
      expiresIn: expiresInSeconds,
    });

    // Store refresh token in Session table
    await this.storeTokenInSession(
      token,
      user.id,
      'refresh',
      expiresAt,
      ipAddress,
      userAgent,
    );

    return { token, expiresAt };
  }

  /**
   * Validate an access token and return user data with roles and gates
   * @param token - JWT token string
   * @returns User data if token is valid
   * @throws UnauthorizedException if token is invalid or revoked
   */
  async validateAccessToken(token: string): Promise<ITokenUser> {
    try {
      // Verify JWT signature and expiration
      const payload = this.jwtService.verify<IJwtPayload>(token);

      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Check if token is revoked in database (stored as SHA-256 hash)
      const session = await this.prisma.session.findUnique({
        where: { token: hashToken(token) },
        select: {
          revoked: true,
          userId: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              banned: true,
              banExpires: true,
              roles: {
                select: {
                  role: {
                    select: {
                      id: true,
                      slug: true,
                      name: true,
                      level: true,
                      active: true,
                    },
                  },
                },
              },
              gates: {
                select: {
                  gate: {
                    select: {
                      id: true,
                      slug: true,
                      name: true,
                      active: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!session || session.revoked) {
        throw new UnauthorizedException('Token has been revoked');
      }

      // Check if user is banned
      if (session.user.banned) {
        if (!session.user.banExpires || session.user.banExpires > new Date()) {
          throw new UnauthorizedException('User account is banned');
        }
        // Ban expired, unban user automatically
        await this.prisma.user.update({
          where: { id: session.userId },
          data: { banned: false, banReason: null, banExpires: null },
        });
      }

      // Filter only active roles and gates
      const activeRoles = session.user.roles
        .filter((ur) => ur.role.active)
        .map((ur) => ({
          id: ur.role.id,
          slug: ur.role.slug,
          name: ur.role.name,
          level: ur.role.level,
        }));

      const activeGates = session.user.gates
        .filter((ug) => ug.gate.active)
        .map((ug) => ({
          id: ug.gate.id,
          slug: ug.gate.slug,
          name: ug.gate.name,
        }));

      return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        roles: activeRoles,
        gates: activeGates,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Validate a refresh token and return user ID
   * @param token - Refresh token string
   * @returns User ID if token is valid
   * @throws UnauthorizedException if token is invalid or revoked
   */
  async validateRefreshToken(token: string): Promise<number> {
    try {
      const payload = this.jwtService.verify<IJwtPayload>(token);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Check if refresh token is revoked (stored as SHA-256 hash)
      const session = await this.prisma.session.findUnique({
        where: { token: hashToken(token) },
        select: { revoked: true, userId: true },
      });

      if (!session || session.revoked) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      return payload.sub;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Rotate a refresh token: revoke the presented one and issue a brand-new
   * access + refresh pair. Implements reuse detection.
   *
   * Outcomes:
   *  - valid, active refresh token  → old one revoked, new pair returned
   *  - unknown / malformed / expired → UnauthorizedException
   *  - already revoked, revokedAt within grace window → UnauthorizedException
   *    ("already used"); nothing else happens (absorbs client retries)
   *  - already revoked, outside grace window → treated as theft: ALL sessions
   *    of the user are revoked and {@link RefreshTokenReuseError} is thrown
   *
   * @param rawToken - Refresh token presented by the client
   * @param ipAddress - Optional IP address for audit trail
   * @param userAgent - Optional user agent for audit trail
   */
  async rotateRefreshToken(
    rawToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IRotatedTokens> {
    let payload: IJwtPayload;
    try {
      payload = this.jwtService.verify<IJwtPayload>(rawToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const tokenHash = hashToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { token: tokenHash },
      select: { revoked: true, revokedAt: true, userId: true, tokenType: true },
    });

    if (!session || session.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (session.revoked) {
      const graceMs = this.reuseGraceSeconds() * 1000;
      const revokedAtMs = session.revokedAt?.getTime() ?? 0;
      if (Date.now() - revokedAtMs <= graceMs) {
        // Benign duplicate (retry / race). The replacement pair was already
        // handed to the client; do not punish.
        throw new UnauthorizedException('Refresh token already used');
      }

      // Reuse outside the grace window: assume the token family is compromised.
      this.logger.warn(
        `Refresh token reuse detected for user ${session.userId}; revoking all sessions`,
      );
      await this.revokeAllUserTokens(session.userId);
      throw new RefreshTokenReuseError(session.userId);
    }

    // Atomically claim the token. If another request rotated it between our
    // read and this write, count is 0 and we treat it like an in-grace reuse.
    const claimed = await this.prisma.session.updateMany({
      where: { token: tokenHash, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new UnauthorizedException('Refresh token already used');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        roles: { include: { role: true } },
        gates: { include: { gate: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const access = await this.generateAccessToken(
      user as any,
      ipAddress,
      userAgent,
    );
    const refresh = await this.generateRefreshToken(
      user as any,
      ipAddress,
      userAgent,
    );

    return {
      userId: user.id,
      accessToken: access.token,
      accessExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  /**
   * Grace window for refresh-token reuse, from REFRESH_TOKEN_REUSE_GRACE_SECONDS.
   * Falls back to the default when unset or not a non-negative integer.
   */
  private reuseGraceSeconds(): number {
    const raw = process.env.REFRESH_TOKEN_REUSE_GRACE_SECONDS;
    if (raw === undefined || raw === '') {
      return DEFAULT_REFRESH_REUSE_GRACE_SECONDS;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      this.logger.warn(
        `Invalid REFRESH_TOKEN_REUSE_GRACE_SECONDS="${raw}"; using default ${DEFAULT_REFRESH_REUSE_GRACE_SECONDS}`,
      );
      return DEFAULT_REFRESH_REUSE_GRACE_SECONDS;
    }
    return parsed;
  }

  /**
   * Store a token in the Session table for revocation tracking.
   * Access and refresh tokens are persisted as a SHA-256 hash (see {@link hashToken}).
   * @param token - JWT token string (raw; hashed here before persisting)
   * @param userId - User ID
   * @param tokenType - Type of token ('access', 'refresh', or 'session')
   * @param expiresAt - Expiration date
   * @param ipAddress - Optional IP address
   * @param userAgent - Optional user agent
   */
  private async storeTokenInSession(
    token: string,
    userId: number,
    tokenType: 'access' | 'refresh' | 'session',
    expiresAt: Date,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    // better-auth manages its own 'session' rows and reads them raw.
    const storedToken = tokenType === 'session' ? token : hashToken(token);
    try {
      await this.prisma.session.create({
        data: {
          token: storedToken,
          tokenType,
          userId,
          expiresAt,
          ipAddress,
          userAgent,
        },
      });
    } catch (error) {
      // Handle unique constraint violation (P2002) gracefully
      // This can happen if the same token is generated (rare but possible)
      const errorCode =
        typeof error === 'object' && error !== null
          ? (error as Record<string, unknown>).code
          : undefined;
      if (errorCode === 'P2002') {
        this.logger.warn(
          `Duplicate token detected for user ${userId}, updating existing session`,
        );
        // Update the existing session instead
        await this.prisma.session.update({
          where: { token: storedToken },
          data: {
            expiresAt,
            ipAddress,
            userAgent,
            revoked: false, // Un-revoke if previously revoked
          },
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Revoke a specific token (mark as revoked in database)
   * @param token - Token string to revoke
   * @returns True if token was revoked
   */
  async revokeToken(token: string): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { token: hashToken(token), revoked: false },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  /**
   * Revoke all tokens for a specific user
   * @param userId - User ID
   * @param exceptToken - Optional raw JWT to exclude from revocation (current token)
   * @returns Number of tokens revoked
   */
  async revokeAllUserTokens(
    userId: number,
    exceptToken?: string,
  ): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revoked: false,
        ...(exceptToken && { token: { not: hashToken(exceptToken) } }),
      },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Clean up expired tokens from database (maintenance task)
   * @returns Number of deleted tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  /**
   * Convert a duration string to a total number of seconds.
   *
   * Used as the single source of truth for both the JWT `expiresIn` (passed to
   * {@link JwtService.sign}) and the persisted Session.expiresAt, guaranteeing
   * the token's `exp` claim and its database record stay aligned.
   *
   * @param duration - Duration string (e.g., '15m', '30d', '1h', '45s')
   * @returns Total seconds represented by the duration
   * @throws Error if the format or unit is invalid
   */
  private durationToSeconds(duration: string): number {
    const matches = duration.match(/^([1-9]\d*)([smhd])$/);
    if (!matches) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = parseInt(matches[1], 10);
    const unit = matches[2];

    switch (unit) {
      case 's': // seconds
        return value;
      case 'm': // minutes
        return value * 60;
      case 'h': // hours
        return value * 60 * 60;
      case 'd': // days
        return value * 24 * 60 * 60;
      default:
        throw new Error(`Unsupported time unit: ${unit}`);
    }
  }
}
