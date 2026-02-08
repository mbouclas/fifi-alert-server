/**
 * Unit tests for AuditLogService
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../services/prisma.service';
import { AuditEventType, AuditEntityType } from '../generated/prisma';
import type { IAuditEventPayload } from './interfaces/audit-event-payload.interface';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('handleAuditEvent', () => {
    it('should create audit log entry on event', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.CREATE,
        action: 'user_created',
        entityType: AuditEntityType.USER,
        entityId: 123,
        userId: 456,
        description: 'User created successfully',
      };

      mockPrismaService.auditLog.create.mockResolvedValue({
        id: 1,
        ...payload,
        timestamp: new Date(),
      });

      await service.handleAuditEvent(payload);

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: AuditEventType.CREATE,
            action: 'user_created',
            entityType: AuditEntityType.USER,
            entityId: 123,
            userId: 456,
            description: 'User created successfully',
            success: true,
          }),
        }),
      );
    });

    it('should redact sensitive fields from oldValues and newValues', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.UPDATE,
        action: 'user_updated',
        entityType: AuditEntityType.USER,
        entityId: 123,
        userId: 456,
        oldValues: {
          email: 'old@example.com',
          password: 'secret123',
          name: 'Old Name',
        },
        newValues: {
          email: 'new@example.com',
          password: 'newsecret456',
          name: 'New Name',
          token: 'Bearer xyz',
        },
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      expect(createCall.data.oldValues).toEqual({
        email: 'old@example.com',
        password: '[REDACTED]',
        name: 'Old Name',
      });
      expect(createCall.data.newValues).toEqual({
        email: 'new@example.com',
        password: '[REDACTED]',
        name: 'New Name',
        token: '[REDACTED]',
      });
    });

    it('should redact all sensitive field variations', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.CREATE,
        action: 'device_registered',
        entityType: AuditEntityType.DEVICE,
        userId: 1,
        newValues: {
          deviceId: 'device123',
          password: 'secret',
          passwordHash: 'hashed',
          secret: 'secret',
          token: 'token',
          accessToken: 'access',
          refreshToken: 'refresh',
          apiKey: 'key',
          privateKey: 'private',
          apiSecret: 'apisecret',
          fcmToken: 'fcm',
          pushToken: 'push',
          push_token: 'push_snake',
          access_token: 'access_snake',
        },
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      const newValues = createCall.data.newValues;

      expect(newValues.deviceId).toBe('device123');
      expect(newValues.password).toBe('[REDACTED]');
      expect(newValues.passwordHash).toBe('[REDACTED]');
      expect(newValues.secret).toBe('[REDACTED]');
      expect(newValues.token).toBe('[REDACTED]');
      expect(newValues.accessToken).toBe('[REDACTED]');
      expect(newValues.refreshToken).toBe('[REDACTED]');
      expect(newValues.apiKey).toBe('[REDACTED]');
      expect(newValues.privateKey).toBe('[REDACTED]');
      expect(newValues.apiSecret).toBe('[REDACTED]');
      expect(newValues.fcmToken).toBe('[REDACTED]');
      expect(newValues.pushToken).toBe('[REDACTED]');
      expect(newValues.push_token).toBe('[REDACTED]');
      expect(newValues.access_token).toBe('[REDACTED]');
    });

    it('should redact nested sensitive fields', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.UPDATE,
        action: 'config_updated',
        userId: 1,
        newValues: {
          publicKey: 'public-key-123',
          auth: {
            apiKey: 'secret-key',
            username: 'admin',
            password: 'secret',
          },
          settings: {
            theme: 'dark',
          },
        },
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      const newValues = createCall.data.newValues;

      expect(newValues.publicKey).toBe('public-key-123');
      expect(newValues.auth.apiKey).toBe('[REDACTED]');
      expect(newValues.auth.username).toBe('admin');
      expect(newValues.auth.password).toBe('[REDACTED]');
      expect(newValues.settings.theme).toBe('dark');
    });

    it('should never throw when DB write fails', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.CREATE,
        action: 'test_action',
        userId: 1,
      };

      mockPrismaService.auditLog.create.mockRejectedValue(
        new Error('Database connection failed'),
      );

      // Should not throw
      await expect(service.handleAuditEvent(payload)).resolves.toBeUndefined();

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should default success to true when not provided', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.CREATE,
        action: 'test_action',
        userId: 1,
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      expect(createCall.data.success).toBe(true);
    });

    it('should respect success=false when provided', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.FAILURE,
        action: 'login_failed',
        userId: 1,
        success: false,
        errorMessage: 'Invalid credentials',
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      expect(createCall.data.success).toBe(false);
      expect(createCall.data.errorMessage).toBe('Invalid credentials');
    });

    it('should infer actorType as "user" when userId is present', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.CREATE,
        action: 'alert_created',
        userId: 123,
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      expect(createCall.data.actorType).toBe('user');
    });

    it('should infer actorType as "system" when no userId', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.SYSTEM,
        action: 'cleanup_completed',
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      expect(createCall.data.actorType).toBe('system');
    });

    it('should infer actorType as "cron" when actorId starts with "cron_"', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.SYSTEM,
        action: 'scheduled_cleanup',
        actorId: 'cron_daily_cleanup',
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      expect(createCall.data.actorType).toBe('cron');
    });

    it('should infer actorType as "api_key" when actorId starts with "api_"', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.ACCESS,
        action: 'api_access',
        actorId: 'api_key_123',
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      expect(createCall.data.actorType).toBe('api_key');
    });

    it('should use provided actorType over inferred value', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.ACCESS,
        action: 'webhook_received',
        actorType: 'webhook',
        actorId: 'webhook_stripe',
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      expect(createCall.data.actorType).toBe('webhook');
    });

    it('should sanitize stack traces (truncate to 10 lines)', async () => {
      const longStackTrace = Array(20)
        .fill(0)
        .map(
          (_, i) =>
            `    at Object.<anonymous> (C:\\path\\to\\file${i}.js:${i}:1)`,
        )
        .join('\n');

      const payload: IAuditEventPayload = {
        eventType: AuditEventType.FAILURE,
        action: 'operation_failed',
        userId: 1,
        success: false,
        errorStack: longStackTrace,
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      const sanitizedStack = createCall.data.errorStack;

      // Should have max 10 lines
      const lineCount = sanitizedStack.split('\n').length;
      expect(lineCount).toBeLessThanOrEqual(10);
    });

    it('should normalize paths in stack traces', async () => {
      const stackWithAbsolutePath = `Error: Test error
    at Function.module.exports [as test] (C:\\Projects\\fifi-alert\\src\\service.ts:10:5)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`;

      const payload: IAuditEventPayload = {
        eventType: AuditEventType.FAILURE,
        action: 'operation_failed',
        userId: 1,
        success: false,
        errorStack: stackWithAbsolutePath,
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      const sanitizedStack = createCall.data.errorStack;

      // Should normalize backslashes to forward slashes
      expect(sanitizedStack).not.toContain('\\');
      expect(sanitizedStack).toContain('at src/');
    });

    it('should redact sensitive fields from metadata', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.SEND,
        action: 'notification_sent',
        userId: 1,
        metadata: {
          deviceId: 'device123',
          fcmToken: 'secret-fcm-token',
          messageId: 'msg-456',
        },
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      await service.handleAuditEvent(payload);

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      expect(createCall.data.metadata.deviceId).toBe('device123');
      expect(createCall.data.metadata.fcmToken).toBe('[REDACTED]');
      expect(createCall.data.metadata.messageId).toBe('msg-456');
    });
  });

  describe('getAuditLogs', () => {
    it('should return paginated results with filters', async () => {
      const mockLogs = [
        {
          id: 1,
          eventType: AuditEventType.CREATE,
          action: 'user_created',
          userId: 1,
        },
        {
          id: 2,
          eventType: AuditEventType.UPDATE,
          action: 'user_updated',
          userId: 1,
        },
      ];

      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);
      mockPrismaService.auditLog.count.mockResolvedValue(2);

      const result = await service.getAuditLogs({
        page: 1,
        limit: 10,
        userId: 1,
      });

      expect(result).toEqual({
        data: mockLogs,
        total: 2,
        page: 1,
        limit: 10,
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('should filter by eventType', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.getAuditLogs({
        eventType: AuditEventType.LOGIN,
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventType: AuditEventType.LOGIN },
        }),
      );
    });

    it('should filter by entityType and entityId', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.getAuditLogs({
        entityType: AuditEntityType.ALERT,
        entityId: 123,
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            entityType: AuditEntityType.ALERT,
            entityId: 123,
          },
        }),
      );
    });

    it('should filter by success status', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.getAuditLogs({
        success: false,
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { success: false },
        }),
      );
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.getAuditLogs({
        startDate,
        endDate,
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            timestamp: {
              gte: startDate,
              lte: endDate,
            },
          },
        }),
      );
    });
  });

  describe('getEntityAuditTrail', () => {
    it('should return audit trail for specific entity', async () => {
      const mockLogs = [
        {
          id: 1,
          eventType: AuditEventType.CREATE,
          entityType: AuditEntityType.ALERT,
          entityId: 123,
        },
        {
          id: 2,
          eventType: AuditEventType.UPDATE,
          entityType: AuditEntityType.ALERT,
          entityId: 123,
        },
      ];

      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.getEntityAuditTrail(
        AuditEntityType.ALERT,
        123,
      );

      expect(result).toEqual(mockLogs);
      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            entityType: AuditEntityType.ALERT,
            entityId: 123,
          },
        }),
      );
    });
  });

  describe('getUserActivity', () => {
    it('should return user activity with options', async () => {
      const mockLogs = [
        { id: 1, userId: 456, action: 'login' },
        { id: 2, userId: 456, action: 'create_alert' },
      ];

      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.getUserActivity(456, {
        limit: 50,
        startDate: new Date('2026-01-01'),
      });

      expect(result).toEqual(mockLogs);
      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 456,
            timestamp: {
              gte: expect.any(Date),
            },
          },
          orderBy: { timestamp: 'desc' },
          take: 50,
        }),
      );
    });
  });

  describe('getSecurityEvents', () => {
    it('should return security-related events', async () => {
      const mockLogs = [
        { id: 1, eventType: AuditEventType.LOGIN },
        { id: 2, eventType: AuditEventType.LOGOUT },
      ];

      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.getSecurityEvents({ limit: 50 });

      expect(result).toEqual(mockLogs);
      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            eventType: {
              in: [
                AuditEventType.LOGIN,
                AuditEventType.LOGOUT,
                AuditEventType.FAILURE,
                AuditEventType.REVOCATION,
                AuditEventType.RESET,
              ],
            },
          },
          orderBy: { timestamp: 'desc' },
          take: 50,
          include: expect.any(Object),
        }),
      );
    });

    it('should filter security events by date range', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      mockPrismaService.auditLog.findMany.mockResolvedValue([]);

      await service.getSecurityEvents({ startDate, endDate });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: {
              gte: startDate,
              lte: endDate,
            },
          }),
        }),
      );
    });
  });

  describe('getFailedOperations', () => {
    it('should return failed operations', async () => {
      const mockLogs = [
        {
          id: 1,
          success: false,
          errorMessage: 'Database error',
        },
        {
          id: 2,
          success: false,
          errorMessage: 'Network timeout',
        },
      ];

      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.getFailedOperations();

      expect(result).toEqual(mockLogs);
      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            success: false,
          }),
        }),
      );
    });
  });
});
