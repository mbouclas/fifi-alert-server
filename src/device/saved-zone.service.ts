import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../services/prisma.service';
import { SavedZone } from '@prisma/client';
import {
  CreateSavedZoneDto,
  UpdateSavedZoneDto,
  SavedZoneResponseDto,
} from './dto';
import { AUDIT_EVENT_NAMES } from '../audit/audit-event-names';
import { IAuditEventPayload } from '../audit/interfaces/audit-event-payload.interface';

@Injectable()
export class SavedZoneService {
  private readonly MAX_ZONES_PER_DEVICE = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'CREATE',
        entityType: 'SAVED_ZONE',
        entityId: parseInt(zoneId, 10),
        userId: parseInt(userId, 10),
        action: 'saved_zone_created',
        description: `Created saved zone "${dto.name}" for device ${deviceId}`,
        newValues: {
          name: dto.name,
          deviceId: deviceId,
          radiusKm: dto.radius_km,
          priority: dto.priority ?? 1,
          isActive: dto.is_active ?? true,
        },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, auditPayload);
    } catch (error) {
      // Silent fail for audit events
    }

    // Fetch and return the created zone
    const zone = await this.prisma.savedZone.findUnique({
      where: { id: zoneId },
    });

    return this.mapToResponseDto(zone!, dto.latitude, dto.longitude);
  }

  /**
   * Find all saved zones for a device
   */
  async findByDevice(
    deviceId: string,
    userId: string,
  ): Promise<SavedZoneResponseDto[]> {
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
     * UpdaCapture oldValues for audit
        const oldValues = {
            name: zone.name,
            radiusKm: zone.radius_km,
            priority: zone.priority,
            isActive: zone.is_active,
        };

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

        // Emit audit event
        try {
            const auditPayload: IAuditEventPayload = {
                eventType: 'UPDATE',
                entityType: 'SAVED_ZONE',
                entityId: parseInt(zoneId, 10),
                userId: parseInt(userId, 10),
                action: 'saved_zone_updated',
                description: `Updated saved zone "${updated.name}"`,
                oldValues,
                newValues: {
                    name: dto.name,
                    radiusKm: dto.radius_km,
                    priority: dto.priority,
                    isActive: dto.is_active,
                },
                success: true,
            };
            this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
        } catch (error) {
            // Silent fail for audit events
        } where: { id: zoneId },
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
           Capture values for audit before deletion
        const auditValues = {
            name: zone.name,
            deviceId: zone.device_id,
            radiusKm: zone.radius_km,
            priority: zone.priority,
        };

        // Delete zone
        await this.prisma.savedZone.delete({
            where: { id: zoneId },
        });

        // Emit audit event
        try {
            const auditPayload: IAuditEventPayload = {
                eventType: 'DELETE',
                entityType: 'SAVED_ZONE',
                entityId: parseInt(zoneId, 10),
                userId: parseInt(userId, 10),
                action: 'saved_zone_deleted',
                description: `Deleted saved zone "${auditValues.name}"`,
                oldValues: auditValues,
                success: true,
            };
            this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.DELETED, auditPayload);
        } catch (error) {
            // Silent fail for audit events
        }

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
      return this.mapToResponseDto(
        zone,
        coord?.latitude || 0,
        coord?.longitude || 0,
      );
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
