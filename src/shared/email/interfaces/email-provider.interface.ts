/**
 * Provider-agnostic email attachment interface
 */
export interface IEmailProviderAttachment {
  /** Name of the attachment file */
  filename: string;
  /** File content as Buffer or string */
  data: Buffer | string;
  /** Optional content type (MIME type) */
  contentType?: string;
}

/**
 * Provider-agnostic message data structure
 * This interface abstracts away provider-specific implementations
 */
export interface IEmailProviderMessageData {
  /** Sender email address (e.g., "noreply@fifi-alert.com") */
  from: string;
  /** Recipient email address(es) */
  to: string | string[];
  /** Carbon copy recipient(s) (optional) */
  cc?: string | string[];
  /** Blind carbon copy recipient(s) (optional) */
  bcc?: string | string[];
  /** Email subject line */
  subject: string;
  /** Plain text version of email body (optional) */
  text?: string;
  /** HTML version of email body (optional) */
  html?: string;
  /** Email attachment(s) (optional) */
  attachment?: IEmailProviderAttachment | IEmailProviderAttachment[];
  /** Additional provider-specific options (optional) */
  options?: Record<string, any>;
}

/**
 * Standardized email send result interface
 * Providers map their responses to this format
 */
export interface IEmailProviderSendResult {
  /** Unique message ID from the provider */
  id: string;
  /** Success/status message from provider */
  message: string;
  /** HTTP status code (if applicable) */
  status?: number;
  /** Additional metadata from provider (optional) */
  metadata?: Record<string, any>;
}

/**
 * Email provider interface
 * All email providers (Mailgun, SMTP, SendGrid, etc.) must implement this interface
 *
 * This ensures EmailService can work with any provider interchangeably
 */
export interface IEmailProvider {
  /**
   * Send an email via the provider
   *
   * @param data - Provider-agnostic email message data
   * @returns Promise resolving to standardized send result
   * @throws Error if send fails
   */
  send(data: IEmailProviderMessageData): Promise<IEmailProviderSendResult>;
}
