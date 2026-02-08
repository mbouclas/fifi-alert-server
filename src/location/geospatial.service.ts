import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';

/**
 * Point coordinates interface
 */
export interface Point {
  latitude: number;
  longitude: number;
}

/**
 * Distance calculation result
 */
export interface DistanceResult {
  distanceKm: number;
  withinRange: boolean;
}

@Injectable()
export class GeospatialService {
  private readonly logger = new Logger(GeospatialService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates distance between two points using PostGIS
   *
   * @param point1 - First point
   * @param point2 - Second point
   * @returns Distance in kilometers
   */
  async calculateDistance(point1: Point, point2: Point): Promise<number> {
    if (!point1 || !point2) {
      this.logger.warn('Cannot calculate distance: missing point(s)');
      return Infinity;
    }

    const result = await this.prisma.$queryRaw<Array<{ distance_km: number }>>`
      SELECT 
        ST_Distance(
          ST_SetSRID(ST_MakePoint(${point1.longitude}, ${point1.latitude}), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${point2.longitude}, ${point2.latitude}), 4326)::geography
        ) / 1000 as distance_km
    `;

    if (!result || result.length === 0) {
      return Infinity;
    }

    return Number(result[0].distance_km);
  }

  /**
   * Checks if a point is within a certain distance of another point
   *
   * @param center - Center point
   * @param testPoint - Point to test
   * @param radiusKm - Radius in kilometers
   * @returns Distance result with withinRange flag
   */
  async isWithinDistance(
    center: Point,
    testPoint: Point,
    radiusKm: number,
  ): Promise<DistanceResult> {
    const distanceKm = await this.calculateDistance(center, testPoint);
    return {
      distanceKm,
      withinRange: distanceKm <= radiusKm,
    };
  }

  /**
   * Finds all points within a radius using ST_DWithin (optimized for large datasets)
   *
   * @param tableName - Name of the table containing geometry column
   * @param geometryColumn - Name of the geometry column
   * @param center - Center point
   * @param radiusKm - Radius in kilometers
   * @param additionalWhere - Optional additional WHERE clauses
   * @returns Array of matching row IDs
   */
  async findPointsWithinRadius(
    tableName: string,
    geometryColumn: string,
    center: Point,
    radiusKm: number,
    additionalWhere?: string,
  ): Promise<string[]> {
    const whereClause = additionalWhere ? `AND ${additionalWhere}` : '';

    // Note: Using template literals carefully to avoid SQL injection
    // tableName and geometryColumn should be validated/whitelisted
    const validTables = ['devices', 'saved_zones', 'alerts', 'sightings'];
    const validColumns = ['gps_point', 'ip_point', 'location_point'];

    if (!validTables.includes(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }
    if (!validColumns.includes(geometryColumn)) {
      throw new Error(`Invalid geometry column: ${geometryColumn}`);
    }

    const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM ${this.prisma.$queryRawUnsafe(tableName)}
      WHERE ST_DWithin(
        ${this.prisma.$queryRawUnsafe(geometryColumn)}::geography,
        ST_SetSRID(ST_MakePoint(${center.longitude}, ${center.latitude}), 4326)::geography,
        ${radiusKm} * 1000
      ) ${this.prisma.$queryRawUnsafe(whereClause)}
    `;

    return result.map((row) => row.id);
  }

  /**
   * Calculates the bounding box for a given center point and radius
   * Useful for initial filtering before more precise ST_DWithin queries
   *
   * @param center - Center point
   * @param radiusKm - Radius in kilometers
   * @returns Bounding box coordinates
   */
  calculateBoundingBox(
    center: Point,
    radiusKm: number,
  ): {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } {
    // Approximate conversion: 1 degree latitude ≈ 111 km
    // 1 degree longitude varies by latitude
    const latDelta = radiusKm / 111;
    const lonDelta =
      radiusKm / (111 * Math.cos((center.latitude * Math.PI) / 180));

    return {
      minLat: center.latitude - latDelta,
      maxLat: center.latitude + latDelta,
      minLon: center.longitude - lonDelta,
      maxLon: center.longitude + lonDelta,
    };
  }

  /**
   * Validates geographic coordinates
   *
   * @param latitude - Latitude to validate
   * @param longitude - Longitude to validate
   * @returns True if valid, false otherwise
   */
  validateCoordinates(latitude: number, longitude: number): boolean {
    return (
      latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    );
  }

  /**
   * Formats distance for display
   *
   * @param distanceKm - Distance in kilometers
   * @returns Formatted string
   */
  formatDistance(distanceKm: number): string {
    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)}m`;
    }
    if (distanceKm < 10) {
      return `${distanceKm.toFixed(1)}km`;
    }
    return `${Math.round(distanceKm)}km`;
  }

  /**
   * Extracts coordinates from PostGIS geometry point
   *
   * @param tableName - Table name
   * @param geometryColumn - Geometry column name
   * @param rowId - Row ID
   * @returns Point coordinates or null
   */
  async extractCoordinates(
    tableName: string,
    geometryColumn: string,
    rowId: string,
  ): Promise<Point | null> {
    const validTables = ['devices', 'saved_zones', 'alerts', 'sightings'];
    const validColumns = ['gps_point', 'ip_point', 'location_point'];

    if (!validTables.includes(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }
    if (!validColumns.includes(geometryColumn)) {
      throw new Error(`Invalid geometry column: ${geometryColumn}`);
    }

    const result = await this.prisma.$queryRaw<
      Array<{ latitude: number; longitude: number }>
    >`
      SELECT 
        ST_Y(${this.prisma.$queryRawUnsafe(geometryColumn)}) as latitude,
        ST_X(${this.prisma.$queryRawUnsafe(geometryColumn)}) as longitude
      FROM ${this.prisma.$queryRawUnsafe(tableName)}
      WHERE id = ${rowId}
    `;

    if (!result || result.length === 0) {
      return null;
    }

    return {
      latitude: Number(result[0].latitude),
      longitude: Number(result[0].longitude),
    };
  }
}
