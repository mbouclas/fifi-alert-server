import { Test, TestingModule } from '@nestjs/testing';
import { GeospatialService } from './geospatial.service';
import { PrismaService } from '../services/prisma.service';

describe('GeospatialService', () => {
  let service: GeospatialService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn((sql: string) => sql),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeospatialService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<GeospatialService>(GeospatialService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateDistance', () => {
    it('should calculate distance between two points', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ distance_km: 5.234 }]);

      const point1 = { latitude: 37.7749, longitude: -122.4194 };
      const point2 = { latitude: 37.7849, longitude: -122.4094 };

      const result = await service.calculateDistance(point1, point2);

      expect(result).toBe(5.234);
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledWith(
        expect.anything(),
      );
    });

    it('should return Infinity when point1 is missing', async () => {
      const point2 = { latitude: 37.7849, longitude: -122.4094 };

      const result = await service.calculateDistance(null as any, point2);

      expect(result).toBe(Infinity);
      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
    });

    it('should return Infinity when point2 is missing', async () => {
      const point1 = { latitude: 37.7749, longitude: -122.4194 };

      const result = await service.calculateDistance(point1, null as any);

      expect(result).toBe(Infinity);
      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
    });

    it('should return Infinity when query returns empty result', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const point1 = { latitude: 37.7749, longitude: -122.4194 };
      const point2 = { latitude: 37.7849, longitude: -122.4094 };

      const result = await service.calculateDistance(point1, point2);

      expect(result).toBe(Infinity);
    });

    it('should handle zero distance (same point)', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ distance_km: 0 }]);

      const point1 = { latitude: 37.7749, longitude: -122.4194 };
      const point2 = { latitude: 37.7749, longitude: -122.4194 };

      const result = await service.calculateDistance(point1, point2);

      expect(result).toBe(0);
    });
  });

  describe('isWithinDistance', () => {
    it('should return true when point is within radius', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ distance_km: 3.5 }]);

      const center = { latitude: 37.7749, longitude: -122.4194 };
      const testPoint = { latitude: 37.7849, longitude: -122.4094 };

      const result = await service.isWithinDistance(center, testPoint, 5.0);

      expect(result).toEqual({
        distanceKm: 3.5,
        withinRange: true,
      });
    });

    it('should return false when point is outside radius', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ distance_km: 7.8 }]);

      const center = { latitude: 37.7749, longitude: -122.4194 };
      const testPoint = { latitude: 37.8049, longitude: -122.3894 };

      const result = await service.isWithinDistance(center, testPoint, 5.0);

      expect(result).toEqual({
        distanceKm: 7.8,
        withinRange: false,
      });
    });

    it('should return true when point is exactly on radius boundary', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ distance_km: 5.0 }]);

      const center = { latitude: 37.7749, longitude: -122.4194 };
      const testPoint = { latitude: 37.8199, longitude: -122.4194 };

      const result = await service.isWithinDistance(center, testPoint, 5.0);

      expect(result).toEqual({
        distanceKm: 5.0,
        withinRange: true,
      });
    });
  });

  describe('findPointsWithinRadius', () => {
    it('should find points within radius for valid table', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        { id: 'device-1' },
        { id: 'device-2' },
      ]);

      const center = { latitude: 37.7749, longitude: -122.4194 };
      const result = await service.findPointsWithinRadius(
        'devices',
        'gps_point',
        center,
        5.0,
      );

      expect(result).toEqual(['device-1', 'device-2']);
    });

    it('should throw error for invalid table name', async () => {
      const center = { latitude: 37.7749, longitude: -122.4194 };

      await expect(
        service.findPointsWithinRadius(
          'malicious_table',
          'gps_point',
          center,
          5.0,
        ),
      ).rejects.toThrow('Invalid table name: malicious_table');
    });

    it('should throw error for invalid geometry column', async () => {
      const center = { latitude: 37.7749, longitude: -122.4194 };

      await expect(
        service.findPointsWithinRadius(
          'devices',
          'malicious_column',
          center,
          5.0,
        ),
      ).rejects.toThrow('Invalid geometry column: malicious_column');
    });

    it('should accept additional WHERE clause', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ id: 'device-1' }]);

      const center = { latitude: 37.7749, longitude: -122.4194 };
      const result = await service.findPointsWithinRadius(
        'devices',
        'gps_point',
        center,
        5.0,
        'push_token IS NOT NULL',
      );

      expect(result).toEqual(['device-1']);
    });

    it('should return empty array when no points match', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const center = { latitude: 37.7749, longitude: -122.4194 };
      const result = await service.findPointsWithinRadius(
        'devices',
        'gps_point',
        center,
        5.0,
      );

      expect(result).toEqual([]);
    });
  });

  describe('calculateBoundingBox', () => {
    it('should calculate bounding box for given center and radius', () => {
      const center = { latitude: 37.7749, longitude: -122.4194 };
      const radiusKm = 10;

      const bbox = service.calculateBoundingBox(center, radiusKm);

      expect(bbox).toHaveProperty('minLat');
      expect(bbox).toHaveProperty('maxLat');
      expect(bbox).toHaveProperty('minLon');
      expect(bbox).toHaveProperty('maxLon');
      expect(bbox.minLat).toBeLessThan(center.latitude);
      expect(bbox.maxLat).toBeGreaterThan(center.latitude);
      expect(bbox.minLon).toBeLessThan(center.longitude);
      expect(bbox.maxLon).toBeGreaterThan(center.longitude);
    });

    it('should calculate larger box for larger radius', () => {
      const center = { latitude: 37.7749, longitude: -122.4194 };
      const bbox5 = service.calculateBoundingBox(center, 5);
      const bbox10 = service.calculateBoundingBox(center, 10);

      expect(bbox10.maxLat - bbox10.minLat).toBeGreaterThan(
        bbox5.maxLat - bbox5.minLat,
      );
      expect(bbox10.maxLon - bbox10.minLon).toBeGreaterThan(
        bbox5.maxLon - bbox5.minLon,
      );
    });

    it('should handle equator location', () => {
      const center = { latitude: 0, longitude: 0 };
      const bbox = service.calculateBoundingBox(center, 10);

      expect(bbox.minLat).toBeLessThan(0);
      expect(bbox.maxLat).toBeGreaterThan(0);
      expect(bbox.minLon).toBeLessThan(0);
      expect(bbox.maxLon).toBeGreaterThan(0);
    });

    it('should handle pole-adjacent location', () => {
      const center = { latitude: 85, longitude: 0 };
      const bbox = service.calculateBoundingBox(center, 10);

      expect(bbox.minLat).toBeLessThan(85);
      expect(bbox.maxLat).toBeGreaterThan(85);
    });
  });

  describe('validateCoordinates', () => {
    it('should return true for valid coordinates', () => {
      expect(service.validateCoordinates(37.7749, -122.4194)).toBe(true);
      expect(service.validateCoordinates(0, 0)).toBe(true);
      expect(service.validateCoordinates(90, 180)).toBe(true);
      expect(service.validateCoordinates(-90, -180)).toBe(true);
    });

    it('should return false for invalid latitude', () => {
      expect(service.validateCoordinates(91, -122.4194)).toBe(false);
      expect(service.validateCoordinates(-91, -122.4194)).toBe(false);
      expect(service.validateCoordinates(100, 0)).toBe(false);
    });

    it('should return false for invalid longitude', () => {
      expect(service.validateCoordinates(37.7749, 181)).toBe(false);
      expect(service.validateCoordinates(37.7749, -181)).toBe(false);
      expect(service.validateCoordinates(0, 200)).toBe(false);
    });

    it('should handle boundary values correctly', () => {
      expect(service.validateCoordinates(90, 0)).toBe(true);
      expect(service.validateCoordinates(-90, 0)).toBe(true);
      expect(service.validateCoordinates(0, 180)).toBe(true);
      expect(service.validateCoordinates(0, -180)).toBe(true);
    });
  });

  describe('formatDistance', () => {
    it('should format distances less than 1km in meters', () => {
      expect(service.formatDistance(0.5)).toBe('500m');
      expect(service.formatDistance(0.123)).toBe('123m');
      expect(service.formatDistance(0.999)).toBe('999m');
    });

    it('should format distances between 1-10km with one decimal', () => {
      expect(service.formatDistance(1.234)).toBe('1.2km');
      expect(service.formatDistance(5.678)).toBe('5.7km');
      expect(service.formatDistance(9.999)).toBe('10.0km');
    });

    it('should format distances over 10km as rounded integers', () => {
      expect(service.formatDistance(10.1)).toBe('10km');
      expect(service.formatDistance(15.7)).toBe('16km');
      expect(service.formatDistance(100.4)).toBe('100km');
    });

    it('should handle zero distance', () => {
      expect(service.formatDistance(0)).toBe('0m');
    });

    it('should handle very large distances', () => {
      expect(service.formatDistance(1000.5)).toBe('1001km');
      expect(service.formatDistance(9999.9)).toBe('10000km');
    });
  });

  describe('extractCoordinates', () => {
    it('should extract coordinates from valid geometry', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        { latitude: 37.7749, longitude: -122.4194 },
      ]);

      const result = await service.extractCoordinates(
        'devices',
        'gps_point',
        'device-1',
      );

      expect(result).toEqual({
        latitude: 37.7749,
        longitude: -122.4194,
      });
    });

    it('should return null when no row found', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.extractCoordinates(
        'devices',
        'gps_point',
        'non-existent-id',
      );

      expect(result).toBeNull();
    });

    it('should throw error for invalid table name', async () => {
      await expect(
        service.extractCoordinates('malicious_table', 'gps_point', 'device-1'),
      ).rejects.toThrow('Invalid table name: malicious_table');
    });

    it('should throw error for invalid geometry column', async () => {
      await expect(
        service.extractCoordinates('devices', 'malicious_column', 'device-1'),
      ).rejects.toThrow('Invalid geometry column: malicious_column');
    });

    it('should handle all valid table names', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        { latitude: 37.7749, longitude: -122.4194 },
      ]);

      const validTables = ['devices', 'saved_zones', 'alerts', 'sightings'];
      for (const table of validTables) {
        await expect(
          service.extractCoordinates(table, 'location_point', 'id-1'),
        ).resolves.toBeDefined();
      }
    });

    it('should handle all valid geometry columns', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        { latitude: 37.7749, longitude: -122.4194 },
      ]);

      const validColumns = ['gps_point', 'ip_point', 'location_point'];
      for (const column of validColumns) {
        await expect(
          service.extractCoordinates('devices', column, 'device-1'),
        ).resolves.toBeDefined();
      }
    });
  });
});
