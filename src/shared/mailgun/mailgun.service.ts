import { Injectable, Logger } from '@nestjs/common';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IEmailProvider,
  IEmailProviderMessageData,
  IEmailProviderSendResult,
  IEmailProviderAttachment,
} from '../email/interfaces/email-provider.interface';
import { MailgunEventNames } from '../email/enums';

/**
 * Mailgun API message data structure
 * Based on mailgun.js SDK types
 */
interface MailgunMessageData {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachment?: any;
  [key: string]: any;
}

/**
 * Mailgun API response structure
 */
interface MessagesSendResult {
  id?: string;
  message?: string;
  status?: number;
}

/**
 * MailgunService - Mailgun email provider adapter
 *
 * Implements IEmailProvider interface to enable Mailgun as an email provider.
 * This service is a thin wrapper around the mailgun.js SDK.
 *
 * Environment Variables Required:
 * - MAILGUN_API_KEY: Your Mailgun API key
 * - MAILGUN_DOMAIN: Your verified Mailgun domain
 * - MAILGUN_BASE_URL: Mailgun API endpoint (US: https://api.mailgun.net, EU: https://api.eu.mailgun.net)
 */
@Injectable()
export class MailgunService implements IEmailProvider {
  private readonly logger = new Logger(MailgunService.name);
  private readonly mailgunClient: ReturnType<Mailgun['client']>;
  private readonly domain: string;

  constructor(private readonly eventEmitter: EventEmitter2) {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    const baseUrl = process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net';

    // Validate required environment variables
    if (!apiKey) {
      this.logger.warn(
        'MAILGUN_API_KEY is not set. Mailgun service will not function properly.',
      );
    }
    if (!domain) {
      this.logger.warn(
        'MAILGUN_DOMAIN is not set. Mailgun service will not function properly.',
      );
    }

    // Initialize Mailgun client
    const mailgun = new Mailgun(FormData);
    this.mailgunClient = mailgun.client({
      username: 'api',
      key: apiKey || '',
      url: baseUrl,
    });
    this.domain = domain || '';

    // Log initialization with configuration (without sensitive data)
    this.logger.log({
      message: 'MailgunService initialized',
      metadata: {
        domain: domain || 'not set',
        baseUrl,
        hasApiKey: !!apiKey,
        region: baseUrl.includes('eu') ? 'EU' : 'US',
      },
    });
  }

  /**
   * Send an email via Mailgun
   *
   * @param data - Provider-agnostic email message data
   * @param domain - Optional domain override (defaults to MAILGUN_DOMAIN env var)
   * @returns Promise resolving to standardized send result
   * @throws Error if Mailgun API request fails
   */
  async send(
    data: IEmailProviderMessageData,
    domain?: string,
  ): Promise<IEmailProviderSendResult> {
    const startTime = Date.now();
    const sendDomain = domain || this.domain;
    const recipients = Array.isArray(data.to) ? data.to.length : 1;

    // Log sending attempt
    this.logger.debug({
      message: 'Sending email via Mailgun',
      metadata: {
        domain: sendDomain,
        recipients,
        subject: data.subject,
        hasAttachment: !!data.attachment,
      },
    });

    try {
      // Map provider-agnostic data to Mailgun's format
      const mailgunData = this.mapToMailgunFormat(data);

      // Send email via Mailgun API
      const response = await this.mailgunClient.messages.create(
        sendDomain,
        mailgunData as any, // Cast to any to handle complex union types from mailgun.js
      );

      const duration = Date.now() - startTime;

      // Map Mailgun response to standardized format
      const result: IEmailProviderSendResult = {
        id: response.id || 'unknown',
        message: response.message || 'Email sent',
        status: response.status,
      };

      // Emit provider-specific event on success
      this.eventEmitter.emit(MailgunEventNames.MAILGUN_EMAIL_SENT, {
        to: data.to,
        response,
      });

      // Log success with structured metadata
      this.logger.log({
        message: 'Email sent successfully via Mailgun',
        metadata: {
          messageId: response.id,
          domain: sendDomain,
          recipients,
          subject: data.subject,
          duration_ms: duration,
          status: response.status,
        },
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log failure with context
      this.logger.error({
        message: 'Failed to send email via Mailgun',
        metadata: {
          domain: sendDomain,
          recipients,
          subject: data.subject,
          duration_ms: duration,
          error: error.message,
          status: error.status,
        },
        error,
      });

      throw error;
    }
  }

  /**
   * Map provider-agnostic email data to Mailgun's expected format
   *
   * @param data - Provider-agnostic email message data
   * @returns Mailgun-specific message data
   */
  private mapToMailgunFormat(
    data: IEmailProviderMessageData,
  ): MailgunMessageData {
    const mailgunData: MailgunMessageData = {
      from: data.from,
      to: data.to,
      subject: data.subject,
    };

    // Add optional fields if provided
    if (data.cc) mailgunData.cc = data.cc;
    if (data.bcc) mailgunData.bcc = data.bcc;
    if (data.text) mailgunData.text = data.text;
    if (data.html) mailgunData.html = data.html;

    // Map attachments if provided
    if (data.attachment) {
      mailgunData.attachment = this.mapAttachments(data.attachment);
    }

    // Spread any additional options
    if (data.options) {
      Object.assign(mailgunData, data.options);
    }

    return mailgunData;
  }

  /**
   * Map provider-agnostic attachments to Mailgun format
   *
   * @param attachments - Single attachment or array of attachments
   * @returns Mailgun-compatible attachment format
   */
  private mapAttachments(
    attachments: IEmailProviderAttachment | IEmailProviderAttachment[],
  ): any {
    const attachmentArray = Array.isArray(attachments)
      ? attachments
      : [attachments];

    return attachmentArray.map((attachment) => ({
      filename: attachment.filename,
      data: attachment.data,
      contentType: attachment.contentType,
    }));
  }
}
