import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { PrismaService } from '../services/prisma.service';
import { LocationService } from '../location/location.service';
import { NotificationService, AlertNotificationJob, PushNotificationJob } from './notification.service';
import { FCMService } from './fcm.service';
import { APNsService } from './apns.service';
import { NOTIFICATION_QUEUE } from './notification.constants';
import { NotificationStatus } from '../generated/prisma';

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
    ) {
        super();
    }

    /**
     * Main job processor - routes to specific handlers based on job name
     */
    async process(job: Job<AlertNotificationJob | PushNotificationJob>): Promise<any> {
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
            const deviceMatches =
                await this.locationService.findDevicesForAlert(alertId);

            this.logger.log(
                `Found ${deviceMatches.length} devices for alert ${alertId}`,
            );

            // Log confidence breakdown
            const confidenceBreakdown = deviceMatches.reduce(
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
            for (const match of deviceMatches) {
                // Skip devices without push tokens
                if (!match.pushToken) {
                    await this.notificationService.trackExclusion(
                        alertId,
                        parseInt(match.deviceId),
                        'PUSH_TOKEN_MISSING',
                    );
                    continue;
                }

                // Create notification record
                const notification = await this.prisma.notification.create({
                    data: {
                        alert_id: alertId,
                        device_id: parseInt(match.deviceId),
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
                `Queued ${queuedCount} push notifications for alert ${alertId}`,
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
    async processPushNotification(
        job: Job<PushNotificationJob>,
    ): Promise<void> {
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

            // Send via FCM or APNs based on platform
            let sendResult: { success: boolean; messageId?: string; error?: string; invalidToken?: boolean };

            if (notification.device.platform === 'ANDROID') {
                this.logger.log(`Sending FCM notification to device ${notification.device_id}`);
                sendResult = await this.fcmService.sendNotification(
                    notification.device.push_token,
                    payload,
                );
            } else if (notification.device.platform === 'IOS') {
                this.logger.log(`Sending APNs notification to device ${notification.device_id}`);
                sendResult = await this.apnsService.sendNotification(
                    notification.device.push_token,
                    payload,
                );
            } else {
                throw new Error(`Unsupported platform: ${notification.device.platform}`);
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

                this.logger.log(`Push notification ${notificationId} sent successfully`);
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

                throw new Error(`Failed to send push notification: ${sendResult.error}`);
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
}
