import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
} from '@nestjs/common';
import { getWebAppUrl } from '@config/web-app.config';
import {
  getMaxSightingPhotos,
  getSightingPhotoUploadWindowHours,
} from '@config/sighting.config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../services/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { Prisma, AlertStatus, Sighting } from '../generated/prisma';
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

/**
 * Prisma `Sighting` row without the PostGIS `location_point` column.
 * Prisma omits `Unsupported` fields from query results, so this is what
 * findUnique / findMany / update actually return.
 */
type SightingRow = Omit<Sighting, 'location_point'>;

@Injectable()
export class SightingService {
  private readonly logger = new Logger(SightingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly eventEmitter: EventEmitter2,
    @Inject('IEmailProvider') private readonly emailProvider: IEmailProvider,
  ) {}

  /**
   * Create a new sighting report
   * Validates alert exists and is ACTIVE, inserts with PostGIS geometry.
   *
   * The `sighting.location_point` column is a PostGIS geometry that Prisma
   * cannot write through the client API, so the INSERT is a raw query. The
   * plain `sighting_lat` / `sighting_lon` columns are populated alongside it
   * so reads never need PostGIS.
   */
  async create(
    dto: CreateSightingDto,
    reporterId: number,
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

    const result = await this.prisma.$queryRaw<Array<{ id: number }>>`
      INSERT INTO sighting (
        alert_id,
        reporter_id,
        sighting_lat,
        sighting_lon,
        location_point,
        location_address,
        photo_url,
        photos,
        notes,
        confidence,
        sighting_time,
        direction,
        dismissed,
        created_at,
        updated_at
      )
      VALUES (
        ${dto.alert_id},
        ${reporterId},
        ${dto.location.latitude},
        ${dto.location.longitude},
        ST_SetSRID(ST_MakePoint(${dto.location.longitude}, ${dto.location.latitude}), 4326),
        ${dto.location.address},
        ${dto.photo || null},
        CASE
          WHEN ${dto.photo || null}::text IS NULL THEN ARRAY[]::text[]
          ELSE ARRAY[${dto.photo || null}::text]
        END,
        ${dto.notes || null},
        ${dto.confidence},
        ${new Date(dto.sighting_time)},
        ${dto.direction || null},
        false,
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    const sightingId = Number(result[0].id);

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'CREATE',
        entityType: 'SIGHTING',
        entityId: sightingId,
        userId: reporterId,
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

    if (!sighting) {
      throw new NotFoundException(
        `Sighting with ID ${sightingId} not found after creation`,
      );
    }

    const sightingResponse = this.mapToResponseDto(sighting);

    // Send sighting reported email to alert creator (non-blocking)
    try {
      await this.sendSightingReportedEmail(
        alert.creator_id,
        dto.alert_id,
        sightingResponse,
      );
    } catch (error) {
      this.logger.error(
        `Sighting reported email send failed for alert ${dto.alert_id} but sighting creation succeeded:`,
        error,
      );
    }

    return sightingResponse;
  }

  /**
   * Find a single sighting by ID, or null if it does not exist
   */
  async findOne(sightingId: number): Promise<SightingResponseDto | null> {
    const sighting = await this.prisma.sighting.findUnique({
      where: { id: sightingId },
    });

    return sighting ? this.mapToResponseDto(sighting) : null;
  }

  /**
   * Find all sightings for a specific alert
   * Filters dismissed sightings unless requester is alert creator
   */
  async findByAlert(
    alertId: number,
    requesterId?: number,
  ): Promise<SightingResponseDto[]> {
    // Verify alert exists
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      select: { id: true, creator_id: true },
    });

    if (!alert) {
      throw new NotFoundException(`Alert with ID ${alertId} not found`);
    }

    const isCreator =
      requesterId !== undefined && requesterId === alert.creator_id;

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
    sightingId: number,
    dto: DismissSightingDto,
    requesterId: number,
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
        entityId: sightingId,
        userId: requesterId,
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
   * Map Prisma Sighting row to the public response DTO.
   * Coordinates come from the plain `sighting_lat` / `sighting_lon` columns,
   * which are always written together with the PostGIS point.
   */
  private mapToResponseDto(sighting: SightingRow): SightingResponseDto {
    return {
      id: sighting.id,
      alert_id: sighting.alert_id,
      reported_by: sighting.reporter_id,
      latitude: sighting.sighting_lat,
      longitude: sighting.sighting_lon,
      address: sighting.location_address,
      photo: sighting.photo_url ?? sighting.photos?.[0] ?? null,
      photos: sighting.photos ?? [],
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
   * Queue notification to alert creator about new sighting
   * Task 3.6
   */
  private async notifyCreatorOfSighting(
    creatorId: number,
    alertId: number,
    sightingId: number,
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
   * Check that `requesterId` may attach `incomingCount` more photos to a
   * sighting. Call this before uploading so rejected requests never hit the
   * CDN.
   *
   * - 404 when the sighting does not exist
   * - 403 when the caller is not the reporter, the upload window
   *   (`SIGHTING_PHOTO_UPLOAD_WINDOW_HOURS` after `created_at`) has closed,
   *   or the parent alert is no longer ACTIVE
   * - 400 when no files were sent or the total would exceed
   *   `MAX_SIGHTING_PHOTOS`
   */
  async authorizePhotoUpload(
    sightingId: number,
    requesterId: number,
    incomingCount: number,
  ): Promise<void> {
    const sighting = await this.prisma.sighting.findUnique({
      where: { id: sightingId },
      select: {
        reporter_id: true,
        created_at: true,
        photos: true,
        alert: { select: { status: true } },
      },
    });

    if (!sighting) {
      throw new NotFoundException(`Sighting with ID ${sightingId} not found`);
    }

    if (sighting.reporter_id !== requesterId) {
      throw new ForbiddenException(
        'Only the reporter of a sighting can add photos to it',
      );
    }

    if (sighting.alert.status !== AlertStatus.ACTIVE) {
      throw new ForbiddenException(
        'Photos can only be added while the alert is active',
      );
    }

    const windowHours = getSightingPhotoUploadWindowHours();
    const windowEnd =
      sighting.created_at.getTime() + windowHours * 60 * 60 * 1000;
    if (Date.now() > windowEnd) {
      throw new ForbiddenException(
        `Photos can only be added within ${windowHours} hours of reporting the sighting`,
      );
    }

    if (!Number.isInteger(incomingCount) || incomingCount < 1) {
      throw new BadRequestException('At least one photo file is required');
    }

    const maxPhotos = getMaxSightingPhotos();
    const existingCount = sighting.photos?.length ?? 0;
    if (existingCount + incomingCount > maxPhotos) {
      const remaining = Math.max(maxPhotos - existingCount, 0);
      throw new BadRequestException(
        `A sighting can have at most ${maxPhotos} photos; ${remaining} more can be added`,
      );
    }
  }

  /**
   * Persist already-uploaded photo URLs on a sighting.
   *
   * URLs are appended in the order given. The legacy `photo_url` column is
   * kept equal to the first entry so older clients keep working. Returns the
   * full photo list after the update.
   */
  async appendPhotos(
    sightingId: number,
    photoUrls: string[],
    userId: number,
  ): Promise<string[]> {
    const sighting = await this.prisma.sighting.findUnique({
      where: { id: sightingId },
      select: { photo_url: true, photos: true },
    });

    if (!sighting) {
      throw new NotFoundException(`Sighting with ID ${sightingId} not found`);
    }

    const previous = sighting.photos ?? [];
    const photos = [...previous, ...photoUrls];
    const photoUrl = photos[0] ?? null;

    await this.prisma.sighting.update({
      where: { id: sightingId },
      data: { photos, photo_url: photoUrl },
    });

    this.logger.log(
      `Added ${photoUrls.length} photo(s) to sighting ${sightingId} (now ${photos.length})`,
    );

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'UPDATE',
        entityType: 'SIGHTING',
        entityId: sightingId,
        userId,
        action: 'sighting_photos_added',
        description: `Added ${photoUrls.length} photo(s) to sighting #${sightingId}`,
        oldValues: { photoUrl: sighting.photo_url, photos: previous },
        newValues: { photoUrl, photos },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
    } catch (error) {
      this.logger.error('Failed to emit audit event for photo update:', error);
    }

    return photos;
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
    alertId: number,
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
      this.logger.warn(
        `Cannot send sighting email - user ${alertCreatorId} not found`,
      );
      throw new Error('USER_NOT_FOUND');
    }

    if (!alert) {
      this.logger.warn(
        `Cannot send sighting email - alert ${alertId} not found`,
      );
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
          appUrl: getWebAppUrl(),
        },
      });

      this.logger.log(
        `Sighting reported email sent successfully for alert ${alertId}`,
      );

      return {
        success: true,
        message: `Sighting email sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send sighting reported email for alert ${alertId}:`,
        error,
      );
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
    alertId: number,
    sighting: SightingResponseDto,
    dismissReason: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `Sending sighting dismissed email for sighting ${sighting.id}`,
    );

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
      this.logger.warn(
        `Cannot send dismissal email - user ${reporterId} not found`,
      );
      throw new Error('USER_NOT_FOUND');
    }

    if (!alert) {
      this.logger.warn(
        `Cannot send dismissal email - alert ${alertId} not found`,
      );
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
          appUrl: getWebAppUrl(),
        },
      });

      this.logger.log(
        `Sighting dismissed email sent successfully for sighting ${sighting.id}`,
      );

      return {
        success: true,
        message: `Dismissal email sent to ${user.email}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send sighting dismissed email for sighting ${sighting.id}:`,
        error,
      );
      throw new Error('FAILED_TO_SEND_SIGHTING_DISMISSED_EMAIL');
    }
  }
}
