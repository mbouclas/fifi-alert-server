import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../services/prisma.service';
import { NOTIFICATION_QUEUE } from './notification.constants';
import { NotificationConfidence } from '../generated/prisma';
import { AUDIT_EVENT_NAMES } from '../audit/audit-event-names';
import { IAuditEventPayload } from '../audit/interfaces/audit-event-payload.interface';

/**
 * Notification payload structure for push notifications
 */
export interface NotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, any>;
}

/**
 * Job data for alert notification targeting
 */
export interface AlertNotificationJob {
  alertId: number;
}

/**
 * Job data for individual push notification sending
 */
export interface PushNotificationJob {
  notificationId: number;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Queue alert notifications for processing
   * Called when a new alert is created
   *
   * @param alertId - Alert to send notifications for
   */
  async queueAlertNotifications(alertId: number): Promise<void> {
    this.logger.log(`Queuing alert notifications for alert ${alertId}`);

    const job = await this.notificationQueue.add('send-alert-notifications', {
      alertId,
    } as AlertNotificationJob);

    this.logger.log(
      `Queued alert notification job ${job.id} for alert ${alertId}`,
    );
  }

  /**
   * Build notification title based on confidence and alert details
   *
   * @param confidence - Notification confidence level
   * @param petSpecies - Type of pet
   * @param petName - Name of pet
   * @param distanceKm - Distance from user (optional)
   * @returns Notification title
   */
  buildTitle(
    confidence: NotificationConfidence,
    petSpecies: string,
    petName: string,
    distanceKm?: number,
  ): string {
    const speciesIcon = this.getSpeciesIcon(petSpecies);
    const distance = distanceKm
      ? this.formatDistance(distanceKm)
      : 'in your area';

    switch (confidence) {
      case NotificationConfidence.HIGH:
        return `${speciesIcon} Missing ${petSpecies}: ${petName} — Last seen ${distance}`;
      case NotificationConfidence.MEDIUM:
        return `Missing ${petSpecies} nearby: ${petName} — Keep an eye out`;
      case NotificationConfidence.LOW:
        return `Missing pet alert in your area`;
      default:
        return `Missing pet alert`;
    }
  }

  /**
   * Build notification body text
   *
   * @param petDescription - Pet description
   * @param locationAddress - Last seen location
   * @returns Notification body
   */
  buildBody(petDescription: string, locationAddress?: string): string {
    let body = petDescription;

    if (locationAddress) {
      body += ` Last seen near ${locationAddress}.`;
    }

    // Truncate to platform limits (iOS: 178 chars, Android: 240 chars)
    const maxLength = 170;
    if (body.length > maxLength) {
      body = body.substring(0, maxLength - 3) + '...';
    }

    return body;
  }

  /**
   * Track notification exclusion for transparency/debugging
   *
   * @param alertId - Alert ID
   * @param deviceId - Device that was excluded
   * @param reason - Reason for exclusion
   */
  async trackExclusion(
    alertId: number,
    deviceId: number,
    reason: string,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        alert_id: alertId,
        device_id: deviceId,
        confidence: NotificationConfidence.LOW,
        match_reason: 'MANUAL', // Default value
        excluded: true,
        exclusion_reason: reason,
      },
    });

    this.logger.debug(
      `Tracked exclusion for device ${deviceId} on alert ${alertId}: ${reason}`,
    );

    // Emit audit event for exclusion
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'SYSTEM',
        entityType: 'NOTIFICATION',
        action: 'notification_excluded',
        description: `Device ${deviceId} excluded from alert ${alertId} notifications`,
        metadata: {
          alertId,
          deviceId,
          reason,
        },
        success: true,
      };
      this.eventEmitter.emit(
        AUDIT_EVENT_NAMES.NOTIFICATION.EXCLUDED,
        auditPayload,
      );
    } catch (error) {
      // Silent fail for audit events
    }
  }

  /**
   * Handle delivery receipt from FCM/APNs
   * Updates notification status to DELIVERED
   *
   * @param notificationId - Notification ID
   */
  async handleDeliveryReceipt(notificationId: number): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: 'DELIVERED',
        delivered_at: new Date(),
      },
    });

    this.logger.log(`Notification ${notificationId} marked as delivered`);
  }

  /**
   * Get emoji icon for pet species
   */
  private getSpeciesIcon(species: string): string {
    const icons: Record<string, string> = {
      DOG: '🐕',
      CAT: '🐈',
      BIRD: '🐦',
      RABBIT: '🐰',
      OTHER: '🐾',
    };
    return icons[species.toUpperCase()] || '🐾';
  }

  /**
   * Format distance for display
   */
  private formatDistance(distanceKm: number): string {
    if (distanceKm < 0.1) {
      return 'very close to you';
    }
    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)}m from you`;
    }
    if (distanceKm < 10) {
      return `${distanceKm.toFixed(1)}km from you`;
    }
    return `${Math.round(distanceKm)}km from you`;
  }
}
