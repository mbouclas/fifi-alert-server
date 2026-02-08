/**
 * Integration tests for Audit Log Event Flow
 * Tests the end-to-end event emission and persistence
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../services/prisma.service';
import { AUDIT_EVENT_NAMES } from './audit-event-names';
import { AuditEventType, AuditEntityType } from '../generated/prisma';
import type { IAuditEventPayload } from './interfaces/audit-event-payload.interface';

describe('Audit Log Integration (Event Flow)', () => {
  let eventEmitter: EventEmitter2;
  let auditLogService: AuditLogService;
  let prismaService: PrismaService;
  let module: TestingModule;

  const mockPrismaService = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot({
          wildcard: true,
          delimiter: '.',
          newListener: false,
          removeListener: false,
          maxListeners: 10,
          verboseMemoryLeak: false,
          ignoreErrors: false,
        }),
      ],
      providers: [
        AuditLogService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    auditLogService = module.get<AuditLogService>(AuditLogService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Initialize the service to register the event listener
    await module.init();
  });

  afterEach(async () => {
    await module.close();
  });

  describe('End-to-End Event Flow', () => {
    it('should emit event and write to database', async () => {
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

      // Emit the event
      eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, payload);

      // Wait for async listener to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify database write was called
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: AuditEventType.CREATE,
            action: 'user_created',
            entityType: AuditEntityType.USER,
            entityId: 123,
            userId: 456,
          }),
        }),
      );
    });

    it('should catch all audit.* prefixed events with wildcard listener', async () => {
      const events = [
        {
          name: AUDIT_EVENT_NAMES.USER.LOGIN,
          payload: {
            eventType: AuditEventType.LOGIN,
            action: 'user_login',
            userId: 1,
            ipAddress: '192.168.1.1',
          },
        },
        {
          name: AUDIT_EVENT_NAMES.ENTITY.CREATED,
          payload: {
            eventType: AuditEventType.CREATE,
            action: 'alert_created',
            entityType: AuditEntityType.ALERT,
            entityId: 999,
            userId: 1,
          },
        },
        {
          name: AUDIT_EVENT_NAMES.EMAIL.SENT,
          payload: {
            eventType: AuditEventType.SEND,
            action: 'email_sent',
            userId: 1,
            metadata: { recipient: 'user@example.com' },
          },
        },
      ];

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      // Emit all events
      events.forEach((event) => {
        eventEmitter.emit(event.name, event.payload);
      });

      // Wait for async listeners to complete
      await new Promise((resolve) => setTimeout(resolve, 150));

      // All three events should have been captured
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(3);
    });

    it('should not capture events that do not start with "audit."', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      // Emit a non-audit event
      eventEmitter.emit('user.created', {
        userId: 123,
        email: 'test@example.com',
      });

      // Wait to ensure no listener fires
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not have been captured
      expect(mockPrismaService.auditLog.create).not.toHaveBeenCalled();
    });

    it('should handle async listener without blocking emitter', async () => {
      const startTime = Date.now();

      // Simulate slow database write
      mockPrismaService.auditLog.create.mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ id: 1 }), 200)),
      );

      const payload: IAuditEventPayload = {
        eventType: AuditEventType.CREATE,
        action: 'test_action',
        userId: 1,
      };

      // Emit event
      eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, payload);

      const emitTime = Date.now() - startTime;

      // Emit should return immediately (not block for 200ms)
      expect(emitTime).toBeLessThan(50);

      // Wait for the async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Verify it was called
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should continue app flow even if audit log write fails', async () => {
      mockPrismaService.auditLog.create.mockRejectedValue(
        new Error('Database connection lost'),
      );

      const payload: IAuditEventPayload = {
        eventType: AuditEventType.CREATE,
        action: 'test_action',
        userId: 1,
      };

      // Emit event - should not throw
      expect(() => {
        eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, payload);
      }).not.toThrow();

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify it attempted to write (but failed gracefully)
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple rapid events correctly', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      // Rapid fire 10 events
      for (let i = 0; i < 10; i++) {
        eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, {
          eventType: AuditEventType.CREATE,
          action: `action_${i}`,
          userId: i,
        });
      }

      // Wait for all async handlers
      await new Promise((resolve) => setTimeout(resolve, 200));

      // All 10 should have been processed
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(10);
    });

    it('should sanitize sensitive data before persistence', async () => {
      const payload: IAuditEventPayload = {
        eventType: AuditEventType.UPDATE,
        action: 'user_updated',
        userId: 1,
        newValues: {
          email: 'new@example.com',
          password: 'secret123',
          name: 'John Doe',
        },
      };

      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, payload);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      expect(createCall.data.newValues.password).toBe('[REDACTED]');
      expect(createCall.data.newValues.email).toBe('new@example.com');
      expect(createCall.data.newValues.name).toBe('John Doe');
    });

    it('should properly handle nested event names (audit.entity.created)', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      const payload: IAuditEventPayload = {
        eventType: AuditEventType.CREATE,
        action: 'alert_created',
        entityType: AuditEntityType.ALERT,
        userId: 1,
      };

      // This is a three-level event name: audit.entity.created
      eventEmitter.emit('audit.entity.created', payload);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should be caught by the audit.** wildcard listener
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should handle events with minimal payload', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      const minimalPayload: IAuditEventPayload = {
        eventType: AuditEventType.SYSTEM,
        action: 'system_startup',
      };

      eventEmitter.emit(AUDIT_EVENT_NAMES.SYSTEM.STARTUP, minimalPayload);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];
      expect(createCall.data.eventType).toBe(AuditEventType.SYSTEM);
      expect(createCall.data.action).toBe('system_startup');
      expect(createCall.data.actorType).toBe('system');
    });

    it('should handle events with full payload', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      const fullPayload: IAuditEventPayload = {
        eventType: AuditEventType.UPDATE,
        action: 'alert_updated',
        entityType: AuditEntityType.ALERT,
        entityId: 456,
        userId: 123,
        actorId: '123',
        actorType: 'user',
        description: 'Updated alert status to RESOLVED',
        oldValues: { status: 'ACTIVE' },
        newValues: { status: 'RESOLVED' },
        metadata: { reason: 'Pet found' },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        sessionId: 'session-xyz',
        requestId: 'req-123',
        success: true,
      };

      eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, fullPayload);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrismaService.auditLog.create.mock.calls[0][0];

      expect(createCall.data.eventType).toBe(AuditEventType.UPDATE);
      expect(createCall.data.action).toBe('alert_updated');
      expect(createCall.data.entityType).toBe(AuditEntityType.ALERT);
      expect(createCall.data.entityId).toBe(456);
      expect(createCall.data.userId).toBe(123);
      expect(createCall.data.ipAddress).toBe('192.168.1.100');
      expect(createCall.data.sessionId).toBe('session-xyz');
      expect(createCall.data.success).toBe(true);
    });
  });

  describe('Wildcard Event Matching', () => {
    it('should match audit.* events', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      eventEmitter.emit('audit.test', {
        eventType: AuditEventType.SYSTEM,
        action: 'test',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should match audit.user.* events', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      eventEmitter.emit('audit.user.login', {
        eventType: AuditEventType.LOGIN,
        action: 'user_login',
        userId: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should match deep nested audit events', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      eventEmitter.emit('audit.deeply.nested.event.name', {
        eventType: AuditEventType.SYSTEM,
        action: 'deep_event',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should NOT match events without audit prefix', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 1 });

      eventEmitter.emit('user.created', { userId: 1 });
      eventEmitter.emit('system.startup', {});
      eventEmitter.emit('notification.sent', {});

      await new Promise((resolve) => setTimeout(resolve, 100));

      // None should be captured
      expect(mockPrismaService.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
