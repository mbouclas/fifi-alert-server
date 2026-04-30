import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@services/prisma.service';
import { Prisma } from '@prisma-lib/client';
import { AUDIT_EVENT_NAMES } from '../audit/audit-event-names';
import { IAuditEventPayload } from '../audit/interfaces/audit-event-payload.interface';
import {
    CreateAlertZoneDto,
    UpdateAlertZoneDto,
    AlertZoneResponseDto,
} from './dto';
import { AlertZoneCacheService } from './alert-zone-cache.service';

/**
 * Constants for AlertZone validation
 */
const MAX_ZONES_PER_USER = 10;
const MIN_RADIUS_METERS = 50;
const MAX_RADIUS_METERS = 5000;

/**
 * AlertZoneService handles user-scoped alert zones.
 * Alert zones are geographic areas where users want to receive notifications
 * about missing pets. Unlike SavedZones (device-scoped), AlertZones apply
 * to all of a user's devices.
 */
@Injectable()
export class AlertZoneService {
    private readonly logger = new Logger(AlertZoneService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly eventEmitter: EventEmitter2,
        private readonly cacheService: AlertZoneCacheService,
    ) { }

    /**
     * Create a new alert zone for a user.
     *
     * @param dto - The alert zone creation data
     * @param userId - The ID of the user creating the zone
     * @return The created alert zone
     * @throws BadRequestException if max zones limit reached or validation fails
     * @throws NotFoundException if user doesn't exist
     */
    async create(
        dto: CreateAlertZoneDto,
        userId: number,
    ): Promise<AlertZoneResponseDto> {
        // Verify user exists
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException(`User with ID ${userId} not found`);
        }

        // Check if user has reached max zones limit
        const existingZonesCount = await this.prisma.alertZone.count({
            where: { user_id: userId },
        });

        if (existingZonesCount >= MAX_ZONES_PER_USER) {
            throw new BadRequestException(
                `Maximum limit of ${MAX_ZONES_PER_USER} alert zones reached`,
            );
        }

        // Validate radius
        if (
            dto.radius_meters < MIN_RADIUS_METERS ||
            dto.radius_meters > MAX_RADIUS_METERS
        ) {
            throw new BadRequestException(
                `Radius must be between ${MIN_RADIUS_METERS} and ${MAX_RADIUS_METERS} meters`,
            );
        }

        // Insert with scalar coordinates and PostGIS geometry
        const result = await this.prisma.$queryRaw<{ id: number }[]>`
            INSERT INTO alert_zone (user_id, name, lat, lon, location_point, radius_meters, priority, is_active, created_at, updated_at)
            VALUES (
                ${userId},
                ${dto.name},
                ${dto.latitude},
                ${dto.longitude},
                ST_SetSRID(ST_MakePoint(${dto.longitude}, ${dto.latitude}), 4326),
                ${dto.radius_meters},
                ${dto.priority ?? 1},
                ${dto.is_active ?? true},
                NOW(),
                NOW()
            )
            RETURNING id
        `;

        const zoneId = result[0].id;

        // Fetch the created zone
        const zone = await this.findOne(zoneId, userId);

        // Emit audit event
        const auditPayload: IAuditEventPayload = {
            eventType: 'CREATE',
            action: 'alert_zone_created',
            entityType: 'ALERT_ZONE',
            entityId: zoneId,
            userId: userId,
            actorId: userId.toString(),
            actorType: 'user',
            description: `Created alert zone: ${dto.name}`,
            newValues: {
                name: dto.name,
                latitude: dto.latitude,
                longitude: dto.longitude,
                radius_meters: dto.radius_meters,
                priority: dto.priority ?? 1,
                is_active: dto.is_active ?? true,
            },
        };

        this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, auditPayload);

        this.logger.log(
            `User ${userId} created alert zone ${zoneId}: ${dto.name}`,
        );

        // Invalidate cache after zone creation
        await this.cacheService.invalidateCache();

        return zone;
    }

    /**
     * Find all alert zones for a user.
     *
     * @param userId - The ID of the user
     * @return Array of alert zones ordered by priority (DESC) and created_at (DESC)
     */
    async findByUser(userId: number): Promise<AlertZoneResponseDto[]> {
        const zones = await this.prisma.$queryRaw<
            Array<{
                id: number;
                user_id: number;
                name: string;
                radius_meters: number;
                is_active: boolean;
                priority: number;
                lon: number;
                lat: number;
                created_at: Date;
                updated_at: Date;
            }>
        >`
      SELECT 
        id, 
        user_id, 
        name, 
        radius_meters, 
        is_active, 
        priority,
        ST_X(location_point::geometry) as lon,
        ST_Y(location_point::geometry) as lat,
        created_at, 
        updated_at
      FROM alert_zone
      WHERE user_id = ${userId}
      ORDER BY priority DESC, created_at DESC
    `;

        return zones.map((zone) => this.mapToResponseDto(zone));
    }

    /**
     * Find a single alert zone by ID.
     *
     * @param zoneId - The ID of the alert zone
     * @param userId - The ID of the user (for ownership verification)
     * @return The alert zone
     * @throws NotFoundException if zone doesn't exist
     * @throws ForbiddenException if user is not the owner
     */
    async findOne(
        zoneId: number,
        userId: number,
    ): Promise<AlertZoneResponseDto> {
        const zone = await this.prisma.alertZone.findUnique({
            where: { id: zoneId },
        });

        if (!zone) {
            throw new NotFoundException(
                `Alert zone with ID ${zoneId} not found`,
            );
        }

        if (zone.user_id !== userId) {
            throw new ForbiddenException(
                'You do not have permission to access this alert zone',
            );
        }

        // Fetch with lat/lon
        const zoneWithCoords = await this.prisma.$queryRaw<
            Array<{
                id: number;
                user_id: number;
                name: string;
                radius_meters: number;
                is_active: boolean;
                priority: number;
                lon: number;
                lat: number;
                created_at: Date;
                updated_at: Date;
            }>
        >`
      SELECT 
        id, 
        user_id, 
        name, 
        radius_meters, 
        is_active, 
        priority,
        ST_X(location_point::geometry) as lon,
        ST_Y(location_point::geometry) as lat,
        created_at, 
        updated_at
      FROM alert_zone
      WHERE id = ${zoneId}
    `;

        if (!zoneWithCoords[0]) {
            throw new NotFoundException(
                `Alert zone with ID ${zoneId} not found`,
            );
        }

        return this.mapToResponseDto(zoneWithCoords[0]);
    }

    /**
     * Update an alert zone.
     *
     * @param zoneId - The ID of the alert zone
     * @param dto - The update data
     * @param userId - The ID of the user (for ownership verification)
     * @return The updated alert zone
     * @throws NotFoundException if zone doesn't exist
     * @throws ForbiddenException if user is not the owner
     * @throws BadRequestException if validation fails
     */
    async update(
        zoneId: number,
        dto: UpdateAlertZoneDto,
        userId: number,
    ): Promise<AlertZoneResponseDto> {
        // Verify ownership
        const existingZone = await this.prisma.alertZone.findUnique({
            where: { id: zoneId },
        });

        if (!existingZone) {
            throw new NotFoundException(
                `Alert zone with ID ${zoneId} not found`,
            );
        }

        if (existingZone.user_id !== userId) {
            throw new ForbiddenException(
                'You do not have permission to update this alert zone',
            );
        }

        // Validate radius if provided
        if (dto.radius_meters !== undefined) {
            if (
                dto.radius_meters < MIN_RADIUS_METERS ||
                dto.radius_meters > MAX_RADIUS_METERS
            ) {
                throw new BadRequestException(
                    `Radius must be between ${MIN_RADIUS_METERS} and ${MAX_RADIUS_METERS} meters`,
                );
            }
        }

        // Get old values for audit
        const oldZone = await this.findOne(zoneId, userId);

        // Check if location changed
        const locationChanged =
            dto.latitude !== undefined || dto.longitude !== undefined;

        if (locationChanged) {
            const lat = dto.latitude ?? oldZone.latitude;
            const lon = dto.longitude ?? oldZone.longitude;

            await this.prisma.$executeRaw`
        UPDATE alert_zone
        SET 
          location_point = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326),
                    lat = ${lat},
                    lon = ${lon},
          name = ${dto.name ?? existingZone.name},
          radius_meters = ${dto.radius_meters ?? existingZone.radius_meters},
          priority = ${dto.priority ?? existingZone.priority},
          is_active = ${dto.is_active ?? existingZone.is_active},
          updated_at = NOW()
        WHERE id = ${zoneId}
      `;
        } else {
            await this.prisma.alertZone.update({
                where: { id: zoneId },
                data: {
                    name: dto.name,
                    radius_meters: dto.radius_meters,
                    priority: dto.priority,
                    is_active: dto.is_active,
                },
            });
        }

        // Fetch updated zone
        const updatedZone = await this.findOne(zoneId, userId);

        // Emit audit event
        const auditPayload: IAuditEventPayload = {
            eventType: 'UPDATE',
            action: 'alert_zone_updated',
            entityType: 'ALERT_ZONE',
            entityId: zoneId,
            userId: userId,
            actorId: userId.toString(),
            actorType: 'user',
            description: `Updated alert zone: ${updatedZone.name}`,
            oldValues: {
                name: oldZone.name,
                latitude: oldZone.latitude,
                longitude: oldZone.longitude,
                radius_meters: oldZone.radius_meters,
                priority: oldZone.priority,
                is_active: oldZone.is_active,
            },
            newValues: {
                name: updatedZone.name,
                latitude: updatedZone.latitude,
                longitude: updatedZone.longitude,
                radius_meters: updatedZone.radius_meters,
                priority: updatedZone.priority,
                is_active: updatedZone.is_active,
            },
        };

        this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);

        this.logger.log(`User ${userId} updated alert zone ${zoneId}`);

        // Invalidate cache after zone update
        await this.cacheService.invalidateCache();

        return updatedZone;
    }

    /**
     * Delete an alert zone.
     *
     * @param zoneId - The ID of the alert zone
     * @param userId - The ID of the user (for ownership verification)
     * @throws NotFoundException if zone doesn't exist
     * @throws ForbiddenException if user is not the owner
     */
    async delete(zoneId: number, userId: number): Promise<void> {
        // Verify ownership
        const zone = await this.prisma.alertZone.findUnique({
            where: { id: zoneId },
        });

        if (!zone) {
            throw new NotFoundException(
                `Alert zone with ID ${zoneId} not found`,
            );
        }

        if (zone.user_id !== userId) {
            throw new ForbiddenException(
                'You do not have permission to delete this alert zone',
            );
        }

        // Get zone details for audit before deletion
        const zoneDetails = await this.findOne(zoneId, userId);

        // Delete the zone
        await this.prisma.alertZone.delete({
            where: { id: zoneId },
        });

        // Emit audit event
        const auditPayload: IAuditEventPayload = {
            eventType: 'DELETE',
            action: 'alert_zone_deleted',
            entityType: 'ALERT_ZONE',
            entityId: zoneId,
            userId: userId,
            actorId: userId.toString(),
            actorType: 'user',
            description: `Deleted alert zone: ${zoneDetails.name}`,
            oldValues: {
                name: zoneDetails.name,
                latitude: zoneDetails.latitude,
                longitude: zoneDetails.longitude,
                radius_meters: zoneDetails.radius_meters,
                priority: zoneDetails.priority,
                is_active: zoneDetails.is_active,
            },
        };

        this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.DELETED, auditPayload);

        this.logger.log(`User ${userId} deleted alert zone ${zoneId}`);

        // Invalidate cache after zone deletion
        await this.cacheService.invalidateCache();
    }

    /**
     * Map raw query result to AlertZoneResponseDto.
     *
     * @param zone - Raw zone data from database
     * @return Formatted response DTO
     */
    private mapToResponseDto(zone: {
        id: number;
        name: string;
        radius_meters: number;
        is_active: boolean;
        priority: number;
        lon: number;
        lat: number;
        created_at: Date;
        updated_at: Date;
    }): AlertZoneResponseDto {
        return {
            id: zone.id,
            name: zone.name,
            latitude: zone.lat,
            longitude: zone.lon,
            radius_meters: zone.radius_meters,
            radius_km: Number((zone.radius_meters / 1000).toFixed(3)), // Convert to km for UI
            is_active: zone.is_active,
            priority: zone.priority,
            created_at: zone.created_at,
            updated_at: zone.updated_at,
        };
    }
}
