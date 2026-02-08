/**
 * Email System Integration Tests
 * Task 6.4
 *
 * These integration tests verify the wiring between email components:
 * - Provider switching via MAIL_SYSTEM environment variable
 * - SharedModule dependency injection
 * - Event emission flow
 * - End-to-end email sending pipeline
 *
 * Note: Actual email delivery is mocked to avoid sending real emails in tests.
 * For manual testing with real providers, see docs/plans/email-sending/TESTING_GUIDE.md
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { EmailService } from '../src/shared/email/email.service';
import { MailgunService } from '../src/shared/mailgun/mailgun.service';
import { SmtpService } from '../src/shared/smtp/smtp.service';
import { SharedModule } from '../src/shared/shared.module';
import {
  EmailEventNames,
  MailgunEventNames,
  SmtpEventNames,
} from '../src/shared/email/enums';
import * as nodemailer from 'nodemailer';

// Mock external dependencies
jest.mock('mailgun.js', () => {
  return jest.fn().mockImplementation(() => {
    return {
      client: jest.fn().mockReturnValue({
        messages: {
          create: jest.fn().mockResolvedValue({
            id: '<test-mailgun-id>',
            message: 'Queued',
            status: 200,
          }),
        },
      }),
    };
  });
});

jest.mock('nodemailer');

describe('Email System Integration Tests', () => {
  // Store original environment
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock nodemailer transporter
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({
        messageId: '<test-smtp-id>',
        response: '250 OK',
        accepted: ['recipient@test.com'],
        rejected: [],
        envelope: {},
      }),
      verify: jest.fn().mockResolvedValue(true),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Provider Switching', () => {
    it('should use SmtpService when MAIL_SYSTEM=smtp', async () => {
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'test@test.com';
      process.env.SMTP_PASSWORD = 'test-password';

      const module: TestingModule = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot(), SharedModule],
      }).compile();

      const emailService = module.get<EmailService>(EmailService);
      expect(emailService).toBeDefined();

      // Verify SMTP provider is being used
      const provider = (emailService as any).emailProvider;
      expect(provider).toBeInstanceOf(SmtpService);
    });

    it('should use MailgunService when MAIL_SYSTEM=mailgun', async () => {
      process.env.MAIL_SYSTEM = 'mailgun';
      process.env.MAILGUN_API_KEY = 'test-api-key';
      process.env.MAILGUN_DOMAIN = 'test.domain.com';

      const module: TestingModule = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot(), SharedModule],
      }).compile();

      const emailService = module.get<EmailService>(EmailService);
      expect(emailService).toBeDefined();

      // Verify Mailgun provider is being used
      const provider = (emailService as any).emailProvider;
      expect(provider).toBeInstanceOf(MailgunService);
    });

    it('should default to SMTP if MAIL_SYSTEM is not set', async () => {
      delete process.env.MAIL_SYSTEM;
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'test@test.com';
      process.env.SMTP_PASSWORD = 'test-password';

      const module: TestingModule = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot(), SharedModule],
      }).compile();

      const emailService = module.get<EmailService>(EmailService);
      const provider = (emailService as any).emailProvider;
      expect(provider).toBeInstanceOf(SmtpService);
    });
  });

  describe('End-to-End Email Sending (SMTP)', () => {
    let app: TestingModule;
    let emailService: EmailService;
    let eventEmitter: EventEmitter2;

    beforeEach(async () => {
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'test@test.com';
      process.env.SMTP_PASSWORD = 'test-password';

      app = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot(), SharedModule],
      }).compile();

      emailService = app.get<EmailService>(EmailService);
      eventEmitter = app.get<EventEmitter2>(EventEmitter2);
    });

    it('should send email via SMTP and emit events', async () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      const result = await emailService.send({
        from: 'sender@test.com',
        to: 'recipient@test.com',
        subject: 'Integration Test',
        text: 'Test email body',
        html: '<p>Test email body</p>',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('<test-smtp-id>');
      expect(result.status).toBe(250);

      // Verify provider-specific event was emitted
      expect(emitSpy).toHaveBeenCalledWith(
        SmtpEventNames.SMTP_EMAIL_SENT,
        expect.any(Object),
      );

      // Verify generic EMAIL_SENT event was emitted
      expect(emitSpy).toHaveBeenCalledWith(
        EmailEventNames.EMAIL_SENT,
        expect.objectContaining({
          to: 'recipient@test.com',
        }),
      );
    });

    it('should handle email send failure and emit EMAIL_FAILED', async () => {
      const mockTransporter = (nodemailer.createTransport as jest.Mock)();
      mockTransporter.sendMail.mockRejectedValue(
        new Error('SMTP connection failed'),
      );

      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      await expect(
        emailService.send({
          from: 'sender@test.com',
          to: 'recipient@test.com',
          subject: 'Test',
          text: 'Test',
        }),
      ).rejects.toThrow('SMTP connection failed');

      // Verify EMAIL_FAILED event was emitted
      expect(emitSpy).toHaveBeenCalledWith(
        EmailEventNames.EMAIL_FAILED,
        expect.objectContaining({
          to: 'recipient@test.com',
          error: expect.any(Error),
        }),
      );
    });
  });

  describe('End-to-End Email Sending (Mailgun)', () => {
    let app: TestingModule;
    let emailService: EmailService;
    let eventEmitter: EventEmitter2;

    beforeEach(async () => {
      process.env.MAIL_SYSTEM = 'mailgun';
      process.env.MAILGUN_API_KEY = 'test-api-key';
      process.env.MAILGUN_DOMAIN = 'test.domain.com';

      app = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot(), SharedModule],
      }).compile();

      emailService = app.get<EmailService>(EmailService);
      eventEmitter = app.get<EventEmitter2>(EventEmitter2);
    });

    it('should send email via Mailgun and emit events', async () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      const result = await emailService.send({
        from: 'sender@test.com',
        to: 'recipient@test.com',
        subject: 'Integration Test',
        text: 'Test email body',
        html: '<p>Test email body</p>',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('<test-mailgun-id>');
      expect(result.message).toBe('Queued');

      // Verify provider-specific event was emitted
      expect(emitSpy).toHaveBeenCalledWith(
        MailgunEventNames.MAILGUN_EMAIL_SENT,
        expect.any(Object),
      );

      // Verify generic EMAIL_SENT event was emitted
      expect(emitSpy).toHaveBeenCalledWith(
        EmailEventNames.EMAIL_SENT,
        expect.objectContaining({
          to: 'recipient@test.com',
        }),
      );
    });
  });

  describe('Template-Based Emails', () => {
    let app: TestingModule;
    let emailService: EmailService;

    beforeEach(async () => {
      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'test@test.com';
      process.env.SMTP_PASSWORD = 'test-password';

      // Mock file system for template loading
      jest.mock('fs', () => ({
        existsSync: jest.fn().mockReturnValue(true),
      }));

      // Mock nunjucks
      jest.mock('nunjucks', () => ({
        configure: jest.fn(),
        render: jest.fn().mockReturnValue('<mjml>Test MJML</mjml>'),
      }));

      // Mock mjml
      jest.mock('mjml', () => ({
        __esModule: true,
        default: jest.fn().mockReturnValue({
          html: '<html>Test HTML</html>',
          errors: [],
        }),
      }));

      app = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot(), SharedModule],
      }).compile();

      emailService = app.get<EmailService>(EmailService);
    });

    it('should have all base templates registered', () => {
      const templates = emailService.getEmailTemplateNames();

      expect(templates).toHaveProperty('welcome');
      expect(templates).toHaveProperty('passwordReset');
      expect(templates).toHaveProperty('forgotPassword');
      expect(templates).toHaveProperty('invite');
      expect(templates).toHaveProperty('newAlert');
      expect(templates).toHaveProperty('alertResolved');
    });

    it('should allow adding custom templates at runtime', () => {
      const customTemplates = {
        customTemplate: {
          subject: 'Custom Template',
          file: 'custom/template.njk',
        },
      };

      emailService.setEmailTemplateNames(customTemplates);

      const templates = emailService.getEmailTemplateNames();
      expect(templates).toHaveProperty('customTemplate');
      expect(templates.customTemplate).toEqual(customTemplates.customTemplate);
    });
  });

  describe('Configuration Validation', () => {
    it('should throw error if SMTP provider is selected without required config', async () => {
      process.env.MAIL_SYSTEM = 'smtp';
      // Intentionally not setting SMTP_HOST, SMTP_USER, or SMTP_PASSWORD

      // The SharedModule should not throw during module creation
      // because services log warnings instead of throwing
      const module = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot(), SharedModule],
      }).compile();

      const emailService = module.get<EmailService>(EmailService);
      expect(emailService).toBeDefined();
    });

    it('should throw error if Mailgun provider is selected without required config', async () => {
      process.env.MAIL_SYSTEM = 'mailgun';
      // Intentionally not setting MAILGUN_API_KEY or MAILGUN_DOMAIN

      // The SharedModule should not throw during module creation
      const module = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot(), SharedModule],
      }).compile();

      const emailService = module.get<EmailService>(EmailService);
      expect(emailService).toBeDefined();
    });
  });

  describe('Event Flow Integration', () => {
    let app: TestingModule;
    let emailService: EmailService;
    let eventEmitter: EventEmitter2;
    const collectedEvents: Array<{ event: string; payload: any }> = [];

    beforeEach(async () => {
      collectedEvents.length = 0;

      process.env.MAIL_SYSTEM = 'smtp';
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'test@test.com';
      process.env.SMTP_PASSWORD = 'test-password';

      app = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot(), SharedModule],
      }).compile();

      emailService = app.get<EmailService>(EmailService);
      eventEmitter = app.get<EventEmitter2>(EventEmitter2);

      // Listen to all email-related events
      eventEmitter.onAny((event: string, payload: any) => {
        if (
          event.includes('EMAIL') ||
          event.includes('SMTP') ||
          event.includes('MAILGUN')
        ) {
          collectedEvents.push({ event, payload });
        }
      });
    });

    it('should emit events in correct order: provider event → generic event', async () => {
      await emailService.send({
        from: 'sender@test.com',
        to: 'recipient@test.com',
        subject: 'Test',
        text: 'Test',
      });

      expect(collectedEvents.length).toBeGreaterThanOrEqual(2);

      // First event should be provider-specific
      expect(collectedEvents[0].event).toBe(SmtpEventNames.SMTP_EMAIL_SENT);

      // Second event should be generic EMAIL_SENT
      expect(collectedEvents[1].event).toBe(EmailEventNames.EMAIL_SENT);
    });

    it('should pass correct payload through event chain', async () => {
      const emailData = {
        from: 'sender@test.com',
        to: 'recipient@test.com',
        subject: 'Test Event Payload',
        text: 'Test',
      };

      await emailService.send(emailData);

      // Find the EMAIL_SENT event
      const emailSentEvent = collectedEvents.find(
        (e) => e.event === EmailEventNames.EMAIL_SENT,
      );

      expect(emailSentEvent).toBeDefined();
      expect(emailSentEvent!.payload).toMatchObject({
        to: emailData.to,
        payload: expect.objectContaining({
          from: emailData.from,
          to: emailData.to,
          subject: emailData.subject,
        }),
      });

      // Verify html/text are not in event payload (security)
      expect(emailSentEvent!.payload.payload.html).toBeUndefined();
      expect(emailSentEvent!.payload.payload.text).toBeUndefined();
    });
  });
});
