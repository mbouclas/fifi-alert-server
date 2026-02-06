import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface FCMNotificationPayload {
    title: string;
    body: string;
    imageUrl?: string;
    data?: Record<string, string>;
}

export interface FCMSendResult {
    success: boolean;
    messageId?: string;
    error?: string;
    invalidToken?: boolean;
}

@Injectable()
export class FCMService implements OnModuleInit {
    private readonly logger = new Logger(FCMService.name);
    private app: admin.app.App;
    private isInitialized = false;

    constructor(private readonly configService: ConfigService) { }

    async onModuleInit() {
        await this.initialize();
    }

    /**
     * Initialize Firebase Admin SDK
     * Uses service account credentials from environment variables
     */
    private async initialize(): Promise<void> {
        try {
            const projectId = this.configService.get<string>('FCM_PROJECT_ID');
            const clientEmail = this.configService.get<string>('FCM_CLIENT_EMAIL');
            const privateKey = this.configService.get<string>('FCM_PRIVATE_KEY');

            // Skip initialization if credentials are not configured or are placeholder values
            if (!projectId || !clientEmail || !privateKey ||
                projectId.includes('your-') ||
                clientEmail.includes('your-') ||
                privateKey.includes('YourPrivateKeyHere')) {
                this.logger.warn(
                    'FCM credentials not configured. Push notifications will be disabled. ' +
                    'Set FCM_PROJECT_ID, FCM_CLIENT_EMAIL, and FCM_PRIVATE_KEY to enable FCM.',
                );
                return;
            }

            // Parse private key (handle escaped newlines)
            const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

            this.app = admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey: formattedPrivateKey,
                }),
            });

            this.isInitialized = true;
            this.logger.log('Firebase Admin SDK initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Firebase Admin SDK:', error);
            // Don't throw error - allow app to start without FCM
            this.logger.warn('FCM will be disabled due to initialization error');
        }
    }

    /**
     * Send push notification to a single Android device via FCM
     * 
     * @param token - FCM device token
     * @param payload - Notification content
     * @returns Result with success status and message ID or error details
     */
    async sendNotification(
        token: string,
        payload: FCMNotificationPayload,
    ): Promise<FCMSendResult> {
        if (!this.isInitialized) {
            this.logger.warn('FCM not initialized. Skipping notification.');
            return {
                success: false,
                error: 'FCM_NOT_INITIALIZED',
            };
        }

        try {
            // Build FCM message
            const message: admin.messaging.Message = {
                token,
                notification: {
                    title: payload.title,
                    body: payload.body,
                    ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'missing-pet-alerts',
                        priority: 'high',
                        defaultSound: true,
                        defaultVibrateTimings: true,
                    },
                },
                data: payload.data || {},
            };

            // Send message
            const messageId = await admin.messaging().send(message);

            this.logger.log(`FCM notification sent successfully: ${messageId}`);

            return {
                success: true,
                messageId,
            };
        } catch (error: any) {
            this.logger.error(`Failed to send FCM notification: ${error.message}`);

            // Check if token is invalid
            const invalidTokenErrors = [
                'messaging/invalid-registration-token',
                'messaging/registration-token-not-registered',
            ];

            const isInvalidToken = invalidTokenErrors.some((code) =>
                error.code?.includes(code),
            );

            return {
                success: false,
                error: error.message,
                invalidToken: isInvalidToken,
            };
        }
    }

    /**
     * Send push notifications to multiple Android devices
     * Uses Firebase multicast messaging for better performance
     * 
     * @param tokens - Array of FCM device tokens
     * @param payload - Notification content
     * @returns Array of results for each token
     */
    async batchSend(
        tokens: string[],
        payload: FCMNotificationPayload,
    ): Promise<FCMSendResult[]> {
        if (!this.isInitialized) {
            this.logger.warn('FCM not initialized. Skipping batch notifications.');
            return tokens.map(() => ({
                success: false,
                error: 'FCM_NOT_INITIALIZED',
            }));
        }

        try {
            // Build multicast message
            const message: admin.messaging.MulticastMessage = {
                tokens,
                notification: {
                    title: payload.title,
                    body: payload.body,
                    ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'missing-pet-alerts',
                        priority: 'high',
                        defaultSound: true,
                        defaultVibrateTimings: true,
                    },
                },
                data: payload.data || {},
            };

            // Send to multiple devices
            const response = await admin.messaging().sendEachForMulticast(message);

            this.logger.log(
                `FCM batch: ${response.successCount}/${tokens.length} sent successfully`,
            );

            // Map results to match our interface
            return response.responses.map((resp, index) => {
                if (resp.success) {
                    return {
                        success: true,
                        messageId: resp.messageId,
                    };
                } else {
                    const invalidTokenErrors = [
                        'messaging/invalid-registration-token',
                        'messaging/registration-token-not-registered',
                    ];

                    const isInvalidToken = invalidTokenErrors.some((code) =>
                        resp.error?.code?.includes(code),
                    );

                    return {
                        success: false,
                        error: resp.error?.message || 'Unknown error',
                        invalidToken: isInvalidToken,
                    };
                }
            });
        } catch (error: any) {
            this.logger.error(`Failed to send FCM batch: ${error.message}`);

            // Return error for all tokens
            return tokens.map(() => ({
                success: false,
                error: error.message,
            }));
        }
    }

    /**
     * Check if FCM is properly initialized and ready to send notifications
     */
    isReady(): boolean {
        return this.isInitialized;
    }
}
