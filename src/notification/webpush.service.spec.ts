/**
 * WebPushService Integration Tests
 *
 * Tests VAPID web push delivery, subscription parsing, and dead-subscription
 * detection (404/410), which the queue processor relies on to clean up tokens.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { WebPushService } from './webpush.service';

jest.mock('web-push');

const mockedWebpush = webpush as jest.Mocked<typeof webpush>;

const VALID_SUBSCRIPTION = JSON.stringify({
  endpoint: 'https://web.push.apple.com/abc123',
  keys: {
    p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
});

const PAYLOAD = {
  title: '🐕 Missing Dog: Fifi',
  body: 'Last seen 800m from you',
  data: { alertId: '42' },
};

function buildModule(config: Record<string, any>) {
  return Test.createTestingModule({
    providers: [
      WebPushService,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => config[key]),
        },
      },
    ],
  }).compile();
}

const CONFIGURED = {
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:alerts@fifialert.com',
  WEB_PUSH_TTL_SECONDS: 3600,
};

describe('WebPushService (Integration)', () => {
  let service: WebPushService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await buildModule(CONFIGURED);
    service = module.get<WebPushService>(WebPushService);
    service.onModuleInit();
  });

  describe('initialization', () => {
    it('configures VAPID details and reports ready', () => {
      expect(mockedWebpush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:alerts@fifialert.com',
        'test-public-key',
        'test-private-key',
      );
      expect(service.isReady()).toBe(true);
    });

    it('stays disabled when credentials are placeholders, without throwing', async () => {
      const module = await buildModule({
        VAPID_PUBLIC_KEY: 'your-vapid-public-key',
        VAPID_PRIVATE_KEY: 'your-vapid-private-key',
        VAPID_SUBJECT: 'mailto:alerts@fifialert.com',
      });
      const disabled = module.get<WebPushService>(WebPushService);
      disabled.onModuleInit();

      expect(disabled.isReady()).toBe(false);

      const result = await disabled.sendNotification(VALID_SUBSCRIPTION, PAYLOAD);
      expect(result).toEqual({
        success: false,
        error: 'WEB_PUSH_NOT_INITIALIZED',
      });
    });
  });

  describe('sendNotification', () => {
    it('sends a notification and returns the push service message id', async () => {
      mockedWebpush.sendNotification.mockResolvedValue({
        statusCode: 201,
        headers: { location: 'https://web.push.apple.com/message/xyz' },
        body: '',
      } as any);

      const result = await service.sendNotification(VALID_SUBSCRIPTION, PAYLOAD);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('https://web.push.apple.com/message/xyz');

      const [subscription, body, options] =
        mockedWebpush.sendNotification.mock.calls[0];
      expect(subscription).toEqual(JSON.parse(VALID_SUBSCRIPTION));
      expect(options).toMatchObject({ TTL: 3600, urgency: 'high' });

      // iOS requires every push to render a notification, so title and body
      // must always reach the service worker.
      const parsedBody = JSON.parse(body as string);
      expect(parsedBody.title).toBe(PAYLOAD.title);
      expect(parsedBody.body).toBe(PAYLOAD.body);
      expect(parsedBody.data).toEqual({ alertId: '42' });
    });

    it('flags a 410 Gone subscription as invalid so the token gets cleaned up', async () => {
      mockedWebpush.sendNotification.mockRejectedValue(
        Object.assign(new Error('Gone'), { statusCode: 410 }),
      );

      const result = await service.sendNotification(VALID_SUBSCRIPTION, PAYLOAD);

      expect(result.success).toBe(false);
      expect(result.invalidToken).toBe(true);
    });

    it('flags a 404 Not Found subscription as invalid', async () => {
      mockedWebpush.sendNotification.mockRejectedValue(
        Object.assign(new Error('Not Found'), { statusCode: 404 }),
      );

      const result = await service.sendNotification(VALID_SUBSCRIPTION, PAYLOAD);

      expect(result.invalidToken).toBe(true);
    });

    it('does not flag a transient 500 as invalid', async () => {
      mockedWebpush.sendNotification.mockRejectedValue(
        Object.assign(new Error('Internal Server Error'), { statusCode: 500 }),
      );

      const result = await service.sendNotification(VALID_SUBSCRIPTION, PAYLOAD);

      expect(result.success).toBe(false);
      expect(result.invalidToken).toBe(false);
    });

    it('rejects a malformed subscription without calling the push service', async () => {
      const result = await service.sendNotification('not-json', PAYLOAD);

      expect(result).toEqual({
        success: false,
        error: 'MALFORMED_SUBSCRIPTION',
        invalidToken: true,
      });
      expect(mockedWebpush.sendNotification).not.toHaveBeenCalled();
    });

    it('rejects a subscription missing encryption keys', async () => {
      const result = await service.sendNotification(
        JSON.stringify({ endpoint: 'https://web.push.apple.com/abc' }),
        PAYLOAD,
      );

      expect(result.invalidToken).toBe(true);
      expect(mockedWebpush.sendNotification).not.toHaveBeenCalled();
    });
  });
});
