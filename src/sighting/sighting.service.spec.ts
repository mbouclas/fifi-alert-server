import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SightingService } from './sighting.service';
import { PrismaService } from '../services/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AlertStatus, NotificationConfidence } from '@prisma/client';
import { CreateSightingDto, DismissSightingDto } from './dto';
import type { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';

describe('SightingService', () => {
  let service: SightingService;
  let prisma: jest.Mocked<PrismaService>;

  const mockPrismaService = {
    alert: {
      findUnique: jest.fn(),
    },
    sighting: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockNotificationService = {
    queueAlertNotifications: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockEmailProvider = {
    send: jest.fn().mockResolvedValue({
      id: 'test-message-id',
      success: true,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SightingService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: 'IEmailProvider',
          useValue: mockEmailProvider,
        },
      ],
    }).compile();

    service = module.get<SightingService>(SightingService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const validDto: CreateSightingDto = {
      alert_id: 'alert-123',
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        address: '123 Main St, San Francisco, CA',
      },
      photo: 'https://storage.fifi-alert.com/photo.jpg',
      notes: 'Saw a golden retriever near the park',
      confidence: NotificationConfidence.HIGH,
      sighting_time: '2026-02-05T14:30:00Z',
      direction: 'Heading north',
    };

    const reporterId = 'user-456';

    it('should create a sighting successfully', async () => {
      // Mock alert lookup
      prisma.alert.findUnique.mockResolvedValue({
        id: 'alert-123',
        status: AlertStatus.ACTIVE,
        creator_id: 'user-789',
      } as any);

      // Mock insert query
      prisma.$queryRaw.mockResolvedValue([{ id: 'sighting-999' }]);

      // Mock sighting fetch
      prisma.sighting.findUnique.mockResolvedValue({
        id: 'sighting-999',
        alert_id: 'alert-123',
        reported_by: reporterId,
        address: validDto.location.address,
        photo: validDto.photo,
        notes: validDto.notes,
        confidence: validDto.confidence,
        sighting_time: new Date(validDto.sighting_time),
        direction: validDto.direction,
        dismissed: false,
        dismissed_at: null,
        dismissed_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      const result = await service.create(validDto, reporterId);

      expect(result.id).toBe('sighting-999');
      expect(result.alert_id).toBe('alert-123');
      expect(result.reported_by).toBe(reporterId);
      expect(prisma.alert.findUnique).toHaveBeenCalledWith({
        where: { id: 'alert-123' },
        select: { id: true, status: true, creator_id: true },
      });
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should throw NotFoundException if alert does not exist', async () => {
      prisma.alert.findUnique.mockResolvedValue(null);

      await expect(service.create(validDto, reporterId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(validDto, reporterId)).rejects.toThrow(
        'Alert with ID alert-123 not found',
      );
    });

    it('should throw BadRequestException if alert is not ACTIVE', async () => {
      prisma.alert.findUnique.mockResolvedValue({
        id: 'alert-123',
        status: AlertStatus.RESOLVED,
        creator_id: 'user-789',
      } as any);

      await expect(service.create(validDto, reporterId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(validDto, reporterId)).rejects.toThrow(
        'Cannot report sighting for resolved alert',
      );
    });

    it('should handle optional fields (photo, notes, direction)', async () => {
      const minimalDto: CreateSightingDto = {
        alert_id: 'alert-123',
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          address: '123 Main St',
        },
        confidence: NotificationConfidence.MEDIUM,
        sighting_time: '2026-02-05T14:30:00Z',
      };

      prisma.alert.findUnique.mockResolvedValue({
        id: 'alert-123',
        status: AlertStatus.ACTIVE,
        creator_id: 'user-789',
      } as any);

      prisma.$queryRaw.mockResolvedValue([{ id: 'sighting-999' }]);

      prisma.sighting.findUnique.mockResolvedValue({
        id: 'sighting-999',
        alert_id: 'alert-123',
        reported_by: reporterId,
        address: minimalDto.location.address,
        photo: null,
        notes: null,
        confidence: minimalDto.confidence,
        sighting_time: new Date(minimalDto.sighting_time),
        direction: null,
        dismissed: false,
        dismissed_at: null,
        dismissed_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      const result = await service.create(minimalDto, reporterId);

      expect(result.photo).toBeNull();
      expect(result.notes).toBeNull();
      expect(result.direction).toBeNull();
    });
  });

  describe('findByAlert', () => {
    const alertId = 'alert-123';
    const creatorId = 'user-creator';
    const otherId = 'user-other';

    const mockSightings = [
      {
        id: 'sighting-1',
        alert_id: alertId,
        reported_by: 'user-reporter-1',
        address: '123 Main St',
        photo: null,
        notes: 'Saw the pet',
        confidence: NotificationConfidence.HIGH,
        sighting_time: new Date('2026-02-05T14:30:00Z'),
        direction: null,
        dismissed: false,
        dismissed_at: null,
        dismissed_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'sighting-2',
        alert_id: alertId,
        reported_by: 'user-reporter-2',
        address: '456 Oak Ave',
        photo: null,
        notes: 'Another sighting',
        confidence: NotificationConfidence.MEDIUM,
        sighting_time: new Date('2026-02-04T10:00:00Z'),
        direction: null,
        dismissed: true,
        dismissed_at: new Date(),
        dismissed_reason: 'Not my pet',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    it('should return all sightings for alert creator (including dismissed)', async () => {
      prisma.alert.findUnique.mockResolvedValue({
        id: alertId,
        creator_id: creatorId,
      } as any);

      prisma.sighting.findMany.mockResolvedValue(mockSightings as any);

      const result = await service.findByAlert(alertId, creatorId);

      expect(result).toHaveLength(2);
      expect(prisma.sighting.findMany).toHaveBeenCalledWith({
        where: { alert_id: alertId },
        orderBy: { sighting_time: 'desc' },
      });
    });

    it('should filter dismissed sightings for non-creators', async () => {
      prisma.alert.findUnique.mockResolvedValue({
        id: alertId,
        creator_id: creatorId,
      } as any);

      prisma.sighting.findMany.mockResolvedValue([mockSightings[0]] as any);

      const result = await service.findByAlert(alertId, otherId);

      expect(result).toHaveLength(1);
      expect(result[0].dismissed).toBe(false);
      expect(prisma.sighting.findMany).toHaveBeenCalledWith({
        where: { alert_id: alertId, dismissed: false },
        orderBy: { sighting_time: 'desc' },
      });
    });

    it('should throw NotFoundException if alert does not exist', async () => {
      prisma.alert.findUnique.mockResolvedValue(null);

      await expect(service.findByAlert(alertId, creatorId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findByAlert(alertId, creatorId)).rejects.toThrow(
        'Alert with ID alert-123 not found',
      );
    });

    it('should handle unauthenticated requests (no requesterId)', async () => {
      prisma.alert.findUnique.mockResolvedValue({
        id: alertId,
        creator_id: creatorId,
      } as any);

      prisma.sighting.findMany.mockResolvedValue([mockSightings[0]] as any);

      const result = await service.findByAlert(alertId, undefined);

      expect(result).toHaveLength(1);
      expect(prisma.sighting.findMany).toHaveBeenCalledWith({
        where: { alert_id: alertId, dismissed: false },
        orderBy: { sighting_time: 'desc' },
      });
    });
  });

  describe('dismiss', () => {
    const sightingId = 'sighting-123';
    const creatorId = 'user-creator';
    const otherId = 'user-other';
    const dismissDto: DismissSightingDto = {
      reason: 'This is not my pet',
    };

    const mockSighting = {
      id: sightingId,
      alert_id: 'alert-123',
      reported_by: 'user-reporter',
      address: '123 Main St',
      photo: null,
      notes: 'Sighting notes',
      confidence: NotificationConfidence.MEDIUM,
      sighting_time: new Date(),
      direction: null,
      dismissed: false,
      dismissed_at: null,
      dismissed_reason: null,
      created_at: new Date(),
      updated_at: new Date(),
      alert: {
        creator_id: creatorId,
      },
    };

    it('should dismiss sighting successfully by alert creator', async () => {
      prisma.sighting.findUnique.mockResolvedValue(mockSighting as any);

      const updatedSighting = {
        ...mockSighting,
        dismissed: true,
        dismissed_at: new Date(),
        dismissed_reason: dismissDto.reason,
      };
      prisma.sighting.update.mockResolvedValue(updatedSighting as any);

      const result = await service.dismiss(sightingId, dismissDto, creatorId);

      expect(result.dismissed).toBe(true);
      expect(result.dismissed_reason).toBe(dismissDto.reason);
      expect(prisma.sighting.update).toHaveBeenCalledWith({
        where: { id: sightingId },
        data: {
          dismissed: true,
          dismissed_at: expect.any(Date),
          dismissed_reason: dismissDto.reason,
        },
      });
    });

    it('should throw NotFoundException if sighting does not exist', async () => {
      prisma.sighting.findUnique.mockResolvedValue(null);

      await expect(
        service.dismiss(sightingId, dismissDto, creatorId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.dismiss(sightingId, dismissDto, creatorId),
      ).rejects.toThrow('Sighting with ID sighting-123 not found');
    });

    it('should throw ForbiddenException if requester is not alert creator', async () => {
      prisma.sighting.findUnique.mockResolvedValue(mockSighting as any);

      await expect(
        service.dismiss(sightingId, dismissDto, otherId),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.dismiss(sightingId, dismissDto, otherId),
      ).rejects.toThrow('Only the alert creator can dismiss sightings');
    });

    it('should throw BadRequestException if sighting is already dismissed', async () => {
      const dismissedSighting = {
        ...mockSighting,
        dismissed: true,
        dismissed_at: new Date(),
        dismissed_reason: 'Already dismissed',
      };
      prisma.sighting.findUnique.mockResolvedValue(dismissedSighting as any);

      await expect(
        service.dismiss(sightingId, dismissDto, creatorId),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.dismiss(sightingId, dismissDto, creatorId),
      ).rejects.toThrow('Sighting is already dismissed');
    });
  });

  describe('enrichWithCoordinates', () => {
    it('should enrich sightings with coordinates from PostGIS', async () => {
      const sightings = [
        {
          id: 'sighting-1',
          alert_id: 'alert-123',
          reported_by: 'user-1',
          latitude: 0,
          longitude: 0,
          address: '123 Main St',
          photo: null,
          notes: null,
          confidence: NotificationConfidence.HIGH,
          sighting_time: new Date(),
          direction: null,
          dismissed: false,
          dismissed_at: null,
          dismissed_reason: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'sighting-2',
          alert_id: 'alert-123',
          reported_by: 'user-2',
          latitude: 0,
          longitude: 0,
          address: '456 Oak Ave',
          photo: null,
          notes: null,
          confidence: NotificationConfidence.MEDIUM,
          sighting_time: new Date(),
          direction: null,
          dismissed: false,
          dismissed_at: null,
          dismissed_reason: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const mockCoords = [
        { id: 'sighting-1', latitude: 37.7749, longitude: -122.4194 },
        { id: 'sighting-2', latitude: 37.7849, longitude: -122.4094 },
      ];

      prisma.$queryRaw.mockResolvedValue(mockCoords);

      const result = await service.enrichWithCoordinates(sightings);

      expect(result[0].latitude).toBe(37.7749);
      expect(result[0].longitude).toBe(-122.4194);
      expect(result[1].latitude).toBe(37.7849);
      expect(result[1].longitude).toBe(-122.4094);
    });

    it('should return empty array if input is empty', async () => {
      const result = await service.enrichWithCoordinates([]);
      expect(result).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('Email Methods', () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      name: 'John Doe',
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      banned: false,
      banReason: null,
      banExpires: null,
      settings: {},
      meta: {},
    };

    const mockAlert = {
      id: 'alert-123',
      pet_name: 'Max',
      pet_species: 'DOG',
      last_seen_lat: 37.7749,
      last_seen_lon: -122.4194,
    };

    const mockSighting = {
      id: 'sighting-999',
      alert_id: 'alert-123',
      reported_by: '2',
      latitude: 37.7749,
      longitude: -122.4194,
      address: '123 Main St, San Francisco, CA',
      photo: 'https://example.com/photo.jpg',
      notes: 'Saw the dog near the park',
      confidence: NotificationConfidence.HIGH,
      sighting_time: new Date('2026-02-05T14:30:00Z'),
      direction: 'Heading north',
      dismissed: false,
      dismissed_at: null,
      dismissed_reason: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    beforeEach(() => {
      process.env.MAIL_NOTIFICATIONS_FROM = 'noreply@fifi-alert.com';
      process.env.APP_URL = 'https://fifi-alert.com';
    });

    describe('sendSightingReportedEmail', () => {
      it('should send sighting reported email successfully', async () => {
        prisma.user.findUnique.mockResolvedValueOnce(mockUser);
        prisma.alert.findUnique.mockResolvedValueOnce(mockAlert as any);

        const result = await service.sendSightingReportedEmail(
          mockUser.id,
          mockAlert.id,
          mockSighting as any,
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('Sighting email sent');
        expect(prisma.user.findUnique).toHaveBeenCalledWith({
          where: { id: mockUser.id },
        });
        expect(prisma.alert.findUnique).toHaveBeenCalledWith({
          where: { id: mockAlert.id },
          select: {
            id: true,
            pet_name: true,
            pet_species: true,
            last_seen_lat: true,
            last_seen_lon: true,
          },
        });
      });

      it('should throw error when user not found', async () => {
        prisma.user.findUnique.mockResolvedValueOnce(null);
        prisma.alert.findUnique.mockResolvedValueOnce(mockAlert as any);

        await expect(
          service.sendSightingReportedEmail(
            mockUser.id,
            mockAlert.id,
            mockSighting as any,
          ),
        ).rejects.toThrow('USER_NOT_FOUND');
      });

      it('should throw error when alert not found', async () => {
        prisma.user.findUnique.mockResolvedValueOnce(mockUser);
        prisma.alert.findUnique.mockResolvedValueOnce(null);

        await expect(
          service.sendSightingReportedEmail(
            mockUser.id,
            mockAlert.id,
            mockSighting as any,
          ),
        ).rejects.toThrow('ALERT_NOT_FOUND');
      });

      it('should throw error when email send fails', async () => {
        prisma.user.findUnique.mockResolvedValueOnce(mockUser);
        prisma.alert.findUnique.mockResolvedValueOnce(mockAlert as any);
        mockEmailProvider.send.mockRejectedValueOnce(new Error('Send failed'));

        await expect(
          service.sendSightingReportedEmail(
            mockUser.id,
            mockAlert.id,
            mockSighting as any,
          ),
        ).rejects.toThrow('FAILED_TO_SEND_SIGHTING_REPORTED_EMAIL');
      });
    });

    describe('sendSightingDismissedEmail', () => {
      const reporterId = 2;
      const dismissReason = 'Not the right pet - different markings';

      it('should send sighting dismissed email successfully', async () => {
        prisma.user.findUnique.mockResolvedValueOnce({ ...mockUser, id: reporterId });
        prisma.alert.findUnique.mockResolvedValueOnce(mockAlert as any);

        const result = await service.sendSightingDismissedEmail(
          reporterId,
          mockAlert.id,
          mockSighting as any,
          dismissReason,
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('Dismissal email sent');
        expect(prisma.user.findUnique).toHaveBeenCalledWith({
          where: { id: reporterId },
        });
      });

      it('should throw error when reporter not found', async () => {
        prisma.user.findUnique.mockResolvedValueOnce(null);
        prisma.alert.findUnique.mockResolvedValueOnce(mockAlert as any);

        await expect(
          service.sendSightingDismissedEmail(
            reporterId,
            mockAlert.id,
            mockSighting as any,
            dismissReason,
          ),
        ).rejects.toThrow('USER_NOT_FOUND');
      });

      it('should throw error when alert not found', async () => {
        prisma.user.findUnique.mockResolvedValueOnce({ ...mockUser, id: reporterId });
        prisma.alert.findUnique.mockResolvedValueOnce(null);

        await expect(
          service.sendSightingDismissedEmail(
            reporterId,
            mockAlert.id,
            mockSighting as any,
            dismissReason,
          ),
        ).rejects.toThrow('ALERT_NOT_FOUND');
      });

      it('should throw error when email send fails', async () => {
        prisma.user.findUnique.mockResolvedValueOnce({ ...mockUser, id: reporterId });
        prisma.alert.findUnique.mockResolvedValueOnce(mockAlert as any);
        mockEmailProvider.send.mockRejectedValueOnce(new Error('Send failed'));

        await expect(
          service.sendSightingDismissedEmail(
            reporterId,
            mockAlert.id,
            mockSighting as any,
            dismissReason,
          ),
        ).rejects.toThrow('FAILED_TO_SEND_SIGHTING_DISMISSED_EMAIL');
      });
    });
  });
});
