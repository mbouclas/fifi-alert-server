/**
 * End-to-End Notification Flow Tests
 * Task 6.20
 *
 * Tests the complete notification pipeline:
 * 1. Alert created
 * 2. Devices matched via LocationService
 * 3. Notifications queued via NotificationService
 * 4. Queue processor handles jobs
 * 5. Push notifications sent via FCM/APNs
 * 6. Status tracked in database
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../services/prisma.service';
import { NotificationService } from './notification.service';
import { NotificationQueueProcessor } from './notification-queue.processor';
import { LocationService } from '../location/location.service';
import { FCMService } from './fcm.service';
import { APNsService } from './apns.service';
import { NOTIFICATION_QUEUE } from './notification.constants';
import {
  NotificationConfidence,
  NotificationStatus,
} from '../generated/prisma';

describe('Notification Flow (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let notificationService: NotificationService;
  let locationService: LocationService;
  let queueProcessor: NotificationQueueProcessor;
  let mockQueue: any;

  beforeEach(async () => {
    // Mock BullMQ Queue
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      close: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        NotificationQueueProcessor,
        {
          provide: getQueueToken(NOTIFICATION_QUEUE),
          useValue: mockQueue,
        },
        {
          provide: PrismaService,
          useValue: {
            alert: {
              findUnique: jest.fn(),
            },
            notification: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            notificationExclusion: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: LocationService,
          useValue: {
            findDevicesForAlert: jest.fn(),
          },
        },
        {
          provide: FCMService,
          useValue: {
            sendNotification: jest.fn().mockResolvedValue({
              success: true,
              messageId: 'fcm-msg-123',
            }),
          },
        },
        {
          provide: APNsService,
          useValue: {
            sendNotification: jest.fn().mockResolvedValue({
              success: true,
              messageId: 'apn-msg-456',
            }),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    prismaService = module.get<PrismaService>(PrismaService);
    notificationService = module.get<NotificationService>(NotificationService);
    locationService = module.get<LocationService>(LocationService);
    queueProcessor = module.get<NotificationQueueProcessor>(
      NotificationQueueProcessor,
    );
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('Complete notification flow', () => {
    it('should queue alert notifications when alert is created', async () => {
      const alertId = 100;

      await notificationService.queueAlertNotifications(alertId);

      expect(mockQueue.add).toHaveBeenCalledWith('send-alert-notifications', {
        alertId,
      });
    });

    it('should process alert and queue individual notifications', async () => {
      const alertId = 100;
      const mockAlert = {
        id: alertId,
        status: 'ACTIVE' as const,
        pet_name: 'Max',
        species: 'DOG' as const,
        last_seen_latitude: 49.2827,
        last_seen_longitude: -123.1207,
      };

      const mockDevices = [
        {
          deviceId: 'device-1',
          userId: 'user-1',
          pushToken: 'fcm-token-1',
          confidence: NotificationConfidence.HIGH,
          matchReason: 'GPS' as any,
          distanceKm: 1.5,
          matchedVia: 'Fresh GPS',
        },
        {
          deviceId: 'device-2',
          userId: 'user-2',
          pushToken: 'apn-token-2',
          confidence: NotificationConfidence.MEDIUM,
          matchReason: 'POSTAL_CODE' as any,
          distanceKm: 8.0,
          matchedVia: 'Postal code match',
        },
      ];

      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue(
        mockAlert,
      );
      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue(
        mockDevices,
      );
      (prismaService.notification.create as jest.Mock).mockImplementation(
        (data) => {
          return Promise.resolve({
            id: Math.floor(Math.random() * 1000),
            ...data.data,
          });
        },
      );

      const job = {
        id: 'job-1',
        name: 'send-alert-notifications',
        data: { alertId },
      } as any;

      await queueProcessor.process(job);

      // Verify 2 notifications were created
      expect(prismaService.notification.create).toHaveBeenCalledTimes(2);

      // Verify HIGH confidence notification
      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          alert_id: alertId,
          device_id: parseInt('device-1'),
          confidence: NotificationConfidence.HIGH,
          match_reason: 'GPS',
          distance_km: 1.5,
          status: NotificationStatus.QUEUED,
        }),
      });

      // Verify MEDIUM confidence notification
      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          alert_id: alertId,
          device_id: parseInt('device-2'),
          confidence: NotificationConfidence.MEDIUM,
          match_reason: 'POSTAL_CODE',
          distance_km: 8.0,
          status: NotificationStatus.QUEUED,
        }),
      });

      // Verify individual push jobs were queued
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should send FCM notification for Android device', async () => {
      const mockNotification = {
        id: 200,
        alert_id: 100,
        device_id: 'android-device',
        confidence: NotificationConfidence.HIGH,
        distance_km: 2.5,
        status: NotificationStatus.QUEUED,
        device: {
          push_token: 'fcm-token-abc',
          platform: 'ANDROID',
        },
        alert: {
          pet_name: 'Buddy',
          pet_species: 'DOG',
          pet_description: 'Golden Retriever with red collar',
          location_address: '123 Main St',
          pet_photos: ['https://example.com/buddy.jpg'],
        },
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );
      (prismaService.notification.update as jest.Mock).mockResolvedValue({
        ...mockNotification,
        status: NotificationStatus.SENT,
      });

      const fcmService = app.get(FCMService);

      const job = {
        id: 'job-2',
        name: 'send-push-notification',
        data: { notificationId: 200 },
      } as any;

      await queueProcessor.process(job);

      expect(fcmService.sendNotification).toHaveBeenCalledWith(
        'fcm-token-abc',
        expect.objectContaining({
          title: expect.stringContaining('Buddy'),
          body: expect.stringContaining('Golden Retriever'),
          imageUrl: 'https://example.com/buddy.jpg',
        }),
      );

      expect(prismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 200 },
        data: {
          status: NotificationStatus.SENT,
          sent_at: expect.any(Date),
          push_message_id: 'fcm-msg-123',
        },
      });
    });

    it('should send APNs notification for iOS device', async () => {
      const mockNotification = {
        id: 300,
        alert_id: 101,
        device_id: 'ios-device',
        confidence: NotificationConfidence.MEDIUM,
        distance_km: 5.0,
        status: NotificationStatus.QUEUED,
        device: {
          push_token: 'apn-token-xyz',
          platform: 'IOS',
        },
        alert: {
          pet_name: 'Luna',
          pet_species: 'CAT',
          pet_description: 'White Persian cat',
          location_address: null,
          pet_photos: [],
        },
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );
      (prismaService.notification.update as jest.Mock).mockResolvedValue({
        ...mockNotification,
        status: NotificationStatus.SENT,
      });

      const apnsService = app.get(APNsService);

      const job = {
        id: 'job-3',
        name: 'send-push-notification',
        data: { notificationId: 300 },
      } as any;

      await queueProcessor.process(job);

      expect(apnsService.sendNotification).toHaveBeenCalledWith(
        'apn-token-xyz',
        expect.objectContaining({
          title: expect.stringContaining('Luna'),
          body: expect.stringContaining('White Persian'),
        }),
      );

      expect(prismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 300 },
        data: {
          status: NotificationStatus.SENT,
          sent_at: expect.any(Date),
          push_message_id: 'apn-msg-456',
        },
      });
    });

    it('should handle push notification failure', async () => {
      const mockNotification = {
        id: 400,
        alert_id: 102,
        device_id: 'device-fail',
        confidence: NotificationConfidence.HIGH,
        distance_km: 1.0,
        status: NotificationStatus.QUEUED,
        device: {
          push_token: 'invalid-token',
          platform: 'ANDROID',
        },
        alert: {
          pet_name: 'Charlie',
          pet_species: 'DOG',
          pet_description: 'Brown Labrador',
          location_address: null,
          pet_photos: [],
        },
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );
      (prismaService.notification.update as jest.Mock).mockResolvedValue({
        ...mockNotification,
        status: NotificationStatus.FAILED,
      });

      const fcmService = app.get(FCMService);
      (fcmService.sendNotification as jest.Mock).mockResolvedValue({
        success: false,
        error: 'INVALID_TOKEN',
        invalidToken: true,
      });

      const job = {
        id: 'job-4',
        name: 'send-push-notification',
        data: { notificationId: 400 },
      } as any;

      // Expect the processor to throw an error after marking as failed
      await expect(queueProcessor.process(job)).rejects.toThrow(
        'Failed to send push notification: INVALID_TOKEN',
      );

      expect(prismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 400 },
        data: {
          status: NotificationStatus.FAILED,
          failed_at: expect.any(Date),
          failure_reason: 'INVALID_TOKEN',
        },
      });
    });

    it('should track exclusions for devices without push tokens', async () => {
      const alertId = 103;
      const mockAlert = {
        id: alertId,
        status: 'ACTIVE' as const,
        pet_name: 'Mittens',
        species: 'CAT' as const,
        last_seen_latitude: 49.2827,
        last_seen_longitude: -123.1207,
      };

      const mockDevices = [
        {
          deviceId: 'device-no-token',
          userId: 'user-5',
          pushToken: null,
          confidence: NotificationConfidence.HIGH,
          matchReason: 'GPS' as any,
          distanceKm: 0.5,
          matchedVia: 'Fresh GPS',
        },
      ];

      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue(
        mockAlert,
      );
      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue(
        mockDevices,
      );

      const job = {
        id: 'job-5',
        name: 'send-alert-notifications',
        data: { alertId },
      } as any;

      await queueProcessor.process(job);

      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: {
          alert_id: alertId,
          device_id: parseInt('device-no-token'),
          confidence: NotificationConfidence.LOW,
          match_reason: 'MANUAL',
          excluded: true,
          exclusion_reason: 'PUSH_TOKEN_MISSING',
        },
      });

      // Verify no push job was queued (only exclusion was tracked)
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should skip notifications for inactive alerts', async () => {
      const alertId = 104;
      const mockAlert = {
        id: alertId,
        status: 'RESOLVED' as const,
        pet_name: 'Rex',
        species: 'DOG' as const,
        last_seen_latitude: 49.2827,
        last_seen_longitude: -123.1207,
      };

      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue(
        mockAlert,
      );

      const job = {
        id: 'job-6',
        name: 'send-alert-notifications',
        data: { alertId },
      } as any;

      await queueProcessor.process(job);

      // Should not query devices for inactive alert
      expect(locationService.findDevicesForAlert).not.toHaveBeenCalled();
      expect(prismaService.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('Confidence-based message formatting', () => {
    it('should format HIGH confidence notification correctly', async () => {
      const mockNotification = {
        id: 500,
        alert_id: 105,
        device_id: 'device-1',
        confidence: NotificationConfidence.HIGH,
        distance_km: 1.2,
        status: NotificationStatus.QUEUED,
        device: {
          push_token: 'token-1',
          platform: 'ANDROID',
        },
        alert: {
          pet_name: 'Max',
          pet_species: 'DOG',
          pet_description: 'Friendly golden retriever',
          location_address: null,
          pet_photos: [],
        },
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );
      (prismaService.notification.update as jest.Mock).mockResolvedValue({});

      const fcmService = app.get(FCMService);

      const job = {
        id: 'job-7',
        name: 'send-push-notification',
        data: { notificationId: 500 },
      } as any;

      await queueProcessor.process(job);

      expect(fcmService.sendNotification).toHaveBeenCalledWith(
        'token-1',
        expect.objectContaining({
          title: expect.stringMatching(/🐕.*Max.*1\.2km/),
        }),
      );
    });

    it('should format MEDIUM confidence notification correctly', async () => {
      const mockNotification = {
        id: 501,
        alert_id: 106,
        device_id: 'device-2',
        confidence: NotificationConfidence.MEDIUM,
        distance_km: 5.0,
        status: NotificationStatus.QUEUED,
        device: {
          push_token: 'token-2',
          platform: 'IOS',
        },
        alert: {
          pet_name: 'Bella',
          pet_species: 'CAT',
          pet_description: 'Tabby cat',
          location_address: null,
          pet_photos: [],
        },
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );
      (prismaService.notification.update as jest.Mock).mockResolvedValue({});

      const apnsService = app.get(APNsService);

      const job = {
        id: 'job-8',
        name: 'send-push-notification',
        data: { notificationId: 501 },
      } as any;

      await queueProcessor.process(job);

      expect(apnsService.sendNotification).toHaveBeenCalledWith(
        'token-2',
        expect.objectContaining({
          title: expect.stringMatching(/Missing CAT nearby.*Bella/),
        }),
      );
    });

    it('should format LOW confidence notification correctly', async () => {
      const mockNotification = {
        id: 502,
        alert_id: 107,
        device_id: 'device-3',
        confidence: NotificationConfidence.LOW,
        distance_km: 15.0,
        status: NotificationStatus.QUEUED,
        device: {
          push_token: 'token-3',
          platform: 'ANDROID',
        },
        alert: {
          pet_name: 'Rocky',
          pet_species: 'DOG',
          pet_description: 'Small terrier',
          location_address: null,
          pet_photos: [],
        },
      };

      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        mockNotification,
      );
      (prismaService.notification.update as jest.Mock).mockResolvedValue({});

      const fcmService = app.get(FCMService);

      const job = {
        id: 'job-9',
        name: 'send-push-notification',
        data: { notificationId: 502 },
      } as any;

      await queueProcessor.process(job);

      expect(fcmService.sendNotification).toHaveBeenCalledWith(
        'token-3',
        expect.objectContaining({
          title: 'Missing pet alert in your area',
        }),
      );
    });
  });
});
