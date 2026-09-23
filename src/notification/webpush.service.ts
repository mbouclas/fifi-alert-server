import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

export interface WebPushNotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

export interface WebPushSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  invalidToken?: boolean;
}

/**
 * Web Push transport (VAPID).
 *
 * Standards-based, so a single code path serves Android Chrome, desktop browsers,
 * and iOS 16.4+ home-screen PWAs. Native apps continue to use FCMService/APNsService.
 *
 * The "token" for a web device is the stringified PushSubscription the browser hands
 * us from pushManager.subscribe().
 */
@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private isInitialized = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initialize();
  }

  /**
   * Configure VAPID details from environment.
   * Mirrors FCMService: never throws, so the app still boots without push configured.
   */
  private initialize(): void {
    try {
      const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
      const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
      const subject = this.configService.get<string>('VAPID_SUBJECT');

      if (
        !publicKey ||
        !privateKey ||
        !subject ||
        publicKey.includes('your-') ||
        privateKey.includes('your-')
      ) {
        this.logger.warn(
          'VAPID credentials not configured. Web push will be disabled. ' +
            'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT to enable web push. ' +
            'Generate a key pair with: npx web-push generate-vapid-keys',
        );
        return;
      }

      webpush.setVapidDetails(subject, publicKey, privateKey);

      this.isInitialized = true;
      this.logger.log('Web Push (VAPID) initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Web Push:', error);
      this.logger.warn('Web push will be disabled due to initialization error');
    }
  }

  /**
   * Parse a stored subscription string into a PushSubscription.
   * Returns null when the stored value is not a usable subscription.
   */
  private parseSubscription(token: string): webpush.PushSubscription | null {
    try {
      const parsed = JSON.parse(token) as webpush.PushSubscription;

      if (!parsed?.endpoint || !parsed?.keys?.p256dh || !parsed?.keys?.auth) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Send a push notification to a single web device.
   *
   * @param token - Stringified PushSubscription from the browser
   * @param payload - Notification content
   * @returns Result with success status and error details
   */
  async sendNotification(
    token: string,
    payload: WebPushNotificationPayload,
  ): Promise<WebPushSendResult> {
    if (!this.isInitialized) {
      this.logger.warn('Web push not initialized. Skipping notification.');
      return {
        success: false,
        error: 'WEB_PUSH_NOT_INITIALIZED',
      };
    }

    const subscription = this.parseSubscription(token);

    if (!subscription) {
      this.logger.warn('Malformed web push subscription; marking as invalid.');
      return {
        success: false,
        error: 'MALFORMED_SUBSCRIPTION',
        invalidToken: true,
      };
    }

    try {
      // iOS enforces userVisibleOnly strictly: every push must render a notification.
      // The service worker reads this shape in its `push` handler.
      const body = JSON.stringify({
        title: payload.title,
        body: payload.body,
        ...(payload.imageUrl && { image: payload.imageUrl }),
        data: payload.data || {},
      });

      const response = await webpush.sendNotification(subscription, body, {
        TTL: this.configService.get<number>('WEB_PUSH_TTL_SECONDS') ?? 3600,
        urgency: 'high',
      });

      this.logger.log(
        `Web push notification sent successfully (status ${response.statusCode})`,
      );

      return {
        success: true,
        // Push services return a message id in the Location header when they provide one.
        messageId: response.headers?.location,
      };
    } catch (error: any) {
      const statusCode: number | undefined = error?.statusCode;

      // 404 Not Found / 410 Gone mean the subscription is dead and must be cleaned up.
      const isInvalidToken = statusCode === 404 || statusCode === 410;

      this.logger.error(
        `Failed to send web push notification (status ${statusCode ?? 'unknown'}): ${error?.message}`,
      );

      return {
        success: false,
        error: error?.message || 'UNKNOWN_ERROR',
        invalidToken: isInvalidToken,
      };
    }
  }

  /**
   * Check if web push is properly configured and ready to send notifications
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
