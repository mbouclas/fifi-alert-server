/**
 * Unit tests for AuditLogController
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { AuditEventType, AuditEntityType } from '../generated/prisma';
import { APP_GUARD } from '@nestjs/core';

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let service: AuditLogService;

  const mockAuditLogService = {
    getAuditLogs: jest.fn(),
    getEntityAuditTrail: jest.fn(),
    getUserActivity: jest.fn(),
    getSecurityEvents: jest.fn(),
    getFailedOperations: jest.fn(),
    getAuditStatistics: jest.fn(),
  };

  // Mock guard to bypass authentication in tests
  const mockGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
        {
          provide: APP_GUARD,
          useValue: mockGuard,
        },
      ],
    }).compile();

    controller = module.get<AuditLogController>(AuditLogController);
    service = module.get<AuditLogService>(AuditLogService);

    jest.clearAllMocks();
  });

  describe('findMany', () => {
    it('should return paginated audit logs', async () => {
      const mockData = [
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

      const mockResult = {
        data: mockData,
        total: 2,
        page: 1,
        limit: 10,
      };

      mockAuditLogService.getAuditLogs.mockResolvedValue(mockResult);

      const result = await controller.findMany(10, 1);

      expect(result).toEqual(mockResult);
      expect(mockAuditLogService.getAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
      });
    });

    it('should filter by eventType', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      };

      mockAuditLogService.getAuditLogs.mockResolvedValue(mockResult);

      await controller.findMany(10, 1, AuditEventType.LOGIN);

      expect(mockAuditLogService.getAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        eventType: AuditEventType.LOGIN,
      });
    });

    it('should filter by entityType and entityId', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      };

      mockAuditLogService.getAuditLogs.mockResolvedValue(mockResult);

      await controller.findMany(
        10,
        1,
        undefined, // eventType
        AuditEntityType.ALERT,
        123, // entityId
      );

      expect(mockAuditLogService.getAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        entityType: AuditEntityType.ALERT,
        entityId: 123,
      });
    });

    it('should filter by userId', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      };

      mockAuditLogService.getAuditLogs.mockResolvedValue(mockResult);

      await controller.findMany(
        10,
        1,
        undefined, // eventType
        undefined, // entityType
        undefined, // entityId
        456, // userId
      );

      expect(mockAuditLogService.getAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        userId: 456,
      });
    });

    it('should filter by actorId', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      };

      mockAuditLogService.getAuditLogs.mockResolvedValue(mockResult);

      await controller.findMany(
        10,
        1,
        undefined, // eventType
        undefined, // entityType
        undefined, // entityId
        undefined, // userId
        'system_cleanup', // actorId
      );

      expect(mockAuditLogService.getAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        actorId: 'system_cleanup',
      });
    });

    it('should filter by success status', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      };

      mockAuditLogService.getAuditLogs.mockResolvedValue(mockResult);

      await controller.findMany(
        10,
        1,
        undefined, // eventType
        undefined, // entityType
        undefined, // entityId
        undefined, // userId
        undefined, // actorId
        false, // success (failed operations)
      );

      expect(mockAuditLogService.getAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        success: false,
      });
    });

    it('should filter by date range', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      };

      const startDate = '2026-01-01T00:00:00.000Z';
      const endDate = '2026-01-31T23:59:59.999Z';

      mockAuditLogService.getAuditLogs.mockResolvedValue(mockResult);

      await controller.findMany(
        10,
        1,
        undefined, // eventType
        undefined, // entityType
        undefined, // entityId
        undefined, // userId
        undefined, // actorId
        undefined, // success
        startDate,
        endDate,
      );

      expect(mockAuditLogService.getAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    });

    it('should filter by action', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      };

      mockAuditLogService.getAuditLogs.mockResolvedValue(mockResult);

      await controller.findMany(
        10,
        1,
        undefined, // eventType
        undefined, // entityType
        undefined, // entityId
        undefined, // userId
        undefined, // actorId
        undefined, // success
        undefined, // startDate
        undefined, // endDate
        'user_login', // action
      );

      expect(mockAuditLogService.getAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        action: 'user_login',
      });
    });

    it('should use default pagination values', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 50,
      };

      mockAuditLogService.getAuditLogs.mockResolvedValue(mockResult);

      // Call without explicit limit/page
      await controller.findMany(undefined, undefined);

      expect(mockAuditLogService.getAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 50,
      });
    });
  });

  describe('getEntityAuditTrail', () => {
    it('should return entity audit trail', async () => {
      const mockLogs = [
        {
          id: 1,
          eventType: AuditEventType.CREATE,
          entityType: AuditEntityType.ALERT,
          entityId: 123,
          action: 'alert_created',
        },
        {
          id: 2,
          eventType: AuditEventType.UPDATE,
          entityType: AuditEntityType.ALERT,
          entityId: 123,
          action: 'alert_updated',
        },
        {
          id: 3,
          eventType: AuditEventType.DELETE,
          entityType: AuditEntityType.ALERT,
          entityId: 123,
          action: 'alert_deleted',
        },
      ];

      mockAuditLogService.getEntityAuditTrail.mockResolvedValue(mockLogs);

      const result = await controller.getEntityAuditTrail(
        AuditEntityType.ALERT,
        123,
      );

      expect(result).toEqual(mockLogs);
      expect(mockAuditLogService.getEntityAuditTrail).toHaveBeenCalledWith(
        AuditEntityType.ALERT,
        123,
      );
    });

    it('should handle different entity types', async () => {
      mockAuditLogService.getEntityAuditTrail.mockResolvedValue([]);

      await controller.getEntityAuditTrail(AuditEntityType.USER, 456);

      expect(mockAuditLogService.getEntityAuditTrail).toHaveBeenCalledWith(
        AuditEntityType.USER,
        456,
      );
    });
  });

  describe('getUserActivity', () => {
    it('should return user activity', async () => {
      const mockActivity = [
        { id: 1, userId: 789, action: 'user_login' },
        { id: 2, userId: 789, action: 'alert_created' },
        { id: 3, userId: 789, action: 'user_logout' },
      ];

      mockAuditLogService.getUserActivity.mockResolvedValue(mockActivity);

      const result = await controller.getUserActivity(789);

      expect(result).toEqual(mockActivity);
      expect(mockAuditLogService.getUserActivity).toHaveBeenCalledWith(789, {
        limit: 100,
      });
    });

    it('should respect limit parameter', async () => {
      mockAuditLogService.getUserActivity.mockResolvedValue([]);

      await controller.getUserActivity(789, 50);

      expect(mockAuditLogService.getUserActivity).toHaveBeenCalledWith(789, {
        limit: 50,
      });
    });

    it('should filter by date range', async () => {
      const startDate = '2026-01-01T00:00:00.000Z';
      const endDate = '2026-01-31T23:59:59.999Z';

      mockAuditLogService.getUserActivity.mockResolvedValue([]);

      await controller.getUserActivity(789, 100, startDate, endDate);

      expect(mockAuditLogService.getUserActivity).toHaveBeenCalledWith(789, {
        limit: 100,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    });
  });

  describe('getSecurityEvents', () => {
    it('should return security events', async () => {
      const mockEvents = [
        { id: 1, eventType: AuditEventType.LOGIN, action: 'user_login' },
        { id: 2, eventType: AuditEventType.LOGOUT, action: 'user_logout' },
        {
          id: 3,
          eventType: AuditEventType.FAILURE,
          action: 'login_failed',
        },
      ];

      mockAuditLogService.getSecurityEvents.mockResolvedValue(mockEvents);

      const result = await controller.getSecurityEvents();

      expect(result).toEqual(mockEvents);
      expect(mockAuditLogService.getSecurityEvents).toHaveBeenCalledWith({
        limit: 100,
      });
    });

    it('should respect limit parameter', async () => {
      mockAuditLogService.getSecurityEvents.mockResolvedValue([]);

      await controller.getSecurityEvents(50);

      expect(mockAuditLogService.getSecurityEvents).toHaveBeenCalledWith({
        limit: 50,
      });
    });

    it('should filter by date range', async () => {
      const startDate = '2026-01-01T00:00:00.000Z';
      const endDate = '2026-01-31T23:59:59.999Z';

      mockAuditLogService.getSecurityEvents.mockResolvedValue([]);

      await controller.getSecurityEvents(100, startDate, endDate);

      expect(mockAuditLogService.getSecurityEvents).toHaveBeenCalledWith({
        limit: 100,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    });
  });

  describe('getFailedOperations', () => {
    it('should return failed operations', async () => {
      const mockFailures = [
        {
          id: 1,
          success: false,
          action: 'create_alert',
          errorMessage: 'Validation failed',
        },
        {
          id: 2,
          success: false,
          action: 'send_notification',
          errorMessage: 'Network timeout',
        },
      ];

      mockAuditLogService.getFailedOperations.mockResolvedValue(mockFailures);

      const result = await controller.getFailedOperations();

      expect(result).toEqual(mockFailures);
      expect(mockAuditLogService.getFailedOperations).toHaveBeenCalledWith({
        limit: 100,
      });
    });

    it('should respect limit parameter', async () => {
      mockAuditLogService.getFailedOperations.mockResolvedValue([]);

      await controller.getFailedOperations(50);

      expect(mockAuditLogService.getFailedOperations).toHaveBeenCalledWith({
        limit: 50,
      });
    });

    it('should filter by date range', async () => {
      const startDate = '2026-01-01T00:00:00.000Z';
      const endDate = '2026-01-31T23:59:59.999Z';

      mockAuditLogService.getFailedOperations.mockResolvedValue([]);

      await controller.getFailedOperations(100, startDate, endDate);

      expect(mockAuditLogService.getFailedOperations).toHaveBeenCalledWith({
        limit: 100,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    });
  });

  describe('getStatistics', () => {
    it('should return audit statistics for date range', async () => {
      const mockStats = {
        totalEvents: 1500,
        eventsByType: {
          CREATE: 500,
          UPDATE: 400,
          DELETE: 100,
          LOGIN: 300,
          LOGOUT: 200,
        },
        eventsByEntityType: {
          USER: 400,
          ALERT: 600,
          DEVICE: 300,
          NOTIFICATION: 200,
        },
        successRate: 0.95,
        failureCount: 75,
      };

      mockAuditLogService.getAuditStatistics.mockResolvedValue(mockStats);

      const startDate = '2026-01-01T00:00:00.000Z';
      const endDate = '2026-01-31T23:59:59.999Z';

      const result = await controller.getStatistics(startDate, endDate);

      expect(result).toEqual(mockStats);
      expect(mockAuditLogService.getAuditStatistics).toHaveBeenCalledWith(
        new Date(startDate),
        new Date(endDate),
      );
    });

    it('should handle empty statistics', async () => {
      const mockStats = {
        totalEvents: 0,
        eventsByType: {},
        eventsByEntityType: {},
        successRate: 1,
        failureCount: 0,
      };

      mockAuditLogService.getAuditStatistics.mockResolvedValue(mockStats);

      const startDate = '2026-02-01T00:00:00.000Z';
      const endDate = '2026-02-01T23:59:59.999Z';

      const result = await controller.getStatistics(startDate, endDate);

      expect(result).toEqual(mockStats);
    });
  });
});
