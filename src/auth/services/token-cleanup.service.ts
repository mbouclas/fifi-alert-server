import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../services/prisma.service';

/**
 * Token Cleanup Service
 * 
 * Scheduled service that automatically cleans up expired and revoked tokens from the database,
 * and removes expired bans.
 * Runs daily at 2:00 AM by default.
 */
@Injectable()
export class TokenCleanupService {
    private readonly logger = new Logger(TokenCleanupService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Clean up expired and revoked tokens
     * Runs daily at 2:00 AM
     */
    @Cron(CronExpression.EVERY_DAY_AT_2AM)
    async cleanupExpiredTokens() {
        this.logger.log('Starting token cleanup job...');

        try {
            const now = new Date();

            // Delete expired tokens (both revoked and non-revoked)
            const expiredResult = await this.prisma.session.deleteMany({
                where: {
                    expiresAt: {
                        lt: now,
                    },
                },
            });

            // Delete revoked tokens older than 30 days
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const revokedResult = await this.prisma.session.deleteMany({
                where: {
                    revoked: true,
                    revokedAt: {
                        lt: thirtyDaysAgo,
                    },
                },
            });

            const totalDeleted = expiredResult.count + revokedResult.count;

            this.logger.log(
                `Token cleanup completed. Deleted ${expiredResult.count} expired tokens and ${revokedResult.count} old revoked tokens (total: ${totalDeleted})`,
            );

            return {
                success: true,
                expiredDeleted: expiredResult.count,
                revokedDeleted: revokedResult.count,
                totalDeleted,
            };
        } catch (error) {
            this.logger.error('Error during token cleanup:', error);
            throw error;
        }
    }

    /**
     * Clean up expired bans
     * Runs daily at 2:30 AM
     */
    @Cron('30 2 * * *') // 2:30 AM daily
    async cleanupExpiredBans() {
        this.logger.log('Starting expired ban cleanup job...');

        try {
            const now = new Date();

            // Find and unban users with expired bans
            const result = await this.prisma.user.updateMany({
                where: {
                    banned: true,
                    banExpires: {
                        not: null,
                        lt: now,
                    },
                },
                data: {
                    banned: false,
                    banReason: null,
                    banExpires: null,
                },
            });

            this.logger.log(
                `Ban cleanup completed. Unbanned ${result.count} users with expired bans`,
            );

            return {
                success: true,
                unbannedCount: result.count,
            };
        } catch (error) {
            this.logger.error('Error during ban cleanup:', error);
            throw error;
        }
    }

    /**
     * Manual cleanup method for testing or on-demand execution
     */
    async manualCleanup() {
        this.logger.log('Manual cleanup triggered');
        const tokenResult = await this.cleanupExpiredTokens();
        const banResult = await this.cleanupExpiredBans();

        return {
            tokens: tokenResult,
            bans: banResult,
        };
    }
}
