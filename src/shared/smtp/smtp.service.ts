import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IEmailProvider,
  IEmailProviderMessageData,
  IEmailProviderSendResult,
  IEmailProviderAttachment,
} from '../email/interfaces/email-provider.interface';
import { SmtpEventNames } from '../email/enums';

/**
 * SmtpService - SMTP email provider adapter using Nodemailer
 *
 * Implements IEmailProvider interface to enable SMTP as an email provider.
 * Supports all standard SMTP servers and common providers (Gmail, Outlook, etc.).
 *
 * Environment Variables Required:
 * - SMTP_HOST: SMTP server hostname (e.g., smtp.gmail.com)
 * - SMTP_PORT: SMTP server port (e.g., 587 for TLS, 465 for SSL)
 * - SMTP_SECURE: Use SSL/TLS (true/false)
 * - SMTP_USER: SMTP authentication username
 * - SMTP_PASSWORD: SMTP authentication password
 * - SMTP_FROM_NAME: Default sender name (optional)
 * - SMTP_FROM_EMAIL: Default sender email (optional)
 *
 * Optional:
 * - SMTP_PROVIDER: Preset provider name (gmail, outlook, etc.)
 */
@Injectable()
export class SmtpService implements IEmailProvider {
  private readonly logger = new Logger(SmtpService.name);
  private readonly transporter: Transporter;
  private readonly defaultFrom: string;

  constructor(private readonly eventEmitter: EventEmitter2) {
    // Get configuration from environment
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    const fromName = process.env.SMTP_FROM_NAME || 'FiFi Alert';
    const fromEmail = process.env.SMTP_FROM_EMAIL || 'noreply@fifi-alert.com';

    // Validate required environment variables
    if (!host) {
      this.logger.warn(
        'SMTP_HOST is not set. SMTP service will not function properly.',
      );
    }
    if (!user) {
      this.logger.warn(
        'SMTP_USER is not set. SMTP service will not function properly.',
      );
    }
    if (!password) {
      this.logger.warn(
        'SMTP_PASSWORD is not set. SMTP service will not function properly.',
      );
    }

    // Check for preset provider configuration
    const provider = process.env.SMTP_PROVIDER?.toLowerCase();
    const transportConfig = this.getProviderPreset(provider) || {
      host,
      port,
      secure,
      auth: {
        user: user || '',
        pass: password || '',
      },
    };

    // Initialize Nodemailer transporter
    this.transporter = nodemailer.createTransport(transportConfig);
    this.defaultFrom = `${fromName} <${fromEmail}>`;

    // Log SMTP configuration (without sensitive data)
    this.logger.log({
      message: 'SmtpService initialized',
      metadata: {
        host: host || provider || 'not set',
        port,
        secure,
        hasAuth: !!(user && password),
        defaultFrom: fromEmail,
        provider: provider || 'custom',
      },
    });

    // Verify connection configuration (async, but don't block constructor)
    this.verifyConnection();
  }

  /**
   * Get preset configuration for common email providers
   *
   * @param provider - Provider name (gmail, outlook, etc.)
   * @returns Nodemailer transport configuration or null
   */
  private getProviderPreset(provider?: string): any {
    if (!provider) return null;

    const user = process.env.SMTP_USER || '';
    const password = process.env.SMTP_PASSWORD || '';

    const presets: Record<string, any> = {
      gmail: {
        service: 'gmail',
        auth: { user, pass: password },
      },
      outlook: {
        service: 'hotmail',
        auth: { user, pass: password },
      },
      yahoo: {
        service: 'yahoo',
        auth: { user, pass: password },
      },
      sendgrid: {
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: { user: 'apikey', pass: password },
      },
    };

    return presets[provider] || null;
  }

  /**
   * Verify SMTP connection configuration
   * Logs result but doesn't throw to avoid blocking initialization
   */
  private async verifyConnection(): Promise<void> {
    const startTime = Date.now();
    try {
      await this.transporter.verify();
      const duration = Date.now() - startTime;

      this.logger.log({
        message: 'SMTP connection verified',
        metadata: {
          duration_ms: duration,
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
        },
      });
    } catch (error) {
      this.logger.error({
        message: 'SMTP connection verification failed',
        metadata: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          error: error.message,
        },
        error,
      });
    }
  }

  /**
   * Send an email via SMTP
   *
   * @param data - Provider-agnostic email message data
   * @returns Promise resolving to standardized send result
   * @throws Error if SMTP send fails
   */
  async send(
    data: IEmailProviderMessageData,
  ): Promise<IEmailProviderSendResult> {
    const startTime = Date.now();
    const recipients = Array.isArray(data.to) ? data.to.length : 1;

    // Log sending attempt
    this.logger.debug({
      message: 'Sending email via SMTP',
      metadata: {
        recipients,
        subject: data.subject,
        hasAttachment: !!data.attachment,
      },
    });

    try {
      // Map provider-agnostic data to Nodemailer's format
      const mailOptions = this.mapToNodemailerFormat(data);

      // Send email via SMTP
      const info = await this.transporter.sendMail(mailOptions);

      const duration = Date.now() - startTime;

      // Map Nodemailer response to standardized format
      const result: IEmailProviderSendResult = {
        id: info.messageId,
        message: info.response,
        status: 250, // SMTP success code
        metadata: {
          accepted: info.accepted,
          rejected: info.rejected,
          envelope: info.envelope,
        },
      };

      // Emit provider-specific event on success
      this.eventEmitter.emit(SmtpEventNames.SMTP_EMAIL_SENT, {
        to: data.to,
        response: info,
      });

      // Log success with structured metadata
      this.logger.log({
        message: 'Email sent successfully via SMTP',
        metadata: {
          messageId: info.messageId,
          recipients,
          subject: data.subject,
          accepted: info.accepted?.length || 0,
          rejected: info.rejected?.length || 0,
          duration_ms: duration,
        },
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log failure with context
      this.logger.error({
        message: 'Failed to send email via SMTP',
        metadata: {
          recipients,
          subject: data.subject,
          duration_ms: duration,
          error: error.message,
          code: error.code,
          command: error.command,
        },
        error,
      });

      throw error;
    }
  }

  /**
   * Map provider-agnostic email data to Nodemailer's expected format
   *
   * @param data - Provider-agnostic email message data
   * @returns Nodemailer mail options
   */
  private mapToNodemailerFormat(data: IEmailProviderMessageData): Mail.Options {
    const mailOptions: Mail.Options = {
      from: data.from || this.defaultFrom,
      to: data.to,
      subject: data.subject,
    };

    // Add optional fields if provided
    if (data.cc) mailOptions.cc = data.cc;
    if (data.bcc) mailOptions.bcc = data.bcc;
    if (data.text) mailOptions.text = data.text;
    if (data.html) mailOptions.html = data.html;

    // Map attachments if provided
    if (data.attachment) {
      mailOptions.attachments = this.mapAttachments(data.attachment);
    }

    // Spread any additional options
    if (data.options) {
      Object.assign(mailOptions, data.options);
    }

    return mailOptions;
  }

  /**
   * Map provider-agnostic attachments to Nodemailer format
   *
   * @param attachments - Single attachment or array of attachments
   * @returns Nodemailer-compatible attachment format
   */
  private mapAttachments(
    attachments: IEmailProviderAttachment | IEmailProviderAttachment[],
  ): Mail.Attachment[] {
    const attachmentArray = Array.isArray(attachments)
      ? attachments
      : [attachments];

    return attachmentArray.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.data,
      contentType: attachment.contentType,
    }));
  }
}
