import { registerAs } from '@nestjs/config';

/**
 * Email Provider Types
 */
export type EmailProvider = 'mailgun' | 'smtp';

/**
 * Email Configuration Interface
 */
export interface EmailConfig {
  /** Selected email provider ('mailgun' | 'smtp') */
  provider: EmailProvider;
  /** Default sender name */
  fromName: string;
  /** Default sender email address */
  fromEmail: string;
  /** SMTP configuration (when provider is 'smtp') */
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    fromName: string;
    fromEmail: string;
  };
  /** Mailgun configuration (when provider is 'mailgun') */
  mailgun: {
    apiKey: string;
    domain: string;
    baseUrl: string;
  };
}

/**
 * Validates email configuration based on selected provider.
 *
 * @throws {Error} If required configuration values are missing or invalid
 */
function validateEmailConfig(): EmailConfig {
  const provider = (process.env.MAIL_SYSTEM?.toLowerCase() ||
    'smtp') as EmailProvider;

  // Validate provider value
  if (!['mailgun', 'smtp'].includes(provider)) {
    throw new Error(
      `Invalid MAIL_SYSTEM value: "${provider}". Must be either 'mailgun' or 'smtp'.`,
    );
  }

  // Default sender configuration
  const fromName = process.env.EMAIL_FROM_NAME || 'FiFi Alert';
  const fromEmail = process.env.EMAIL_FROM_EMAIL || 'noreply@fifi-alert.com';

  // SMTP Configuration
  const smtpConfig = {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromName: process.env.SMTP_FROM_NAME || fromName,
    fromEmail: process.env.SMTP_FROM_EMAIL || fromEmail,
  };

  // Mailgun Configuration
  const mailgunConfig = {
    apiKey: process.env.MAILGUN_API_KEY || '',
    domain: process.env.MAILGUN_DOMAIN || '',
    baseUrl: process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net',
  };

  // Provider-specific validation
  if (provider === 'smtp') {
    const missingVars: string[] = [];

    if (!smtpConfig.host) missingVars.push('SMTP_HOST');
    if (!smtpConfig.user) missingVars.push('SMTP_USER');
    if (!smtpConfig.password) missingVars.push('SMTP_PASSWORD');

    if (missingVars.length > 0) {
      throw new Error(
        `SMTP email provider selected but required environment variables are missing: ${missingVars.join(', ')}. ` +
          `Please set these variables in your .env file or switch MAIL_SYSTEM to 'mailgun'.`,
      );
    }

    // Validate port is a valid number
    if (
      isNaN(smtpConfig.port) ||
      smtpConfig.port <= 0 ||
      smtpConfig.port > 65535
    ) {
      throw new Error(
        `Invalid SMTP_PORT value: "${process.env.SMTP_PORT}". Must be a number between 1 and 65535.`,
      );
    }
  }

  if (provider === 'mailgun') {
    const missingVars: string[] = [];

    if (!mailgunConfig.apiKey) missingVars.push('MAILGUN_API_KEY');
    if (!mailgunConfig.domain) missingVars.push('MAILGUN_DOMAIN');

    if (missingVars.length > 0) {
      throw new Error(
        `Mailgun email provider selected but required environment variables are missing: ${missingVars.join(', ')}. ` +
          `Please set these variables in your .env file or switch MAIL_SYSTEM to 'smtp'.`,
      );
    }
  }

  return {
    provider,
    fromName,
    fromEmail,
    smtp: smtpConfig,
    mailgun: mailgunConfig,
  };
}

/**
 * Email configuration namespace.
 *
 * Centralizes all email-related configuration values and validates
 * required variables based on the selected email provider (MAIL_SYSTEM).
 *
 * @throws {Error} If required configuration is missing or invalid
 *
 * @example
 * // Inject in a service
 * constructor(
 *   @Inject(emailConfig.KEY)
 *   private emailConfig: ConfigType<typeof emailConfig>,
 * ) {}
 *
 * // Access values
 * const provider = this.emailConfig.provider;
 * const smtpHost = this.emailConfig.smtp.host;
 */
export default registerAs('email', () => {
  try {
    return validateEmailConfig();
  } catch (error) {
    // Log error for visibility and re-throw
    console.error(
      '\n❌ Email Configuration Error:\n',
      error instanceof Error ? error.message : error,
      '\n',
    );
    throw error;
  }
});
