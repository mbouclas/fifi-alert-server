import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import * as path from 'path';
import * as fs from 'fs';
import * as nunjucks from 'nunjucks';
import mjml2html from 'mjml';
import type { IEmailProvider } from './interfaces/email-provider.interface';
import {
  IEmailProviderMessageData,
  IEmailProviderSendResult,
  IEmailProviderAttachment,
} from './interfaces/email-provider.interface';
import { EmailEventNames } from './enums';

/**
 * Email template definition
 */
export interface IEmailTemplate {
  /** Email subject line */
  subject: string;
  /** Relative path from src/ to template file */
  file: string;
}

/**
 * Email message data (same as provider interface for backward compat)
 */
export interface IEmailMessageData extends IEmailProviderMessageData { }

/**
 * Email attachment (same as provider interface for backward compat)
 */
export interface IEmailAttachment extends IEmailProviderAttachment { }

/**
 * Template-based email data (subject comes from template registry)
 */
export type IEmailTemplateData = Omit<IEmailMessageData, 'html' | 'subject'> & {
  templateData?: Record<string, any>;
};

/**
 * Email send result (same as provider interface for backward compat)
 */
export interface IEmailSendResult extends IEmailProviderSendResult { }

/**
 * Base email template registry
 * 
 * IMPORTANT: This registry is maintained for backward compatibility.
 * The recommended pattern is for each service to maintain its own local
 * template registry and pass it to EmailService constructor.
 * 
 * Example: UserService maintains userServiceEmailTemplates,
 * AlertService maintains alertServiceEmailTemplates, etc.
 * 
 * This keeps each service's templates isolated and maintainable.
 * See UserService, AlertService, SightingService, and AuthEmailService
 * for implementation examples.
 */
export const baseEmailTemplateNames: Record<string, IEmailTemplate> = {
  welcome: {
    subject: 'Welcome to FiFi Alert!',
    file: 'notifications/email/user/welcome.njk',
  },
  passwordReset: {
    subject: 'Reset Your Password',
    file: 'notifications/email/user/passwordReset.njk',
  },
  forgotPassword: {
    subject: 'Forgot Your Password?',
    file: 'notifications/email/user/forgotPassword.njk',
  },
  invite: {
    subject: "You're Invited!",
    file: 'notifications/email/user/invite.njk',
  },
  newAlert: {
    subject: 'New Pet Alert Near You',
    file: 'notifications/email/alert/newAlert.njk',
  },
  alertResolved: {
    subject: 'Pet Alert Resolved',
    file: 'notifications/email/alert/alertResolved.njk',
  },
};

/**
 * Email sent event payload
 */
export interface IEmailSentEventPayload {
  to: string | string[];
  result: IEmailSendResult;
  payload?: Record<string, any>;
}

/**
 * EmailService - Core email service with template support
 *
 * This service provides:
 * - Provider-agnostic email sending (delegates to IEmailProvider)
 * - Template-based email rendering (MJML + Nunjucks)
 * - Extensible template registry
 * - Event emission for audit logging
 *
 * The service works with any provider implementing IEmailProvider interface.
 * Switch providers by changing the MAIL_SYSTEM environment variable.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private emailTemplateNames: Record<string, IEmailTemplate>;

  constructor(
    private readonly emailProvider: IEmailProvider,
    private readonly eventEmitter: EventEmitter2,
    @Optional() moduleTemplates?: Record<string, IEmailTemplate>,
  ) {
    // Merge base templates with module-specific templates
    this.emailTemplateNames = {
      ...baseEmailTemplateNames,
      ...(moduleTemplates || {}),
    };

    this.logger.log(
      `EmailService initialized with ${Object.keys(this.emailTemplateNames).length} templates`,
    );
  }

  /**
   * Send a raw email (with HTML/text provided directly)
   *
   * @param data - Email message data
   * @returns Promise resolving to send result
   */
  async send(data: IEmailMessageData): Promise<IEmailSendResult> {
    const startTime = Date.now();
    const recipients = Array.isArray(data.to) ? data.to.length : 1;

    // Log email send attempt with metadata (no sensitive content)
    this.logger.log({
      message: 'Attempting to send email',
      metadata: {
        from: data.from,
        recipients,
        subject: data.subject,
        hasHtml: !!data.html,
        hasText: !!data.text,
        hasAttachment: !!data.attachment,
      },
    });

    try {
      // Delegate to the configured email provider
      const result = await this.emailProvider.send(data);

      const duration = Date.now() - startTime;

      // Log successful send with timing
      this.logger.log({
        message: 'Email sent successfully',
        metadata: {
          messageId: result.id,
          recipients,
          subject: data.subject,
          duration_ms: duration,
          status: result.status,
        },
      });

      // Emit generic EMAIL_SENT event for audit logging
      this.eventEmitter.emit(EmailEventNames.EMAIL_SENT, {
        to: data.to,
        result,
        payload: {
          from: data.from,
          to: data.to,
          subject: data.subject,
          cc: data.cc,
          bcc: data.bcc,
          // Intentionally exclude html/text body from event payload
        },
      } as IEmailSentEventPayload);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log failure with context
      this.logger.error({
        message: 'Failed to send email',
        metadata: {
          recipients,
          subject: data.subject,
          duration_ms: duration,
          error: error.message,
        },
        error,
      });

      // Emit EMAIL_FAILED event
      this.eventEmitter.emit(EmailEventNames.EMAIL_FAILED, {
        to: data.to,
        error,
        payload: {
          from: data.from,
          to: data.to,
          subject: data.subject,
        },
      });

      throw error;
    }
  }

  /**
   * Send a template-based email
   *
   * @param templateName - Template name from registry
   * @param data - Email data (subject comes from template)
   * @returns Promise resolving to send result
   */
  async sendHtml(
    templateName: string,
    data: IEmailTemplateData,
  ): Promise<IEmailSendResult> {
    const startTime = Date.now();

    // Log template email attempt
    this.logger.log({
      message: 'Sending template-based email',
      metadata: {
        templateName,
        from: data.from,
        recipients: Array.isArray(data.to) ? data.to.length : 1,
      },
    });

    try {
      // Load and render template
      const html = await this.loadTemplate(
        templateName,
        data.templateData || {},
      );

      const loadDuration = Date.now() - startTime;

      // Log template loading success
      this.logger.debug({
        message: 'Email template loaded successfully',
        metadata: {
          templateName,
          load_duration_ms: loadDuration,
        },
      });

      // Get template metadata
      const template = this.emailTemplateNames[templateName];
      if (!template) {
        throw new Error(
          `Email template "${templateName}" not found in registry`,
        );
      }

      // Send email with rendered HTML
      return await this.send({
        ...data,
        subject: template.subject,
        html,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log template email failure
      this.logger.error({
        message: 'Failed to send template email',
        metadata: {
          templateName,
          from: data.from,
          recipients: Array.isArray(data.to) ? data.to.length : 1,
          duration_ms: duration,
          error: error.message,
        },
        error,
      });

      throw error;
    }
  }

  /**
   * Load and render an email template
   *
   * Pipeline: Nunjucks (.njk) → MJML → HTML
   *
   * @param templateName - Template name from registry
   * @param data - Variables to pass to Nunjucks
   * @returns Promise resolving to rendered HTML
   */
  async loadTemplate(
    templateName: string,
    data: Record<string, any>,
  ): Promise<string> {
    // Look up template in registry
    const template = this.emailTemplateNames[templateName];
    if (!template) {
      throw new Error(`Email template "${templateName}" not found in registry`);
    }

    // Build absolute path to template file
    const templatePath = path.join(process.cwd(), 'src', template.file);

    // Verify template file exists
    if (!fs.existsSync(templatePath)) {
      throw new Error(
        `Template file not found: ${templatePath} (for template: ${templateName})`,
      );
    }

    // Configure Nunjucks with email templates root directory
    // This enables {% extends %} to resolve relative paths correctly
    const emailTemplatesRoot = path.join(
      process.cwd(),
      'src',
      'notifications',
      'email',
    );

    nunjucks.configure(emailTemplatesRoot, {
      autoescape: false, // MJML handles its own escaping
      throwOnUndefined: false, // Gracefully handle missing variables
    });

    // Resolve relative template path for Nunjucks
    const relativeTemplatePath = path.relative(
      emailTemplatesRoot,
      templatePath,
    );

    // Render template with Nunjucks
    const mjmlOutput = nunjucks.render(relativeTemplatePath, data);

    // Compile MJML to responsive HTML
    const htmlOutput = mjml2html(mjmlOutput, {
      validationLevel: 'soft',
      minify: false,
    });

    if (htmlOutput.errors.length > 0) {
      this.logger.warn(
        `MJML compilation warnings for ${templateName}:`,
        htmlOutput.errors,
      );
    }

    return htmlOutput.html;
  }

  /**
   * Add or update templates in the registry at runtime
   *
   * @param templates - Templates to add/merge
   */
  setEmailTemplateNames(templates: Record<string, IEmailTemplate>): void {
    this.emailTemplateNames = {
      ...this.emailTemplateNames,
      ...templates,
    };
    this.logger.log(
      `Updated template registry with ${Object.keys(templates).length} templates`,
    );
  }

  /**
   * Get a copy of the current template registry
   *
   * @returns Shallow copy of template registry
   */
  getEmailTemplateNames(): Record<string, IEmailTemplate> {
    return { ...this.emailTemplateNames };
  }

  /**
   * Event handler for EMAIL_SENT events
   * Re-emits as audit event for AuditLogService to pick up
   *
   * NOTE: This handler is optional - remove if audit logging is not needed
   */
  @OnEvent(EmailEventNames.EMAIL_SENT)
  private handleEmailSent(payload: IEmailSentEventPayload): void {
    // Re-emit as audit event
    // The actual audit event name would be defined in your audit module
    // For now, we'll just log it
    this.logger.debug('Email sent event for audit:', {
      to: payload.to,
      messageId: payload.result.id,
    });

    // If you have an audit module, emit the audit event here:
    // this.eventEmitter.emit('audit.email.sent', {
    //   eventType: 'EMAIL',
    //   entityType: 'EMAIL',
    //   action: 'SENT',
    //   success: true,
    //   description: `Email sent to ${payload.to}`,
    //   metadata: payload,
    // });
  }

  /**
   * Event handler for EMAIL_FAILED events
   * Re-emits as audit event for AuditLogService to pick up
   *
   * NOTE: This handler is optional - remove if audit logging is not needed
   */
  @OnEvent(EmailEventNames.EMAIL_FAILED)
  private handleEmailFailed(payload: any): void {
    this.logger.debug('Email failed event for audit:', {
      to: payload.to,
      error: payload.error?.message,
    });

    // If you have an audit module, emit the audit event here:
    // this.eventEmitter.emit('audit.email.failed', {
    //   eventType: 'EMAIL',
    //   entityType: 'EMAIL',
    //   action: 'SENT',
    //   success: false,
    //   description: `Email failed to send to ${payload.to}`,
    //   metadata: payload,
    // });
  }
}
