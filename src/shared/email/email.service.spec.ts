import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  EmailService,
  baseEmailTemplateNames,
  IEmailTemplate,
} from './email.service';
import { EmailEventNames } from './enums';
import {
  IEmailProvider,
  IEmailProviderMessageData,
  IEmailProviderSendResult,
} from './interfaces/email-provider.interface';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');

// Mock nunjucks
const mockNunjucks = {
  configure: jest.fn(),
  render: jest.fn(),
};
jest.mock('nunjucks', () => mockNunjucks);

// Mock mjml2html
const mockMjml2html = jest.fn();
jest.mock('mjml', () => ({
  __esModule: true,
  default: mockMjml2html,
}));

describe('EmailService', () => {
  let service: EmailService;
  let eventEmitter: EventEmitter2;
  let mockEmailProvider: jest.Mocked<IEmailProvider>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockEmailProvider = {
      send: jest.fn(),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: 'IEmailProvider',
          useValue: mockEmailProvider,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    // Suppress logger output in tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();

    service = new EmailService(mockEmailProvider, mockEventEmitter as any);

    eventEmitter = mockEventEmitter as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with base email templates', () => {
      const templates = service.getEmailTemplateNames();
      expect(templates).toEqual(baseEmailTemplateNames);
    });

    it('should merge module-specific templates with base templates', () => {
      const moduleTemplates: Record<string, IEmailTemplate> = {
        customTemplate: {
          subject: 'Custom Template',
          file: 'custom/template.njk',
        },
      };

      const newService = new EmailService(
        mockEmailProvider,
        eventEmitter,
        moduleTemplates,
      );

      const templates = newService.getEmailTemplateNames();
      expect(templates).toEqual({
        ...baseEmailTemplateNames,
        ...moduleTemplates,
      });
    });

    it('should log initialization message', () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      new EmailService(mockEmailProvider, eventEmitter);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('EmailService initialized'),
      );
    });
  });

  describe('send', () => {
    const basicEmailData: IEmailProviderMessageData = {
      from: 'sender@test.com',
      to: 'recipient@test.com',
      subject: 'Test Email',
      text: 'Test body',
      html: '<p>Test body</p>',
    };

    it('should delegate to email provider', async () => {
      const mockResult: IEmailProviderSendResult = {
        id: 'test-id',
        message: 'Email sent',
        status: 250,
      };

      mockEmailProvider.send.mockResolvedValue(mockResult);

      const result = await service.send(basicEmailData);

      expect(result).toEqual(mockResult);
      expect(mockEmailProvider.send).toHaveBeenCalledWith(basicEmailData);
    });

    it('should emit EMAIL_SENT event on success', async () => {
      const mockResult: IEmailProviderSendResult = {
        id: 'test-id',
        message: 'Email sent',
        status: 250,
      };

      mockEmailProvider.send.mockResolvedValue(mockResult);

      await service.send(basicEmailData);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        EmailEventNames.EMAIL_SENT,
        expect.objectContaining({
          to: basicEmailData.to,
          result: mockResult,
          payload: expect.objectContaining({
            from: basicEmailData.from,
            to: basicEmailData.to,
            subject: basicEmailData.subject,
          }),
        }),
      );
    });

    it('should not include html/text body in event payload', async () => {
      const mockResult: IEmailProviderSendResult = {
        id: 'test-id',
        message: 'Email sent',
        status: 250,
      };

      mockEmailProvider.send.mockResolvedValue(mockResult);

      await service.send(basicEmailData);

      const emitCall = (eventEmitter.emit as jest.Mock).mock.calls[0];
      const payload = emitCall[1].payload;

      expect(payload.html).toBeUndefined();
      expect(payload.text).toBeUndefined();
    });

    it('should emit EMAIL_FAILED event on failure', async () => {
      const error = new Error('Send failed');
      mockEmailProvider.send.mockRejectedValue(error);

      await expect(service.send(basicEmailData)).rejects.toThrow('Send failed');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        EmailEventNames.EMAIL_FAILED,
        expect.objectContaining({
          to: basicEmailData.to,
          error,
          payload: expect.objectContaining({
            from: basicEmailData.from,
            to: basicEmailData.to,
            subject: basicEmailData.subject,
          }),
        }),
      );
    });

    it('should log error on failure', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error');
      const error = new Error('Send failed');
      mockEmailProvider.send.mockRejectedValue(error);

      await expect(service.send(basicEmailData)).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith('Failed to send email', error);
    });

    it('should handle CC and BCC in event payload', async () => {
      const emailDataWithCC: IEmailProviderMessageData = {
        ...basicEmailData,
        cc: 'cc@test.com',
        bcc: ['bcc@test.com'],
      };

      const mockResult: IEmailProviderSendResult = {
        id: 'test-id',
        message: 'Email sent',
        status: 250,
      };

      mockEmailProvider.send.mockResolvedValue(mockResult);

      await service.send(emailDataWithCC);

      const emitCall = (eventEmitter.emit as jest.Mock).mock.calls[0];
      const payload = emitCall[1].payload;

      expect(payload.cc).toBe('cc@test.com');
      expect(payload.bcc).toEqual(['bcc@test.com']);
    });
  });

  describe('sendHtml', () => {
    const templateData = {
      from: 'sender@test.com',
      to: 'recipient@test.com',
      templateData: {
        user: { firstName: 'Test' },
      },
    };

    beforeEach(() => {
      // Mock file system
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      // Mock nunjucks rendering
      mockNunjucks.render.mockReturnValue('<mjml>Test MJML</mjml>');

      // Mock MJML compilation
      mockMjml2html.mockReturnValue({
        html: '<html>Test HTML</html>',
        errors: [],
      });
    });

    it('should load and send template-based email', async () => {
      const mockResult: IEmailProviderSendResult = {
        id: 'test-id',
        message: 'Email sent',
        status: 250,
      };

      mockEmailProvider.send.mockResolvedValue(mockResult);

      const result = await service.sendHtml('welcome', templateData);

      expect(result).toEqual(mockResult);
      expect(mockEmailProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: templateData.from,
          to: templateData.to,
          subject: baseEmailTemplateNames.welcome.subject,
          html: '<html>Test HTML</html>',
        }),
      );
    });

    it('should throw error if template not found', async () => {
      await expect(
        service.sendHtml('nonexistent', templateData),
      ).rejects.toThrow('Email template "nonexistent" not found in registry');
    });

    it('should log error if template send fails', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error');
      const error = new Error('Send failed');
      mockEmailProvider.send.mockRejectedValue(error);

      await expect(service.sendHtml('welcome', templateData)).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send template email: welcome'),
        error,
      );
    });

    it('should pass empty object if templateData not provided', async () => {
      const dataWithoutTemplateData = {
        from: 'sender@test.com',
        to: 'recipient@test.com',
      };

      const mockResult: IEmailProviderSendResult = {
        id: 'test-id',
        message: 'Email sent',
        status: 250,
      };

      mockEmailProvider.send.mockResolvedValue(mockResult);

      await service.sendHtml('welcome', dataWithoutTemplateData);

      expect(mockNunjucks.render).toHaveBeenCalledWith(expect.any(String), {});
    });
  });

  describe('loadTemplate', () => {
    const templateData = {
      user: { firstName: 'Test' },
      link: 'https://example.com',
    };

    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      mockNunjucks.render.mockReturnValue('<mjml>Test MJML</mjml>');
      mockMjml2html.mockReturnValue({
        html: '<html>Test HTML</html>',
        errors: [],
      });
    });

    it('should load and render a template successfully', async () => {
      const html = await service.loadTemplate('welcome', templateData);

      expect(html).toBe('<html>Test HTML</html>');
      expect(fs.existsSync).toHaveBeenCalled();
      expect(mockNunjucks.configure).toHaveBeenCalled();
      expect(mockNunjucks.render).toHaveBeenCalled();
      expect(mockMjml2html).toHaveBeenCalledWith(
        '<mjml>Test MJML</mjml>',
        expect.objectContaining({
          validationLevel: 'soft',
          minify: false,
        }),
      );
    });

    it('should throw error if template not in registry', async () => {
      await expect(
        service.loadTemplate('nonexistent', templateData),
      ).rejects.toThrow('Email template "nonexistent" not found in registry');
    });

    it('should throw error if template file does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(
        service.loadTemplate('welcome', templateData),
      ).rejects.toThrow('Template file not found');
    });

    it('should configure nunjucks with correct root directory', async () => {
      await service.loadTemplate('welcome', templateData);

      expect(mockNunjucks.configure).toHaveBeenCalledWith(
        expect.stringContaining(path.join('notifications', 'email')),
        expect.objectContaining({
          autoescape: false,
          throwOnUndefined: false,
        }),
      );
    });

    it('should pass template data to nunjucks', async () => {
      await service.loadTemplate('welcome', templateData);

      expect(mockNunjucks.render).toHaveBeenCalledWith(
        expect.any(String),
        templateData,
      );
    });

    it('should log warnings if MJML compilation has errors', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      mockMjml2html.mockReturnValue({
        html: '<html>Test HTML</html>',
        errors: ['Warning: Invalid attribute'],
      });

      await service.loadTemplate('welcome', templateData);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('MJML compilation warnings'),
        expect.any(Array),
      );
    });
  });

  describe('Template Registry Management', () => {
    it('should add new templates via setEmailTemplateNames', () => {
      const newTemplates: Record<string, IEmailTemplate> = {
        customTemplate: {
          subject: 'Custom',
          file: 'custom.njk',
        },
      };

      service.setEmailTemplateNames(newTemplates);

      const templates = service.getEmailTemplateNames();
      expect(templates).toHaveProperty('customTemplate');
      expect(templates.customTemplate).toEqual(newTemplates.customTemplate);
    });

    it('should override existing templates via setEmailTemplateNames', () => {
      const overrideTemplate: Record<string, IEmailTemplate> = {
        welcome: {
          subject: 'New Welcome Subject',
          file: 'new-welcome.njk',
        },
      };

      service.setEmailTemplateNames(overrideTemplate);

      const templates = service.getEmailTemplateNames();
      expect(templates.welcome.subject).toBe('New Welcome Subject');
    });

    it('should log when templates are updated', () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');
      const newTemplates: Record<string, IEmailTemplate> = {
        template1: { subject: 'Test 1', file: 'test1.njk' },
        template2: { subject: 'Test 2', file: 'test2.njk' },
      };

      service.setEmailTemplateNames(newTemplates);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Updated template registry with 2 templates'),
      );
    });

    it('should return a shallow copy via getEmailTemplateNames', () => {
      const templates1 = service.getEmailTemplateNames();
      const templates2 = service.getEmailTemplateNames();

      expect(templates1).toEqual(templates2);
      expect(templates1).not.toBe(templates2); // Different objects

      // Modifying returned copy should not affect service
      templates1.welcome.subject = 'Modified';
      const templates3 = service.getEmailTemplateNames();
      expect(templates3.welcome.subject).toBe(
        baseEmailTemplateNames.welcome.subject,
      );
    });
  });

  describe('Event Handlers', () => {
    it('should handle EMAIL_SENT events', () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug');
      const payload = {
        to: 'test@test.com',
        result: { id: 'test-id', message: 'Sent', status: 250 },
      };

      // Manually call the event handler (since @OnEvent is decorator-based)
      (service as any).handleEmailSent(payload);

      expect(debugSpy).toHaveBeenCalledWith(
        'Email sent event for audit:',
        expect.objectContaining({
          to: payload.to,
          messageId: payload.result.id,
        }),
      );
    });

    it('should handle EMAIL_FAILED events', () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug');
      const payload = {
        to: 'test@test.com',
        error: new Error('Send failed'),
      };

      (service as any).handleEmailFailed(payload);

      expect(debugSpy).toHaveBeenCalledWith(
        'Email failed event for audit:',
        expect.objectContaining({
          to: payload.to,
          error: 'Send failed',
        }),
      );
    });
  });
});
