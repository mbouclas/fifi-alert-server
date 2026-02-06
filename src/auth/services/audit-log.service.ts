import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';

export type AuditAction =
    | 'login_success'
    | 'login_failed'
    | 'token_refresh'
    | 'user_banned'
    | 'user_unbanned'
    | 'role_assigned'
    | 'role_removed'
    | 'gate_assigned'
    | 'gate_removed'
    | 'session_revoked'
    | 'password_changed'
    | 'email_changed';

export interface AuditLogOptions {
    action: AuditAction;
    userId?: number; // User who was affected
    actorId?: number; // User who performed the action (admin, etc.)
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Audit Log Service
 * 
 * Tracks sensitive operations and authentication events for security and compliance.
 */
@Injectable()
export class AuditLogService {
    private readonly logger = new Logger(AuditLogService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Create an audit log entry
     */
    async log(options: AuditLogOptions) {
        try {
            const auditLog = await this.prisma.auditLog.create({
                data: {
                    action: options.action,
                    userId: options.userId,
                    actorId: options.actorId,
                    metadata: options.metadata || {},
                    ipAddress: options.ipAddress,
                    userAgent: options.userAgent,
                },
            });

            this.logger.log(
                `Audit log created: ${options.action} for user ${options.userId || 'N/A'} by actor ${options.actorId || 'system'}`,
            );

            return auditLog;
        } catch (error) {
            this.logger.error('Failed to create audit log:', error);
            // Don't throw - audit logging should not break the application
        }
    }

    /**
     * Get audit logs for a specific user
     */
    async getUserLogs(userId: number, limit: number = 50) {
        return this.prisma.auditLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /**
     * Get audit logs by action type
     */
    async getLogsByAction(action: AuditAction, limit: number = 50) {
        return this.prisma.auditLog.findMany({
            where: { action },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /**
     * Get recent audit logs
     */
    async getRecentLogs(limit: number = 100) {
        return this.prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /**
     * Clean up old audit logs (older than specified days)
     */
    async cleanup(daysToKeep: number = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await this.prisma.auditLog.deleteMany({
            where: {
                createdAt: {
                    lt: cutoffDate,
                },
            },
        });

        this.logger.log(`Deleted ${result.count} audit logs older than ${daysToKeep} days`);
        return result.count;
    }
}
