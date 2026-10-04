import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationQueueProcessor } from './notification-queue.processor';
import { NotificationService } from './notification.service';
import { LocationService } from '../location/location.service';
import { PrismaService } from '../services/prisma.service';
import { FCMService } from './fcm.service';
import { APNsService } from './apns.service';
import { WebPushService } from './webpush.service';
import { AlertEmailService } from './alert-email.service';
import { NOTIFICATION_QUEUE } from './notification.constants';
import {
  NotificationConfidence,
  AlertStatus,
  NotificationStatus,
  LocationSource,
} from '../generated/prisma';


/**
 * Default `device.findMany` behaviour: every matched device that carries a push
 * token is reachable. Mirrors what the real table holds for the matches the
 * test hands to `findDevicesForAlert`; tests that care about extra or disabled
 * devices override it.
 */
function reachableDevicesFromMatches(locationService: LocationService) {
  return async ({ where }: any) => {
    const mock = locationService.findDevicesForAlert as jest.Mock;
    const matches: any[] =
      (await mock.mock.results[mock.mock.results.length - 1]?.value) ?? [];
    const ids: number[] = where?.user_id?.in ?? [];
    return matches
      .filter((m) => m.pushToken && ids.includes(parseInt(m.userId)))
      .map((m) => ({ id: parseInt(m.deviceId), user_id: parseInt(m.userId) }));
  };
}

describe('NotificationQueueProcessor', () => {
  let processor: NotificationQueueProcessor;
  let notificationService: NotificationService;
  let locationService: LocationService;
  let prismaService: PrismaService;
  let fcmService: FCMService;
  let apnsService: APNsService;
  let webPushService: WebPushService;
  let alertEmailService: AlertEmailService;
  let mockQueue: any;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: WebPushService,
          useValue: {
            sendNotification: jest.fn(),
          },
        },
        {
          provide: AlertEmailService,
          useValue: {
            isOptedIn: jest.fn().mockResolvedValue(false),
            sendAlertEmail: jest.fn().mockResolvedValue(true),
          },
        },
        NotificationQueueProcessor,
        {
          provide: NotificationService,
          useValue: {
            buildTitle: jest.fn(),
            buildBody: jest.fn(),
            trackExclusion: jest.fn(),
          },
        },
        {
          provide: LocationService,
          useValue: {
            findDevicesForAlert: jest.fn(),
          },
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
              findFirst: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            device: {
              findMany: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: FCMService,
          useValue: {
            sendNotification: jest.fn(),
          },
        },
        {
          provide: APNsService,
          useValue: {
            sendNotification: jest.fn(),
          },
        },
        {
          provide: getQueueToken(NOTIFICATION_QUEUE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    processor = module.get<NotificationQueueProcessor>(
      NotificationQueueProcessor,
    );
    notificationService = module.get<NotificationService>(NotificationService);
    locationService = module.get<LocationService>(LocationService);
    prismaService = module.get<PrismaService>(PrismaService);
    fcmService = module.get<FCMService>(FCMService);
    apnsService = module.get<APNsService>(APNsService);
    webPushService = module.get<WebPushService>(WebPushService);
    alertEmailService = module.get<AlertEmailService>(AlertEmailService);
    (prismaService.device.findMany as jest.Mock).mockImplementation(
      reachableDevicesFromMatches(locationService),
    );

    // Fatigue guards default to "clear" so each test opts into the case it cares about.
    (prismaService.notification.findFirst as jest.Mock).mockResolvedValue(null);
    (prismaService.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prismaService.notification.count as jest.Mock).mockResolvedValue(0);

    // Daytime by default so quiet-hours logic only applies where a test pins 03:00.
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('processAlertNotifications', () => {
    it('should log warning if alert not found', async () => {
      const logSpy = jest.spyOn(processor['logger'], 'warn');
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue(null);

      const job = {
        data: { alertId: 999 },
      } as Job;

      await processor.processAlertNotifications(job);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Alert 999 not found'),
      );
    });

    it('should log warning if alert not active', async () => {
      const logSpy = jest.spyOn(processor['logger'], 'warn');
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.RESOLVED,
      });

      const job = {
        data: { alertId: 1 },
      } as Job;

      await processor.processAlertNotifications(job);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Alert 1 is not ACTIVE'),
      );
    });

    it('should find matching devices and queue notifications', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
        location_latitude: 37.7749,
        location_longitude: -122.4194,
        search_radius_km: 5,
      });

      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '10',
          userId: '1',
          pushToken: 'token-123',
          confidence: NotificationConfidence.HIGH,
          matchReason: 'SAVED_ZONE',
          distanceKm: 1.5,
          matchedVia: 'Saved zone: Home',
        },
        {
          deviceId: '20',
          userId: '2',
          pushToken: 'token-456',
          confidence: NotificationConfidence.MEDIUM,
          matchReason: 'FRESH_GPS',
          distanceKm: 3.2,
          matchedVia: 'Fresh GPS',
        },
      ]);

      (prismaService.notification.create as jest.Mock).mockResolvedValue({
        id: 100,
      });

      const job = {
        data: { alertId: 1 },
      } as Job;

      await processor.processAlertNotifications(job);

      expect(locationService.findDevicesForAlert).toHaveBeenCalledWith(1);

      // A job with no wave is treated as HIGH, so only the HIGH match is queued;
      // the MEDIUM match is left for the delayed wave.
      expect(prismaService.notification.create).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith('send-push-notification', {
        notificationId: 100,
      });
    });

    it('should only queue the wave it was asked for', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
      });

      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '10',
          userId: '1',
          pushToken: 'token-123',
          confidence: NotificationConfidence.HIGH,
          matchReason: 'SAVED_ZONE',
          distanceKm: 1.5,
          matchedVia: 'Saved zone: Home',
        },
        {
          deviceId: '20',
          userId: '2',
          pushToken: 'token-456',
          confidence: NotificationConfidence.MEDIUM,
          matchReason: 'FRESH_GPS',
          distanceKm: 3.2,
          matchedVia: 'Stale GPS',
        },
      ]);

      (prismaService.notification.create as jest.Mock).mockResolvedValue({
        id: 200,
      });

      await processor.processAlertNotifications({
        data: { alertId: 1, wave: 'MEDIUM' },
      } as Job);

      expect(prismaService.notification.create).toHaveBeenCalledTimes(1);
      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          device_id: 20,
          confidence: NotificationConfidence.MEDIUM,
        }),
      });
    });

    it('should not re-notify a user an earlier wave already reached', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
      });

      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '20',
          userId: '2',
          pushToken: 'token-456',
          confidence: NotificationConfidence.MEDIUM,
          matchReason: 'FRESH_GPS',
          distanceKm: 3.2,
          matchedVia: 'Stale GPS',
        },
      ]);

      // User 2 already has a notification row for this alert from the HIGH wave.
      (prismaService.notification.findMany as jest.Mock).mockResolvedValue([{ meta: null }]);

      await processor.processAlertNotifications({
        data: { alertId: 1, wave: 'MEDIUM' },
      } as Job);

      expect(prismaService.notification.create).not.toHaveBeenCalled();
      expect(notificationService.trackExclusion).toHaveBeenCalledWith(
        1,
        20,
        'ALREADY_NOTIFIED',
      );
    });

    it('should exclude users over the rolling daily cap', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
      });

      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '20',
          userId: '2',
          pushToken: 'token-456',
          confidence: NotificationConfidence.MEDIUM,
          matchReason: 'FRESH_GPS',
          distanceKm: 3.2,
          matchedVia: 'Stale GPS',
        },
      ]);

      // MEDIUM cap is 5 per rolling 24h.
      (prismaService.notification.count as jest.Mock).mockResolvedValue(5);

      await processor.processAlertNotifications({
        data: { alertId: 1, wave: 'MEDIUM' },
      } as Job);

      expect(prismaService.notification.create).not.toHaveBeenCalled();
      expect(notificationService.trackExclusion).toHaveBeenCalledWith(
        1,
        20,
        'DAILY_CAP',
      );
    });

    it('should hold back non-HIGH waves during quiet hours', async () => {
      // 03:00 local
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 15, 3, 0, 0));

      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
      });

      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '20',
          userId: '2',
          pushToken: 'token-456',
          confidence: NotificationConfidence.LOW,
          matchReason: 'IP',
          distanceKm: 12,
          matchedVia: 'IP geolocation',
        },
      ]);

      try {
        await processor.processAlertNotifications({
          data: { alertId: 1, wave: 'LOW' },
        } as Job);

        expect(prismaService.notification.create).not.toHaveBeenCalled();
        expect(notificationService.trackExclusion).toHaveBeenCalledWith(
          1,
          20,
          'QUIET_HOURS',
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should track exclusions for devices without push tokens', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
      });

      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '10',
          userId: '1',
          pushToken: null,
          confidence: NotificationConfidence.HIGH,
          matchReason: 'FRESH_GPS',
          distanceKm: 1.0,
          matchedVia: 'Fresh GPS',
        },
      ]);

      (prismaService.notification.create as jest.Mock).mockImplementation(
        ({ data }) => {
          if (!data.excluded) {
            throw new Error('Device has no push token');
          }
          return Promise.resolve({ id: 100 });
        },
      );

      const job = {
        data: { alertId: 1 },
      } as Job;

      await processor.processAlertNotifications(job);

      expect(notificationService.trackExclusion).toHaveBeenCalledWith(
        1,
        10,
        'PUSH_TOKEN_MISSING',
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should log confidence breakdown', async () => {
      const logSpy = jest.spyOn(processor['logger'], 'log');

      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
      });

      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '1',
          userId: '0',
          pushToken: 'token-1',
          confidence: NotificationConfidence.HIGH,
          matchReason: 'SAVED_ZONE',
          distanceKm: 1.0,
          matchedVia: 'Saved zone: Home',
        },
        {
          deviceId: '2',
          userId: '0',
          pushToken: 'token-2',
          confidence: NotificationConfidence.HIGH,
          matchReason: 'FRESH_GPS',
          distanceKm: 2.0,
          matchedVia: 'Fresh GPS',
        },
        {
          deviceId: '3',
          userId: '0',
          pushToken: 'token-3',
          confidence: NotificationConfidence.MEDIUM,
          matchReason: 'STALE_GPS',
          distanceKm: 4.0,
          matchedVia: 'Stale GPS',
        },
        {
          deviceId: '4',
          userId: '0',
          pushToken: 'token-4',
          confidence: NotificationConfidence.LOW,
          matchReason: 'IP_GEOLOCATION',
          distanceKm: 10.0,
          matchedVia: 'IP geolocation',
        },
      ]);

      (prismaService.notification.create as jest.Mock).mockResolvedValue({
        id: 100,
      });

      const job = {
        data: { alertId: 1 },
      } as Job;

      await processor.processAlertNotifications(job);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Confidence breakdown: {"HIGH":2,"MEDIUM":1,"LOW":1}',
        ),
      );
    });
  });

  describe('processPushNotification', () => {
    it('should log warning if notification not found', async () => {
      const logSpy = jest.spyOn(processor['logger'], 'warn');
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      const job = {
        data: { notificationId: 999 },
      } as Job;

      await processor.processPushNotification(job);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Notification 999 not found'),
      );
    });

    it('should build and send push notification', async () => {
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue({
        id: 100,
        alert_id: 1,
        device_id: 10,
        confidence: NotificationConfidence.HIGH,
        match_reason: 'FRESH_GPS',
        distance_km: 2.5,
        location_address: '123 Main St',
        alert: {
          id: 1,
          pet_name: 'Max',
          pet_species: 'DOG',
          pet_description: 'Golden Retriever, very friendly',
          location_address: '123 Main St',
          pet_photos: ['https://example.com/photo1.jpg'],
        },
        device: {
          id: 10,
          push_token: 'fcm-token-123',
          platform: 'ANDROID',
        },
      });

      (fcmService.sendNotification as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'fcm-message-123',
      });

      (notificationService.buildTitle as jest.Mock).mockReturnValue(
        '🐕 Missing DOG: Max — Last seen 2.5km from you',
      );
      (notificationService.buildBody as jest.Mock).mockReturnValue(
        'Golden Retriever, very friendly. Last seen near 123 Main St',
      );

      (prismaService.notification.update as jest.Mock).mockResolvedValue({
        id: 100,
        status: NotificationStatus.SENT,
      });

      const job = {
        data: { notificationId: 100 },
      } as Job;

      await processor.processPushNotification(job);

      expect(notificationService.buildTitle).toHaveBeenCalledWith(
        NotificationConfidence.HIGH,
        'DOG',
        'Max',
        2.5,
      );

      expect(notificationService.buildBody).toHaveBeenCalledWith(
        'Golden Retriever, very friendly',
        '123 Main St',
      );

      expect(prismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: {
          status: NotificationStatus.SENT,
          sent_at: expect.any(Date),
          push_message_id: 'fcm-message-123',
        },
      });
    });

    it('should handle null distance_km', async () => {
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue({
        id: 100,
        alert_id: 1,
        device_id: 10,
        confidence: NotificationConfidence.LOW,
        match_reason: 'IP_GEOLOCATION',
        distance_km: null,
        alert: {
          id: 1,
          pet_name: 'Luna',
          pet_species: 'CAT',
          pet_description: 'Black cat',
          location_address: 'Downtown',
          pet_photos: [],
        },
        device: {
          id: 10,
          push_token: 'apn-token-456',
          platform: 'IOS',
        },
      });

      (apnsService.sendNotification as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'apn-message-456',
      });

      (apnsService.sendNotification as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'apn-message-456',
      });

      (notificationService.buildTitle as jest.Mock).mockReturnValue(
        'Missing pet alert in your area',
      );
      (notificationService.buildBody as jest.Mock).mockReturnValue('Black cat');

      (prismaService.notification.update as jest.Mock).mockResolvedValue({
        id: 100,
      });

      const job = {
        data: { notificationId: 100 },
      } as Job;

      await processor.processPushNotification(job);

      expect(notificationService.buildTitle).toHaveBeenCalledWith(
        NotificationConfidence.LOW,
        'CAT',
        'Luna',
        undefined,
      );

      expect(notificationService.buildBody).toHaveBeenCalledWith(
        'Black cat',
        'Downtown',
      );
    });

    it('should send web push for a WEB device (installed PWA)', async () => {
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue({
        id: 100,
        alert_id: 1,
        device_id: 10,
        confidence: NotificationConfidence.HIGH,
        match_reason: 'ALERT_ZONE:Home',
        distance_km: 1.2,
        alert: {
          id: 1,
          pet_name: 'Fifi',
          pet_species: 'DOG',
          pet_description: 'Brown terrier',
          location_address: 'Nicosia',
          pet_photos: [],
        },
        device: {
          id: 10,
          push_token: '{"endpoint":"https://web.push.apple.com/abc","keys":{"p256dh":"key","auth":"auth"}}',
          platform: 'WEB',
        },
      });

      (webPushService.sendNotification as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'web-push-message-789',
      });

      (notificationService.buildTitle as jest.Mock).mockReturnValue(
        'Missing DOG: Fifi',
      );
      (notificationService.buildBody as jest.Mock).mockReturnValue(
        'Brown terrier',
      );
      (prismaService.notification.update as jest.Mock).mockResolvedValue({
        id: 100,
      });

      await processor.processPushNotification({
        data: { notificationId: 100 },
      } as Job);

      expect(webPushService.sendNotification).toHaveBeenCalledTimes(1);
      // WEB must not fall through to the native transports
      expect(apnsService.sendNotification).not.toHaveBeenCalled();

      expect(prismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: expect.objectContaining({
          status: 'SENT',
          push_message_id: 'web-push-message-789',
        }),
      });
    });

    it('should mark a dead web push subscription as failed without retrying', async () => {
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue({
        id: 101,
        alert_id: 1,
        device_id: 11,
        confidence: NotificationConfidence.HIGH,
        match_reason: 'ALERT_ZONE:Home',
        distance_km: 1.2,
        alert: {
          id: 1,
          pet_name: 'Fifi',
          pet_species: 'DOG',
          pet_description: 'Brown terrier',
          location_address: 'Nicosia',
          pet_photos: [],
        },
        device: {
          id: 11,
          user_id: 7,
          push_token: '{"endpoint":"https://web.push.apple.com/abc","keys":{"p256dh":"key","auth":"auth"}}',
          platform: 'WEB',
        },
      });
      (alertEmailService.isOptedIn as jest.Mock).mockResolvedValue(true);

      // iOS destroys the subscription when the home screen icon is removed;
      // the push service then answers 410 Gone.
      (webPushService.sendNotification as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Gone',
        invalidToken: true,
      });

      (notificationService.buildTitle as jest.Mock).mockReturnValue('t');
      (notificationService.buildBody as jest.Mock).mockReturnValue('b');
      (prismaService.notification.update as jest.Mock).mockResolvedValue({
        id: 101,
      });

      // A dead subscription cannot be retried into working, so the job resolves.
      await expect(
        processor.processPushNotification({
          data: { notificationId: 101 },
        } as Job),
      ).resolves.toBeUndefined();

      expect(prismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: expect.objectContaining({ status: 'FAILED' }),
      });
      // Email is the HIGH wave's job, not the push job's.
      expect(alertEmailService.sendAlertEmail).not.toHaveBeenCalled();
      // The dead subscription is cleared so the next alert does not target it again.
      expect(prismaService.device.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: expect.objectContaining({ push_token: null }),
      });
    });

    it('should not retry when the push provider is not configured', async () => {
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue({
        id: 102,
        alert_id: 16,
        device_id: 2102,
        confidence: NotificationConfidence.HIGH,
        match_reason: 'MANUAL',
        distance_km: 2.67,
        alert: {
          pet_name: 'Fifi',
          pet_species: 'DOG',
          pet_description: 'Brown terrier',
          location_address: 'Nicosia',
          pet_photos: [],
        },
        device: { id: 2102, user_id: 2170, push_token: '{"endpoint":"x"}', platform: 'WEB' },
      });
      (webPushService.sendNotification as jest.Mock).mockResolvedValue({
        success: false,
        error: 'WEB_PUSH_NOT_INITIALIZED',
      });
      (notificationService.buildTitle as jest.Mock).mockReturnValue('t');
      (notificationService.buildBody as jest.Mock).mockReturnValue('b');
      (prismaService.notification.update as jest.Mock).mockResolvedValue({ id: 102 });
      (alertEmailService.isOptedIn as jest.Mock).mockResolvedValue(true);

      await expect(
        processor.processPushNotification({ data: { notificationId: 102 } } as Job),
      ).resolves.toBeUndefined();

      expect(alertEmailService.sendAlertEmail).not.toHaveBeenCalled();
    });

    it('should still retry transient push failures', async () => {
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue({
        id: 104,
        alert_id: 1,
        device_id: 11,
        confidence: NotificationConfidence.HIGH,
        match_reason: 'MANUAL',
        distance_km: 1,
        alert: { pet_name: 'Fifi', pet_species: 'DOG', pet_description: '', location_address: null, pet_photos: [] },
        device: { id: 11, user_id: 7, push_token: '{"endpoint":"x"}', platform: 'WEB' },
      });
      (webPushService.sendNotification as jest.Mock).mockResolvedValue({
        success: false,
        error: 'ECONNRESET',
      });
      (notificationService.buildTitle as jest.Mock).mockReturnValue('t');
      (notificationService.buildBody as jest.Mock).mockReturnValue('b');
      (prismaService.notification.update as jest.Mock).mockResolvedValue({ id: 104 });

      await expect(
        processor.processPushNotification({ data: { notificationId: 104 } } as Job),
      ).rejects.toThrow();
      expect(alertEmailService.sendAlertEmail).not.toHaveBeenCalled();
    });

    it('should fall back to email on the HIGH wave when a user has no push channel', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
        pet_name: 'Fifi',
        pet_species: 'DOG',
        pet_description: 'Brown terrier',
        location_address: 'Nicosia',
        pet_photos: ['https://cdn.example/fifi.jpg'],
      });

      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '10',
          userId: '1',
          pushToken: null,
          confidence: NotificationConfidence.HIGH,
          matchReason: 'ALERT_ZONE',
          distanceKm: 1.2,
          matchedVia: 'Alert zone: Home',
        },
      ]);

      (alertEmailService.isOptedIn as jest.Mock).mockResolvedValue(true);

      await processor.processAlertNotifications({
        data: { alertId: 1, wave: 'HIGH' },
      } as Job);

      expect(notificationService.trackExclusion).toHaveBeenCalledWith(
        1,
        10,
        'PUSH_TOKEN_MISSING',
      );
      expect(alertEmailService.sendAlertEmail).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          alertId: 1,
          petName: 'Fifi',
          petPhotoUrl: 'https://cdn.example/fifi.jpg',
          distanceKm: 1.2,
        }),
      );
      // The email is recorded so later waves see the user as reached.
      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          alert_id: 1,
          device_id: 10,
          status: 'SENT',
          meta: { channel: 'EMAIL' },
        }),
      });
    });

    it('should never notify or email the alert creator', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 16,
        status: AlertStatus.ACTIVE,
        creator_id: 2213,
        pet_name: 'Fifi',
        pet_species: 'DOG',
        pet_description: 'Brown terrier',
        location_address: 'Nicosia',
        pet_photos: [],
      });
      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '1',
          userId: '2213',
          pushToken: 'creator-token',
          confidence: NotificationConfidence.HIGH,
          matchReason: 'MANUAL',
          distanceKm: 0,
          matchedVia: 'Alert zone: Home',
        },
        {
          deviceId: '2',
          userId: '2213',
          pushToken: null,
          confidence: NotificationConfidence.HIGH,
          matchReason: 'MANUAL',
          distanceKm: 0,
          matchedVia: 'Alert zone: Home',
        },
        {
          deviceId: '3',
          userId: '2170',
          pushToken: null,
          confidence: NotificationConfidence.HIGH,
          matchReason: 'MANUAL',
          distanceKm: 2.67,
          matchedVia: 'Alert zone: Home Zone',
        },
      ]);
      (alertEmailService.isOptedIn as jest.Mock).mockResolvedValue(true);

      await processor.processAlertNotifications({
        data: { alertId: 16, wave: 'HIGH' },
      } as Job);

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(alertEmailService.sendAlertEmail).toHaveBeenCalledTimes(1);
      expect(alertEmailService.sendAlertEmail).toHaveBeenCalledWith(
        2170,
        expect.anything(),
      );
      expect(notificationService.trackExclusion).not.toHaveBeenCalledWith(
        16,
        1,
        expect.anything(),
      );
    });

    it('should push to every push-enabled device of a matched user, not just the matched one', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
        creator_id: 99,
        pet_name: 'Timos',
        pet_species: 'DOG',
        pet_description: 'Brown terrier',
        location_address: 'Nicosia',
        pet_photos: [],
      });
      // The zone matched the laptop; the phone and a tablet sit on the same account.
      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '2120',
          userId: '2170',
          pushToken: 'laptop-sub',
          confidence: NotificationConfidence.HIGH,
          matchReason: 'MANUAL',
          distanceKm: 3.6,
          matchedVia: 'Alert zone: Home Zone',
        },
      ]);
      (prismaService.device.findMany as jest.Mock).mockResolvedValue([
        { id: 2102, user_id: 2170 },
        { id: 2118, user_id: 2170 },
        { id: 2120, user_id: 2170 },
      ]);
      let nextId = 600;
      (prismaService.notification.create as jest.Mock).mockImplementation(() =>
        Promise.resolve({ id: nextId++ }),
      );
      (alertEmailService.isOptedIn as jest.Mock).mockResolvedValue(true);

      await processor.processAlertNotifications({
        data: { alertId: 1, wave: 'HIGH' },
      } as Job);

      expect(prismaService.device.findMany).toHaveBeenCalledWith({
        where: {
          user_id: { in: [2170] },
          push_token: { not: null },
          push_enabled: true,
        },
        select: { id: true, user_id: true },
      });
      // Three pushes (one per device) + one email row.
      expect(mockQueue.add).toHaveBeenCalledTimes(3);
      for (const deviceId of [2102, 2118, 2120]) {
        expect(prismaService.notification.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            device_id: deviceId,
            distance_km: 3.6,
            status: 'QUEUED',
          }),
        });
      }
      expect(alertEmailService.sendAlertEmail).toHaveBeenCalledTimes(1);
      expect(notificationService.trackExclusion).not.toHaveBeenCalled();
    });

    it('should record PUSH_TOKEN_MISSING when the only tokened device has push disabled', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
        creator_id: 99,
        pet_name: 'Timos',
        pet_species: 'DOG',
        pet_description: '',
        location_address: null,
        pet_photos: [],
      });
      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '11',
          userId: '1',
          pushToken: 'fcm-token',
          confidence: NotificationConfidence.HIGH,
          matchReason: 'MANUAL',
          distanceKm: 0.5,
          matchedVia: 'Alert zone: Home',
        },
      ]);
      // push_enabled = false filters the device out at the query.
      (prismaService.device.findMany as jest.Mock).mockResolvedValue([]);
      (alertEmailService.isOptedIn as jest.Mock).mockResolvedValue(true);
      (prismaService.notification.create as jest.Mock).mockResolvedValue({
        id: 700,
      });

      await processor.processAlertNotifications({
        data: { alertId: 1, wave: 'HIGH' },
      } as Job);

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(notificationService.trackExclusion).toHaveBeenCalledTimes(1);
      expect(notificationService.trackExclusion).toHaveBeenCalledWith(
        1,
        11,
        'PUSH_TOKEN_MISSING',
      );
      // Email still goes out: the user matched, they just have no push channel.
      expect(alertEmailService.sendAlertEmail).toHaveBeenCalledTimes(1);
    });

    it('should exclude every device of a user an earlier wave already pushed', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
        creator_id: 99,
        pet_name: 'Timos',
        pet_species: 'DOG',
        pet_description: '',
        location_address: null,
        pet_photos: [],
      });
      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '11',
          userId: '1',
          pushToken: 'fcm-token',
          confidence: NotificationConfidence.MEDIUM,
          matchReason: 'GPS',
          distanceKm: 4,
          matchedVia: 'Stale GPS',
        },
      ]);
      (prismaService.device.findMany as jest.Mock).mockResolvedValue([
        { id: 11, user_id: 1 },
        { id: 12, user_id: 1 },
      ]);
      // A PUSH row from the HIGH wave already exists.
      (prismaService.notification.findMany as jest.Mock).mockResolvedValue([
        { meta: null },
      ]);

      await processor.processAlertNotifications({
        data: { alertId: 1, wave: 'MEDIUM' },
      } as Job);

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(notificationService.trackExclusion).toHaveBeenCalledWith(
        1,
        11,
        'ALREADY_NOTIFIED',
      );
      expect(notificationService.trackExclusion).toHaveBeenCalledWith(
        1,
        12,
        'ALREADY_NOTIFIED',
      );
    });

    it('should send one email per user even when they own several token-less devices', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 16,
        status: AlertStatus.ACTIVE,
        pet_name: 'Fifi',
        pet_species: 'DOG',
        pet_description: 'Brown terrier',
        location_address: 'Nicosia',
        pet_photos: [],
      });
      const tokenless = (deviceId: string) => ({
        deviceId,
        userId: '2170',
        pushToken: null,
        confidence: NotificationConfidence.HIGH,
        matchReason: 'MANUAL',
        distanceKm: 2.67,
        matchedVia: 'Alert zone: Home Zone',
      });
      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        tokenless('2103'),
        tokenless('2104'),
        tokenless('2105'),
      ]);
      (alertEmailService.isOptedIn as jest.Mock).mockResolvedValue(true);

      await processor.processAlertNotifications({
        data: { alertId: 16, wave: 'HIGH' },
      } as Job);

      expect(notificationService.trackExclusion).toHaveBeenCalledTimes(3);
      expect(alertEmailService.sendAlertEmail).toHaveBeenCalledTimes(1);
      expect(prismaService.notification.create).toHaveBeenCalledTimes(1);
    });

    it('should push and email when a user has both a tokened and a token-less device', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
        pet_name: 'Fifi',
        pet_species: 'DOG',
        pet_description: 'Brown terrier',
        location_address: 'Nicosia',
        pet_photos: [],
      });
      // Token-less device is listed first (nearer); the push device must still win.
      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '10',
          userId: '1',
          pushToken: null,
          confidence: NotificationConfidence.HIGH,
          matchReason: 'MANUAL',
          distanceKm: 0.5,
          matchedVia: 'Alert zone: Home',
        },
        {
          deviceId: '11',
          userId: '1',
          pushToken: 'fcm-token',
          confidence: NotificationConfidence.HIGH,
          matchReason: 'MANUAL',
          distanceKm: 0.5,
          matchedVia: 'Alert zone: Home',
        },
      ]);
      (prismaService.notification.create as jest.Mock).mockResolvedValue({ id: 500 });
      (alertEmailService.isOptedIn as jest.Mock).mockResolvedValue(true);

      await processor.processAlertNotifications({
        data: { alertId: 1, wave: 'HIGH' },
      } as Job);

      expect(mockQueue.add).toHaveBeenCalledWith('send-push-notification', {
        notificationId: 500,
      });
      expect(alertEmailService.sendAlertEmail).toHaveBeenCalledTimes(1);
      expect(alertEmailService.sendAlertEmail).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ alertId: 1 }),
      );
      expect(notificationService.trackExclusion).toHaveBeenCalledWith(
        1,
        10,
        'PUSH_TOKEN_MISSING',
      );
    });

    it('should email a user with a working push channel on the HIGH wave', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
        creator_id: 99,
        pet_name: 'Fifi',
        pet_species: 'DOG',
        pet_description: 'Brown terrier',
        location_address: 'Nicosia',
        pet_photos: [],
      });
      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '11',
          userId: '1',
          pushToken: 'fcm-token',
          confidence: NotificationConfidence.HIGH,
          matchReason: 'MANUAL',
          distanceKm: 0.5,
          matchedVia: 'Alert zone: Home',
        },
      ]);
      (prismaService.notification.create as jest.Mock).mockResolvedValue({ id: 501 });
      (alertEmailService.isOptedIn as jest.Mock).mockResolvedValue(true);

      await processor.processAlertNotifications({
        data: { alertId: 1, wave: 'HIGH' },
      } as Job);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(alertEmailService.sendAlertEmail).toHaveBeenCalledTimes(1);
      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'SENT', meta: { channel: 'EMAIL' } }),
      });
    });

    it('should not block a push because the user was already emailed, nor re-email a pushed user', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
        creator_id: 99,
        pet_name: 'Fifi',
        pet_species: 'DOG',
        pet_description: '',
        location_address: null,
        pet_photos: [],
      });
      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '11',
          userId: '1',
          pushToken: 'fcm-token',
          confidence: NotificationConfidence.HIGH,
          matchReason: 'MANUAL',
          distanceKm: 0.5,
          matchedVia: 'Alert zone: Home',
        },
      ]);
      // An EMAIL row already exists for this user and alert.
      (prismaService.notification.findMany as jest.Mock).mockResolvedValue([
        { meta: { channel: 'EMAIL' } },
      ]);
      (prismaService.notification.create as jest.Mock).mockResolvedValue({ id: 502 });
      (alertEmailService.isOptedIn as jest.Mock).mockResolvedValue(true);

      await processor.processAlertNotifications({
        data: { alertId: 1, wave: 'HIGH' },
      } as Job);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(alertEmailService.sendAlertEmail).not.toHaveBeenCalled();
    });

    it('should not send fallback email on lower-confidence waves', async () => {
      (prismaService.alert.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: AlertStatus.ACTIVE,
        pet_name: 'Fifi',
        pet_species: 'DOG',
        pet_description: 'Brown terrier',
        location_address: 'Nicosia',
        pet_photos: [],
      });

      (locationService.findDevicesForAlert as jest.Mock).mockResolvedValue([
        {
          deviceId: '20',
          userId: '2',
          pushToken: null,
          confidence: NotificationConfidence.LOW,
          matchReason: 'IP',
          distanceKm: 14,
          matchedVia: 'IP geolocation',
        },
      ]);

      (alertEmailService.isOptedIn as jest.Mock).mockResolvedValue(true);

      await processor.processAlertNotifications({
        data: { alertId: 1, wave: 'LOW' },
      } as Job);

      // "A pet is missing somewhere in your city" is not worth an email.
      expect(alertEmailService.sendAlertEmail).not.toHaveBeenCalled();
    });

    it('should catch errors and continue processing', async () => {
      const errorSpy = jest.spyOn(processor['logger'], 'error');
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue({
        id: 100,
        alert_id: 1,
        device_id: 10,
        confidence: NotificationConfidence.HIGH,
        match_reason: 'FRESH_GPS',
        distance_km: 1.0,
        alert: {
          id: 1,
          pet_name: 'Buddy',
          pet_species: 'DOG',
          pet_description: 'Brown dog',
          pet_photos: [],
        },
        device: {
          id: 10,
          push_token: 'invalid-token',
          platform: 'ANDROID',
        },
      });

      (notificationService.buildTitle as jest.Mock).mockReturnValue('Title');
      (notificationService.buildBody as jest.Mock).mockReturnValue('Body');

      // Simulate push service error
      (prismaService.notification.update as jest.Mock).mockRejectedValueOnce(
        new Error('Push service unavailable'),
      );

      const job = {
        data: { notificationId: 100 },
      } as Job;

      await expect(processor.processPushNotification(job)).rejects.toThrow();

      // Should have logged the error
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should use first pet photo as image URL', async () => {
      (prismaService.notification.findUnique as jest.Mock).mockResolvedValue({
        id: 100,
        alert_id: 1,
        device_id: 10,
        confidence: NotificationConfidence.HIGH,
        match_reason: 'SAVED_ZONE',
        distance_km: 0.5,
        alert: {
          id: 1,
          pet_name: 'Rex',
          pet_species: 'DOG',
          pet_description: 'Husky',
          pet_photos: [
            'https://cdn.example.com/photo1.jpg',
            'https://cdn.example.com/photo2.jpg',
          ],
        },
        device: {
          id: 10,
          push_token: 'token-123',
          platform: 'IOS',
        },
      });
      (apnsService.sendNotification as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'apn-message-789',
      });
      (notificationService.buildTitle as jest.Mock).mockReturnValue('Title');
      (notificationService.buildBody as jest.Mock).mockReturnValue('Body');
      (prismaService.notification.update as jest.Mock).mockResolvedValue({
        id: 100,
      });

      const job = {
        data: { notificationId: 100 },
      } as Job;

      await processor.processPushNotification(job);

      // Verify notification was sent
      expect(prismaService.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 100 },
          data: expect.objectContaining({
            status: NotificationStatus.SENT,
          }),
        }),
      );
    });
  });
});
