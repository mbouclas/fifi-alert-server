import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { Prisma, AlertStatus, Sighting } from '@prisma/client';
import {
    CreateSightingDto,
    SightingResponseDto,
    DismissSightingDto,
} from './dto';

@Injectable()
export class SightingService {
    private readonly logger = new Logger(SightingService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService,
    ) { }

    /**
     * Create a new sighting report
     * Validates alert exists and is ACTIVE, inserts with PostGIS geometry
     */
    async create(
        dto: CreateSightingDto,
        reporterId: string,
    ): Promise<SightingResponseDto> {
        // Verify alert exists and is ACTIVE
        const alert = await this.prisma.alert.findUnique({
            where: { id: dto.alert_id },
            select: { id: true, status: true, creator_id: true },
        });

        if (!alert) {
            throw new NotFoundException(`Alert with ID ${dto.alert_id} not found`);
        }

        if (alert.status !== AlertStatus.ACTIVE) {
            throw new BadRequestException(
                `Cannot report sighting for ${alert.status.toLowerCase()} alert`,
            );
        }

        // Insert sighting using PostGIS for geometry
        const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO sightings (
        alert_id,
        reported_by,
        location_point,
        address,
        photo,
        notes,
        confidence,
        sighting_time,
        direction
      )
      VALUES (
        ${dto.alert_id}::text,
        ${reporterId}::text,
        ST_SetSRID(ST_MakePoint(${dto.location.longitude}, ${dto.location.latitude}), 4326),
        ${dto.location.address},
        ${dto.photo || null},
        ${dto.notes || null},
        ${dto.confidence}::"NotificationConfidence",
        ${new Date(dto.sighting_time)},
        ${dto.direction || null}
      )
      RETURNING id
    `;

        const sightingId = result[0].id;

        // Queue notification to alert creator about the sighting (Task 3.6)
        try {
            await this.notifyCreatorOfSighting(alert.creator_id, alertId, sightingId, dto);
        } catch (error) {
            this.logger.error(`Failed to queue sighting notification: ${error.message}`);
            // Don't fail the sighting creation if notification fails
        }

        // Fetch and return the created sighting
        const sighting = await this.prisma.sighting.findUnique({
            where: { id: sightingId },
        });

        return this.mapToResponseDto(sighting!);
    }

    /**
     * Find all sightings for a specific alert
     * Filters dismissed sightings unless requester is alert creator
     */
    async findByAlert(
        alertId: string,
        requesterId?: string,
    ): Promise<SightingResponseDto[]> {
        // Verify alert exists
        const alert = await this.prisma.alert.findUnique({
            where: { id: alertId },
            select: { id: true, creator_id: true },
        });

        if (!alert) {
            throw new NotFoundException(`Alert with ID ${alertId} not found`);
        }

        const isCreator = requesterId === alert.creator_id;

        // Build query with conditional filtering
        const whereClause: Prisma.SightingWhereInput = {
            alert_id: alertId,
        };

        // Non-creators cannot see dismissed sightings
        if (!isCreator) {
            whereClause.dismissed = false;
        }

        const sightings = await this.prisma.sighting.findMany({
            where: whereClause,
            orderBy: { sighting_time: 'desc' },
        });

        return sightings.map((s) => this.mapToResponseDto(s));
    }

    /**
     * Dismiss a sighting (only by alert creator)
     */
    async dismiss(
        sightingId: string,
        dto: DismissSightingDto,
        requesterId: string,
    ): Promise<SightingResponseDto> {
        // Fetch sighting with alert info
        const sighting = await this.prisma.sighting.findUnique({
            where: { id: sightingId },
            include: {
                alert: {
                    select: { creator_id: true },
                },
            },
        });

        if (!sighting) {
            throw new NotFoundException(`Sighting with ID ${sightingId} not found`);
        }

        // Verify requester is alert creator
        if (sighting.alert.creator_id !== requesterId) {
            throw new ForbiddenException(
                'Only the alert creator can dismiss sightings',
            );
        }

        // Already dismissed?
        if (sighting.dismissed) {
            throw new BadRequestException('Sighting is already dismissed');
        }

        // Update sighting
        const updated = await this.prisma.sighting.update({
            where: { id: sightingId },
            data: {
                dismissed: true,
                dismissed_at: new Date(),
                dismissed_reason: dto.reason,
            },
        });

        return this.mapToResponseDto(updated);
    }

    /**
     * Map Prisma Sighting to response DTO
     * Extracts lat/lon from PostGIS geometry
     */
    private mapToResponseDto(sighting: Sighting): SightingResponseDto {
        // Extract coordinates from PostGIS point
        // Note: Prisma returns Unsupported type as Buffer, need to query separately for coordinates
        return {
            id: sighting.id,
            alert_id: sighting.alert_id,
            reported_by: sighting.reported_by,
            latitude: 0, // Will be populated by controller using raw query
            longitude: 0, // Will be populated by controller using raw query
            address: sighting.address,
            photo: sighting.photo,
            notes: sighting.notes,
            confidence: sighting.confidence,
            sighting_time: sighting.sighting_time,
            direction: sighting.direction,
            dismissed: sighting.dismissed,
            dismissed_at: sighting.dismissed_at,
            dismissed_reason: sighting.dismissed_reason,
            created_at: sighting.created_at,
            updated_at: sighting.updated_at,
        };
    }

    /**
     * Helper to extract coordinates from PostGIS geometry
     */
    async enrichWithCoordinates(
        sightings: SightingResponseDto[],
    ): Promise<SightingResponseDto[]> {
        if (sightings.length === 0) return sightings;

        const ids = sightings.map((s) => s.id);

        // Fetch coordinates using PostGIS functions
        const coords = await this.prisma.$queryRaw<
            Array<{ id: string; latitude: number; longitude: number }>
        >`
      SELECT
        id,
        ST_Y(location_point) as latitude,
        ST_X(location_point) as longitude
      FROM sightings
      WHERE id = ANY(${ids}::text[])
    `;

        // Create lookup map
        const coordMap = new Map(coords.map((c) => [c.id, c]));

        // Enrich sightings with coordinates
        return sightings.map((sighting) => {
            const coord = coordMap.get(sighting.id);
            return {
                ...sighting,
                latitude: coord?.latitude || 0,
                longitude: coord?.longitude || 0,
            };
        });
    }

    /**
     * Queue notification to alert creator about new sighting
     * Task 3.6
     */
    private async notifyCreatorOfSighting(
        creatorId: number,
        alertId: number,
        sightingId: string,
        sightingData: CreateSightingDto,
    ): Promise<void> {
        this.logger.log(`Notifying alert creator ${creatorId} of sighting ${sightingId}`);

        // Fetch creator's device(s) with push tokens
        const devices = await this.prisma.device.findMany({
            where: {
                user_id: creatorId,
                push_token: { not: null },
            },
            select: {
                id: true,
                push_token: true,
                platform: true,
            },
        });

        if (devices.length === 0) {
            this.logger.warn(`Alert creator ${creatorId} has no devices with push tokens`);
            return;
        }

        // Queue individual notifications for each device
        for (const device of devices) {
            try {
                const notification = await this.prisma.notification.create({
                    data: {
                        alert_id: alertId,
                        device_id: device.id,
                        confidence: sightingData.confidence,
                        match_reason: `Sighting reported at ${sightingData.location.address || 'unknown location'}`,
                        distance_km: 0, // Not applicable for sighting notifications
                        status: 'QUEUED',
                    },
                });

                // Queue push notification job
                await this.notificationService.queueAlertNotifications(alertId);

                this.logger.log(`Queued sighting notification ${notification.id} for device ${device.id}`);
            } catch (error) {
                this.logger.error(`Failed to queue notification for device ${device.id}:`, error);
            }
        }
    }

    /**
     * Update sighting photo URL
     * Task 7.7
     */
    async updatePhoto(sightingId: string, photoUrl: string): Promise<void> {
        await this.prisma.sighting.update({
            where: { id: sightingId },
            data: { photo_url: photoUrl },
        });

        this.logger.log(`Updated photo for sighting ${sightingId}`);
    }
}
