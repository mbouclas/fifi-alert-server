import emailConfig from './email.config';
import type { EmailConfig } from './email.config';

describe('EmailConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test - start fresh without email config
    process.env = { ...originalEnv };

    // Remove all email-related env vars to ensure clean state
    delete process.env.MAIL_SYSTEM;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_FROM_NAME;
    delete process.env.SMTP_FROM_EMAIL;
    delete process.env.SMTP_PROVIDER;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.EMAIL_FROM_EMAIL;
    delete process.env.MAILGUN_API_KEY;
    delete process.env.MAILGUN_DOMAIN;
    delete process.env.MAILGUN_BASE_URL;
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('SMTP Provider Configuration', () => {
    it('should validate and return valid SMTP configuration', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.gmail.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_SECURE = 'false';
      process.env.SMTP_USER = 'test@gmail.com';
      process.env.SMTP_PASSWORD = 'test-password';
      process.env.EMAIL_FROM_NAME = 'Test App';
      process.env.EMAIL_FROM_EMAIL = 'test@example.com';

      // Act
      const config = emailConfig();

      // Assert
      expect(config.provider).toBe('smtp');
      expect(config.fromName).toBe('Test App');
      expect(config.fromEmail).toBe('test@example.com');
      expect(config.smtp.host).toBe('smtp.gmail.com');
      expect(config.smtp.port).toBe(587);
      expect(config.smtp.secure).toBe(false);
      expect(config.smtp.user).toBe('test@gmail.com');
      expect(config.smtp.password).toBe('test-password');
    });

    it('should use default values when optional SMTP env vars are missing', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';
      // Omit SMTP_PORT, SMTP_SECURE, EMAIL_FROM_NAME, EMAIL_FROM_EMAIL

      // Act
      const config = emailConfig();

      // Assert
      expect(config.smtp.port).toBe(587); // Default
      expect(config.smtp.secure).toBe(false); // Default
      expect(config.fromName).toBe('FiFi Alert'); // Default
      expect(config.fromEmail).toBe('noreply@fifi-alert.com'); // Default
    });

    it('should throw error when SMTP_HOST is missing', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';
      // Missing SMTP_HOST

      // Act & Assert
      expect(() => emailConfig()).toThrow(
        /SMTP email provider selected but required environment variables are missing: SMTP_HOST/,
      );
    });

    it('should throw error when SMTP_USER is missing', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_PASSWORD = 'pass';
      // Missing SMTP_USER

      // Act & Assert
      expect(() => emailConfig()).toThrow(
        /SMTP email provider selected but required environment variables are missing: SMTP_USER/,
      );
    });

    it('should throw error when SMTP_PASSWORD is missing', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      // Missing SMTP_PASSWORD

      // Act & Assert
      expect(() => emailConfig()).toThrow(
        /SMTP email provider selected but required environment variables are missing: SMTP_PASSWORD/,
      );
    });

    it('should throw error when multiple SMTP env vars are missing', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      // Missing SMTP_HOST, SMTP_USER, SMTP_PASSWORD

      // Act & Assert
      expect(() => emailConfig()).toThrow(
        /SMTP email provider selected but required environment variables are missing: SMTP_HOST, SMTP_USER, SMTP_PASSWORD/,
      );
    });

    it('should throw error when SMTP_PORT is invalid (non-numeric)', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_PORT = 'invalid';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';

      // Act & Assert
      expect(() => emailConfig()).toThrow(/Invalid SMTP_PORT value: "invalid"/);
    });

    it('should throw error when SMTP_PORT is out of range (too low)', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_PORT = '0';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';

      // Act & Assert
      expect(() => emailConfig()).toThrow(/Invalid SMTP_PORT value: "0"/);
    });

    it('should throw error when SMTP_PORT is out of range (too high)', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_PORT = '99999';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';

      // Act & Assert
      expect(() => emailConfig()).toThrow(/Invalid SMTP_PORT value: "99999"/);
    });

    it('should parse SMTP_SECURE as boolean correctly', () => {
      // Arrange - Test true
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';
      process.env.SMTP_SECURE = 'true';

      // Act
      const config = emailConfig();

      // Assert
      expect(config.smtp.secure).toBe(true);
    });

    it('should parse SMTP_SECURE as false when not explicitly "true"', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';
      process.env.SMTP_SECURE = 'false';

      // Act
      const config = emailConfig();

      // Assert
      expect(config.smtp.secure).toBe(false);
    });
  });

  describe('Mailgun Provider Configuration', () => {
    it('should validate and return valid Mailgun configuration', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'mailgun';
      process.env.MAILGUN_API_KEY = 'key-test123';
      process.env.MAILGUN_DOMAIN = 'mg.example.com';
      process.env.MAILGUN_BASE_URL = 'https://api.eu.mailgun.net';
      process.env.EMAIL_FROM_NAME = 'Test App';
      process.env.EMAIL_FROM_EMAIL = 'test@example.com';

      // Act
      const config = emailConfig();

      // Assert
      expect(config.provider).toBe('mailgun');
      expect(config.fromName).toBe('Test App');
      expect(config.fromEmail).toBe('test@example.com');
      expect(config.mailgun.apiKey).toBe('key-test123');
      expect(config.mailgun.domain).toBe('mg.example.com');
      expect(config.mailgun.baseUrl).toBe('https://api.eu.mailgun.net');
    });

    it('should use default Mailgun base URL when not provided', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'mailgun';
      process.env.MAILGUN_API_KEY = 'key-test';
      process.env.MAILGUN_DOMAIN = 'mg.test.com';
      // Omit MAILGUN_BASE_URL

      // Act
      const config = emailConfig();

      // Assert
      expect(config.mailgun.baseUrl).toBe('https://api.mailgun.net');
    });

    it('should throw error when MAILGUN_API_KEY is missing', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'mailgun';
      process.env.MAILGUN_DOMAIN = 'mg.test.com';
      // Missing MAILGUN_API_KEY

      // Act & Assert
      expect(() => emailConfig()).toThrow(
        /Mailgun email provider selected but required environment variables are missing: MAILGUN_API_KEY/,
      );
    });

    it('should throw error when MAILGUN_DOMAIN is missing', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'mailgun';
      process.env.MAILGUN_API_KEY = 'key-test';
      // Missing MAILGUN_DOMAIN

      // Act & Assert
      expect(() => emailConfig()).toThrow(
        /Mailgun email provider selected but required environment variables are missing: MAILGUN_DOMAIN/,
      );
    });

    it('should throw error when both MAILGUN_API_KEY and MAILGUN_DOMAIN are missing', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'mailgun';
      // Missing both

      // Act & Assert
      expect(() => emailConfig()).toThrow(
        /Mailgun email provider selected but required environment variables are missing: MAILGUN_API_KEY, MAILGUN_DOMAIN/,
      );
    });
  });

  describe('Provider Selection', () => {
    it('should default to SMTP when MAIL_SYSTEM is not set', () => {
      // Arrange
      delete process.env.MAIL_SYSTEM;
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';

      // Act
      const config = emailConfig();

      // Assert
      expect(config.provider).toBe('smtp');
    });

    it('should normalize MAIL_SYSTEM to lowercase', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'SMTP';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';

      // Act
      const config = emailConfig();

      // Assert
      expect(config.provider).toBe('smtp');
    });

    it('should throw error for invalid MAIL_SYSTEM value', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'sendgrid';

      // Act & Assert
      expect(() => emailConfig()).toThrow(
        /Invalid MAIL_SYSTEM value: "sendgrid". Must be either 'mailgun' or 'smtp'/,
      );
    });

    it('should throw error for empty MAIL_SYSTEM value', () => {
      // Arrange
      process.env.MAIL_SYSTEM = '';
      // Will default to 'smtp', so provide SMTP config
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';

      // Act
      const config = emailConfig();

      // Assert - Empty string defaults to 'smtp'
      expect(config.provider).toBe('smtp');
    });
  });

  describe('Default Sender Configuration', () => {
    it('should use default sender values when not provided', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';
      // Omit EMAIL_FROM_NAME and EMAIL_FROM_EMAIL

      // Act
      const config = emailConfig();

      // Assert
      expect(config.fromName).toBe('FiFi Alert');
      expect(config.fromEmail).toBe('noreply@fifi-alert.com');
    });

    it('should use custom sender values when provided', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';
      process.env.EMAIL_FROM_NAME = 'Custom App';
      process.env.EMAIL_FROM_EMAIL = 'custom@example.com';

      // Act
      const config = emailConfig();

      // Assert
      expect(config.fromName).toBe('Custom App');
      expect(config.fromEmail).toBe('custom@example.com');
    });

    it('should apply SMTP-specific sender overrides when provided', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';
      process.env.EMAIL_FROM_NAME = 'Default Name';
      process.env.EMAIL_FROM_EMAIL = 'default@example.com';
      process.env.SMTP_FROM_NAME = 'SMTP Name';
      process.env.SMTP_FROM_EMAIL = 'smtp@example.com';

      // Act
      const config = emailConfig();

      // Assert
      expect(config.smtp.fromName).toBe('SMTP Name');
      expect(config.smtp.fromEmail).toBe('smtp@example.com');
    });
  });

  describe('Error Handling', () => {
    it('should log error to console and re-throw', () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      process.env.MAIL_SYSTEM = 'invalid-provider';

      // Act & Assert
      expect(() => emailConfig()).toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][1]).toContain(
        'Invalid MAIL_SYSTEM value',
      );

      // Cleanup
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should throw error when MAIL_SYSTEM has whitespace', () => {
      // Arrange
      process.env.MAIL_SYSTEM = '  smtp  ';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';

      // Act & Assert
      // Config doesn't trim whitespace, so this should throw
      expect(() => emailConfig()).toThrow(
        /Invalid MAIL_SYSTEM value: " {2}smtp {2}"/,
      );
    });

    it('should handle negative SMTP_PORT', () => {
      // Arrange
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_PORT = '-1';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';

      // Act & Assert
      expect(() => emailConfig()).toThrow(/Invalid SMTP_PORT value: "-1"/);
    });

    it('should return complete config structure even when provider not used', () => {
      // Arrange - Use SMTP but also set Mailgun vars
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASSWORD = 'pass';
      process.env.MAILGUN_API_KEY = 'key-test';
      process.env.MAILGUN_DOMAIN = 'mg.test.com';

      // Act
      const config = emailConfig();

      // Assert
      expect(config.provider).toBe('smtp');
      expect(config.smtp).toBeDefined();
      expect(config.mailgun).toBeDefined();
      expect(config.mailgun.apiKey).toBe('key-test');
      expect(config.mailgun.domain).toBe('mg.test.com');
    });
  });
});
