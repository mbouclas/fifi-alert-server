import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AlertZoneService } from './alert-zone.service';
import { PrismaService } from '../services/prisma.service';
import { AUDIT_EVENT_NAMES } from '../audit/audit-event-names';

describe('AlertZoneService', () => {
  let service: AlertZoneService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    alertZone: {
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertZoneService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<AlertZoneService>(AlertZoneService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      name: 'Home',
      latitude: 37.7749,
      longitude: -122.4194,
      radius_meters: 500,
      priority: 1,
      is_active: true,
    };

    const mockUser = { id: 1, email: 'test@example.com' };
    const mockZone = {
      id: 1,
      name: 'Home',
      lat: 37.7749,
      lon: -122.4194,
      radius_meters: 500,
      is_active: true,
      priority: 1,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should successfully create an alert zone', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.alertZone.count.mockResolvedValue(5); // User has 5 zones
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]); // Insert result
      mockPrisma.$queryRaw.mockResolvedValueOnce([mockZone]); // findOne result

      const result = await service.create(createDto, 1);

      expect(result).toEqual({
        id: 1,
        name: 'Home',
        latitude: 37.7749,
        longitude: -122.4194,
        radius_meters: 500,
        radius_km: 0.5,
        is_active: true,
        priority: 1,
        created_at: mockZone.created_at,
        updated_at: mockZone.updated_at,
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_EVENT_NAMES.ENTITY.CREATED,
        expect.objectContaining({
          eventType: 'CREATE',
          entityType: 'ALERT_ZONE',
          entityId: 1,
          userId: 1,
        }),
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto, 999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when max zones limit reached', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.alertZone.count.mockResolvedValue(10); // User has 10 zones (max)

      await expect(service.create(createDto, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.alertZone.count).toHaveBeenCalledWith({
        where: { user_id: 1 },
      });
    });

    it('should throw BadRequestException for invalid radius (too small)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.alertZone.count.mockResolvedValue(5);

      const invalidDto = { ...createDto, radius_meters: 30 }; // Below minimum of 50

      await expect(service.create(invalidDto, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid radius (too large)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.alertZone.count.mockResolvedValue(5);

      const invalidDto = { ...createDto, radius_meters: 6000 }; // Above maximum of 5000

      await expect(service.create(invalidDto, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should emit audit event with correct payload', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.alertZone.count.mockResolvedValue(5);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([mockZone]);

      await service.create(createDto, 1);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_EVENT_NAMES.ENTITY.CREATED,
        expect.objectContaining({
          eventType: 'CREATE',
          entityType: 'ALERT_ZONE',
          entityId: 1,
          userId: 1,
          actorId: '1',
          actorType: 'user',
          newValues: expect.objectContaining({
            name: 'Home',
            latitude: 37.7749,
            longitude: -122.4194,
            radius_meters: 500,
          }),
        }),
      );
    });
  });

  describe('findByUser', () => {
    const mockZones = [
      {
        id: 1,
        user_id: 1,
        name: 'Home',
        lat: 37.7749,
        lon: -122.4194,
        radius_meters: 500,
        is_active: true,
        priority: 2,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      },
      {
        id: 2,
        user_id: 1,
        name: 'Work',
        lat: 37.7799,
        lon: -122.4294,
        radius_meters: 300,
        is_active: true,
        priority: 1,
        created_at: new Date('2026-01-02'),
        updated_at: new Date('2026-01-02'),
      },
    ];

    it('should return all zones for a user ordered by priority', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockZones);

      const result = await service.findByUser(1);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Home');
      expect(result[0].priority).toBe(2);
      expect(result[1].name).toBe('Work');
      expect(result[1].priority).toBe(1);
    });

    it('should return empty array when user has no zones', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.findByUser(1);

      expect(result).toEqual([]);
    });

    it('should correctly convert meters to kilometers', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([mockZones[0]]);

      const result = await service.findByUser(1);

      expect(result[0].radius_meters).toBe(500);
      expect(result[0].radius_km).toBe(0.5);
    });
  });

  describe('findOne', () => {
    const mockZone = {
      id: 1,
      user_id: 1,
      name: 'Home',
      radius_meters: 500,
      is_active: true,
      priority: 1,
    };

    const mockZoneWithCoords = {
      id: 1,
      user_id: 1,
      name: 'Home',
      lat: 37.7749,
      lon: -122.4194,
      radius_meters: 500,
      is_active: true,
      priority: 1,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should return a zone when found and user is owner', async () => {
      mockPrisma.alertZone.findUnique.mockResolvedValue(mockZone);
      mockPrisma.$queryRaw.mockResolvedValue([mockZoneWithCoords]);

      const result = await service.findOne(1, 1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Home');
      expect(result.latitude).toBe(37.7749);
      expect(result.longitude).toBe(-122.4194);
    });

    it('should throw NotFoundException when zone does not exist', async () => {
      mockPrisma.alertZone.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      mockPrisma.alertZone.findUnique.mockResolvedValue({
        ...mockZone,
        user_id: 2, // Different user
      });

      await expect(service.findOne(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    const mockZone = {
      id: 1,
      user_id: 1,
      name: 'Home',
      radius_meters: 500,
      is_active: true,
      priority: 1,
    };

    const mockOldZoneWithCoords = {
      id: 1,
      name: 'Home',
      latitude: 37.7749,
      longitude: -122.4194,
      radius_meters: 500,
      radius_km: 0.5,
      is_active: true,
      priority: 1,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const updateDto = {
      name: 'Casa',
      radius_meters: 1000,
    };

    it('should successfully update a zone without location change', async () => {
      mockPrisma.alertZone.findUnique.mockResolvedValue(mockZone);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          user_id: 1,
          name: 'Home',
          lat: 37.7749,
          lon: -122.4194,
          radius_meters: 500,
          is_active: true,
          priority: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]); // Old zone
      mockPrisma.alertZone.update.mockResolvedValue({
        ...mockZone,
        ...updateDto,
      });
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          user_id: 1,
          name: 'Casa',
          lat: 37.7749,
          lon: -122.4194,
          radius_meters: 1000,
          is_active: true,
          priority: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]); // Updated zone

      const result = await service.update(1, updateDto, 1);

      expect(result.name).toBe('Casa');
      expect(result.radius_meters).toBe(1000);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_EVENT_NAMES.ENTITY.UPDATED,
        expect.objectContaining({
          eventType: 'UPDATE',
          entityType: 'ALERT_ZONE',
        }),
      );
    });

    it('should use $executeRaw when location changes', async () => {
      mockPrisma.alertZone.findUnique.mockResolvedValue(mockZone);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          user_id: 1,
          name: 'Home',
          lat: 37.7749,
          lon: -122.4194,
          radius_meters: 500,
          is_active: true,
          priority: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]); // Old zone
      mockPrisma.$executeRaw.mockResolvedValue(1);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          user_id: 1,
          name: 'Home',
          lat: 37.7799,
          lon: -122.4294,
          radius_meters: 500,
          is_active: true,
          priority: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]); // Updated zone

      await service.update(1, { latitude: 37.7799, longitude: -122.4294 }, 1);

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      mockPrisma.alertZone.findUnique.mockResolvedValue({
        ...mockZone,
        user_id: 2,
      });

      await expect(service.update(1, updateDto, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException for invalid radius', async () => {
      mockPrisma.alertZone.findUnique.mockResolvedValue(mockZone);

      await expect(
        service.update(1, { radius_meters: 10000 }, 1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    const mockZone = {
      id: 1,
      user_id: 1,
      name: 'Home',
      radius_meters: 500,
      is_active: true,
      priority: 1,
    };

    it('should successfully delete a zone', async () => {
      mockPrisma.alertZone.findUnique.mockResolvedValue(mockZone);
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          user_id: 1,
          name: 'Home',
          lat: 37.7749,
          lon: -122.4194,
          radius_meters: 500,
          is_active: true,
          priority: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]); // Zone details for audit
      mockPrisma.alertZone.delete.mockResolvedValue(mockZone);

      await service.delete(1, 1);

      expect(mockPrisma.alertZone.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_EVENT_NAMES.ENTITY.DELETED,
        expect.objectContaining({
          eventType: 'DELETE',
          entityType: 'ALERT_ZONE',
          entityId: 1,
        }),
      );
    });

    it('should throw NotFoundException when zone does not exist', async () => {
      mockPrisma.alertZone.findUnique.mockResolvedValue(null);

      await expect(service.delete(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      mockPrisma.alertZone.findUnique.mockResolvedValue({
        ...mockZone,
        user_id: 2,
      });

      await expect(service.delete(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });
});
