import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../services/prisma.service';
import { LocationService } from '../location/location.service';
import {
  NotificationService,
  AlertNotificationJob,
  PushNotificationJob,
} from './notification.service';
import { FCMService } from './fcm.service';
import { APNsService } from './apns.service';
import { WebPushService } from './webpush.service';
import { AlertEmailService } from './alert-email.service';
import {
  QUIET_HOURS_START,
  QUIET_HOURS_END,
  DAILY_CAP_BY_CONFIDENCE,
  EXCLUSION_REASONS,
} from './notification.constants';
import { NOTIFICATION_QUEUE } from './notification.constants';
import { NotificationStatus } from '../generated/prisma';
import { AUDIT_EVENT_NAMES } from '../audit/audit-event-names';
import { IAuditEventPayload } from '../audit/interfaces/audit-event-payload.interface';

@Processor(NOTIFICATION_QUEUE)
export class NotificationQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationQueueProcessor.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly locationService: LocationService,
    private readonly notificationService: NotificationService,
    private readonly fcmService: FCMService,
    private readonly apnsService: APNsService,
    private readonly webPushService: WebPushService,
    private readonly alertEmailService: AlertEmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  /**
   * Main job processor - routes to specific handlers based on job name
   */
  async process(
    job: Job<AlertNotificationJob | PushNotificationJob>,
  ): Promise<any> {
    switch (job.name) {
      case 'send-alert-notifications':
        return this.processAlertNotifications(job as Job<AlertNotificationJob>);
      case 'send-push-notification':
        return this.processPushNotification(job as Job<PushNotificationJob>);
      default:
        this.logger.error(`Unknown job type: ${job.name}`);
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }

  /**
   * Process alert notification targeting job
   * Finds all matching devices and queues individual push notifications
   */
  async processAlertNotifications(
    job: Job<AlertNotificationJob>,
  ): Promise<void> {
    const { alertId } = job.data;
    this.logger.log(`Processing alert notifications for alert ${alertId}`);

    try {
      // Fetch alert details
      const alert = await this.prisma.alert.findUnique({
        where: { id: alertId },
        select: {
          id: true,
          pet_name: true,
          pet_species: true,
          pet_description: true,
          location_address: true,
          status: true,
        },
      });

      if (!alert) {
        this.logger.warn(`Alert ${alertId} not found, skipping notifications`);
        return;
      }

      if (alert.status !== 'ACTIVE') {
        this.logger.warn(
          `Alert ${alertId} is not ACTIVE (status: ${alert.status}), skipping notifications`,
        );
        return;
      }

      // Find all matching devices using geospatial service
      const wave = job.data.wave ?? 'HIGH';

      const allMatches =
        await this.locationService.findDevicesForAlert(alertId);

      // Each wave only handles its own confidence tier. HIGH goes out immediately;
      // MEDIUM and LOW arrive later, and only if the alert is still unresolved.
      const deviceMatches = allMatches.filter(
        (match) => match.confidence === wave,
      );

      this.logger.log(
        `Wave ${wave}: ${deviceMatches.length} of ${allMatches.length} matches for alert ${alertId}`,
      );

      // Breakdown covers every match, not just this wave, so the logs show the full
      // reachable audience for the alert.
      const confidenceBreakdown = allMatches.reduce(
        (acc, match) => {
          acc[match.confidence] = (acc[match.confidence] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      this.logger.log(
        `Confidence breakdown: ${JSON.stringify(confidenceBreakdown)}`,
      );

      // Create notification records and queue push jobs
      let queuedCount = 0;
      const inQuietHours = this.isQuietHours();

      for (const match of deviceMatches) {
        const deviceId = parseInt(match.deviceId);

        // No push channel. On iOS this is the common case: the user never added
        // FiFi to their Home Screen, so they cannot be subscribed at all.
        if (!match.pushToken) {
          await this.notificationService.trackExclusion(
            alertId,
            deviceId,
            EXCLUSION_REASONS.PUSH_TOKEN_MISSING,
          );

          // Fall back to email, but only for the wave that justifies it.
          if (wave === 'HIGH') {
            await this.sendFallbackEmail(alert, match);
          }

          continue;
        }

        // A missing pet 400m away is worth waking someone for; a LOW-confidence
        // city-level match at 3am is not.
        if (inQuietHours && wave !== 'HIGH') {
          await this.notificationService.trackExclusion(
            alertId,
            deviceId,
            EXCLUSION_REASONS.QUIET_HOURS,
          );
          continue;
        }

        // A later wave must not re-notify someone an earlier wave already reached.
        if (await this.hasBeenNotified(alertId, match.userId)) {
          await this.notificationService.trackExclusion(
            alertId,
            deviceId,
            EXCLUSION_REASONS.ALREADY_NOTIFIED,
          );
          continue;
        }

        if (await this.isOverDailyCap(match.userId, wave)) {
          await this.notificationService.trackExclusion(
            alertId,
            deviceId,
            EXCLUSION_REASONS.DAILY_CAP,
          );
          continue;
        }

        // Create notification record
        const notification = await this.prisma.notification.create({
          data: {
            alert_id: alertId,
            device_id: deviceId,
            confidence: match.confidence,
            match_reason: match.matchReason,
            distance_km: match.distanceKm,
            status: NotificationStatus.QUEUED,
          },
        });

        // Queue individual push notification job
        await this.notificationQueue.add('send-push-notification', {
          notificationId: notification.id,
        } as PushNotificationJob);

        queuedCount++;
      }

      this.logger.log(
        `Wave ${wave}: queued ${queuedCount} push notifications for alert ${alertId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing alert notifications for alert ${alertId}:`,
        error,
      );
      throw error; // Re-throw to trigger BullMQ retry
    }
  }

  /**
   * Process individual push notification job
   * Sends push notification to device via FCM or APNs
   */
  async processPushNotification(job: Job<PushNotificationJob>): Promise<void> {
    const { notificationId } = job.data;
    this.logger.log(`Processing push notification ${notificationId}`);

    try {
      // Fetch notification with related data
      const notification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        include: {
          alert: {
            select: {
              pet_name: true,
              pet_species: true,
              pet_description: true,
              pet_photos: true,
              location_address: true,
            },
          },
          device: {
            select: {
              push_token: true,
              platform: true,
            },
          },
        },
      });

      if (!notification) {
        this.logger.warn(`Notification ${notificationId} not found`);
        return;
      }

      if (!notification.device.push_token) {
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: {
            status: NotificationStatus.FAILED,
            failed_at: new Date(),
            failure_reason: 'PUSH_TOKEN_MISSING',
          },
        });
        return;
      }

      // Build notification payload
      const title = this.notificationService.buildTitle(
        notification.confidence,
        notification.alert.pet_species,
        notification.alert.pet_name,
        notification.distance_km ?? undefined,
      );

      const body = this.notificationService.buildBody(
        notification.alert.pet_description,
        notification.alert.location_address ?? undefined,
      );

      const payload = {
        title,
        body,
        imageUrl: notification.alert.pet_photos[0] || undefined,
        data: {
          alertId: notification.alert_id.toString(),
          notificationId: notificationId.toString(),
          confidence: notification.confidence,
        },
      };

      // Send via FCM, APNs, or Web Push based on platform
      let sendResult: {
        success: boolean;
        messageId?: string;
        error?: string;
        invalidToken?: boolean;
      };

      if (notification.device.platform === 'ANDROID') {
        this.logger.log(
          `Sending FCM notification to device ${notification.device_id}`,
        );
        sendResult = await this.fcmService.sendNotification(
          notification.device.push_token,
          payload,
        );
      } else if (notification.device.platform === 'IOS') {
        this.logger.log(
          `Sending APNs notification to device ${notification.device_id}`,
        );
        sendResult = await this.apnsService.sendNotification(
          notification.device.push_token,
          payload,
        );
      } else if (notification.device.platform === 'WEB') {
        this.logger.log(
          `Sending web push notification to device ${notification.device_id}`,
        );
        sendResult = await this.webPushService.sendNotification(
          notification.device.push_token,
          payload,
        );
      } else {
        throw new Error(
          `Unsupported platform: ${notification.device.platform}`,
        );
      }

      // Handle send result
      if (sendResult.success) {
        // Update notification status to SENT
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: {
            status: NotificationStatus.SENT,
            sent_at: new Date(),
            push_message_id: sendResult.messageId,
          },
        });

        this.logger.log(
          `Push notification ${notificationId} sent successfully`,
        );

        // Emit audit event for successful send
        try {
          const auditPayload: IAuditEventPayload = {
            eventType: 'SEND',
            entityType: 'NOTIFICATION',
            entityId: notificationId,
            action: 'notification_sent',
            description: `Sent push notification to device ${notification.device_id} for alert ${notification.alert_id}`,
            metadata: {
              alertId: notification.alert_id,
              deviceId: notification.device_id,
              platform: notification.device.platform,
              confidence: notification.confidence,
              matchReason: notification.match_reason,
              distanceKm: notification.distance_km,
            },
            success: true,
          };
          this.eventEmitter.emit(
            AUDIT_EVENT_NAMES.NOTIFICATION.SENT,
            auditPayload,
          );
        } catch (error) {
          // Silent fail for audit events
        }
      } else {
        // Mark as failed
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: {
            status: NotificationStatus.FAILED,
            failed_at: new Date(),
            failure_reason: sendResult.error || 'UNKNOWN_ERROR',
          },
        });

        // If token is invalid, we could mark device for token refresh
        if (sendResult.invalidToken) {
          this.logger.warn(
            `Invalid push token for device ${notification.device_id}. Token should be refreshed.`,
          );
        }

        // Emit audit event for failed send
        try {
          const auditPayload: IAuditEventPayload = {
            eventType: 'FAILURE',
            entityType: 'NOTIFICATION',
            entityId: notificationId,
            action: 'notification_failed',
            description: `Failed to send push notification to device ${notification.device_id} for alert ${notification.alert_id}`,
            errorMessage: sendResult.error || 'UNKNOWN_ERROR',
            metadata: {
              alertId: notification.alert_id,
              deviceId: notification.device_id,
              platform: notification.device.platform,
              invalidToken: sendResult.invalidToken,
            },
            success: false,
          };
          this.eventEmitter.emit(
            AUDIT_EVENT_NAMES.NOTIFICATION.FAILED,
            auditPayload,
          );
        } catch (error) {
          // Silent fail for audit events
        }

        throw new Error(
          `Failed to send push notification: ${sendResult.error}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error processing push notification ${notificationId}:`,
        error,
      );

      // Update notification status to failed
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.FAILED,
          failed_at: new Date(),
          failure_reason: error.message || 'UNKNOWN_ERROR',
        },
      });

      throw error; // Re-throw to trigger BullMQ retry
    }
  }

  /**
   * Handle queue errors
   */
  @OnWorkerEvent('error')
  handleError(error: Error) {
    this.logger.error('Queue error:', error);
  }

  /**
   * Handle failed jobs
   */
  @OnWorkerEvent('failed')
  handleFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.name}) failed after ${job.attemptsMade} attempts:`,
      error,
    );
  }

  /**
   * Degraded delivery for a match with no push channel. Failures are logged and
   * swallowed: a fallback email must never fail the whole alert fan-out.
   */
  private async sendFallbackEmail(
    alert: {
      id: number;
      pet_name: string;
      pet_species: string;
      pet_description: string;
      location_address?: string | null;
      pet_photos?: string[] | null;
    },
    match: { userId: string; distanceKm: number },
  ): Promise<void> {
    try {
      const userId = parseInt(match.userId);

      if (!Number.isFinite(userId)) return;
      if (!(await this.alertEmailService.isOptedIn(userId))) return;

      await this.alertEmailService.sendAlertEmail(userId, {
        alertId: alert.id,
        petName: alert.pet_name,
        petSpecies: alert.pet_species,
        petDescription: alert.pet_description,
        petPhotoUrl: alert.pet_photos?.[0],
        locationAddress: alert.location_address ?? undefined,
        distanceKm: match.distanceKm,
      });
    } catch (error) {
      this.logger.error('Fallback email failed:', error);
    }
  }

  /**
   * Quiet hours in local server time. Wraps midnight (22:00 -> 07:00).
   */
  private isQuietHours(now: Date = new Date()): boolean {
    const hour = now.getHours();
    return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
  }

  /**
   * Whether any device belonging to this user has already been queued or sent a
   * notification for this alert. Guards against later waves and alert renewals.
   */
  private async hasBeenNotified(
    alertId: number,
    userId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.notification.findFirst({
      where: {
        alert_id: alertId,
        excluded: false,
        device: { user_id: parseInt(userId) },
      },
      select: { id: true },
    });

    return Boolean(existing);
  }

  /**
   * Rolling 24h per-user cap, stricter for lower-confidence tiers. Notification
   * fatigue is the main way a crowd-sourcing app loses its audience.
   */
  private async isOverDailyCap(
    userId: string,
    wave: string,
  ): Promise<boolean> {
    const cap = DAILY_CAP_BY_CONFIDENCE[wave];

    if (cap === undefined) {
      return false;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const sentToday = await this.prisma.notification.count({
      where: {
        excluded: false,
        queued_at: { gte: since },
        device: { user_id: parseInt(userId) },
      },
    });

    return sentToday >= cap;
  }
}
