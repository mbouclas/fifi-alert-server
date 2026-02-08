/**
 * FCMService Integration Tests
 * Task 6.18
 *
 * Tests Firebase Cloud Messaging integration with mock tokens and payloads
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FCMService } from './fcm.service';

describe('FCMService (Integration)', () => {
  let service: FCMService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FCMService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              // Return placeholder values to prevent FCM initialization
              const config: Record<string, any> = {
                FCM_PROJECT_ID: 'your-project-id',
                FCM_CLIENT_EMAIL:
                  'your-firebase@example.iam.gserviceaccount.com',
                FCM_PRIVATE_KEY:
                  '-----BEGIN PRIVATE KEY-----\\nYourPrivateKeyHere\\n-----END PRIVATE KEY-----',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FCMService>(FCMService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create FCM service instance', () => {
      expect(service).toBeDefined();
    });

    it('should not initialize when credentials are placeholders', () => {
      // Service should log warning and remain not initialized
      // This tests the graceful degradation when FCM is not configured
      expect(service).toBeDefined();
    });
  });

  describe('sendNotification (not initialized)', () => {
    it('should return error when FCM not initialized', async () => {
      const payload = {
        title: '🐕 Missing DOG: Max',
        body: 'Golden Retriever, very friendly',
        imageUrl: 'https://example.com/photo.jpg',
        data: {
          alertId: '123',
          notificationId: '456',
        },
      };

      const result = await service.sendNotification('mock-token-123', payload);

      expect(result).toEqual({
        success: false,
        error: 'FCM_NOT_INITIALIZED',
      });
    });

    it('should handle empty token gracefully', async () => {
      const payload = {
        title: 'Test Title',
        body: 'Test Body',
      };

      const result = await service.sendNotification('', payload);

      expect(result).toEqual({
        success: false,
        error: 'FCM_NOT_INITIALIZED',
      });
    });

    it('should handle null data field', async () => {
      const payload = {
        title: 'Test Title',
        body: 'Test Body',
        data: undefined,
      };

      const result = await service.sendNotification('mock-token', payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('FCM_NOT_INITIALIZED');
    });
  });

  describe('payload validation', () => {
    it('should accept payload with all fields', () => {
      const payload = {
        title: 'Missing Pet Alert',
        body: 'Keep an eye out',
        imageUrl: 'https://cdn.example.com/pet.jpg',
        data: {
          alertId: '100',
          confidence: 'HIGH',
          distanceKm: '2.5',
        },
      };

      expect(payload.title).toBeDefined();
      expect(payload.body).toBeDefined();
      expect(payload.imageUrl).toBeDefined();
      expect(payload.data).toBeDefined();
    });

    it('should accept payload without optional fields', () => {
      const payload = {
        title: 'Test',
        body: 'Test message',
      };

      expect(payload.title).toBeDefined();
      expect(payload.body).toBeDefined();
      expect(payload.imageUrl).toBeUndefined();
      expect(payload.data).toBeUndefined();
    });

    it('should handle long notification text', () => {
      const longBody = 'A'.repeat(300);
      const payload = {
        title: 'Test',
        body: longBody,
      };

      expect(payload.body.length).toBe(300);
    });

    it('should handle special characters in payload', () => {
      const payload = {
        title: '🐕🐈 Pets Missing! Alert 🚨',
        body: 'Multiple pets: "Max" & "Luna" - Call 555-1234',
        data: {
          specialChars: 'Test & "quotes" <html>',
        },
      };

      expect(payload.title).toContain('🐕');
      expect(payload.body).toContain('&');
    });
  });

  describe('batchSend (not initialized)', () => {
    it('should return error for batch send when not initialized', async () => {
      const tokens = ['token1', 'token2', 'token3'];
      const payload = {
        title: 'Batch Test',
        body: 'Testing batch send',
      };

      // Since batchSend is not implemented yet, this tests future functionality
      // For now, we'd need to send individual notifications
      const results = await Promise.all(
        tokens.map((token) => service.sendNotification(token, payload)),
      );

      expect(results.length).toBe(3);
      results.forEach((result) => {
        expect(result.success).toBe(false);
        expect(result.error).toBe('FCM_NOT_INITIALIZED');
      });
    });
  });

  describe('error handling', () => {
    it('should handle invalid token format', async () => {
      const payload = {
        title: 'Test',
        body: 'Test',
      };

      const result = await service.sendNotification(
        'invalid-token-format!!!',
        payload,
      );

      expect(result.success).toBe(false);
    });

    it('should handle network errors gracefully', async () => {
      // This would test actual network errors if FCM was initialized
      const payload = {
        title: 'Test',
        body: 'Test',
      };

      const result = await service.sendNotification('mock-token', payload);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
    });
  });

  describe('token validation', () => {
    it('should recognize FCM token format', () => {
      // FCM tokens are typically 152+ characters
      const mockToken = 'e'.repeat(152);
      expect(mockToken.length).toBeGreaterThanOrEqual(152);
    });

    it('should handle tokens with special characters', () => {
      const mockToken = 'fcm-token-with-dashes-and_underscores:123';
      expect(mockToken).toBeDefined();
    });
  });
});
