import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { SavedZone } from '@prisma/client';
import {
    CreateSavedZoneDto,
    UpdateSavedZoneDto,
    SavedZoneResponseDto,
} from './dto';

@Injectable()
export class SavedZoneService {
    private readonly MAX_ZONES_PER_DEVICE = 5;

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Create a new saved zone
     * Enforces max 5 zones per device limit
     */
    async create(
        deviceId: string,
        dto: CreateSavedZoneDto,
        userId: string,
    ): Promise<SavedZoneResponseDto> {
        // Verify device belongs to user
        const device = await this.prisma.device.findFirst({
            where: {
                id: deviceId,
                user_id: userId,
            },
            include: {
                saved_zones: true,
            },
        });

        if (!device) {
            throw new NotFoundException(
                `Device with ID ${deviceId} not found or does not belong to user`,
            );
        }

        // Check max zones limit
        if (device.saved_zones.length >= this.MAX_ZONES_PER_DEVICE) {
            throw new BadRequestException(
                `Maximum ${this.MAX_ZONES_PER_DEVICE} saved zones per device`,
            );
        }

        // Insert zone using PostGIS
        const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO saved_zones (
        device_id,
        name,
        location_point,
        radius_km,
        priority,
        is_active
      )
      VALUES (
        ${deviceId}::text,
        ${dto.name},
        ST_SetSRID(ST_MakePoint(${dto.longitude}, ${dto.latitude}), 4326),
        ${dto.radius_km},
        ${dto.priority ?? 1},
        ${dto.is_active ?? true}
      )
      RETURNING id
    `;

        const zoneId = result[0].id;

        // Fetch and return the created zone
        const zone = await this.prisma.savedZone.findUnique({
            where: { id: zoneId },
        });

        return this.mapToResponseDto(zone!, dto.latitude, dto.longitude);
    }

    /**
     * Find all saved zones for a device
     */
    async findByDevice(deviceId: string, userId: string): Promise<SavedZoneResponseDto[]> {
        // Verify device belongs to user
        const device = await this.prisma.device.findFirst({
            where: {
                id: deviceId,
                user_id: userId,
            },
        });

        if (!device) {
            throw new NotFoundException(
                `Device with ID ${deviceId} not found or does not belong to user`,
            );
        }

        const zones = await this.prisma.savedZone.findMany({
            where: { device_id: deviceId },
            orderBy: { priority: 'desc' },
        });

        // Extract coordinates from PostGIS geometry
        return this.enrichWithCoordinates(zones);
    }

    /**
     * Update a saved zone
     */
    async update(
        zoneId: string,
        dto: UpdateSavedZoneDto,
        userId: string,
    ): Promise<SavedZoneResponseDto> {
        // Fetch zone with device to verify ownership
        const zone = await this.prisma.savedZone.findUnique({
            where: { id: zoneId },
            include: {
                device: true,
            },
        });

        if (!zone) {
            throw new NotFoundException(`Saved zone with ID ${zoneId} not found`);
        }

        if (zone.device.user_id !== userId) {
            throw new ForbiddenException('You do not have access to this saved zone');
        }

        // Update zone
        const updated = await this.prisma.savedZone.update({
            where: { id: zoneId },
            data: {
                name: dto.name ?? zone.name,
                radius_km: dto.radius_km ?? zone.radius_km,
                priority: dto.priority ?? zone.priority,
                is_active: dto.is_active ?? zone.is_active,
            },
        });

        // Extract coordinates
        const coords = await this.extractCoordinates(zoneId);

        return this.mapToResponseDto(updated, coords.latitude, coords.longitude);
    }

    /**
     * Delete a saved zone
     */
    async delete(zoneId: string, userId: string): Promise<void> {
        // Fetch zone with device to verify ownership
        const zone = await this.prisma.savedZone.findUnique({
            where: { id: zoneId },
            include: {
                device: true,
            },
        });

        if (!zone) {
            throw new NotFoundException(`Saved zone with ID ${zoneId} not found`);
        }

        if (zone.device.user_id !== userId) {
            throw new ForbiddenException('You do not have access to this saved zone');
        }

        // Delete zone
        await this.prisma.savedZone.delete({
            where: { id: zoneId },
        });
    }

    /**
     * Extract coordinates from PostGIS geometry for a single zone
     */
    private async extractCoordinates(
        zoneId: string,
    ): Promise<{ latitude: number; longitude: number }> {
        const result = await this.prisma.$queryRaw<
            Array<{ latitude: number; longitude: number }>
        >`
      SELECT
        ST_Y(location_point) as latitude,
        ST_X(location_point) as longitude
      FROM saved_zones
      WHERE id = ${zoneId}::text
    `;

        return result[0];
    }

    /**
     * Enrich zones with coordinates from PostGIS
     */
    private async enrichWithCoordinates(
        zones: SavedZone[],
    ): Promise<SavedZoneResponseDto[]> {
        if (zones.length === 0) return [];

        const ids = zones.map((z) => z.id);

        // Fetch coordinates using PostGIS functions
        const coords = await this.prisma.$queryRaw<
            Array<{ id: string; latitude: number; longitude: number }>
        >`
      SELECT
        id,
        ST_Y(location_point) as latitude,
        ST_X(location_point) as longitude
      FROM saved_zones
      WHERE id = ANY(${ids}::text[])
    `;

        // Create lookup map
        const coordMap = new Map(coords.map((c) => [c.id, c]));

        // Enrich zones with coordinates
        return zones.map((zone) => {
            const coord = coordMap.get(zone.id);
            return this.mapToResponseDto(zone, coord?.latitude || 0, coord?.longitude || 0);
        });
    }

    /**
     * Map SavedZone to response DTO
     */
    private mapToResponseDto(
        zone: SavedZone,
        latitude: number,
        longitude: number,
    ): SavedZoneResponseDto {
        return {
            id: zone.id,
            device_id: zone.device_id,
            name: zone.name,
            latitude,
            longitude,
            radius_km: zone.radius_km,
            priority: zone.priority,
            is_active: zone.is_active,
            created_at: zone.created_at,
            updated_at: zone.updated_at,
        };
    }
}

