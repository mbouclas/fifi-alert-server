import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as apn from 'apn';
import { readFileSync } from 'fs';

export interface APNsNotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
  badge?: number;
}

export interface APNsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  invalidToken?: boolean;
}

@Injectable()
export class APNsService implements OnModuleInit {
  private readonly logger = new Logger(APNsService.name);
  private provider: apn.Provider;
  private isInitialized = false;
  private bundleId: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initialize();
  }

  /**
   * Initialize APNs provider
   * Uses .p8 key file from Apple Developer account
   */
  private async initialize(): Promise<void> {
    try {
      const keyId = this.configService.get<string>('APNS_KEY_ID');
      const teamId = this.configService.get<string>('APNS_TEAM_ID');
      this.bundleId = this.configService.get<string>('APNS_BUNDLE_ID');
      const keyPath = this.configService.get<string>('APNS_PRIVATE_KEY_PATH');
      const production = this.configService.get<boolean>(
        'APNS_PRODUCTION',
        false,
      );

      // Skip initialization if credentials are not configured (allows testing without APNs)
      if (!keyId || !teamId || !this.bundleId || !keyPath) {
        this.logger.warn(
          'APNs credentials not configured. iOS push notifications will be disabled. ' +
            'Set APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, and APNS_PRIVATE_KEY_PATH to enable APNs.',
        );
        return;
      }

      // Read .p8 key file
      let token: Buffer;
      try {
        token = readFileSync(keyPath);
      } catch (error) {
        this.logger.error(
          `APNs key file not found at ${keyPath}. iOS notifications disabled.`,
        );
        return;
      }

      // Initialize APNs provider
      this.provider = new apn.Provider({
        token: {
          key: token,
          keyId,
          teamId,
        },
        production,
      });

      this.isInitialized = true;
      this.logger.log(
        `APNs provider initialized successfully (${production ? 'Production' : 'Development'})`,
      );
    } catch (error) {
      this.logger.warn(
        'Failed to initialize APNs provider. iOS notifications disabled.',
      );
      // Don't throw error - allow app to start without APNs
    }
  }

  /**
   * Send push notification to a single iOS device via APNs
   *
   * @param token - APNs device token (hex string)
   * @param payload - Notification content
   * @returns Result with success status and error details if any
   */
  async sendNotification(
    token: string,
    payload: APNsNotificationPayload,
  ): Promise<APNsSendResult> {
    if (!this.isInitialized) {
      this.logger.warn('APNs not initialized. Skipping notification.');
      return {
        success: false,
        error: 'APNS_NOT_INITIALIZED',
      };
    }

    try {
      // Build APNs notification
      const notification = new apn.Notification();

      // Alert content
      notification.alert = {
        title: payload.title,
        body: payload.body,
      };

      // Badge count (optional)
      if (payload.badge !== undefined) {
        notification.badge = payload.badge;
      }

      // Sound
      notification.sound = 'default';

      // Custom data
      if (payload.data) {
        notification.payload = payload.data;
      }

      // Image attachment (if provided)
      if (payload.imageUrl) {
        notification.mutableContent = 1; // Enable notification service extension
        notification.payload = {
          ...notification.payload,
          imageUrl: payload.imageUrl,
        };
      }

      // Set topic (bundle ID)
      notification.topic = this.bundleId;

      // High priority for missing pet alerts
      notification.priority = 10;

      // Expiration (24 hours)
      notification.expiry = Math.floor(Date.now() / 1000) + 86400;

      // Send notification
      const result = await this.provider.send(notification, token);

      // Check for errors
      if (result.failed && result.failed.length > 0) {
        const failure = result.failed[0];
        const error = failure.response;

        this.logger.error(
          `APNs notification failed: ${error.reason} (status: ${error.status})`,
        );

        // Check if token is invalid
        const invalidTokenReasons = [
          'BadDeviceToken',
          'Unregistered',
          'DeviceTokenNotForTopic',
        ];

        const isInvalidToken = invalidTokenReasons.includes(error.reason);

        return {
          success: false,
          error: error.reason,
          invalidToken: isInvalidToken,
        };
      }

      // Success
      if (result.sent && result.sent.length > 0) {
        const messageId = result.sent[0].device;
        this.logger.log(`APNs notification sent successfully to ${messageId}`);

        return {
          success: true,
          messageId,
        };
      }

      // Unknown state
      return {
        success: false,
        error: 'UNKNOWN_RESULT',
      };
    } catch (error: any) {
      this.logger.error(`Failed to send APNs notification: ${error.message}`);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send push notifications to multiple iOS devices
   * Sends notifications sequentially (APNs SDK doesn't have native batch support)
   *
   * @param tokens - Array of APNs device tokens
   * @param payload - Notification content
   * @returns Array of results for each token
   */
  async batchSend(
    tokens: string[],
    payload: APNsNotificationPayload,
  ): Promise<APNsSendResult[]> {
    if (!this.isInitialized) {
      this.logger.warn('APNs not initialized. Skipping batch notifications.');
      return tokens.map(() => ({
        success: false,
        error: 'APNS_NOT_INITIALIZED',
      }));
    }

    // Send notifications sequentially
    const results: APNsSendResult[] = [];

    for (const token of tokens) {
      const result = await this.sendNotification(token, payload);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    this.logger.log(
      `APNs batch: ${successCount}/${tokens.length} sent successfully`,
    );

    return results;
  }

  /**
   * Check if APNs is properly initialized and ready to send notifications
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Gracefully shutdown APNs provider
   */
  async onModuleDestroy() {
    if (this.provider) {
      this.provider.shutdown();
      this.logger.log('APNs provider shut down');
    }
  }
}
