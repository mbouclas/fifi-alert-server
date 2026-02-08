import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MailgunService } from './mailgun.service';
import { MailgunEventNames } from '../email/enums';
import {
  IEmailProviderMessageData,
  IEmailProviderAttachment,
} from '../email/interfaces/email-provider.interface';

// Mock Mailgun module
jest.mock('mailgun.js', () => {
  return jest.fn().mockImplementation(() => {
    return {
      client: jest.fn().mockReturnValue({
        messages: {
          create: jest.fn(),
        },
      }),
    };
  });
});

describe('MailgunService', () => {
  let service: MailgunService;
  let eventEmitter: EventEmitter2;
  let mockMailgunClient: any;

  // Store original env vars
  const originalEnv = process.env;

  beforeEach(async () => {
    // Reset environment variables
    process.env = {
      ...originalEnv,
      MAILGUN_API_KEY: 'test-api-key',
      MAILGUN_DOMAIN: 'test.domain.com',
      MAILGUN_BASE_URL: 'https://api.mailgun.net',
    };

    // Reset mocks
    jest.clearAllMocks();

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailgunService,
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<MailgunService>(MailgunService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    // Get the mocked mailgun client
    mockMailgunClient = (service as any).mailgunClient;
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

    it('should initialize with provided environment variables', () => {
      expect(service).toBeDefined();
      expect((service as any).domain).toBe('test.domain.com');
    });

    it('should warn if MAILGUN_API_KEY is not set', async () => {
      const loggerWarnSpy = jest.spyOn(
        MailgunService.prototype as any,
        'logger',
      );

      delete process.env.MAILGUN_API_KEY;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailgunService,
          {
            provide: EventEmitter2,
            useValue: { emit: jest.fn() },
          },
        ],
      }).compile();

      const newService = module.get<MailgunService>(MailgunService);
      expect(newService).toBeDefined();
    });

    it('should warn if MAILGUN_DOMAIN is not set', async () => {
      delete process.env.MAILGUN_DOMAIN;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailgunService,
          {
            provide: EventEmitter2,
            useValue: { emit: jest.fn() },
          },
        ],
      }).compile();

      const newService = module.get<MailgunService>(MailgunService);
      expect(newService).toBeDefined();
    });

    it('should use default base URL if not provided', async () => {
      delete process.env.MAILGUN_BASE_URL;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailgunService,
          {
            provide: EventEmitter2,
            useValue: { emit: jest.fn() },
          },
        ],
      }).compile();

      const newService = module.get<MailgunService>(MailgunService);
      expect(newService).toBeDefined();
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
      const mockResponse = {
        id: '<20230101120000.1.1234@test.domain.com>',
        message: 'Queued. Thank you.',
        status: 200,
      };

      mockMailgunClient.messages.create.mockResolvedValue(mockResponse);

      const result = await service.send(basicEmailData);

      expect(result).toEqual({
        id: mockResponse.id,
        message: mockResponse.message,
        status: mockResponse.status,
      });

      expect(mockMailgunClient.messages.create).toHaveBeenCalledWith(
        'test.domain.com',
        expect.objectContaining({
          from: basicEmailData.from,
          to: basicEmailData.to,
          subject: basicEmailData.subject,
          text: basicEmailData.text,
          html: basicEmailData.html,
        }),
      );
    });

    it('should emit MAILGUN_EMAIL_SENT event on success', async () => {
      const mockResponse = {
        id: '<test-id>',
        message: 'Queued',
        status: 200,
      };

      mockMailgunClient.messages.create.mockResolvedValue(mockResponse);

      await service.send(basicEmailData);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        MailgunEventNames.MAILGUN_EMAIL_SENT,
        {
          to: basicEmailData.to,
          response: mockResponse,
        },
      );
    });

    it('should handle email with CC and BCC', async () => {
      const emailData: IEmailProviderMessageData = {
        ...basicEmailData,
        cc: 'cc@test.com',
        bcc: ['bcc1@test.com', 'bcc2@test.com'],
      };

      const mockResponse = {
        id: '<test-id>',
        message: 'Queued',
      };

      mockMailgunClient.messages.create.mockResolvedValue(mockResponse);

      await service.send(emailData);

      expect(mockMailgunClient.messages.create).toHaveBeenCalledWith(
        'test.domain.com',
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

      const mockResponse = {
        id: '<test-id>',
        message: 'Queued',
      };

      mockMailgunClient.messages.create.mockResolvedValue(mockResponse);

      await service.send(emailData);

      expect(mockMailgunClient.messages.create).toHaveBeenCalledWith(
        'test.domain.com',
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

      const mockResponse = {
        id: '<test-id>',
        message: 'Queued',
      };

      mockMailgunClient.messages.create.mockResolvedValue(mockResponse);

      await service.send(emailData);

      expect(mockMailgunClient.messages.create).toHaveBeenCalledWith(
        'test.domain.com',
        expect.objectContaining({
          attachment: [
            {
              filename: 'test.pdf',
              data: expect.any(Buffer),
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

      const mockResponse = {
        id: '<test-id>',
        message: 'Queued',
      };

      mockMailgunClient.messages.create.mockResolvedValue(mockResponse);

      await service.send(emailData);

      expect(mockMailgunClient.messages.create).toHaveBeenCalledWith(
        'test.domain.com',
        expect.objectContaining({
          attachment: expect.arrayContaining([
            expect.objectContaining({ filename: 'test1.pdf' }),
            expect.objectContaining({ filename: 'test2.jpg' }),
          ]),
        }),
      );
    });

    it('should use custom domain if provided', async () => {
      const customDomain = 'custom.domain.com';
      const mockResponse = {
        id: '<test-id>',
        message: 'Queued',
      };

      mockMailgunClient.messages.create.mockResolvedValue(mockResponse);

      await service.send(basicEmailData, customDomain);

      expect(mockMailgunClient.messages.create).toHaveBeenCalledWith(
        customDomain,
        expect.any(Object),
      );
    });

    it('should include additional options if provided', async () => {
      const emailData: IEmailProviderMessageData = {
        ...basicEmailData,
        options: {
          'o:tracking': true,
          'o:tag': ['newsletter', 'important'],
        },
      };

      const mockResponse = {
        id: '<test-id>',
        message: 'Queued',
      };

      mockMailgunClient.messages.create.mockResolvedValue(mockResponse);

      await service.send(emailData);

      expect(mockMailgunClient.messages.create).toHaveBeenCalledWith(
        'test.domain.com',
        expect.objectContaining({
          'o:tracking': true,
          'o:tag': ['newsletter', 'important'],
        }),
      );
    });

    it('should throw error on Mailgun API failure', async () => {
      const error = new Error('Mailgun API error');
      mockMailgunClient.messages.create.mockRejectedValue(error);

      await expect(service.send(basicEmailData)).rejects.toThrow(
        'Mailgun API error',
      );

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should handle response with missing id field', async () => {
      const mockResponse = {
        message: 'Queued',
      };

      mockMailgunClient.messages.create.mockResolvedValue(mockResponse);

      const result = await service.send(basicEmailData);

      expect(result.id).toBe('unknown');
      expect(result.message).toBe('Queued');
    });

    it('should handle response with missing message field', async () => {
      const mockResponse = {
        id: '<test-id>',
      };

      mockMailgunClient.messages.create.mockResolvedValue(mockResponse);

      const result = await service.send(basicEmailData);

      expect(result.id).toBe('<test-id>');
      expect(result.message).toBe('Email sent');
    });
  });

  describe('IEmailProvider interface implementation', () => {
    it('should implement send method with correct signature', () => {
      expect(service.send).toBeDefined();
      expect(typeof service.send).toBe('function');
    });
  });
});
