import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../services/prisma.service';
import type { User, Role, Gate } from '../../generated/prisma';

/**
 * JWT token payload structure
 */
export interface IJwtPayload {
    sub: number; // User ID
    email: string;
    roles: Array<{ id: number; slug: string; level: number }>;
    gates: Array<{ id: number; slug: string }>;
    type: 'access' | 'refresh';
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
    constructor(
        private readonly jwtService: JwtService,
        private readonly prisma: PrismaService,
    ) { }

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
            process.env.JWT_ACCESS_EXPIRATION || '15m';
        const expiresAt = this.calculateExpiration(expirationTime);

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
        };

        const token = this.jwtService.sign(payload as any);

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
            process.env.JWT_REFRESH_EXPIRATION || '7d';
        const expiresAt = this.calculateExpiration(expirationTime);

        const payload: IJwtPayload = {
            sub: user.id,
            email: user.email,
            roles: [], // Minimal payload for refresh tokens
            gates: [],
            type: 'refresh',
        };

        const token = this.jwtService.sign(payload as any);

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

            // Check if token is revoked in database
            const session = await this.prisma.session.findUnique({
                where: { token },
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

            // Check if refresh token is revoked
            const session = await this.prisma.session.findUnique({
                where: { token },
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
     * Store a token in the Session table for revocation tracking
     * @param token - JWT token string
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
        await this.prisma.session.create({
            data: {
                token,
                tokenType,
                userId,
                expiresAt,
                ipAddress,
                userAgent,
            },
        });
    }

    /**
     * Revoke a specific token (mark as revoked in database)
     * @param token - Token string to revoke
     * @returns True if token was revoked
     */
    async revokeToken(token: string): Promise<boolean> {
        const result = await this.prisma.session.updateMany({
            where: { token, revoked: false },
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
     * @param exceptToken - Optional token to exclude from revocation (current token)
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
                ...(exceptToken && { token: { not: exceptToken } }),
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
     * Calculate expiration date from duration string
     * @param duration - Duration string (e.g., '15m', '7d', '1h')
     * @returns Date object representing expiration time
     */
    private calculateExpiration(duration: string): Date {
        const matches = duration.match(/^(\d+)([smhd])$/);
        if (!matches) {
            throw new Error(`Invalid duration format: ${duration}`);
        }

        const value = parseInt(matches[1], 10);
        const unit = matches[2];

        const now = new Date();

        switch (unit) {
            case 's': // seconds
                return new Date(now.getTime() + value * 1000);
            case 'm': // minutes
                return new Date(now.getTime() + value * 60 * 1000);
            case 'h': // hours
                return new Date(now.getTime() + value * 60 * 60 * 1000);
            case 'd': // days
                return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
            default:
                throw new Error(`Unsupported time unit: ${unit}`);
        }
    }
}
