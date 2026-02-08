import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../services/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { Prisma, AlertStatus, Sighting } from '@prisma/client';
import {
  CreateSightingDto,
  SightingResponseDto,
  DismissSightingDto,
} from './dto';
import { AUDIT_EVENT_NAMES } from '../audit/audit-event-names';
import { IAuditEventPayload } from '../audit/interfaces/audit-event-payload.interface';
import { EmailService, IEmailTemplate } from '@shared/email/email.service';
import type { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';

/**
 * Email template registry for sighting-related emails
 */
const sightingServiceEmailTemplates: Record<string, IEmailTemplate> = {
  sightingReported: {
    subject: 'New Sighting Reported for Your Alert',
    file: 'notifications/email/sighting/sightingReported.njk',
  },
  sightingConfirmed: {
    subject: 'Sighting Confirmed - Action Required',
    file: 'notifications/email/sighting/sightingConfirmed.njk',
  },
  sightingDismissed: {
    subject: 'Sighting Report Update',
    file: 'notifications/email/sighting/sightingDismissed.njk',
  },
};

@Injectable()
export class SightingService {
  private readonly logger = new Logger(SightingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly eventEmitter: EventEmitter2,
    @Inject('IEmailProvider') private readonly emailProvider: IEmailProvider,
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

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'CREATE',
        entityType: 'SIGHTING',
        entityId: parseInt(sightingId, 10),
        userId: parseInt(reporterId, 10),
        action: 'sighting_reported',
        description: `Sighting reported for alert #${dto.alert_id}`,
        newValues: {
          alertId: dto.alert_id,
          confidence: dto.confidence,
          location: { lat: dto.location.latitude, lon: dto.location.longitude },
          sightingTime: dto.sighting_time,
        },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, auditPayload);
    } catch (error) {
      this.logger.error(
        'Failed to emit audit event for sighting creation:',
        error,
      );
    }

    // Queue notification to alert creator about the sighting (Task 3.6)
    try {
      await this.notifyCreatorOfSighting(
        alert.creator_id,
        dto.alert_id,
        sightingId,
        dto,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue sighting notification: ${error.message}`,
      );
      // Don't fail the sighting creation if notification fails
    }

    // Fetch and return the created sighting
    const sighting = await this.prisma.sighting.findUnique({
      where: { id: sightingId },
    });

    const sightingResponse = this.mapToResponseDto(sighting!);

    // Enrich with coordinates for email
    const enrichedSightings = await this.enrichWithCoordinates([sightingResponse]);
    const enrichedSighting = enrichedSightings[0];

    // Send sighting reported email to alert creator (non-blocking)
    try {
      await this.sendSightingReportedEmail(
        alert.creator_id,
        dto.alert_id,
        enrichedSighting,
      );
    } catch (error) {
      this.logger.error(
        `Sighting reported email send failed for alert ${dto.alert_id} but sighting creation succeeded:`,
        error,
      );
    }

    return enrichedSighting;
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
    if (sighting.alert.creator_id !== parseInt(requesterId, 10)) {
      throw new ForbiddenException(
        'Only the alert creator can dismiss sightings',
      );
    }

    // Already dismissed?
    if (sighting.dismissed) {
      throw new BadRequestException('Sighting is already dismissed');
    }

    // Capture oldValues for audit
    const oldValues = {
      dismissed: sighting.dismissed,
      dismissedAt: sighting.dismissed_at,
      dismissedReason: sighting.dismissed_reason,
    };

    // Update sighting
    const updated = await this.prisma.sighting.update({
      where: { id: sightingId },
      data: {
        dismissed: true,
        dismissed_at: new Date(),
        dismissed_reason: dto.reason,
      },
    });

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'UPDATE',
        entityType: 'SIGHTING',
        entityId: parseInt(sightingId, 10),
        userId: parseInt(requesterId, 10),
        action: 'sighting_dismissed',
        description: `Dismissed sighting #${sightingId}: ${dto.reason}`,
        oldValues,
        newValues: {
          dismissed: true,
          dismissedReason: dto.reason,
        },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
    } catch (error) {
      this.logger.error(
        'Failed to emit audit event for sighting dismissal:',
        error,
      );
    }

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
    this.logger.log(
      `Notifying alert creator ${creatorId} of sighting ${sightingId}`,
    );

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
      this.logger.warn(
        `Alert creator ${creatorId} has no devices with push tokens`,
      );
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

        this.logger.log(
          `Queued sighting notification ${notification.id} for device ${device.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to queue notification for device ${device.id}:`,
          error,
        );
      }
    }
  }

  /**
   * Update sighting photo URL
   * Task 7.7
   */
  async updatePhoto(
    sightingId: string,
    photoUrl: string,
    userId?: number,
  ): Promise<void> {
    // Get old photo for audit
    const sighting = await this.prisma.sighting.findUnique({
      where: { id: sightingId },
      select: { photo_url: true, reported_by: true },
    });

    const oldPhotoUrl = sighting?.photo_url;

    await this.prisma.sighting.update({
      where: { id: sightingId },
      data: { photo_url: photoUrl },
    });

    this.logger.log(`Updated photo for sighting ${sightingId}`);

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'UPDATE',
        entityType: 'SIGHTING',
        entityId: parseInt(sightingId, 10),
        userId:
          userId || (sighting ? parseInt(sighting.reported_by, 10) : undefined),
        action: 'sighting_photo_updated',
        description: `Updated photo for sighting #${sightingId}`,
        oldValues: { photoUrl: oldPhotoUrl },
        newValues: { photoUrl },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
    } catch (error) {
      this.logger.error('Failed to emit audit event for photo update:', error);
    }
  }

  // ============================================================
  // Email Methods
  // ============================================================

  /**
   * Send sighting reported email to alert creator
   * @param alertCreatorId ID of the alert creator
   * @param alertId ID of the alert
   * @param sighting Sighting information
   * @returns Success message
   */
  async sendSightingReportedEmail(
    alertCreatorId: number,
    alertId: string,
    sighting: SightingResponseDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Sending sighting reported email for alert ${alertId}`);

    // Get user and alert information
    const [user, alert] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: alertCreatorId },
      }),
      this.prisma.alert.findUnique({
        where: { id: alertId },
        select: {
          id: true,
          pet_name: true,
          pet_species: true,
          last_seen_lat: true,
          last_seen_lon: true,
        },
      }),
    ]);

    if (!user) {
      this.logger.warn(`Cannot send sighting email - user ${alertCreatorId} not found`);
      throw new Error('USER_NOT_FOUND');
    }

    if (!alert) {
      this.logger.warn(`Cannot send sighting email - alert ${alertId} not found`);
      throw new Error('ALERT_NOT_FOUND');
    }

    // Instantiate EmailService with local templates
    const emailService = new EmailService(
      this.emailProvider,
      this.eventEmitter,
      sightingServiceEmailTemplates,
    );

    try {
      await emailService.sendHtml('sightingReported', {
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
            petName: alert.pet_name,
            petSpecies: alert.pet_species,
          },
          sighting: {
            id: sighting.id,
            location: sighting.address,
            latitude: sighting.latitude,
            longitude: sighting.longitude,
            confidence: sighting.confidence,
            sightingTime: sighting.sighting_time,
            photo: sighting.photo,
            notes: sighting.notes,
            direction: sighting.direction,
          },
          appUrl: process.env.APP_URL || 'https://fifi-alert.com',
        },
      });

      this.logger.log(`Sighting reported email sent successfully for alert ${alertId}`);

      return {
        success: true,
        message: `Sighting email sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(`Failed to send sighting reported email for alert ${alertId}:`, error);
      throw new Error('FAILED_TO_SEND_SIGHTING_REPORTED_EMAIL');
    }
  }

  /**
   * Send sighting dismissed email to the reporter (optional - can be used if needed)
   * @param reporterId ID of the person who reported the sighting
   * @param alertId ID of the alert
   * @param sighting Sighting information
   * @param dismissReason Reason for dismissal
   * @returns Success message
   */
  async sendSightingDismissedEmail(
    reporterId: number,
    alertId: string,
    sighting: SightingResponseDto,
    dismissReason: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Sending sighting dismissed email for sighting ${sighting.id}`);

    // Get reporter and alert information
    const [user, alert] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: reporterId },
      }),
      this.prisma.alert.findUnique({
        where: { id: alertId },
        select: {
          id: true,
          pet_name: true,
          pet_species: true,
        },
      }),
    ]);

    if (!user) {
      this.logger.warn(`Cannot send dismissal email - user ${reporterId} not found`);
      throw new Error('USER_NOT_FOUND');
    }

    if (!alert) {
      this.logger.warn(`Cannot send dismissal email - alert ${alertId} not found`);
      throw new Error('ALERT_NOT_FOUND');
    }

    // Instantiate EmailService with local templates
    const emailService = new EmailService(
      this.emailProvider,
      this.eventEmitter,
      sightingServiceEmailTemplates,
    );

    try {
      await emailService.sendHtml('sightingDismissed', {
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
            petName: alert.pet_name,
            petSpecies: alert.pet_species,
          },
          sighting: {
            id: sighting.id,
            location: sighting.address,
            sightingTime: sighting.sighting_time,
          },
          dismissReason,
          appUrl: process.env.APP_URL || 'https://fifi-alert.com',
        },
      });

      this.logger.log(`Sighting dismissed email sent successfully for sighting ${sighting.id}`);

      return {
        success: true,
        message: `Dismissal email sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(`Failed to send sighting dismissed email for sighting ${sighting.id}:`, error);
      throw new Error('FAILED_TO_SEND_SIGHTING_DISMISSED_EMAIL');
    }
  }
}
