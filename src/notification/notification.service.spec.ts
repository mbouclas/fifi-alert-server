import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { NotificationService } from './notification.service';
import { PrismaService } from '../services/prisma.service';
import { NOTIFICATION_QUEUE } from './notification.constants';
import { NotificationConfidence } from '../generated/prisma';

describe('NotificationService', () => {
  let service: NotificationService;
  let prismaService: PrismaService;
  let mockQueue: any;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getQueueToken(NOTIFICATION_QUEUE),
          useValue: mockQueue,
        },
        {
          provide: PrismaService,
          useValue: {
            notification: {
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('queueAlertNotifications', () => {
    it('should queue alert notification job', async () => {
      await service.queueAlertNotifications(1);

      expect(mockQueue.add).toHaveBeenCalledWith('send-alert-notifications', {
        alertId: 1,
      });
    });

    it('should log job ID after queuing', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');

      await service.queueAlertNotifications(42);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('alert 42'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('job-123'));
    });
  });

  describe('buildTitle', () => {
    it('should build HIGH confidence title with distance', () => {
      const title = service.buildTitle(
        NotificationConfidence.HIGH,
        'DOG',
        'Max',
        2.5,
      );

      expect(title).toContain('🐕');
      expect(title).toContain('Missing DOG: Max');
      expect(title).toContain('2.5km from you');
    });

    it('should build HIGH confidence title without distance', () => {
      const title = service.buildTitle(
        NotificationConfidence.HIGH,
        'CAT',
        'Whiskers',
      );

      expect(title).toContain('🐈');
      expect(title).toContain('Missing CAT: Whiskers');
      expect(title).toContain('in your area');
    });

    it('should build MEDIUM confidence title', () => {
      const title = service.buildTitle(
        NotificationConfidence.MEDIUM,
        'BIRD',
        'Tweety',
        5.0,
      );

      expect(title).toContain('Missing BIRD nearby: Tweety');
      expect(title).toContain('Keep an eye out');
    });

    it('should build LOW confidence title', () => {
      const title = service.buildTitle(
        NotificationConfidence.LOW,
        'RABBIT',
        'Fluffy',
        10.0,
      );

      expect(title).toBe('Missing pet alert in your area');
    });

    it('should format very close distance', () => {
      const title = service.buildTitle(
        NotificationConfidence.HIGH,
        'DOG',
        'Buddy',
        0.05,
      );

      expect(title).toContain('very close to you');
    });

    it('should format distance in meters for < 1km', () => {
      const title = service.buildTitle(
        NotificationConfidence.HIGH,
        'CAT',
        'Luna',
        0.5,
      );

      expect(title).toContain('500m from you');
    });

    it('should format distance with decimal for < 10km', () => {
      const title = service.buildTitle(
        NotificationConfidence.HIGH,
        'DOG',
        'Rex',
        7.8,
      );

      expect(title).toContain('7.8km from you');
    });

    it('should format distance as integer for >= 10km', () => {
      const title = service.buildTitle(
        NotificationConfidence.HIGH,
        'BIRD',
        'Polly',
        15.3,
      );

      expect(title).toContain('15km from you');
    });

    it('should use correct emoji for each species', () => {
      expect(
        service.buildTitle(NotificationConfidence.HIGH, 'DOG', 'Test', 1),
      ).toContain('🐕');
      expect(
        service.buildTitle(NotificationConfidence.HIGH, 'CAT', 'Test', 1),
      ).toContain('🐈');
      expect(
        service.buildTitle(NotificationConfidence.HIGH, 'BIRD', 'Test', 1),
      ).toContain('🐦');
      expect(
        service.buildTitle(NotificationConfidence.HIGH, 'RABBIT', 'Test', 1),
      ).toContain('🐰');
      expect(
        service.buildTitle(NotificationConfidence.HIGH, 'OTHER', 'Test', 1),
      ).toContain('🐾');
    });
  });

  describe('buildBody', () => {
    it('should build body with description and address', () => {
      const body = service.buildBody(
        'Golden Retriever, very friendly',
        '123 Main St, San Francisco',
      );

      expect(body).toContain('Golden Retriever, very friendly');
      expect(body).toContain('Last seen near 123 Main St, San Francisco');
    });

    it('should build body with only description', () => {
      const body = service.buildBody('Small black cat with white paws');

      expect(body).toBe('Small black cat with white paws');
    });

    it('should truncate long descriptions to 170 characters', () => {
      const longDescription = 'A'.repeat(200);
      const body = service.buildBody(longDescription);

      expect(body.length).toBeLessThanOrEqual(170);
      expect(body).toContain('...');
    });

    it('should truncate description with address to fit limit', () => {
      const longDescription = 'A'.repeat(150);
      const body = service.buildBody(longDescription, 'Some very long address');

      expect(body.length).toBeLessThanOrEqual(170);
      expect(body).toContain('...');
    });

    it('should not truncate if within limit', () => {
      const shortDescription = 'Small brown dog';
      const body = service.buildBody(shortDescription, 'Main St');

      expect(body).not.toContain('...');
      expect(body).toContain(shortDescription);
      expect(body).toContain('Main St');
    });
  });

  describe('trackExclusion', () => {
    it('should create notification record with excluded flag', async () => {
      const mockCreate = jest.fn().mockResolvedValue({ id: 1 });
      (prismaService.notification.create as jest.Mock) = mockCreate;

      await service.trackExclusion(10, 20, 'PUSH_TOKEN_MISSING');

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          alert_id: 10,
          device_id: 20,
          confidence: NotificationConfidence.LOW,
          match_reason: 'MANUAL',
          excluded: true,
          exclusion_reason: 'PUSH_TOKEN_MISSING',
        },
      });
    });

    it('should log exclusion for debugging', async () => {
      const logSpy = jest.spyOn(service['logger'], 'debug');
      (prismaService.notification.create as jest.Mock).mockResolvedValue({
        id: 1,
      });

      await service.trackExclusion(10, 20, 'LOCATION_STALE');

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('device 20'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('alert 10'));
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('LOCATION_STALE'),
      );
    });
  });

  describe('handleDeliveryReceipt', () => {
    it('should update notification status to DELIVERED', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({ id: 1 });
      (prismaService.notification.update as jest.Mock) = mockUpdate;

      await service.handleDeliveryReceipt(123);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          status: 'DELIVERED',
          delivered_at: expect.any(Date),
        },
      });
    });

    it('should log delivery confirmation', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      (prismaService.notification.update as jest.Mock).mockResolvedValue({
        id: 456,
      });

      await service.handleDeliveryReceipt(456);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('456'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('delivered'));
    });
  });
});
