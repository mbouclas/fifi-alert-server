import { Test, TestingModule } from '@nestjs/testing';
import { SavedZoneService } from './saved-zone.service';
import { PrismaService } from '../services/prisma.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateSavedZoneDto, UpdateSavedZoneDto } from './dto';

describe('SavedZoneService', () => {
  let service: SavedZoneService;
  let prisma: jest.Mocked<PrismaService>;

  const mockPrismaService = {
    device: {
      findFirst: jest.fn(),
    },
    savedZone: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavedZoneService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SavedZoneService>(SavedZoneService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const userId = 'user-123';
    const deviceId = 'device-123';
    const createDto: CreateSavedZoneDto = {
      name: 'Home',
      latitude: 37.7749,
      longitude: -122.4194,
      radius_km: 2.5,
      priority: 1,
      is_active: true,
    };

    it('should create a saved zone successfully', async () => {
      // Mock device with 2 existing zones
      prisma.device.findFirst.mockResolvedValue({
        id: deviceId,
        user_id: userId,
        saved_zones: [{ id: 'zone-1' }, { id: 'zone-2' }],
      } as any);

      // Mock insert query
      prisma.$queryRaw.mockResolvedValue([{ id: 'zone-new' }]);

      // Mock zone fetch
      prisma.savedZone.findUnique.mockResolvedValue({
        id: 'zone-new',
        device_id: deviceId,
        name: createDto.name,
        radius_km: createDto.radius_km,
        priority: createDto.priority,
        is_active: createDto.is_active,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      const result = await service.create(deviceId, createDto, userId);

      expect(result.id).toBe('zone-new');
      expect(result.name).toBe('Home');
      expect(result.radius_km).toBe(2.5);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should throw NotFoundException if device does not exist', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(service.create(deviceId, createDto, userId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(deviceId, createDto, userId)).rejects.toThrow(
        'Device with ID device-123 not found or does not belong to user',
      );
    });

    it('should throw BadRequestException if max zones limit exceeded', async () => {
      // Mock device with 5 existing zones (maximum)
      prisma.device.findFirst.mockResolvedValue({
        id: deviceId,
        user_id: userId,
        saved_zones: [
          { id: 'zone-1' },
          { id: 'zone-2' },
          { id: 'zone-3' },
          { id: 'zone-4' },
          { id: 'zone-5' },
        ],
      } as any);

      await expect(service.create(deviceId, createDto, userId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(deviceId, createDto, userId)).rejects.toThrow(
        'Maximum 5 saved zones per device',
      );
    });

    it('should use default values for optional fields', async () => {
      const minimalDto: CreateSavedZoneDto = {
        name: 'Work',
        latitude: 37.7849,
        longitude: -122.4094,
        radius_km: 1.5,
      };

      prisma.device.findFirst.mockResolvedValue({
        id: deviceId,
        user_id: userId,
        saved_zones: [],
      } as any);

      prisma.$queryRaw.mockResolvedValue([{ id: 'zone-minimal' }]);

      prisma.savedZone.findUnique.mockResolvedValue({
        id: 'zone-minimal',
        device_id: deviceId,
        name: minimalDto.name,
        radius_km: minimalDto.radius_km,
        priority: 1, // Default
        is_active: true, // Default
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      const result = await service.create(deviceId, minimalDto, userId);

      expect(result.priority).toBe(1);
      expect(result.is_active).toBe(true);
    });
  });

  describe('findByDevice', () => {
    const userId = 'user-123';
    const deviceId = 'device-123';

    it('should return all saved zones for a device', async () => {
      prisma.device.findFirst.mockResolvedValue({
        id: deviceId,
        user_id: userId,
      } as any);

      const mockZones = [
        {
          id: 'zone-1',
          device_id: deviceId,
          name: 'Home',
          radius_km: 2.5,
          priority: 2,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'zone-2',
          device_id: deviceId,
          name: 'Work',
          radius_km: 1.5,
          priority: 1,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      prisma.savedZone.findMany.mockResolvedValue(mockZones as any);

      // Mock coordinate extraction
      prisma.$queryRaw.mockResolvedValue([
        { id: 'zone-1', latitude: 37.7749, longitude: -122.4194 },
        { id: 'zone-2', latitude: 37.7849, longitude: -122.4094 },
      ]);

      const result = await service.findByDevice(deviceId, userId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Home');
      expect(result[0].latitude).toBe(37.7749);
      expect(result[1].name).toBe('Work');
      expect(prisma.savedZone.findMany).toHaveBeenCalledWith({
        where: { device_id: deviceId },
        orderBy: { priority: 'desc' },
      });
    });

    it('should throw NotFoundException if device does not exist', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(service.findByDevice(deviceId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array if device has no zones', async () => {
      prisma.device.findFirst.mockResolvedValue({
        id: deviceId,
        user_id: userId,
      } as any);

      prisma.savedZone.findMany.mockResolvedValue([]);

      const result = await service.findByDevice(deviceId, userId);

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    const userId = 'user-123';
    const zoneId = 'zone-123';
    const updateDto: UpdateSavedZoneDto = {
      name: 'Updated Home',
      radius_km: 3.0,
      priority: 3,
      is_active: false,
    };

    it('should update a saved zone successfully', async () => {
      const existingZone = {
        id: zoneId,
        device_id: 'device-123',
        name: 'Home',
        radius_km: 2.5,
        priority: 1,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        device: {
          id: 'device-123',
          user_id: userId,
        },
      };

      prisma.savedZone.findUnique.mockResolvedValue(existingZone as any);

      const updatedZone = {
        ...existingZone,
        name: updateDto.name!,
        radius_km: updateDto.radius_km!,
        priority: updateDto.priority!,
        is_active: updateDto.is_active!,
      };

      prisma.savedZone.update.mockResolvedValue(updatedZone as any);

      // Mock coordinate extraction
      prisma.$queryRaw.mockResolvedValue([
        { latitude: 37.7749, longitude: -122.4194 },
      ]);

      const result = await service.update(zoneId, updateDto, userId);

      expect(result.name).toBe('Updated Home');
      expect(result.radius_km).toBe(3.0);
      expect(result.priority).toBe(3);
      expect(result.is_active).toBe(false);
      expect(prisma.savedZone.update).toHaveBeenCalledWith({
        where: { id: zoneId },
        data: updateDto,
      });
    });

    it('should throw NotFoundException if zone does not exist', async () => {
      prisma.savedZone.findUnique.mockResolvedValue(null);

      await expect(service.update(zoneId, updateDto, userId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.update(zoneId, updateDto, userId)).rejects.toThrow(
        'Saved zone with ID zone-123 not found',
      );
    });

    it('should throw ForbiddenException if zone belongs to different user', async () => {
      prisma.savedZone.findUnique.mockResolvedValue({
        id: zoneId,
        device_id: 'device-123',
        device: {
          id: 'device-123',
          user_id: 'other-user',
        },
      } as any);

      await expect(service.update(zoneId, updateDto, userId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.update(zoneId, updateDto, userId)).rejects.toThrow(
        'You do not have access to this saved zone',
      );
    });

    it('should handle partial updates', async () => {
      const partialDto: UpdateSavedZoneDto = {
        name: 'New Name',
      };

      const existingZone = {
        id: zoneId,
        device_id: 'device-123',
        name: 'Old Name',
        radius_km: 2.5,
        priority: 1,
        is_active: true,
        device: {
          user_id: userId,
        },
      };

      prisma.savedZone.findUnique.mockResolvedValue(existingZone as any);
      prisma.savedZone.update.mockResolvedValue({
        ...existingZone,
        name: partialDto.name!,
      } as any);
      prisma.$queryRaw.mockResolvedValue([
        { latitude: 37.7749, longitude: -122.4194 },
      ]);

      const result = await service.update(zoneId, partialDto, userId);

      expect(result.name).toBe('New Name');
      expect(prisma.savedZone.update).toHaveBeenCalledWith({
        where: { id: zoneId },
        data: {
          name: 'New Name',
          radius_km: existingZone.radius_km,
          priority: existingZone.priority,
          is_active: existingZone.is_active,
        },
      });
    });
  });

  describe('delete', () => {
    const userId = 'user-123';
    const zoneId = 'zone-123';

    it('should delete a saved zone successfully', async () => {
      prisma.savedZone.findUnique.mockResolvedValue({
        id: zoneId,
        device_id: 'device-123',
        device: {
          id: 'device-123',
          user_id: userId,
        },
      } as any);

      prisma.savedZone.delete.mockResolvedValue({} as any);

      await service.delete(zoneId, userId);

      expect(prisma.savedZone.delete).toHaveBeenCalledWith({
        where: { id: zoneId },
      });
    });

    it('should throw NotFoundException if zone does not exist', async () => {
      prisma.savedZone.findUnique.mockResolvedValue(null);

      await expect(service.delete(zoneId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if zone belongs to different user', async () => {
      prisma.savedZone.findUnique.mockResolvedValue({
        id: zoneId,
        device_id: 'device-123',
        device: {
          id: 'device-123',
          user_id: 'other-user',
        },
      } as any);

      await expect(service.delete(zoneId, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
