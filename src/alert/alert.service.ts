import { Injectable, NotFoundException, ForbiddenException, UnprocessableEntityException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, AlertStatus, PetSpecies } from '../generated/prisma';
import { PrismaService } from '../services/prisma.service';
import { CreateAlertDto, UpdateAlertDto, ResolveAlertDto, ListAlertsQueryDto, AlertResponseDto } from './dto';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class AlertService {
    private readonly logger = new Logger(AlertService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly rateLimitService: RateLimitService,
    ) { }

    /**
     * Create a new missing pet alert
     * Task 2.3
     */
    async create(userId: number, dto: CreateAlertDto): Promise<AlertResponseDto> {
        this.logger.log(`Creating alert for user ${userId}, pet: ${dto.pet.name}`);

        // Check rate limits (Task 2.9)
        await this.rateLimitService.checkAlertCreationLimit(userId);

        // Calculate expires_at (7 days from now)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Convert lastSeenTime string to Date
        const timeLastSeen = new Date(dto.location.lastSeenTime);

        // Insert alert using Prisma raw query with PostGIS ST_MakePoint
        const result = await this.prisma.$queryRaw<Array<{ id: number }>>`
            INSERT INTO alert (
                creator_id, pet_name, pet_species, pet_breed, pet_description, pet_color, pet_age_years, pet_photos,
                last_seen_lat, last_seen_lon, location_point, location_address, alert_radius_km,
                status, time_last_seen, created_at, updated_at, expires_at,
                contact_phone, contact_email, is_phone_public,
                reward_offered, reward_amount, notes
            ) VALUES (
                ${userId},
                ${dto.pet.name},
                ${dto.pet.species}::\"PetSpecies\",
                ${dto.pet.breed || null},
                ${dto.pet.description},
                ${dto.pet.color || null},
                ${dto.pet.ageYears || null},
                ${dto.pet.photos || []}::TEXT[],
                ${dto.location.lat},
                ${dto.location.lon},
                ST_SetSRID(ST_MakePoint(${dto.location.lon}, ${dto.location.lat}), 4326),
                ${dto.location.address || null},
                ${dto.location.radiusKm},
                'ACTIVE'::\"AlertStatus\",
                ${timeLastSeen},
                NOW(),
                NOW(),
                ${expiresAt},
                ${dto.contact.phone || null},
                ${dto.contact.email || null},
                ${dto.contact.isPhonePublic},
                ${dto.reward?.offered || false},
                ${dto.reward?.amount || null},
                ${dto.notes || null}
            )
            RETURNING id;
        `;

        const alertId = result[0].id;
        this.logger.log(`Alert created with ID: ${alertId}`);

        // TODO: Queue background job to pre-compute affected postal codes
        // TODO: Queue notification targeting job (BullMQ)

        // Fetch and return the created alert
        return this.findById(alertId, userId);
    }

    /**
     * Find alert by ID
     * Task 2.4
     */
    async findById(alertId: number, requesterId?: number): Promise<AlertResponseDto | null> {
        const alert = await this.prisma.alert.findUnique({
            where: { id: alertId },
            include: {
                sightings: {
                    where: { dismissed: false },
                    orderBy: { sightingTime: 'desc' },
                },
            },
        });

        if (!alert) {
            return null;
        }

        return this.mapToResponseDto(alert, requesterId);
    }

    /**
     * Find nearby alerts using geospatial query
     * Task 2.5
     */
    async findNearby(query: ListAlertsQueryDto): Promise<AlertResponseDto[]> {
        const {
            lat,
            lon,
            radiusKm = 10,
            species,
            status = AlertStatus.ACTIVE,
            postalCode,
            limit = 20,
            offset = 0,
        } = query;

        // Build the WHERE conditions
        const conditions: string[] = ['status = $1::\"AlertStatus\"'];
        const params: any[] = [status];
        let paramIndex = 2;

        if (species) {
            conditions.push(`pet_species = $${paramIndex}::\"PetSpecies\"`);
            params.push(species);
            paramIndex++;
        }

        // Geospatial condition
        if (lat !== undefined && lon !== undefined) {
            conditions.push(`ST_DWithin(
                location_point::geography,
                ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography,
                $${paramIndex + 2} * 1000
            )`);
            params.push(lon, lat, radiusKm);
            paramIndex += 3;
        } else if (postalCode) {
            conditions.push(`$${paramIndex} = ANY(affected_postal_codes)`);
            params.push(postalCode);
            paramIndex++;
        }

        const whereClause = conditions.join(' AND ');

        // Build ORDER BY and distance calculation
        let orderBy = 'created_at DESC';
        let distanceSelect = 'NULL as distance_km';

        if (lat !== undefined && lon !== undefined) {
            const lonIndex = params.indexOf(lon) + 1;
            const latIndex = params.indexOf(lat) + 1;
            distanceSelect = `ST_Distance(
                location_point::geography,
                ST_SetSRID(ST_MakePoint($${lonIndex}, $${latIndex}), 4326)::geography
            ) / 1000 as distance_km`;
            orderBy = 'distance_km ASC';
        }

        // Execute query
        const alerts = await this.prisma.$queryRaw<any[]>`
            SELECT 
                id, creator_id, pet_name, pet_species, pet_breed, pet_description, pet_color, pet_age_years, pet_photos,
                last_seen_lat, last_seen_lon, location_address, alert_radius_km,
                status, time_last_seen, created_at, updated_at, expires_at, resolved_at, renewal_count,
                contact_phone, contact_email, is_phone_public,
                affected_postal_codes, notes, reward_offered, reward_amount,
                ${Prisma.raw(distanceSelect)}
            FROM alert
            WHERE ${Prisma.raw(whereClause)}
            ORDER BY ${Prisma.raw(orderBy)}
            LIMIT ${limit}
            OFFSET ${offset};
        `;

        return alerts.map(alert => this.mapRawToResponseDto(alert));
    }

    /**
     * Update an existing alert
     * Task 2.6
     */
    async update(alertId: number, userId: number, dto: UpdateAlertDto): Promise<AlertResponseDto> {
        // Verify ownership
        const alert = await this.prisma.alert.findUnique({
            where: { id: alertId },
        });

        if (!alert) {
            throw new NotFoundException(`Alert with ID ${alertId} not found`);
        }

        if (alert.creatorId !== userId) {
            throw new ForbiddenException('You do not have permission to update this alert');
        }

        // Build update data (only allowed fields)
        const updateData: any = {
            updatedAt: new Date(),
        };

        if (dto.petDescription !== undefined) {
            updateData.petDescription = dto.petDescription;
        }

        if (dto.petPhotos !== undefined && dto.petPhotos.length > 0) {
            // Append new photos to existing ones
            updateData.petPhotos = [...alert.petPhotos, ...dto.petPhotos];
        }

        if (dto.contactPhone !== undefined) {
            updateData.contactPhone = dto.contactPhone;
        }

        if (dto.contactEmail !== undefined) {
            updateData.contactEmail = dto.contactEmail;
        }

        if (dto.notes !== undefined) {
            updateData.notes = dto.notes;
        }

        // Update the alert
        await this.prisma.alert.update({
            where: { id: alertId },
            data: updateData,
        });

        this.logger.log(`Alert ${alertId} updated by user ${userId}`);

        return this.findById(alertId, userId);
    }

    /**
     * Resolve an alert (pet found)
     * Task 2.7
     */
    async resolve(alertId: number, userId: number, dto: ResolveAlertDto): Promise<AlertResponseDto> {
        // Verify ownership
        const alert = await this.prisma.alert.findUnique({
            where: { id: alertId },
        });

        if (!alert) {
            throw new NotFoundException(`Alert with ID ${alertId} not found`);
        }

        if (alert.creatorId !== userId) {
            throw new ForbiddenException('You do not have permission to resolve this alert');
        }

        if (alert.status === AlertStatus.RESOLVED) {
            throw new UnprocessableEntityException('Alert is already resolved');
        }

        // Update alert status to RESOLVED
        const resolutionNotes = dto.notes || `Pet found! Outcome: ${dto.outcome}`;

        await this.prisma.alert.update({
            where: { id: alertId },
            data: {
                status: AlertStatus.RESOLVED,
                resolvedAt: new Date(),
                notes: resolutionNotes,
            },
        });

        this.logger.log(`Alert ${alertId} resolved by user ${userId} with outcome: ${dto.outcome}`);

        // TODO: Cancel any queued notifications (BullMQ)
        // TODO: Queue resolution notifications to sighting reporters
        // TODO: Log audit event

        return this.findById(alertId, userId);
    }

    /**
     * Renew an alert (extend expiration)
     * Task 2.8
     */
    async renew(alertId: number, userId: number): Promise<AlertResponseDto> {
        // Verify ownership
        const alert = await this.prisma.alert.findUnique({
            where: { id: alertId },
        });

        if (!alert) {
            throw new NotFoundException(`Alert with ID ${alertId} not found`);
        }

        if (alert.creatorId !== userId) {
            throw new ForbiddenException('You do not have permission to renew this alert');
        }

        if (alert.renewalCount >= 3) {
            throw new UnprocessableEntityException('Maximum renewal limit (3) reached');
        }

        // Extend expires_at by 7 days from now
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + 7);

        await this.prisma.alert.update({
            where: { id: alertId },
            data: {
                expiresAt: newExpiresAt,
                renewalCount: alert.renewalCount + 1,
                updatedAt: new Date(),
            },
        });

        this.logger.log(`Alert ${alertId} renewed by user ${userId}. Renewal count: ${alert.renewalCount + 1}/3`);

        return this.findById(alertId, userId);
    }

    /**
     * Map database alert to response DTO
     */
    private mapToResponseDto(alert: any, requesterId?: number): AlertResponseDto {
        const isCreator = requesterId === alert.creatorId;

        return {
            id: alert.id,
            creatorId: alert.creatorId,
            petName: alert.petName,
            petSpecies: alert.petSpecies,
            petBreed: alert.petBreed,
            petDescription: alert.petDescription,
            petColor: alert.petColor,
            petAgeYears: alert.petAgeYears,
            petPhotos: alert.petPhotos,
            lastSeenLat: alert.lastSeenLat,
            lastSeenLon: alert.lastSeenLon,
            locationAddress: alert.locationAddress,
            alertRadiusKm: alert.alertRadiusKm,
            status: alert.status,
            timeLastSeen: alert.timeLastSeen,
            createdAt: alert.createdAt,
            updatedAt: alert.updatedAt,
            expiresAt: alert.expiresAt,
            resolvedAt: alert.resolvedAt,
            renewalCount: alert.renewalCount,
            // Contact info visibility
            contactPhone: isCreator || alert.isPhonePublic ? alert.contactPhone : undefined,
            contactEmail: isCreator ? alert.contactEmail : undefined,
            isPhonePublic: alert.isPhonePublic,
            affectedPostalCodes: alert.affectedPostalCodes,
            notes: alert.notes,
            rewardOffered: alert.rewardOffered,
            rewardAmount: alert.rewardAmount ? parseFloat(alert.rewardAmount) : undefined,
            sightingCount: alert.sightings?.length || 0,
        };
    }

    /**
     * Map raw query result to response DTO
     */
    private mapRawToResponseDto(alert: any): AlertResponseDto {
        return {
            id: alert.id,
            creatorId: alert.creator_id,
            petName: alert.pet_name,
            petSpecies: alert.pet_species,
            petBreed: alert.pet_breed,
            petDescription: alert.pet_description,
            petColor: alert.pet_color,
            petAgeYears: alert.pet_age_years,
            petPhotos: alert.pet_photos,
            lastSeenLat: alert.last_seen_lat,
            lastSeenLon: alert.last_seen_lon,
            locationAddress: alert.location_address,
            alertRadiusKm: alert.alert_radius_km,
            status: alert.status,
            timeLastSeen: alert.time_last_seen,
            createdAt: alert.created_at,
            updatedAt: alert.updated_at,
            expiresAt: alert.expires_at,
            resolvedAt: alert.resolved_at,
            renewalCount: alert.renewal_count,
            contactPhone: alert.is_phone_public ? alert.contact_phone : undefined,
            contactEmail: undefined, // Never expose in list view
            isPhonePublic: alert.is_phone_public,
            affectedPostalCodes: alert.affected_postal_codes,
            notes: alert.notes,
            rewardOffered: alert.reward_offered,
            rewardAmount: alert.reward_amount ? parseFloat(alert.reward_amount) : undefined,
            distanceKm: alert.distance_km ? parseFloat(alert.distance_km) : undefined,
        };
    }

    /**
     * Add photos to an existing alert
     * Task 7.7
     */
    async addPhotos(alertId: number, userId: number, photoUrls: string[]): Promise<void> {
        // Verify ownership
        const alert = await this.findById(alertId, userId);
        if (!alert) {
            throw new NotFoundException(`Alert with ID ${alertId} not found`);
        }

        // Append new photos to existing ones
        await this.prisma.$executeRaw`
            UPDATE alert
            SET pet_photos = array_cat(pet_photos, ${photoUrls}::TEXT[]),
                updated_at = NOW()
            WHERE id = ${alertId}
        `;

        this.logger.log(`Added ${photoUrls.length} photo(s) to alert ${alertId}`);
    }

    /**
     * Check and expire alerts that have passed their expiration date
     * Task 2.10 - Runs every hour via cron
     */
    @Cron(CronExpression.EVERY_HOUR)
    async checkExpired(): Promise<void> {
        this.logger.log('Running alert expiration check...');

        try {
            const result = await this.prisma.$executeRaw`
                UPDATE alert
                SET status = 'EXPIRED'::\"AlertStatus\",
                    updated_at = NOW()
                WHERE expires_at < NOW()
                  AND status = 'ACTIVE'::\"AlertStatus\"
            `;

            if (result > 0) {
                this.logger.log(`Expired ${result} alert(s)`);

                // TODO: Cancel queued notifications for expired alerts
                // This will be implemented when we add notification cancellation logic
            } else {
                this.logger.debug('No alerts to expire');
            }
        } catch (error) {
            this.logger.error('Error checking expired alerts:', error);
        }
    }
}

