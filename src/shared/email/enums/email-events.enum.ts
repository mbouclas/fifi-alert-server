/**
 * Provider-agnostic email event names
 * These events are emitted by EmailService for any provider
 */
export enum EmailEventNames {
  /** Emitted when any email is successfully sent via EmailService */
  EMAIL_SENT = 'EMAIL_SENT',
  /** Emitted when any email fails to send via EmailService */
  EMAIL_FAILED = 'EMAIL_FAILED',
}

/**
 * Mailgun-specific event names
 * Emitted by MailgunService for tracking provider-specific events
 */
export enum MailgunEventNames {
  /** Emitted when email is successfully sent via Mailgun API */
  MAILGUN_EMAIL_SENT = 'MAILGUN_EMAIL_SENT',
}

/**
 * SMTP-specific event names
 * Emitted by SmtpService for tracking provider-specific events
 */
export enum SmtpEventNames {
  /** Emitted when email is successfully sent via SMTP */
  SMTP_EMAIL_SENT = 'SMTP_EMAIL_SENT',
}
