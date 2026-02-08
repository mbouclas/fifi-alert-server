import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { NotificationModule } from '../src/notification/notification.module';
import { NOTIFICATION_QUEUE } from '../src/notification/notification.constants';
import { NotificationService } from '../src/notification/notification.service';
import { NotificationQueueProcessor } from '../src/notification/notification-queue.processor';
import { LocationModule } from '../src/location/location.module';
import { PrismaService } from '../src/services/prisma.service';
import {
  AlertStatus,
  NotificationStatus,
  NotificationConfidence,
  DevicePlatform,
  LocationSource,
} from '../src/generated/prisma';

describe('Notification E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationService: NotificationService;
  let processor: NotificationQueueProcessor;
  let queue: Queue;
  let testUserId: number;
  let testAlertId: number;
  let testDeviceIds: number[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [NotificationModule, LocationModule],
    })
      .overrideProvider(getQueueToken(NOTIFICATION_QUEUE))
      .useValue({
        add: jest.fn().mockResolvedValue({ id: 'test-job-123' }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);
    notificationService = app.get(NotificationService);
    processor = app.get(NotificationQueueProcessor);
    queue = app.get(getQueueToken(NOTIFICATION_QUEUE));
  });

  afterAll(async () => {
    // Cleanup test data
    if (testDeviceIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { device_id: { in: testDeviceIds } },
      });
      await prisma.device.deleteMany({
        where: { id: { in: testDeviceIds } },
      });
    }

    if (testAlertId) {
      await prisma.alert.delete({ where: { id: testAlertId } }).catch(() => {});
    }

    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }

    await app.close();
  });

  describe('Notification Queue Integration', () => {
    beforeEach(async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          email: `test-notification-${Date.now()}@example.com`,
          password_hash: 'hashed',
        },
      });
      testUserId = user.id;

      // Create test alert (Union Square, SF)
      const alert = await prisma.alert.create({
        data: {
          user_id: testUserId,
          pet_name: 'Notification Test Dog',
          pet_species: 'DOG',
          pet_breed: 'Golden Retriever',
          pet_description: 'Friendly dog with golden fur',
          pet_photos: ['https://example.com/photo1.jpg'],
          location_latitude: 37.788,
          location_longitude: -122.4074,
          location_address: 'Union Square, San Francisco, CA',
          search_radius_km: 5,
          status: AlertStatus.ACTIVE,
        },
      });
      testAlertId = alert.id;
    });

    afterEach(async () => {
      // Clean up test data
      if (testDeviceIds.length > 0) {
        await prisma.notification.deleteMany({
          where: { device_id: { in: testDeviceIds } },
        });
        await prisma.device.deleteMany({
          where: { id: { in: testDeviceIds } },
        });
        testDeviceIds = [];
      }

      if (testAlertId) {
        await prisma.alert.delete({ where: { id: testAlertId } });
        testAlertId = null;
      }

      if (testUserId) {
        await prisma.user.delete({ where: { id: testUserId } });
        testUserId = null;
      }
    });

    it('should queue alert notification job', async () => {
      await notificationService.queueAlertNotifications(testAlertId);

      expect(queue.add).toHaveBeenCalledWith('send-alert-notifications', {
        alertId: testAlertId,
      });
    });

    it('should process alert and create notifications for matching devices', async () => {
      // Create test devices with GPS locations near alert
      const device1 = await prisma.device.create({
        data: {
          user_id: testUserId,
          device_uuid: `device-notification-1-${Date.now()}`,
          push_token: 'fcm-test-token-1',
          platform: DevicePlatform.ANDROID,
          last_location_update: new Date(),
          last_location_latitude: 37.79, // ~200m from alert
          last_location_longitude: -122.408,
          last_location_source: LocationSource.GPS,
          last_location_accuracy_meters: 10,
        },
      });
      testDeviceIds.push(device1.id);

      const device2 = await prisma.device.create({
        data: {
          user_id: testUserId,
          device_uuid: `device-notification-2-${Date.now()}`,
          push_token: 'apn-test-token-2',
          platform: DevicePlatform.IOS,
          last_location_update: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago (stale)
          last_location_latitude: 37.785,
          last_location_longitude: -122.41,
          last_location_source: LocationSource.GPS,
          last_location_accuracy_meters: 15,
        },
      });
      testDeviceIds.push(device2.id);

      // Process alert notifications
      const job = {
        data: { alertId: testAlertId },
      } as any;

      await processor.processAlertNotifications(job);

      // Verify notifications were created
      const notifications = await prisma.notification.findMany({
        where: {
          alert_id: testAlertId,
          device_id: { in: testDeviceIds },
        },
      });

      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].status).toBe(NotificationStatus.QUEUED);
      expect(notifications[0].confidence).toBeDefined();
      expect(notifications[0].match_reason).toBeDefined();

      // Device 1 should have HIGH confidence (fresh GPS)
      const device1Notification = notifications.find(
        (n) => n.device_id === device1.id,
      );
      expect(device1Notification?.confidence).toBe(NotificationConfidence.HIGH);

      // Device 2 should have MEDIUM confidence (stale GPS)
      const device2Notification = notifications.find(
        (n) => n.device_id === device2.id,
      );
      expect(device2Notification?.confidence).toBe(
        NotificationConfidence.MEDIUM,
      );
    });

    it('should process individual push notification', async () => {
      // Create test device
      const device = await prisma.device.create({
        data: {
          user_id: testUserId,
          device_uuid: `device-push-${Date.now()}`,
          push_token: 'test-push-token',
          platform: DevicePlatform.ANDROID,
          last_location_update: new Date(),
          last_location_latitude: 37.788,
          last_location_longitude: -122.407,
          last_location_source: LocationSource.GPS,
        },
      });
      testDeviceIds.push(device.id);

      // Create notification record
      const notification = await prisma.notification.create({
        data: {
          alert_id: testAlertId,
          device_id: device.id,
          confidence: NotificationConfidence.HIGH,
          match_reason: 'FRESH_GPS',
          distance_km: 0.5,
          status: NotificationStatus.QUEUED,
        },
      });

      // Process push notification
      const job = {
        data: { notificationId: notification.id },
      } as any;

      await processor.processPushNotification(job);

      // Verify notification was updated
      const updated = await prisma.notification.findUnique({
        where: { id: notification.id },
      });

      expect(updated.status).toBe(NotificationStatus.SENT);
      expect(updated.sent_at).toBeDefined();
      expect(updated.push_message_id).toBeDefined();
    });

    it('should track exclusions for devices without push tokens', async () => {
      // Create device without push token
      const device = await prisma.device.create({
        data: {
          user_id: testUserId,
          device_uuid: `device-no-token-${Date.now()}`,
          push_token: null,
          platform: DevicePlatform.ANDROID,
          last_location_update: new Date(),
          last_location_latitude: 37.79,
          last_location_longitude: -122.408,
          last_location_source: LocationSource.GPS,
        },
      });
      testDeviceIds.push(device.id);

      // Process alert notifications
      const job = {
        data: { alertId: testAlertId },
      } as any;

      await processor.processAlertNotifications(job);

      // Verify exclusion was tracked
      const exclusion = await prisma.notification.findFirst({
        where: {
          alert_id: testAlertId,
          device_id: device.id,
          excluded: true,
        },
      });

      expect(exclusion).toBeDefined();
      expect(exclusion.exclusion_reason).toBe('PUSH_TOKEN_MISSING');
    });

    it('should build HIGH confidence notification text', () => {
      const title = notificationService.buildTitle(
        NotificationConfidence.HIGH,
        'DOG',
        'Max',
        1.5,
      );

      expect(title).toContain('🐕');
      expect(title).toContain('Max');
      expect(title).toContain('1.5km');

      const body = notificationService.buildBody(
        'Golden Retriever, very friendly',
        'Union Square, SF',
      );

      expect(body).toContain('Golden Retriever');
      expect(body).toContain('Union Square, SF');
    });

    it('should build MEDIUM confidence notification text', () => {
      const title = notificationService.buildTitle(
        NotificationConfidence.MEDIUM,
        'CAT',
        'Whiskers',
        5.0,
      );

      expect(title).toContain('Missing CAT nearby');
      expect(title).toContain('Keep an eye out');
    });

    it('should build LOW confidence notification text', () => {
      const title = notificationService.buildTitle(
        NotificationConfidence.LOW,
        'BIRD',
        'Tweety',
        10.0,
      );

      expect(title).toBe('Missing pet alert in your area');
    });

    it('should handle delivery receipt', async () => {
      // Create test device and notification
      const device = await prisma.device.create({
        data: {
          user_id: testUserId,
          device_uuid: `device-receipt-${Date.now()}`,
          push_token: 'test-token',
          platform: DevicePlatform.IOS,
        },
      });
      testDeviceIds.push(device.id);

      const notification = await prisma.notification.create({
        data: {
          alert_id: testAlertId,
          device_id: device.id,
          confidence: NotificationConfidence.HIGH,
          match_reason: 'SAVED_ZONE',
          status: NotificationStatus.SENT,
          sent_at: new Date(),
          push_message_id: 'test-message-id',
        },
      });

      // Handle delivery receipt
      await notificationService.handleDeliveryReceipt(notification.id);

      // Verify status updated
      const updated = await prisma.notification.findUnique({
        where: { id: notification.id },
      });

      expect(updated.status).toBe(NotificationStatus.DELIVERED);
      expect(updated.delivered_at).toBeDefined();
    });

    it('should process notifications with saved zones', async () => {
      // Create device with saved zone
      const device = await prisma.device.create({
        data: {
          user_id: testUserId,
          device_uuid: `device-zone-${Date.now()}`,
          push_token: 'test-token-zone',
          platform: DevicePlatform.ANDROID,
        },
      });
      testDeviceIds.push(device.id);

      // Create saved zone near alert location
      await prisma.savedLocation.create({
        data: {
          device_id: device.id,
          name: 'Work',
          latitude: 37.788,
          longitude: -122.4074,
          radius_meters: 500,
        },
      });

      // Process alert notifications
      const job = {
        data: { alertId: testAlertId },
      } as any;

      await processor.processAlertNotifications(job);

      // Verify HIGH confidence notification created
      const notification = await prisma.notification.findFirst({
        where: {
          alert_id: testAlertId,
          device_id: device.id,
        },
      });

      expect(notification).toBeDefined();
      expect(notification.confidence).toBe(NotificationConfidence.HIGH);
      expect(notification.match_reason).toBe('SAVED_ZONE');
    });
  });
});
