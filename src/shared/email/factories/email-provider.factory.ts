import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IEmailProvider } from '../interfaces/email-provider.interface';
import { MailgunService } from '../../mailgun/mailgun.service';
import { SmtpService } from '../../smtp/smtp.service';

/**
 * Email provider factory
 *
 * Creates and returns the appropriate email provider instance based on
 * the MAIL_SYSTEM environment variable.
 *
 * Supported providers:
 * - 'mailgun' → MailgunService
 * - 'smtp' → SmtpService (default)
 *
 * @param mailSystem - Provider name from environment (MAIL_SYSTEM)
 * @param eventEmitter - NestJS EventEmitter2 instance for event emission
 * @returns IEmailProvider implementation
 * @throws Error if invalid provider specified
 */
export function createEmailProvider(
  mailSystem: string,
  eventEmitter: EventEmitter2,
): IEmailProvider {
  const logger = new Logger('EmailProviderFactory');
  const normalizedSystem = (mailSystem || 'smtp').toLowerCase().trim();

  logger.log({
    message: 'Initializing email provider',
    metadata: {
      mail_system: normalizedSystem,
      env_value: mailSystem,
    },
  });

  switch (normalizedSystem) {
    case 'mailgun':
      logger.log({
        message: 'Email provider initialized',
        metadata: {
          provider: 'mailgun',
          features: ['api-based', 'webhooks', 'analytics', 'dedicated-ips'],
        },
      });
      return new MailgunService(eventEmitter);

    case 'smtp':
      logger.log({
        message: 'Email provider initialized',
        metadata: {
          provider: 'smtp',
          features: ['standard', 'portable', 'self-hosted'],
        },
      });
      return new SmtpService(eventEmitter);

    default:
      const errorMessage = `Invalid MAIL_SYSTEM environment variable: "${mailSystem}". Must be "mailgun" or "smtp".`;
      logger.error({
        message: 'Email provider initialization failed',
        metadata: {
          mail_system: mailSystem,
          allowed_values: ['mailgun', 'smtp'],
        },
        error: new Error(errorMessage),
      });
      throw new Error(errorMessage);
  }
}
