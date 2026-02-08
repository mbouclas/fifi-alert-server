import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, AlertStatus, PetSpecies } from '../generated/prisma';
import { PrismaService } from '../services/prisma.service';
import {
  CreateAlertDto,
  UpdateAlertDto,
  ResolveAlertDto,
  ListAlertsQueryDto,
  AlertResponseDto,
} from './dto';
import { RateLimitService } from './rate-limit.service';
import { AUDIT_EVENT_NAMES } from '../audit/audit-event-names';
import { IAuditEventPayload } from '../audit/interfaces/audit-event-payload.interface';
import { EmailService, IEmailTemplate } from '@shared/email/email.service';
import type { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';

/**
 * Email template registry for alert-related emails
 */
const alertServiceEmailTemplates: Record<string, IEmailTemplate> = {
  alertCreated: {
    subject: 'Your Pet Alert Has Been Created',
    file: 'notifications/email/alert/alertCreated.njk',
  },
  alertPublished: {
    subject: 'Your Pet Alert is Now Live',
    file: 'notifications/email/alert/alertPublished.njk',
  },
  alertResolved: {
    subject: 'Pet Alert Resolved',
    file: 'notifications/email/alert/alertResolved.njk',
  },
  alertNearYou: {
    subject: 'New Pet Alert Near You',
    file: 'notifications/email/alert/newAlert.njk',
  },
};

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimitService: RateLimitService,
    private readonly eventEmitter: EventEmitter2,
    @Inject('IEmailProvider') private readonly emailProvider: IEmailProvider,
  ) { }

  /**
   * Create a new missing pet alert
   * Task 2.3
   */
  async create(userId: number, dto: CreateAlertDto): Promise<AlertResponseDto> {
    this.logger.log(`Creating alert for user ${userId}, pet: ${dto.pet.name}`);

    // Check rate limits (Task 2.9)
    await this.rateLimitService.checkAlertCreationLimit(userId);

    // Validate petId if provided
    if (dto.petId) {
      const pet = await this.prisma.pet.findUnique({
        where: { id: dto.petId },
      });

      if (!pet) {
        throw new NotFoundException(`Pet with ID ${dto.petId} not found`);
      }

      if (pet.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to create alerts for this pet',
        );
      }

      // Optional: Auto-mark pet as missing when alert is created
      if (!pet.isMissing) {
        await this.prisma.pet.update({
          where: { id: dto.petId },
          data: { isMissing: true },
        });
        this.logger.log(`Pet ${dto.petId} automatically marked as missing`);
      }
    }

    // Calculate expires_at (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Convert lastSeenTime string to Date
    const timeLastSeen = new Date(dto.location.lastSeenTime);

    // Insert alert using Prisma raw query with PostGIS ST_MakePoint
    const result = await this.prisma.$queryRaw<Array<{ id: number }>>`
            INSERT INTO alert (
                creator_id, pet_id, pet_name, pet_species, pet_breed, pet_description, pet_color, pet_age_years, pet_photos,
                last_seen_lat, last_seen_lon, location_point, location_address, alert_radius_km,
                status, time_last_seen, created_at, updated_at, expires_at,
                contact_phone, contact_email, is_phone_public,
                reward_offered, reward_amount, notes
            ) VALUES (
                ${userId},
                ${dto.petId || null},
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

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'CREATE',
        entityType: 'ALERT',
        entityId: alertId,
        userId: userId,
        action: 'alert_created',
        description: `Created alert for missing ${dto.pet.species}: ${dto.pet.name}`,
        newValues: {
          petId: dto.petId,
          petName: dto.pet.name,
          petSpecies: dto.pet.species,
          location: { lat: dto.location.lat, lon: dto.location.lon },
          radiusKm: dto.location.radiusKm,
          status: 'ACTIVE',
        },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, auditPayload);
    } catch (error) {
      this.logger.error(
        'Failed to emit audit event for alert creation:',
        error,
      );
    }

    // TODO: Queue background job to pre-compute affected postal codes
    // TODO: Queue notification targeting job (BullMQ)

    // Fetch and return the created alert
    const createdAlert = await this.findById(alertId, userId);

    // Send alert created confirmation email (non-blocking)
    if (createdAlert) {
      try {
        await this.sendAlertCreatedEmail(createdAlert);
      } catch (error) {
        this.logger.error(
          `Alert created email send failed for alert ${alertId} but alert creation succeeded:`,
          error,
        );
      }
    }

    return createdAlert;
  }

  /**
   * Find alert by ID
   * Task 2.4
   */
  async findById(
    alertId: number,
    requesterId?: number,
  ): Promise<AlertResponseDto | null> {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        sightings: {
          where: { dismissed: false },
          orderBy: { sighting_time: 'desc' },
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
    const sqlQuery = `
            SELECT 
                id, creator_id, pet_id, pet_name, pet_species, pet_breed, pet_description, pet_color, pet_age_years, pet_photos,
                last_seen_lat, last_seen_lon, location_address, alert_radius_km,
                status, time_last_seen, created_at, updated_at, expires_at, resolved_at, renewal_count,
                contact_phone, contact_email, is_phone_public,
                affected_postal_codes, notes, reward_offered, reward_amount,
                ${distanceSelect}
            FROM alert
            WHERE ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ${limit}
            OFFSET ${offset}
        `;

    const alerts = await this.prisma.$queryRawUnsafe<any[]>(
      sqlQuery,
      ...params,
    );

    return alerts.map((alert) => this.mapRawToResponseDto(alert));
  }

  /**
   * Update an existing alert
   * Task 2.6
   */
  async update(
    alertId: number,
    userId: number,
    dto: UpdateAlertDto,
  ): Promise<AlertResponseDto> {
    // Verify ownership
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException(`Alert with ID ${alertId} not found`);
    }

    if (alert.creator_id !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this alert',
      );
    }

    // Capture oldValues for audit
    const oldValues: any = {
      petDescription: alert.pet_description,
      petPhotos: alert.pet_photos,
      contactPhone: alert.contact_phone,
      contactEmail: alert.contact_email,
      notes: alert.notes,
    };

    // Build update data (only allowed fields)
    const updateData: any = {
      updated_at: new Date(),
    };

    if (dto.petDescription !== undefined) {
      updateData.pet_description = dto.petDescription;
    }

    if (dto.petPhotos !== undefined && dto.petPhotos.length > 0) {
      // Append new photos to existing ones
      updateData.pet_photos = [...alert.pet_photos, ...dto.petPhotos];
    }

    if (dto.contactPhone !== undefined) {
      updateData.contact_phone = dto.contactPhone;
    }

    if (dto.contactEmail !== undefined) {
      updateData.contact_email = dto.contactEmail;
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

    // Emit audit event
    try {
      const newValues: any = {};
      if (dto.petDescription !== undefined)
        newValues.petDescription = dto.petDescription;
      if (dto.petPhotos !== undefined)
        newValues.petPhotos = updateData.pet_photos;
      if (dto.contactPhone !== undefined)
        newValues.contactPhone = dto.contactPhone;
      if (dto.contactEmail !== undefined)
        newValues.contactEmail = dto.contactEmail;
      if (dto.notes !== undefined) newValues.notes = dto.notes;

      const auditPayload: IAuditEventPayload = {
        eventType: 'UPDATE',
        entityType: 'ALERT',
        entityId: alertId,
        userId: userId,
        action: 'alert_updated',
        description: `Updated alert #${alertId}`,
        oldValues,
        newValues,
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
    } catch (error) {
      this.logger.error('Failed to emit audit event for alert update:', error);
    }

    return this.findById(alertId, userId);
  }

  /**
   * Resolve an alert (pet found)
   * Task 2.7
   */
  async resolve(
    alertId: number,
    userId: number,
    dto: ResolveAlertDto,
  ): Promise<AlertResponseDto> {
    // Verify ownership
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException(`Alert with ID ${alertId} not found`);
    }

    if (alert.creator_id !== userId) {
      throw new ForbiddenException(
        'You do not have permission to resolve this alert',
      );
    }

    if (alert.status === AlertStatus.RESOLVED) {
      throw new UnprocessableEntityException('Alert is already resolved');
    }

    // Capture oldValues for audit
    const oldValues = {
      status: alert.status,
      resolvedAt: alert.resolved_at,
      notes: alert.notes,
    };

    // Update alert status to RESOLVED
    const resolutionNotes = dto.notes || `Pet found! Outcome: ${dto.outcome}`;

    await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.RESOLVED,
        resolved_at: new Date(),
        notes: resolutionNotes,
      },
    });

    this.logger.log(
      `Alert ${alertId} resolved by user ${userId} with outcome: ${dto.outcome}`,
    );

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'UPDATE',
        entityType: 'ALERT',
        entityId: alertId,
        userId: userId,
        action: 'alert_resolved',
        description: `Resolved alert #${alertId}: ${dto.outcome}`,
        oldValues,
        newValues: {
          status: 'RESOLVED',
          outcome: dto.outcome,
          notes: resolutionNotes,
        },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
    } catch (error) {
      this.logger.error(
        'Failed to emit audit event for alert resolution:',
        error,
      );
    }

    // TODO: Cancel any queued notifications (BullMQ)
    // TODO: Queue resolution notifications to sighting reporters

    // Fetch the resolved alert
    const resolvedAlert = await this.findById(alertId, userId);

    // Send alert resolved email (non-blocking)
    if (resolvedAlert) {
      try {
        await this.sendAlertResolvedEmail(resolvedAlert, dto.outcome);
      } catch (error) {
        this.logger.error(
          `Alert resolved email send failed for alert ${alertId} but alert resolution succeeded:`,
          error,
        );
      }
    }

    return resolvedAlert;
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

    if (alert.creator_id !== userId) {
      throw new ForbiddenException(
        'You do not have permission to renew this alert',
      );
    }

    if (alert.renewal_count >= 3) {
      throw new UnprocessableEntityException(
        'Maximum renewal limit (3) reached',
      );
    }

    // Capture oldValues for audit
    const oldValues = {
      expiresAt: alert.expires_at,
      renewalCount: alert.renewal_count,
    };

    // Extend expires_at by 7 days from now
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        expires_at: newExpiresAt,
        renewal_count: alert.renewal_count + 1,
        updated_at: new Date(),
      },
    });

    this.logger.log(
      `Alert ${alertId} renewed by user ${userId}. Renewal count: ${alert.renewal_count + 1}/3`,
    );

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'UPDATE',
        entityType: 'ALERT',
        entityId: alertId,
        userId: userId,
        action: 'alert_renewed',
        description: `Renewed alert #${alertId} (renewal ${alert.renewal_count + 1}/3)`,
        oldValues,
        newValues: {
          expiresAt: newExpiresAt,
          renewalCount: alert.renewal_count + 1,
        },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
    } catch (error) {
      this.logger.error('Failed to emit audit event for alert renewal:', error);
    }

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
      petId: alert.petId,
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
      contactPhone:
        isCreator || alert.isPhonePublic ? alert.contactPhone : undefined,
      contactEmail: isCreator ? alert.contactEmail : undefined,
      isPhonePublic: alert.isPhonePublic,
      affectedPostalCodes: alert.affectedPostalCodes,
      notes: alert.notes,
      rewardOffered: alert.rewardOffered,
      rewardAmount: alert.rewardAmount
        ? parseFloat(alert.rewardAmount)
        : undefined,
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
      petId: alert.pet_id,
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
      rewardAmount: alert.reward_amount
        ? parseFloat(alert.reward_amount)
        : undefined,
      distanceKm: alert.distance_km ? parseFloat(alert.distance_km) : undefined,
    };
  }

  /**
   * Add photos to an existing alert
   * Task 7.7
   */
  async addPhotos(
    alertId: number,
    userId: number,
    photoUrls: string[],
  ): Promise<void> {
    // Verify ownership
    const alert = await this.findById(alertId, userId);
    if (!alert) {
      throw new NotFoundException(`Alert with ID ${alertId} not found`);
    }

    // Get current photos for oldValues
    const currentAlert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      select: { pet_photos: true },
    });

    const oldPhotos = currentAlert?.pet_photos || [];

    // Append new photos to existing ones
    await this.prisma.$executeRaw`
            UPDATE alert
            SET pet_photos = array_cat(pet_photos, ${photoUrls}::TEXT[]),
                updated_at = NOW()
            WHERE id = ${alertId}
        `;

    this.logger.log(`Added ${photoUrls.length} photo(s) to alert ${alertId}`);

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'UPDATE',
        entityType: 'ALERT',
        entityId: alertId,
        userId: userId,
        action: 'alert_photos_added',
        description: `Added ${photoUrls.length} photo(s) to alert #${alertId}`,
        oldValues: { photoCount: oldPhotos.length },
        newValues: { photoCount: oldPhotos.length + photoUrls.length },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
    } catch (error) {
      this.logger.error(
        'Failed to emit audit event for photo addition:',
        error,
      );
    }
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

        // Emit audit event for system operation
        try {
          const auditPayload: IAuditEventPayload = {
            eventType: 'SYSTEM',
            entityType: 'SYSTEM',
            action: 'alert_expiration_cron',
            description: `Cron job expired ${result} alert(s)`,
            metadata: { expiredCount: result },
            success: true,
          };
          this.eventEmitter.emit(
            AUDIT_EVENT_NAMES.SYSTEM.CRON_EXECUTED,
            auditPayload,
          );
        } catch (error) {
          this.logger.error(
            'Failed to emit audit event for expiration cron:',
            error,
          );
        }

        // TODO: Cancel queued notifications for expired alerts
        // This will be implemented when we add notification cancellation logic
      } else {
        this.logger.debug('No alerts to expire');
      }
    } catch (error) {
      this.logger.error('Error checking expired alerts:', error);

      // Emit audit event for failure
      try {
        const auditPayload: IAuditEventPayload = {
          eventType: 'FAILURE',
          entityType: 'SYSTEM',
          action: 'alert_expiration_cron_failed',
          description: 'Failed to expire alerts (cron job)',
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          success: false,
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.SYSTEM.ERROR, auditPayload);
      } catch (auditError) {
        this.logger.error(
          'Failed to emit audit event for cron failure:',
          auditError,
        );
      }
    }
  }

  // ============================================================
  // Email Methods
  // ============================================================

  /**
   * Send alert created confirmation email to alert creator
   * @param alert Created alert with creator information
   * @returns Success message
   */
  async sendAlertCreatedEmail(alert: AlertResponseDto): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Sending alert created email for alert ${alert.id}`);

    // Get user information
    const user = await this.prisma.user.findUnique({
      where: { id: alert.creatorId },
    });

    if (!user) {
      this.logger.warn(`Cannot send alert created email - user ${alert.creatorId} not found`);
      throw new Error('USER_NOT_FOUND');
    }

    // Instantiate EmailService with local templates
    const emailService = new EmailService(
      this.emailProvider,
      this.eventEmitter,
      alertServiceEmailTemplates,
    );

    try {
      await emailService.sendHtml('alertCreated', {
        from: String(process.env.MAIL_NOTIFICATIONS_FROM),
        to: user.email,
        templateData: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
          },
          alert: {
            id: alert.id,
            petName: alert.pet.name,
            petSpecies: alert.pet.species,
            petBreed: alert.pet.breed,
            location: alert.location.address,
            radiusKm: alert.location.radiusKm,
            status: alert.status,
          },
          appUrl: process.env.APP_URL || 'https://fifi-alert.com',
        },
      });

      this.logger.log(`Alert created email sent successfully for alert ${alert.id}`);

      return {
        success: true,
        message: `Alert created email sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(`Failed to send alert created email for alert ${alert.id}:`, error);
      throw new Error('FAILED_TO_SEND_ALERT_CREATED_EMAIL');
    }
  }

  /**
   * Send alert resolved confirmation email to alert creator
   * @param alert Resolved alert with creator information
   * @param outcome Resolution outcome (e.g., 'FOUND', 'FALSE_ALARM')
   * @returns Success message
   */
  async sendAlertResolvedEmail(
    alert: AlertResponseDto,
    outcome: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Sending alert resolved email for alert ${alert.id}`);

    // Get user information
    const user = await this.prisma.user.findUnique({
      where: { id: alert.creatorId },
    });

    if (!user) {
      this.logger.warn(`Cannot send alert resolved email - user ${alert.creatorId} not found`);
      throw new Error('USER_NOT_FOUND');
    }

    // Instantiate EmailService with local templates
    const emailService = new EmailService(
      this.emailProvider,
      this.eventEmitter,
      alertServiceEmailTemplates,
    );

    try {
      await emailService.sendHtml('alertResolved', {
        from: String(process.env.MAIL_NOTIFICATIONS_FROM),
        to: user.email,
        templateData: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
          },
          alert: {
            id: alert.id,
            petName: alert.pet.name,
            petSpecies: alert.pet.species,
            outcome,
            resolvedAt: alert.resolvedAt,
          },
          appUrl: process.env.APP_URL || 'https://fifi-alert.com',
        },
      });

      this.logger.log(`Alert resolved email sent successfully for alert ${alert.id}`);

      return {
        success: true,
        message: `Alert resolved email sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(`Failed to send alert resolved email for alert ${alert.id}:`, error);
      throw new Error('FAILED_TO_SEND_ALERT_RESOLVED_EMAIL');
    }
  }

  /**
   * Send alert notification to nearby users (batch)
   * @param userIds Array of user IDs to notify
   * @param alert Alert information to send
   * @returns Summary of send results
   */
  async sendAlertNearYouEmails(
    userIds: number[],
    alert: AlertResponseDto,
  ): Promise<{ success: number; failed: number }> {
    this.logger.log(`Sending alert near you emails to ${userIds.length} users for alert ${alert.id}`);

    // Get all users
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
    });

    if (users.length === 0) {
      this.logger.warn('No users found to send alert notifications');
      return { success: 0, failed: 0 };
    }

    // Instantiate EmailService with local templates
    const emailService = new EmailService(
      this.emailProvider,
      this.eventEmitter,
      alertServiceEmailTemplates,
    );

    let successCount = 0;
    let failedCount = 0;

    // Send emails in parallel
    const emailPromises = users.map(async (user) => {
      try {
        await emailService.sendHtml('alertNearYou', {
          from: String(process.env.MAIL_NOTIFICATIONS_FROM),
          to: user.email,
          templateData: {
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              name: user.name,
            },
            alert: {
              id: alert.id,
              petName: alert.pet.name,
              petSpecies: alert.pet.species,
              petBreed: alert.pet.breed,
              petDescription: alert.pet.description,
              location: alert.location.address,
              radiusKm: alert.location.radiusKm,
              photos: alert.pet.photos,
              rewardOffered: alert.reward?.offered,
              rewardAmount: alert.reward?.amount,
            },
            appUrl: process.env.APP_URL || 'https://fifi-alert.com',
          },
        });
        successCount++;
      } catch (error) {
        this.logger.error(`Failed to send alert notification to user ${user.id}:`, error);
        failedCount++;
      }
    });

    await Promise.all(emailPromises);

    this.logger.log(
      `Alert notification batch completed: ${successCount} sent, ${failedCount} failed`,
    );

    return { success: successCount, failed: failedCount };
  }
}
