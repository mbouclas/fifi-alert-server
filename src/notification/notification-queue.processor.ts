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
import {
  LocationSource,
  NotificationConfidence,
  NotificationStatus,
} from '../generated/prisma';

/** Push errors that a BullMQ retry can never fix. */
const TERMINAL_PUSH_ERRORS = new Set([
  'FCM_NOT_INITIALIZED',
  'APNS_NOT_INITIALIZED',
  'WEB_PUSH_NOT_INITIALIZED',
]);
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
          pet_photos: true,
          location_address: true,
          status: true,
          creator_id: true,
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
      // The reporter's own devices and zones match by definition; they never get
      // "a pet is missing near you" for their own pet.
      const creatorId = String(alert.creator_id);
      const deviceMatches = allMatches.filter(
        (match) => match.confidence === wave && match.userId !== creatorId,
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

      // One match per user. findDevicesForAlert already keeps the best match per
      // user, and that match carries the distance both channels report. Matches
      // are ordered by priority then distance, so the first one per user wins.
      const userMatches = new Map<string, (typeof deviceMatches)[number]>();
      for (const match of deviceMatches) {
        if (!userMatches.has(match.userId)) {
          userMatches.set(match.userId, match);
        }
      }

      // Pass 1: push to every reachable device each matched user owns. Zones and
      // GPS match a single device, which is often the laptop that created the
      // zone while the phone sits in the same account. The email goes to the
      // user, so the push must reach every device they registered.
      let queuedCount = 0;
      let pushedUserCount = 0;
      const inQuietHours = this.isQuietHours();

      const userIds = [...userMatches.keys()]
        .map((id) => parseInt(id))
        .filter((id) => Number.isFinite(id));

      const reachableDevices =
        userIds.length > 0
          ? await this.prisma.device.findMany({
              where: {
                user_id: { in: userIds },
                push_token: { not: null },
                push_enabled: true,
              },
              select: { id: true, user_id: true },
            })
          : [];

      const devicesByUser = new Map<string, number[]>();
      for (const device of reachableDevices) {
        const key = String(device.user_id);
        const list = devicesByUser.get(key) ?? [];
        list.push(device.id);
        devicesByUser.set(key, list);
      }

      // Matched devices with no push channel are recorded so the audit trail
      // shows why they got nothing, even when a sibling device is pushed.
      for (const match of deviceMatches) {
        if (!match.pushToken) {
          await this.notificationService.trackExclusion(
            alertId,
            parseInt(match.deviceId),
            EXCLUSION_REASONS.PUSH_TOKEN_MISSING,
          );
        }
      }

      for (const [userId, match] of userMatches) {
        const targets = devicesByUser.get(userId) ?? [];

        if (targets.length === 0) {
          // The matched device may hold a token with push disabled; record that
          // too, but never twice for the same token-less device.
          if (match.pushToken) {
            await this.notificationService.trackExclusion(
              alertId,
              parseInt(match.deviceId),
              EXCLUSION_REASONS.PUSH_TOKEN_MISSING,
            );
          }
          continue;
        }

        const excludeAll = async (reason: string) => {
          for (const deviceId of targets) {
            await this.notificationService.trackExclusion(
              alertId,
              deviceId,
              reason,
            );
          }
        };

        // A missing pet 400m away is worth waking someone for; a LOW-confidence
        // city-level match at 3am is not.
        if (inQuietHours && wave !== 'HIGH') {
          await excludeAll(EXCLUSION_REASONS.QUIET_HOURS);
          continue;
        }

        // A later wave must not re-notify someone an earlier wave already reached.
        if (await this.hasBeenNotified(alertId, userId, 'PUSH')) {
          await excludeAll(EXCLUSION_REASONS.ALREADY_NOTIFIED);
          continue;
        }

        if (await this.isOverDailyCap(userId, wave)) {
          await excludeAll(EXCLUSION_REASONS.DAILY_CAP);
          continue;
        }

        for (const deviceId of targets) {
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

          await this.notificationQueue.add('send-push-notification', {
            notificationId: notification.id,
          } as PushNotificationJob);

          queuedCount++;
        }

        pushedUserCount++;
      }

      // Pass 2: email. Push is best-effort (iOS users who never added FiFi to
      // their Home Screen cannot be subscribed at all), so every HIGH-wave user
      // also gets one email. Lower waves are push-only: "a pet is missing
      // somewhere in your city" is not worth an email.
      let emailedCount = 0;

      if (wave === 'HIGH') {
        for (const [userId, match] of userMatches) {
          if (await this.hasBeenNotified(alertId, userId, 'EMAIL')) continue;

          const sent = await this.sendFallbackEmail(alert, match);
          // null = nothing attempted (opted out); no row to record.
          if (sent === null) continue;
          await this.recordEmailNotification(alertId, match, sent);
          if (sent) emailedCount++;
        }
      }

      this.logger.log(
        `Wave ${wave}: emailed ${emailedCount} users for alert ${alertId}`,
      );

      this.logger.log(
        `Wave ${wave}: queued ${queuedCount} push notifications to ${pushedUserCount} users for alert ${alertId}`,
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
            `Invalid push token for device ${notification.device_id}. Clearing it.`,
          );
          // Every device a user owns is now targeted, so a dead subscription
          // would otherwise fail again on every future alert.
          try {
            await this.prisma.device.update({
              where: { id: notification.device_id },
              data: { push_token: null, push_token_updated_at: new Date() },
            });
          } catch (error) {
            this.logger.error(
              `Failed to clear dead push token for device ${notification.device_id}:`,
              error,
            );
          }
        }

        const terminal =
          Boolean(sendResult.invalidToken) ||
          TERMINAL_PUSH_ERRORS.has(sendResult.error ?? '');

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

        // Retrying a dead token or a missing provider config cannot succeed.
        // The HIGH wave already emailed this user, so just let the job complete.
        if (terminal) {
          return;
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
   * Email channel for a match. Returns null when nothing was attempted (user
   * opted out), otherwise whether the send succeeded. Failures are logged and
   * swallowed: an email must never fail the whole alert fan-out.
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
  ): Promise<boolean | null> {
    try {
      const userId = parseInt(match.userId);

      if (!Number.isFinite(userId)) return null;
      if (!(await this.alertEmailService.isOptedIn(userId))) return null;

      return await this.alertEmailService.sendAlertEmail(userId, {
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
      return false;
    }
  }

  /**
   * Persist a fallback email as a notification row so it shows up alongside
   * pushes and so hasBeenNotified() dedupes the user across later waves.
   * Never throws: bookkeeping must not fail the fan-out.
   */
  private async recordEmailNotification(
    alertId: number,
    match: {
      deviceId: string;
      confidence: NotificationConfidence;
      matchReason: LocationSource;
      distanceKm: number;
    },
    sent: boolean,
  ): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          alert_id: alertId,
          device_id: parseInt(match.deviceId),
          confidence: match.confidence,
          match_reason: match.matchReason,
          distance_km: match.distanceKm,
          status: sent ? NotificationStatus.SENT : NotificationStatus.FAILED,
          sent_at: sent ? new Date() : undefined,
          failed_at: sent ? undefined : new Date(),
          failure_reason: sent ? undefined : 'EMAIL_FALLBACK_NOT_SENT',
          meta: { channel: 'EMAIL' },
        },
      });
    } catch (error) {
      this.logger.error('Failed to record email notification:', error);
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
   * Whether this user has already been reached on the given channel for this
   * alert. Guards against later waves and alert renewals. Push and email are
   * independent channels, so an email row never blocks a push or vice versa.
   * Failed pushes are not deliveries and do not count.
   */
  private async hasBeenNotified(
    alertId: number,
    userId: string,
    channel: 'PUSH' | 'EMAIL',
  ): Promise<boolean> {
    const rows = await this.prisma.notification.findMany({
      where: {
        alert_id: alertId,
        excluded: false,
        status: { not: NotificationStatus.FAILED },
        device: { user_id: parseInt(userId) },
      },
      select: { meta: true },
    });

    return rows.some((row) => {
      const meta = row.meta as { channel?: string } | null;
      const rowChannel = meta?.channel === 'EMAIL' ? 'EMAIL' : 'PUSH';
      return rowChannel === channel;
    });
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
