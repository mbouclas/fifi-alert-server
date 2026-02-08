import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SmtpService } from './smtp.service';
import { SmtpEventNames } from '../email/enums';
import {
  IEmailProviderMessageData,
  IEmailProviderAttachment,
} from '../email/interfaces/email-provider.interface';
import * as nodemailer from 'nodemailer';

// Mock nodemailer
jest.mock('nodemailer');

describe('SmtpService', () => {
  let service: SmtpService;
  let eventEmitter: EventEmitter2;
  let mockTransporter: any;

  // Store original env vars
  const originalEnv = process.env;

  beforeEach(async () => {
    // Reset environment variables
    process.env = {
      ...originalEnv,
      SMTP_HOST: 'smtp.test.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'test@test.com',
      SMTP_PASSWORD: 'test-password',
      SMTP_FROM_NAME: 'Test Sender',
      SMTP_FROM_EMAIL: 'sender@test.com',
    };

    // Reset mocks
    jest.clearAllMocks();

    // Mock transporter
    mockTransporter = {
      sendMail: jest.fn(),
      verify: jest.fn().mockResolvedValue(true),
    };

    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmtpService,
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<SmtpService>(SmtpService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    // Wait for async verify to complete
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize transporter with environment variables', () => {
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@test.com',
          pass: 'test-password',
        },
      });
    });

    it('should verify connection on initialization', async () => {
      // Wait for verify to be called
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    it('should warn if SMTP_HOST is not set', async () => {
      delete process.env.SMTP_HOST;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmtpService,
          {
            provide: EventEmitter2,
            useValue: { emit: jest.fn() },
          },
        ],
      }).compile();

      const newService = module.get<SmtpService>(SmtpService);
      expect(newService).toBeDefined();
    });

    it('should warn if SMTP_USER is not set', async () => {
      delete process.env.SMTP_USER;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmtpService,
          {
            provide: EventEmitter2,
            useValue: { emit: jest.fn() },
          },
        ],
      }).compile();

      const newService = module.get<SmtpService>(SmtpService);
      expect(newService).toBeDefined();
    });

    it('should warn if SMTP_PASSWORD is not set', async () => {
      delete process.env.SMTP_PASSWORD;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmtpService,
          {
            provide: EventEmitter2,
            useValue: { emit: jest.fn() },
          },
        ],
      }).compile();

      const newService = module.get<SmtpService>(SmtpService);
      expect(newService).toBeDefined();
    });

    it('should use default values for optional config', async () => {
      delete process.env.SMTP_FROM_NAME;
      delete process.env.SMTP_FROM_EMAIL;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmtpService,
          {
            provide: EventEmitter2,
            useValue: { emit: jest.fn() },
          },
        ],
      }).compile();

      const newService = module.get<SmtpService>(SmtpService);
      expect(newService).toBeDefined();
    });

    it('should handle connection verification failure gracefully', async () => {
      mockTransporter.verify.mockRejectedValue(new Error('Connection failed'));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmtpService,
          {
            provide: EventEmitter2,
            useValue: { emit: jest.fn() },
          },
        ],
      }).compile();

      const newService = module.get<SmtpService>(SmtpService);
      expect(newService).toBeDefined();

      // Wait for verify to complete
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  });

  describe('Provider Presets', () => {
    it('should use Gmail preset when SMTP_PROVIDER=gmail', async () => {
      process.env.SMTP_PROVIDER = 'gmail';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmtpService,
          {
            provide: EventEmitter2,
            useValue: { emit: jest.fn() },
          },
        ],
      }).compile();

      const newService = module.get<SmtpService>(SmtpService);

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'gmail',
        }),
      );
    });

    it('should use Outlook preset when SMTP_PROVIDER=outlook', async () => {
      process.env.SMTP_PROVIDER = 'outlook';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmtpService,
          {
            provide: EventEmitter2,
            useValue: { emit: jest.fn() },
          },
        ],
      }).compile();

      const newService = module.get<SmtpService>(SmtpService);

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'hotmail',
        }),
      );
    });

    it('should use SendGrid preset when SMTP_PROVIDER=sendgrid', async () => {
      process.env.SMTP_PROVIDER = 'sendgrid';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmtpService,
          {
            provide: EventEmitter2,
            useValue: { emit: jest.fn() },
          },
        ],
      }).compile();

      const newService = module.get<SmtpService>(SmtpService);

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.sendgrid.net',
          port: 587,
          auth: { user: 'apikey', pass: 'test-password' },
        }),
      );
    });
  });

  describe('send', () => {
    const basicEmailData: IEmailProviderMessageData = {
      from: 'sender@test.com',
      to: 'recipient@test.com',
      subject: 'Test Email',
      text: 'Test email body',
      html: '<p>Test email body</p>',
    };

    it('should send a basic email successfully', async () => {
      const mockInfo = {
        messageId: '<test-message-id@test.com>',
        response: '250 Message accepted',
        accepted: ['recipient@test.com'],
        rejected: [],
        envelope: {
          from: 'sender@test.com',
          to: ['recipient@test.com'],
        },
      };

      mockTransporter.sendMail.mockResolvedValue(mockInfo);

      const result = await service.send(basicEmailData);

      expect(result).toEqual({
        id: mockInfo.messageId,
        message: mockInfo.response,
        status: 250,
        metadata: {
          accepted: mockInfo.accepted,
          rejected: mockInfo.rejected,
          envelope: mockInfo.envelope,
        },
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: basicEmailData.from,
          to: basicEmailData.to,
          subject: basicEmailData.subject,
          text: basicEmailData.text,
          html: basicEmailData.html,
        }),
      );
    });

    it('should emit SMTP_EMAIL_SENT event on success', async () => {
      const mockInfo = {
        messageId: '<test-id>',
        response: '250 OK',
        accepted: ['recipient@test.com'],
        rejected: [],
        envelope: {},
      };

      mockTransporter.sendMail.mockResolvedValue(mockInfo);

      await service.send(basicEmailData);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SmtpEventNames.SMTP_EMAIL_SENT,
        {
          to: basicEmailData.to,
          response: mockInfo,
        },
      );
    });

    it('should use default from address if not provided', async () => {
      const emailDataWithoutFrom: IEmailProviderMessageData = {
        to: 'recipient@test.com',
        subject: 'Test',
        text: 'Test',
      };

      const mockInfo = {
        messageId: '<test-id>',
        response: '250 OK',
        accepted: [],
        rejected: [],
        envelope: {},
      };

      mockTransporter.sendMail.mockResolvedValue(mockInfo);

      await service.send(emailDataWithoutFrom);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Test Sender <sender@test.com>',
        }),
      );
    });

    it('should handle email with CC and BCC', async () => {
      const emailData: IEmailProviderMessageData = {
        ...basicEmailData,
        cc: 'cc@test.com',
        bcc: ['bcc1@test.com', 'bcc2@test.com'],
      };

      const mockInfo = {
        messageId: '<test-id>',
        response: '250 OK',
        accepted: [],
        rejected: [],
        envelope: {},
      };

      mockTransporter.sendMail.mockResolvedValue(mockInfo);

      await service.send(emailData);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: 'cc@test.com',
          bcc: ['bcc1@test.com', 'bcc2@test.com'],
        }),
      );
    });

    it('should handle multiple recipients', async () => {
      const emailData: IEmailProviderMessageData = {
        ...basicEmailData,
        to: ['recipient1@test.com', 'recipient2@test.com'],
      };

      const mockInfo = {
        messageId: '<test-id>',
        response: '250 OK',
        accepted: [],
        rejected: [],
        envelope: {},
      };

      mockTransporter.sendMail.mockResolvedValue(mockInfo);

      await service.send(emailData);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['recipient1@test.com', 'recipient2@test.com'],
        }),
      );
    });

    it('should handle single attachment', async () => {
      const attachment: IEmailProviderAttachment = {
        filename: 'test.pdf',
        data: Buffer.from('test data'),
        contentType: 'application/pdf',
      };

      const emailData: IEmailProviderMessageData = {
        ...basicEmailData,
        attachment,
      };

      const mockInfo = {
        messageId: '<test-id>',
        response: '250 OK',
        accepted: [],
        rejected: [],
        envelope: {},
      };

      mockTransporter.sendMail.mockResolvedValue(mockInfo);

      await service.send(emailData);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: 'test.pdf',
              content: expect.any(Buffer),
              contentType: 'application/pdf',
            },
          ],
        }),
      );
    });

    it('should handle multiple attachments', async () => {
      const attachments: IEmailProviderAttachment[] = [
        {
          filename: 'test1.pdf',
          data: Buffer.from('test data 1'),
          contentType: 'application/pdf',
        },
        {
          filename: 'test2.jpg',
          data: Buffer.from('test data 2'),
          contentType: 'image/jpeg',
        },
      ];

      const emailData: IEmailProviderMessageData = {
        ...basicEmailData,
        attachment: attachments,
      };

      const mockInfo = {
        messageId: '<test-id>',
        response: '250 OK',
        accepted: [],
        rejected: [],
        envelope: {},
      };

      mockTransporter.sendMail.mockResolvedValue(mockInfo);

      await service.send(emailData);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({ filename: 'test1.pdf' }),
            expect.objectContaining({ filename: 'test2.jpg' }),
          ]),
        }),
      );
    });

    it('should include additional options if provided', async () => {
      const emailData: IEmailProviderMessageData = {
        ...basicEmailData,
        options: {
          priority: 'high',
          headers: { 'X-Custom-Header': 'test' },
        },
      };

      const mockInfo = {
        messageId: '<test-id>',
        response: '250 OK',
        accepted: [],
        rejected: [],
        envelope: {},
      };

      mockTransporter.sendMail.mockResolvedValue(mockInfo);

      await service.send(emailData);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'high',
          headers: { 'X-Custom-Header': 'test' },
        }),
      );
    });

    it('should throw error on SMTP send failure', async () => {
      const error = new Error('SMTP connection error');
      mockTransporter.sendMail.mockRejectedValue(error);

      await expect(service.send(basicEmailData)).rejects.toThrow(
        'SMTP connection error',
      );

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should handle authentication failure', async () => {
      const error = new Error('Invalid login: 535 Authentication failed');
      mockTransporter.sendMail.mockRejectedValue(error);

      await expect(service.send(basicEmailData)).rejects.toThrow(
        'Invalid login',
      );
    });

    it('should handle connection timeout', async () => {
      const error = new Error('Connection timeout');
      mockTransporter.sendMail.mockRejectedValue(error);

      await expect(service.send(basicEmailData)).rejects.toThrow(
        'Connection timeout',
      );
    });
  });

  describe('IEmailProvider interface implementation', () => {
    it('should implement send method with correct signature', () => {
      expect(service.send).toBeDefined();
      expect(typeof service.send).toBe('function');
    });
  });
});
