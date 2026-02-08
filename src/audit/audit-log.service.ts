/**
 * Audit Log Service
 *
 * Event-driven audit logging service that listens for audit events
 * and persists them to the database. Provides query methods for
 * retrieving audit logs.
 *
 * @module AuditLogService
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../services/prisma.service';
import type { IAuditEventPayload } from './interfaces/audit-event-payload.interface';
import { AuditLog, AuditEventType, AuditEntityType } from '../generated/prisma';

/**
 * Sensitive fields that should be redacted from audit logs
 */
const SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'privateKey',
  'apiSecret',
  'fcmToken',
  'pushToken',
  'push_token',
  'idToken',
  'password_hash',
  'access_token',
  'refresh_token',
  'api_key',
  'private_key',
  'api_secret',
  'fcm_token',
];

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Event listener for all audit events
   * Listens to any event starting with 'audit.'
   */
  @OnEvent('audit.**', { async: true })
  async handleAuditEvent(payload: IAuditEventPayload): Promise<void> {
    try {
      // Sanitize payload to remove sensitive data
      const sanitizedPayload = this.sanitizePayload(payload);

      // Create audit log entry
      await this.createAuditLog(sanitizedPayload);
    } catch (error) {
      // NEVER throw - audit failures should not break the application
      this.logger.error('Failed to create audit log', {
        error: error.message,
        stack: error.stack,
        payload: this.sanitizePayload(payload),
      });
    }
  }

  /**
   * Create an audit log entry in the database
   */
  private async createAuditLog(payload: IAuditEventPayload): Promise<AuditLog> {
    const {
      eventType,
      action,
      entityType,
      entityId,
      description,
      userId,
      actorId,
      actorType,
      oldValues,
      newValues,
      ipAddress,
      userAgent,
      sessionId,
      requestId,
      success = true,
      errorMessage,
      errorStack,
      metadata,
      timestamp,
    } = payload;

    // Infer actor type if not provided
    const inferredActorType = actorType || this.inferActorType(userId, actorId);

    // Sanitize stack trace
    const sanitizedStack = errorStack
      ? this.sanitizeStackTrace(errorStack)
      : undefined;

    return this.prisma.auditLog.create({
      data: {
        eventType,
        action,
        entityType,
        entityId,
        description,
        userId,
        actorId: actorId || userId?.toString(),
        actorType: inferredActorType,
        oldValues: oldValues
          ? this.removeSensitiveFields(oldValues)
          : undefined,
        newValues: newValues
          ? this.removeSensitiveFields(newValues)
          : undefined,
        ipAddress,
        userAgent,
        sessionId,
        requestId,
        success,
        errorMessage,
        errorStack: sanitizedStack,
        metadata: metadata ? this.removeSensitiveFields(metadata) : undefined,
        timestamp: timestamp || new Date(),
        createdAt: new Date(),
      },
    });
  }

  /**
   * Sanitize the entire payload
   */
  private sanitizePayload(payload: IAuditEventPayload): IAuditEventPayload {
    return {
      ...payload,
      oldValues: payload.oldValues
        ? this.removeSensitiveFields(payload.oldValues)
        : undefined,
      newValues: payload.newValues
        ? this.removeSensitiveFields(payload.newValues)
        : undefined,
      metadata: payload.metadata
        ? this.removeSensitiveFields(payload.metadata)
        : undefined,
      errorStack: payload.errorStack
        ? this.sanitizeStackTrace(payload.errorStack)
        : undefined,
    };
  }

  /**
   * Remove sensitive fields from an object
   */
  private removeSensitiveFields(obj: Record<string, any>): Record<string, any> {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const sanitized = { ...obj };

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();

      // Check if this is a sensitive field
      if (
        SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))
      ) {
        sanitized[key] = '[REDACTED]';
      } else if (
        typeof sanitized[key] === 'object' &&
        sanitized[key] !== null
      ) {
        // Recursively sanitize nested objects
        sanitized[key] = this.removeSensitiveFields(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Sanitize stack traces (truncate and normalize paths)
   */
  private sanitizeStackTrace(stack: string): string {
    if (!stack) return '';

    // Split into lines and take first 10 lines
    const lines = stack.split('\n').slice(0, 10);

    // Normalize paths (remove absolute paths, keep relative)
    return lines
      .map((line) => {
        // Remove common path prefixes
        return line
          .replace(/at\s+.*?\\src\\/g, 'at src/')
          .replace(/at\s+.*?\/src\//g, 'at src/')
          .replace(/\\/g, '/');
      })
      .join('\n');
  }

  /**
   * Infer actor type based on available information
   */
  private inferActorType(
    userId?: number,
    actorId?: string,
  ): string | undefined {
    if (userId) return 'user';
    if (!actorId) return 'system';
    if (actorId.startsWith('cron_')) return 'cron';
    if (actorId.startsWith('api_')) return 'api_key';
    if (actorId.startsWith('webhook_')) return 'webhook';
    return 'system';
  }

  /**
   * Get paginated audit logs with filters
   */
  async getAuditLogs(options: {
    page?: number;
    limit?: number;
    eventType?: AuditEventType;
    entityType?: AuditEntityType;
    entityId?: number;
    userId?: number;
    actorId?: string;
    success?: boolean;
    startDate?: Date;
    endDate?: Date;
    action?: string;
  }): Promise<{
    data: AuditLog[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 50,
      eventType,
      entityType,
      entityId,
      userId,
      actorId,
      success,
      startDate,
      endDate,
      action,
    } = options;

    const where: any = {};

    if (eventType) where.eventType = eventType;
    if (entityType) where.entityType = entityType;
    if (entityId !== undefined) where.entityId = entityId;
    if (userId !== undefined) where.userId = userId;
    if (actorId) where.actorId = actorId;
    if (success !== undefined) where.success = success;
    if (action) where.action = { contains: action, mode: 'insensitive' };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Get audit trail for a specific entity
   */
  async getEntityAuditTrail(
    entityType: AuditEntityType,
    entityId: number,
    options?: {
      limit?: number;
      includeRelated?: boolean;
    },
  ): Promise<AuditLog[]> {
    const { limit = 100, includeRelated = false } = options || {};

    const where: any = {
      entityType,
      entityId,
    };

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Get user activity
   */
  async getUserActivity(
    userId: number,
    options?: {
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<AuditLog[]> {
    const { limit = 100, startDate, endDate } = options || {};

    const where: any = { userId };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Get security events (logins, password changes, etc.)
   */
  async getSecurityEvents(options?: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<AuditLog[]> {
    const { limit = 100, startDate, endDate } = options || {};

    const where: any = {
      eventType: {
        in: [
          AuditEventType.LOGIN,
          AuditEventType.LOGOUT,
          AuditEventType.FAILURE,
          AuditEventType.REVOCATION,
          AuditEventType.RESET,
        ],
      },
    };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Get failed operations
   */
  async getFailedOperations(options?: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<AuditLog[]> {
    const { limit = 100, startDate, endDate } = options || {};

    const where: any = { success: false };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Get audit statistics for a date range
   */
  async getAuditStatistics(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByEntity: Record<string, number>;
    failureRate: number;
    topUsers: Array<{ userId: number; count: number }>;
  }> {
    const where = {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    };

    const [
      totalEvents,
      eventsByType,
      eventsByEntity,
      failedEvents,
      userActivity,
    ] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({
        by: ['eventType'],
        where,
        _count: true,
      }),
      this.prisma.auditLog.groupBy({
        by: ['entityType'],
        where: {
          ...where,
          entityType: { not: null },
        },
        _count: true,
      }),
      this.prisma.auditLog.count({
        where: {
          ...where,
          success: false,
        },
      }),
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          ...where,
          userId: { not: null },
        },
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
    ]);

    const eventsByTypeMap: Record<string, number> = {};
    eventsByType.forEach((item) => {
      eventsByTypeMap[item.eventType] = item._count;
    });

    const eventsByEntityMap: Record<string, number> = {};
    eventsByEntity.forEach((item) => {
      if (item.entityType) {
        eventsByEntityMap[item.entityType] = item._count;
      }
    });

    const topUsers = userActivity
      .filter((item) => item.userId !== null)
      .map((item) => ({
        userId: item.userId!,
        count: item._count,
      }));

    const failureRate =
      totalEvents > 0 ? (failedEvents / totalEvents) * 100 : 0;

    return {
      totalEvents,
      eventsByType: eventsByTypeMap,
      eventsByEntity: eventsByEntityMap,
      failureRate,
      topUsers,
    };
  }

  /**
   * Find many audit logs with custom query
   */
  async findMany(options: any): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany(options);
  }

  /**
   * Find one audit log
   */
  async findOne(id: number): Promise<AuditLog | null> {
    return this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }
}
