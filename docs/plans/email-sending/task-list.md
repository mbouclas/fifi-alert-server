# Email System Implementation Tasks

> **Goal:** Implement a dual-provider email system with Mailgun and SMTP adapters, configurable via environment variable.

---

## Architecture Overview

```
EmailService (Core)
    ↓ (uses IEmailProvider based on MAIL_SYSTEM env var)
    ├── MailgunService (implements IEmailProvider)
    └── SmtpService (implements IEmailProvider)
```

**Key Design Principles:**
1. Both providers implement the same `IEmailProvider` interface
2. EmailService selects provider dynamically based on `MAIL_SYSTEM` environment variable
3. Template system (MJML + Nunjucks) works identically for both providers
4. Event emission architecture remains consistent across providers

---

## Task Breakdown

### Phase 1: Foundation & Interface Design

#### Task 1.1: Create IEmailProvider Interface
**File:** `src/shared/email/interfaces/email-provider.interface.ts`

**Description:** Define the provider-agnostic interface that both Mailgun and SMTP services will implement.

**Requirements:**
- [x] Create interface file with proper directory structure
- [x] Define `IEmailProvider` interface with `send()` method signature:
  ```typescript
  export interface IEmailProvider {
    send(data: IEmailProviderMessageData): Promise<IEmailProviderSendResult>;
  }
  ```
- [x] Define `IEmailProviderMessageData` interface (provider-agnostic message structure)
- [x] Define `IEmailProviderSendResult` interface (standardized response format)
- [x] Define `IEmailProviderAttachment` interface (attachment structure)
- [x] Add JSDoc comments documenting each interface and its purpose

**Dependencies:** None

**Estimated Time:** 30 minutes

---

#### Task 1.2: Create Email Event Enums
**File:** `src/shared/email/enums/email-events.enum.ts`

**Description:** Centralize all email-related event names.

**Requirements:**
- [x] Create enum for provider-agnostic events (EMAIL_SENT, EMAIL_FAILED)
- [x] Create enum for provider-specific events (MAILGUN_EMAIL_SENT, SMTP_EMAIL_SENT)
- [x] Export all enums from a barrel file

**Dependencies:** None

**Estimated Time:** 15 minutes

---

### Phase 2: Provider Implementations

#### Task 2.1: Refactor MailgunService to Implement IEmailProvider
**File:** `src/shared/mailgun/mailgun.service.ts`

**Description:** Update existing MailgunService (if exists) or create new one implementing IEmailProvider.

**Requirements:**
- [x] Install dependencies: `bun add mailgun.js form-data`
- [x] Create service with `@Injectable()` decorator
- [x] Implement `IEmailProvider` interface
- [x] Initialize Mailgun client in constructor using environment variables
- [x] Implement `send()` method that:
  - Maps `IEmailProviderMessageData` to Mailgun's `MailgunMessageData` format
  - Calls `this.mailgunClient.messages.create()`
  - Maps Mailgun response to `IEmailProviderSendResult`
  - Emits `MAILGUN_EMAIL_SENT` event on success
  - Handles errors and emits `EMAIL_FAILED` event on failure
- [x] Add proper error handling with try/catch
- [x] Add logging for debugging (constructor warnings, send success/failure)
- [x] Validate required environment variables (MAILGUN_API_KEY, MAILGUN_DOMAIN)

**Environment Variables Required:**
```env
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=your-mailgun-domain.com
MAILGUN_BASE_URL=https://api.mailgun.net
```

**Dependencies:** Task 1.1, Task 1.2

**Estimated Time:** 1.5 hours

---

#### Task 2.2: Create SmtpService Implementing IEmailProvider
**File:** `src/shared/smtp/smtp.service.ts`

**Description:** Create SMTP provider adapter using Nodemailer.

**Requirements:**
- [x] Install dependencies: `bun add nodemailer` and `bun add -d @types/nodemailer`
- [x] Create service with `@Injectable()` decorator
- [x] Implement `IEmailProvider` interface
- [x] Initialize Nodemailer transporter in constructor using environment variables:
  - Support for SMTP host, port, secure flag
  - Support for authentication (user, password)
  - Support for common providers (Gmail, Outlook, etc.) via preset configs
- [x] Implement `send()` method that:
  - Maps `IEmailProviderMessageData` to Nodemailer's `MailOptions` format
  - Calls `this.transporter.sendMail()`
  - Maps Nodemailer response to `IEmailProviderSendResult`
  - Emits `SMTP_EMAIL_SENT` event on success
  - Handles errors and emits `EMAIL_FAILED` event on failure
- [x] Implement connection verification method (optional but recommended)
- [x] Add proper error handling with try/catch
- [x] Add logging for debugging
- [x] Validate required environment variables

**Environment Variables Required:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_NAME=FiFi Alert
SMTP_FROM_EMAIL=noreply@fifi-alert.com
```

**Optional Preset Support:**
```env
SMTP_PROVIDER=gmail  # Preset configs for common providers
```

**Dependencies:** Task 1.1, Task 1.2

**Estimated Time:** 2 hours

---

### Phase 3: Core Email Service Updates

#### Task 3.1: Create Provider Factory
**File:** `src/shared/email/factories/email-provider.factory.ts`

**Description:** Create factory function to dynamically resolve the email provider based on environment configuration.

**Requirements:**
- [x] Create factory function: `createEmailProvider(mailSystem: string): IEmailProvider`
- [x] Implement switch/case logic for provider selection:
  - `'mailgun'` → return MailgunService instance
  - `'smtp'` → return SmtpService instance
  - default → throw error with helpful message
- [x] Add validation for MAIL_SYSTEM environment variable
- [x] Add logging when provider is selected
- [x] Export factory function

**Dependencies:** Task 2.1, Task 2.2

**Estimated Time:** 30 minutes

---

#### Task 3.2: Update EmailService to Use Dynamic Provider
**File:** `src/shared/email/email.service.ts`

**Description:** Refactor EmailService to use the selected provider instead of hardcoding MailgunService.

**Requirements:**
- [x] Update constructor to accept `IEmailProvider` instead of `MailgunService`
- [x] Keep existing logic for:
  - Template loading (MJML + Nunjucks)
  - Template registry management
  - Event emission for audit trail
- [x] Update `send()` method to delegate to `this.emailProvider.send()`
- [x] Ensure provider-agnostic interface mapping
- [x] Keep `sendHtml()`, `loadTemplate()`, and other template methods unchanged
- [x] Update JSDoc comments to reflect provider-agnostic design
- [x] Maintain backward compatibility with existing event emission

**Dependencies:** Task 1.1, Task 3.1

**Estimated Time:** 1 hour

---

#### Task 3.3: Update SharedModule for Dynamic Provider
**File:** `src/shared/shared.module.ts`

**Description:** Configure NestJS DI to provide the correct email provider based on environment variable.

**Requirements:**
- [x] Import both MailgunService and SmtpService
- [x] Create a custom provider for `IEmailProvider`:
  ```typescript
  {
    provide: 'IEmailProvider',
    useFactory: (eventEmitter: EventEmitter2) => {
      const mailSystem = process.env.MAIL_SYSTEM || 'smtp';
      if (mailSystem === 'mailgun') {
        return new MailgunService(eventEmitter);
      } else if (mailSystem === 'smtp') {
        return new SmtpService(eventEmitter);
      } else {
        throw new Error(`Invalid MAIL_SYSTEM: ${mailSystem}`);
      }
    },
    inject: [EventEmitter2]
  }
  ```
- [x] Update EmailService to inject `@Inject('IEmailProvider')` instead of MailgunService
- [x] Keep static `eventEmitter` reference for backward compatibility
- [x] Export EmailService (not the individual providers)
- [x] Add validation logging on module initialization

**Dependencies:** Task 2.1, Task 2.2, Task 3.2

**Estimated Time:** 45 minutes

---

### Phase 4: Template System Setup

#### Task 4.1: Create Base MJML Layout Template
**File:** `src/notifications/email/common/layout.nunj`

**Description:** Set up the base Nunjucks template with MJML structure.

**Requirements:**
- [x] Create directory structure: `src/notifications/email/common/`
- [x] Copy base layout template from reproduction guide
- [x] Define overridable blocks: `title`, `header`, `content`, `footer`
- [x] Add company branding placeholders
- [x] Configure responsive email styles via MJML attributes
- [x] Test MJML compilation (syntax check)

**Dependencies:** None (can be done in parallel)

**Estimated Time:** 30 minutes

---

#### Task 4.2: Create Default Email Templates
**Files:**
- `src/notifications/email/user/welcome.njk`
- `src/notifications/email/user/passwordReset.njk`
- `src/notifications/email/alert/newAlert.njk`
- `src/notifications/email/alert/alertResolved.njk`

**Description:** Create common email templates for FiFi Alert use cases.

**Requirements:**
- [x] Create `user/` subdirectory for user-related emails
- [x] Create `alert/` subdirectory for alert-related emails
- [x] Implement welcome email template
- [x] Implement password reset email template
- [x] Implement new alert notification email template
- [x] Implement alert resolved email template
- [x] Each template should extend `common/layout.nunj`
- [x] Use Nunjucks variables for dynamic content
- [x] Test template rendering with sample data

**Template Variables Expected:**
- Welcome: `{ user: { firstName, email }, activationLink }`
- Password Reset: `{ user: { firstName }, resetLink, expiresIn }`
- New Alert: `{ alert: { petName, location, distance }, user: { firstName } }`
- Alert Resolved: `{ alert: { petName, resolution }, user: { firstName } }`

**Dependencies:** Task 4.1

**Estimated Time:** 2 hours

---

#### Task 4.3: Update Base Template Registry
**File:** `src/shared/email/email.service.ts`

**Description:** Register the default templates in EmailService.

**Requirements:**
- [x] Update `baseEmailTemplateNames` constant with FiFi Alert templates:
  ```typescript
  export const baseEmailTemplateNames: Record<string, IEmailTemplate> = {
    welcome: {
      subject: 'Welcome to FiFi Alert!',
      file: 'notifications/email/user/welcome.njk',
    },
    passwordReset: {
      subject: 'Reset Your Password',
      file: 'notifications/email/user/passwordReset.njk',
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
  ```

**Dependencies:** Task 4.2

**Estimated Time:** 15 minutes

---

### Phase 5: Configuration & Environment Setup

#### Task 5.1: Add Environment Variables to .env
**File:** `.env`

**Description:** Add all required environment variables for both email providers.

**Requirements:**
- [x] Add `MAIL_SYSTEM` variable (default: `smtp`)
- [x] Add Mailgun configuration section (with placeholder values)
- [x] Add SMTP configuration section (with real/placeholder values)
- [x] Add email sender defaults (FROM name and email)
- [x] Comment out the provider not in use

**Example:**
```env
# Email Configuration
MAIL_SYSTEM=smtp  # Options: 'mailgun' or 'smtp'

# Email Sender Defaults
EMAIL_FROM_NAME=FiFi Alert
EMAIL_FROM_EMAIL=noreply@fifi-alert.com

# Mailgun Configuration (when MAIL_SYSTEM=mailgun)
# MAILGUN_API_KEY=your-mailgun-api-key
# MAILGUN_DOMAIN=mg.fifi-alert.com
# MAILGUN_BASE_URL=https://api.mailgun.net

# SMTP Configuration (when MAIL_SYSTEM=smtp)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

**Dependencies:** None

**Estimated Time:** 10 minutes

---

#### Task 5.2: Add Environment Variables to .env.example
**File:** `.env.example`

**Description:** Document all email-related environment variables.

**Requirements:**
- [x] Copy email configuration section from `.env`
- [x] Replace sensitive values with placeholders
- [x] Add detailed comments explaining each variable
- [x] Include examples for common SMTP providers (Gmail, Outlook, SendGrid)

**Dependencies:** Task 5.1

**Estimated Time:** 15 minutes

---

#### Task 5.3: Validate Environment Configuration
**File:** `src/config/email.config.ts` (new file)

**Description:** Create configuration validation for email settings.

**Requirements:**
- [x] Create configuration file using `@nestjs/config` if available
- [x] Validate `MAIL_SYSTEM` is either 'mailgun' or 'smtp'
- [x] Validate required variables based on selected provider:
  - If mailgun: MAILGUN_API_KEY, MAILGUN_DOMAIN required
  - If smtp: SMTP_HOST, SMTP_USER, SMTP_PASSWORD required
- [x] Provide clear error messages for missing/invalid configuration
- [x] Export typed configuration object
- [x] Add unit tests for configuration validation

**Dependencies:** Task 5.1

**Estimated Time:** 1 hour

---

### Phase 6: Testing

#### Task 6.1: Unit Tests for MailgunService
**File:** `src/shared/mailgun/mailgun.service.spec.ts`

**Description:** Write comprehensive unit tests for Mailgun provider.

**Requirements:**
- [x] Mock Mailgun client
- [x] Mock EventEmitter2
- [x] Test successful email sending
- [x] Test error handling (API failures)
- [x] Test event emission on success/failure
- [x] Test environment variable validation
- [x] Test interface contract (implements IEmailProvider correctly)
- [x] Achieve >80% code coverage

**Dependencies:** Task 2.1

**Estimated Time:** 1.5 hours

---

#### Task 6.2: Unit Tests for SmtpService
**File:** `src/shared/smtp/smtp.service.spec.ts`

**Description:** Write comprehensive unit tests for SMTP provider.

**Requirements:**
- [x] Mock Nodemailer transporter
- [x] Mock EventEmitter2
- [x] Test successful email sending
- [x] Test error handling (connection failures, auth failures)
- [x] Test event emission on success/failure
- [x] Test environment variable validation
- [x] Test interface contract (implements IEmailProvider correctly)
- [x] Test attachment handling
- [x] Achieve >80% code coverage

**Dependencies:** Task 2.2

**Estimated Time:** 1.5 hours

---

#### Task 6.3: Unit Tests for EmailService
**File:** `src/shared/email/email.service.spec.ts`

**Description:** Write tests for core EmailService with mocked providers.

**Requirements:**
- [x] Mock IEmailProvider (test provider-agnostic design)
- [x] Mock EventEmitter2
- [x] Test `send()` method delegation to provider
- [x] Test `sendHtml()` template rendering pipeline
- [x] Test `loadTemplate()` with MJML + Nunjucks
- [x] Test template registry operations
- [x] Test audit event emission
- [x] Test error handling and failure events
- [x] Achieve >80% code coverage

**Dependencies:** Task 3.2

**Estimated Time:** 2 hours

---

#### Task 6.4: Integration Tests for Email System
**File:** `test/email.e2e-spec.ts`

**Description:** End-to-end tests using real email providers (or mocked services).

**Requirements:**
- [x] Set up test module with SharedModule
- [x] Test provider switching via MAIL_SYSTEM environment variable
- [x] Test sending raw HTML email via SMTP
- [x] Test sending template-based email via SMTP
- [x] Test Mailgun provider (if API key available for testing)
- [x] Test error scenarios (invalid configuration)
- [x] Test event emission to audit system
- [x] Verify emails are formatted correctly

**Optional:** Use tools like [Ethereal Email](https://ethereal.email/) for SMTP testing without sending real emails.

**Dependencies:** Task 3.3, Task 4.3

**Estimated Time:** 2 hours

---

#### Task 6.5: Manual Testing Checklist
**File:** `docs/plans/email-sending/TESTING_CHECKLIST.md` (new file)

**Description:** Create manual testing guide for developers.

**Requirements:**
- [x] Document how to set up test email accounts (Gmail App Password, Ethereal, etc.)
- [x] Create test scripts to send sample emails with both providers
- [x] Verify email rendering in different clients (Gmail, Outlook, Apple Mail, mobile)
- [x] Test all default templates with sample data
- [x] Test error handling (wrong credentials, network failures)
- [x] Document expected behavior for each scenario

**Dependencies:** None (documentation task)

**Estimated Time:** 1 hour

---

### Phase 7: Documentation

#### Task 7.1: Update Reproduction Guide
**File:** `docs/plans/email-sending/email-sending-reproduction-guide.md`

**Description:** Update the reproduction guide to reflect dual-provider architecture.

**Requirements:**
- [x] Add section on provider architecture and selection
- [x] Document IEmailProvider interface
- [x] Add SmtpService implementation details
- [x] Update environment variables section
- [x] Update NestJS module configuration section
- [x] Add troubleshooting section for provider switching
- [x] Update package installation instructions

**Dependencies:** All implementation tasks

**Estimated Time:** 1.5 hours

---

#### Task 7.2: Create Email Module Documentation
**File:** `docs/modules/EMAIL_MODULE.md` (new file)

**Description:** Create comprehensive documentation for the email module.

**Requirements:**
- [x] Document module purpose and architecture
- [x] Explain provider selection mechanism
- [x] Document all public interfaces and methods
- [x] Provide usage examples for each provider
- [x] Document template system and how to add custom templates
- [x] Document event emission and audit integration
- [x] Add troubleshooting guide
- [x] Add FAQs (e.g., "How do I switch providers?", "How do I add a new template?")

**Dependencies:** All implementation tasks

**Estimated Time:** 2 hours

---

#### Task 7.3: Create Quick Start Guide
**File:** `docs/EMAIL_QUICKSTART.md` (new file)

**Description:** Create a quick start guide for developers new to the email system.

**Requirements:**
- [x] Step-by-step setup instructions for both providers
- [x] How to send your first email (with code examples)
- [x] How to create and use custom templates
- [x] Common use cases with code samples
- [x] Link to detailed module documentation

**Dependencies:** Task 7.2

**Estimated Time:** 1 hour

---

### Phase 8: Production Readiness

#### Task 8.1: Add Email Service Health Check
**File:** `src/health/email-health.indicator.ts` (new file)

**Description:** Implement health check for email service.

**Requirements:**
- [x] Create custom health indicator extending `HealthIndicator`
- [x] Implement check for active email provider
- [x] Verify provider configuration is valid
- [x] Test provider connectivity (send test email or verify connection)
- [x] Integrate with existing health check endpoint
- [x] Document health check response format

**Dependencies:** Task 3.3

**Estimated Time:** 1 hour

---

#### Task 8.2: Add Monitoring and Logging
**File:** Update existing email services

**Description:** Enhance logging for production monitoring.

**Requirements:**
- [x] Add structured logging to MailgunService (using NestJS Logger)
- [x] Add structured logging to SmtpService (using NestJS Logger)
- [x] Log provider selection on application startup
- [x] Log email send attempts with metadata (to, subject, provider)
- [x] Log failures with full error context
- [x] Ensure no sensitive data (passwords, full email bodies) in logs
- [x] Document log format and important log events

**Dependencies:** Task 2.1, Task 2.2

**Estimated Time:** 1.5 hours

---

#### Task 8.3: Create Migration Guide
**File:** `docs/EMAIL_MIGRATION_GUIDE.md` (new file)

**Description:** Guide for migrating between email providers.

**Requirements:**
- [x] Document steps to switch from SMTP to Mailgun
- [x] Document steps to switch from Mailgun to SMTP
- [x] Checklist for production provider switching
- [x] Rollback procedures
- [x] Testing recommendations before going live
- [x] Cost comparison and decision factors

**Dependencies:** None (documentation task)

**Estimated Time:** 1 hour

---

## Task Dependencies Visualization

```
Phase 1 (Foundation)
├── Task 1.1: IEmailProvider Interface ← [START]
└── Task 1.2: Email Event Enums ← [START]

Phase 2 (Providers)
├── Task 2.1: MailgunService ← [1.1, 1.2]
└── Task 2.2: SmtpService ← [1.1, 1.2]

Phase 3 (Core Service)
├── Task 3.1: Provider Factory ← [2.1, 2.2]
├── Task 3.2: Update EmailService ← [1.1, 3.1]
└── Task 3.3: Update SharedModule ← [2.1, 2.2, 3.2]

Phase 4 (Templates)
├── Task 4.1: Base MJML Layout ← [START]
├── Task 4.2: Default Templates ← [4.1]
└── Task 4.3: Template Registry ← [4.2]

Phase 5 (Configuration)
├── Task 5.1: .env Setup ← [START]
├── Task 5.2: .env.example ← [5.1]
└── Task 5.3: Config Validation ← [5.1]

Phase 6 (Testing)
├── Task 6.1: MailgunService Tests ← [2.1]
├── Task 6.2: SmtpService Tests ← [2.2]
├── Task 6.3: EmailService Tests ← [3.2]
├── Task 6.4: Integration Tests ← [3.3, 4.3]
└── Task 6.5: Manual Testing Checklist ← [START]

Phase 7 (Documentation)
├── Task 7.1: Update Reproduction Guide ← [ALL IMPL]
├── Task 7.2: Module Documentation ← [ALL IMPL]
└── Task 7.3: Quick Start Guide ← [7.2]

Phase 8 (Production)
├── Task 8.1: Health Check ← [3.3]
├── Task 8.2: Monitoring/Logging ← [2.1, 2.2]
└── Task 8.3: Migration Guide ← [START]
```

---

## Implementation Order Recommendation

**Critical Path (MVP):**
1. Tasks 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → 3.3 (Core functionality)
2. Tasks 5.1 → 5.2 (Environment setup)
3. Tasks 4.1 → 4.2 → 4.3 (Templates)
4. Tasks 6.1 → 6.2 → 6.3 → 6.4 (Testing)

**Post-MVP:**
5. Phase 7 (Documentation)
6. Phase 8 (Production hardening)

**Estimated Total Time:** 25-30 hours

---

## Success Criteria

- [x] Both Mailgun and SMTP providers implement `IEmailProvider` interface
- [x] Email provider can be switched via `MAIL_SYSTEM` environment variable
- [x] No code changes required to switch providers
- [x] All existing email functionality works with both providers
- [x] Template system (MJML + Nunjucks) works identically for both providers
- [x] Event emission and audit logging works for both providers
- [x] Unit test coverage >80% for all email services
- [x] Integration tests pass with both providers
- [x] Documentation is complete and accurate
- [x] Health checks include email service status
- [x] Production-ready logging and monitoring in place

---

## Notes

- **Parallel Work:** Tasks in Phase 1, 4, 5, and 8.3 can be started immediately in parallel
- **Provider Choice:** SMTP is recommended as default (`MAIL_SYSTEM=smtp`) for easier local development
- **Testing:** Use [Ethereal Email](https://ethereal.email/) for development SMTP testing
- **Mailgun Testing:** Requires paid account; consider using sandbox mode for testing
- **Code Quality:** Follow NestJS conventions, use dependency injection, maintain loose coupling
- **Security:** Never commit real credentials to version control

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider-specific features not abstracted | High | Design interface carefully; document limitations |
| SMTP configuration complexity | Medium | Provide presets for common providers (Gmail, Outlook) |
| Template rendering errors | Medium | Add comprehensive error handling and validation |
| Missing environment variables | High | Implement config validation on startup |
| Production email failures | Critical | Implement health checks, monitoring, and retry logic |
| Cost overruns with Mailgun | Medium | Document pricing; provide SMTP as free alternative |

---

## Future Enhancements (Post-Implementation)

- [ ] Add SendGrid as third provider option
- [ ] Implement email queue for bulk sending
- [ ] Add retry logic with exponential backoff
- [ ] Implement email rate limiting per provider
- [ ] Add email preview/testing endpoint for development
- [ ] Support for inline images and advanced attachments
- [ ] Email analytics and tracking (open rates, click rates)
- [ ] A/B testing support for email templates
- [ ] Template editor UI for non-technical users
