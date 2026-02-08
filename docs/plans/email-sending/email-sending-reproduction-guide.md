# Email Sending Functionality — Reproduction Guide

> **Audience:** AI coding agents tasked with reproducing this email system in a new NestJS application.
> **Source project:** `digital-card-server`

---

## Table of Contents

1. [Overview](#overview)
2. [Required Packages](#required-packages)
3. [Environment Variables](#environment-variables)
4. [Directory & File Structure](#directory--file-structure)
5. [Service Implementation](#service-implementation)
   - [MailgunService (Provider Adapter)](#1-mailgunservice-provider-adapter)
   - [EmailService (Core Email Service)](#2-emailservice-core-email-service)
6. [Template System (MJML + Nunjucks)](#template-system-mjml--nunjucks)
   - [Base Layout Template](#base-layout-template)
   - [Child Templates](#child-templates)
7. [NestJS Module Configuration](#nestjs-module-configuration)
8. [Event & Audit Integration](#event--audit-integration)
9. [TypeScript Path Aliases](#typescript-path-aliases)
10. [Step-by-Step Reproduction Checklist](#step-by-step-reproduction-checklist)

---

## Overview

The email system is a **three-layer architecture** with a **dual-provider design**:

### Architecture Layers

1. **Provider Layer** — Adapter services that interface with external email delivery systems:
   - **`MailgunService`** — Wrapper around the `mailgun.js` SDK for Mailgun API
   - **`SmtpService`** — Wrapper around `nodemailer` for SMTP-based email delivery
   
2. **Abstraction Layer** — **`IEmailProvider`** interface defines a provider-agnostic contract that both providers implement

3. **Core Service Layer** — **`EmailService`** provides the main API for sending emails. It delegates to the active provider (selected via environment variables) and handles template rendering with MJML + Nunjucks

### Provider Selection

The system dynamically selects the email provider at startup based on the `MAIL_SYSTEM` environment variable:

```typescript
// Factory pattern for provider selection
export function createEmailProvider(
  mailSystem: string,
  mailgunService?: MailgunService,
  smtpService?: SmtpService,
): IEmailProvider {
  switch (mailSystem?.toLowerCase()) {
    case 'mailgun':
      if (!mailgunService) throw new Error('MailgunService not available');
      return mailgunService;
    case 'smtp':
      if (!smtpService) throw new Error('SmtpService not available');
      return smtpService;
    default:
      throw new Error(`Unknown MAIL_SYSTEM: ${mailSystem}`);
  }
}
```

**No code changes** are required to switch providers — just update the environment variable and restart.

### Email Flow

#### Direct Email Flow
```
Caller → EmailService.send(data)
           ↓
         EmailService delegates to active provider
           ↓
         MailgunService.send() OR SmtpService.send()
           ↓
         External API (Mailgun or SMTP server)
           ↓
         Events emitted → AuditLogService picks them up
```

#### Template-Based Email Flow
```
Caller → EmailService.sendHtml(templateName, data)
           ↓
         EmailService.loadTemplate() → Nunjucks renders .njk → MJML compiles to HTML
           ↓
         EmailService.send(data with compiled HTML)
           ↓
         Active provider sends email (MailgunService or SmtpService)
           ↓
         Events emitted → AuditLogService picks them up
```

---

## Required Packages

Install these npm packages in your new NestJS project:

### Core Dependencies

| Package              | Version (tested) | Purpose                                              |
|----------------------|-------------------|------------------------------------------------------|
| `mailgun.js`         | `^12.6.1`         | Mailgun SDK for sending emails (Mailgun provider)     |
| `form-data`          | (peer dep of mailgun.js) | Required by mailgun.js for form encoding   |
| `nodemailer`         | `^6.9.16`         | SMTP client for sending emails (SMTP provider)        |
| `mjml`               | `^4.18.0`         | MJML-to-HTML compiler for responsive email templates  |
| `nunjucks`           | `^3.2.4`          | Template engine for rendering variables/logic in MJML |

### NestJS Dependencies

| Package                        | Version (tested) | Purpose                                       |
|--------------------------------|-------------------|-----------------------------------------------|
| `@nestjs/common`               | `^11.1.2`         | Core NestJS framework                          |
| `@nestjs/core`                 | `^11.1.2`         | Core NestJS framework                          |
| `@nestjs/event-emitter`        | `^3.0.1`          | Event-driven audit logging after email send    |

### Type Definitions (devDependencies)

| Package             | Version (tested) | Purpose                              |
|---------------------|-------------------|--------------------------------------|
| `@types/node`       | `^22.15.27`       | Node.js type definitions              |
| `@types/nodemailer` | `^6.4.17`         | Type definitions for nodemailer       |

### Installation Command

```bash
# Using bun (preferred)
bun add mailgun.js form-data nodemailer mjml nunjucks @nestjs/event-emitter
bun add -d @types/nodemailer

# Using npm
npm install mailgun.js form-data nodemailer mjml nunjucks @nestjs/event-emitter
npm install -D @types/nodemailer
```

> **Note:** `@nestjs/common`, `@nestjs/core`, and `reflect-metadata` are assumed to already be part of your NestJS project.

---

## Environment Variables

Add these to your `.env` and `.env.example` files:

### Provider Selection

```env
# Email Provider Selection
MAIL_SYSTEM=smtp  # Options: 'smtp' or 'mailgun'
```

- `MAIL_SYSTEM` — Determines which email provider to use. Set to `smtp` or `mailgun`.

### SMTP Configuration (if MAIL_SYSTEM=smtp)

```env
# SMTP Configuration
SMTP_HOST=smtp.gmail.com           # SMTP server hostname
SMTP_PORT=587                      # SMTP port (587 for TLS, 465 for SSL)
SMTP_SECURE=false                  # Use SSL (true for port 465, false for 587)
SMTP_USER=your-email@gmail.com     # SMTP username/email
SMTP_PASSWORD=your-app-password    # SMTP password or app-specific password

# Optional SMTP Authentication
SMTP_AUTH_TYPE=login               # Auth type: 'login' (default), 'oauth2', or 'plain'
```

**Common SMTP Providers:**

| Provider | Host | Port | Secure | Notes |
|----------|------|------|--------|-------|
| Gmail | `smtp.gmail.com` | 587 | false | Requires App Password (2FA enabled) |
| Outlook | `smtp-mail.outlook.com` | 587 | false | Use account password |
| Ethereal | `smtp.ethereal.email` | 587 | false | Free testing accounts |
| SendGrid | `smtp.sendgrid.net` | 587 | false | Use API key as password |
| Mailgun SMTP | `smtp.mailgun.org` | 587 | false | Alternative to Mailgun API |

### Mailgun Configuration (if MAIL_SYSTEM=mailgun)

```env
# Mailgun Configuration
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxx  # Your Mailgun API key
MAILGUN_DOMAIN=mg.yourdomain.com      # Verified sending domain
MAILGUN_BASE_URL=https://api.mailgun.net  # US: api.mailgun.net, EU: api.eu.mailgun.net
```

- `MAILGUN_API_KEY` — Your Mailgun API key (starts with `key-...` or is a sending API key).
- `MAILGUN_DOMAIN` — The verified sending domain in Mailgun (e.g., `mg.yourcompany.com`).
- `MAILGUN_BASE_URL` — Use `https://api.mailgun.net` for US region or `https://api.eu.mailgun.net` for EU region.

### Sender Configuration (Common to Both Providers)

```env
# Email Sender Configuration
EMAIL_FROM_NAME=Your App Name
EMAIL_FROM_EMAIL=noreply@yourdomain.com
```

- `EMAIL_FROM_NAME` — The display name for the sender (appears as "From: Your App Name <noreply@yourdomain.com>")
- `EMAIL_FROM_EMAIL` — The sender's email address (must be verified in production)

---

## Directory & File Structure

Reproduce the following structure in your NestJS project:

```
src/
├── shared/
│   ├── shared.module.ts              # Shared module (registers services, exports them)
│   ├── email/
│   │   ├── email.service.ts          # High-level email service with template support
│   │   └── email-provider.interface.ts  # IEmailProvider interface definition
│   ├── mailgun/
│   │   └── mailgun.service.ts        # Mailgun SDK wrapper (implements IEmailProvider)
│   └── smtp/
│       └── smtp.service.ts           # Nodemailer SMTP wrapper (implements IEmailProvider)
├── notifications/
│   └── email/
│       ├── common/
│       │   └── layout.nunj           # Base MJML layout (Nunjucks parent template)
│       └── user/
│           ├── welcome.njk           # Welcome email child template
│           ├── passwordReset.njk     # Password reset child template
│           ├── forgotPassword.njk    # Forgot password child template
│           └── invite.njk           # Invitation email child template
```

---

## Service Implementation

### 0. IEmailProvider Interface (Provider Abstraction)

**File:** `src/shared/email/email-provider.interface.ts`

This interface defines the contract that all email providers must implement, enabling the system to work with multiple providers interchangeably.

```typescript
export interface IEmailAttachment {
  filename: string;
  data: Buffer | string;
  contentType?: string;
}

export interface IEmailMessageData {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachment?: IEmailAttachment | IEmailAttachment[];
  options?: Record<string, any>;
}

export interface IEmailSendResult {
  id: string;
  message: string;
  status?: number;
}

export interface IEmailProvider {
  /**
   * Send an email via this provider
   * @param data Email message data
   * @param domain Optional domain (used by Mailgun provider)
   * @returns Result object with message ID and status
   */
  send(
    data: IEmailMessageData,
    domain?: string,
  ): Promise<IEmailSendResult>;
}
```

**Key Points:**
- Both `MailgunService` and `SmtpService` implement this interface
- The `send()` method signature is identical across providers
- The `domain` parameter is optional (only used by Mailgun, ignored by SMTP)
- Return type is always `IEmailSendResult` regardless of provider

### 1. MailgunService (Mailgun Provider Implementation)

**File:** `src/shared/mailgun/mailgun.service.ts`

This service wraps the `mailgun.js` SDK and implements the `IEmailProvider` interface.

**Key implementation details:**

- Decorated with `@Injectable()` and implements `IEmailProvider`.
- Initializes `mailgun.js` client in the constructor using environment variables.
- The constructor creates the client with `new Mailgun(FormData)`, then calls `.client()` with credentials.
- `send(data, domain?)` calls `this.mailgunClient.messages.create(domain, data)`.
- On success, emits a `MAILGUN_EMAIL_SENT` event via `EventEmitter2`.
- Logs warnings if `MAILGUN_API_KEY` or `MAILGUN_DOMAIN` are missing.
- Maps generic `IEmailMessageData` to Mailgun's `MailgunMessageData` format.

**Constructor pattern:**

```typescript
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import type { MailgunMessageData, MessagesSendResult } from 'mailgun.js/definitions';

@Injectable()
export class MailgunService implements IEmailProvider {
  private mailgunClient: ReturnType<Mailgun['client']>;
  private domain: string;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: Logger,
  ) {
    const mailgun = new Mailgun(FormData);
    this.mailgunClient = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY || '',
      url: process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net',
    });
    this.domain = process.env.MAILGUN_DOMAIN || '';
    
    if (!process.env.MAILGUN_API_KEY) {
      this.logger.warn('MAILGUN_API_KEY is not set');
    }
    if (!process.env.MAILGUN_DOMAIN) {
      this.logger.warn('MAILGUN_DOMAIN is not set');
    }
  }

  async send(
    data: IEmailMessageData,
    domain?: string,
  ): Promise<IEmailSendResult> {
    // Map IEmailMessageData to MailgunMessageData
    const mailgunData: MailgunMessageData = {
      from: data.from,
      to: Array.isArray(data.to) ? data.to : [data.to],
      subject: data.subject,
      text: data.text,
      html: data.html,
      // Map attachments if present
    };

    const targetDomain = domain || this.domain;
    const response = await this.mailgunClient.messages.create(
      targetDomain,
      mailgunData,
    );

    // Emit event for audit logging
    this.eventEmitter.emit('MAILGUN_EMAIL_SENT', {
      to: data.to,
      response,
    });

    return {
      id: response.id,
      message: response.message,
      status: response.status,
    };
  }
}
```

**Interfaces/types used from mailgun.js:**

```typescript
import type { MailgunMessageData, MessagesSendResult } from 'mailgun.js/definitions';
```

### 2. SmtpService (SMTP Provider Implementation)

**File:** `src/shared/smtp/smtp.service.ts`

This service wraps `nodemailer` and implements the `IEmailProvider` interface.

**Key implementation details:**

- Decorated with `@Injectable()` and implements `IEmailProvider`.
- Creates a `nodemailer` transporter in the constructor using SMTP environment variables.
- Supports well-known SMTP providers (Gmail, Outlook, etc.) via preset configurations.
- `send(data)` calls `this.transporter.sendMail()` with the provided data.
- On success, emits an `SMTP_EMAIL_SENT` event via `EventEmitter2`.
- Provides a `verifyConnection()` method to test SMTP connectivity at startup.
- Maps generic `IEmailMessageData` to Nodemailer's `SendMailOptions` format.

**Constructor pattern:**

```typescript
import * as nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';

@Injectable()
export class SmtpService implements IEmailProvider {
  private transporter: Transporter;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: Logger,
  ) {
    const smtpConfig: any = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    };

    // Support well-known service shortcuts (Gmail, Outlook, etc.)
    if (process.env.SMTP_SERVICE) {
      smtpConfig.service = process.env.SMTP_SERVICE;
      delete smtpConfig.host; // Service takes precedence
      delete smtpConfig.port;
    }

    this.transporter = nodemailer.createTransport(smtpConfig);

    if (!process.env.SMTP_HOST && !process.env.SMTP_SERVICE) {
      this.logger.warn('SMTP_HOST or SMTP_SERVICE is not set');
    }
  }

  /**
   * Verify SMTP connection (optional, but recommended to call at startup)
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified successfully');
      return true;
    } catch (error) {
      this.logger.error('SMTP connection verification failed', error);
      return false;
    }
  }

  async send(
    data: IEmailMessageData,
    _domain?: string, // Ignored by SMTP
  ): Promise<IEmailSendResult> {
    // Map IEmailMessageData to SendMailOptions
    const mailOptions: SendMailOptions = {
      from: data.from,
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      text: data.text,
      html: data.html,
      // Map attachments if present
      attachments: data.attachment
        ? Array.isArray(data.attachment)
          ? data.attachment.map(att => ({
              filename: att.filename,
              content: att.data,
              contentType: att.contentType,
            }))
          : [{
              filename: data.attachment.filename,
              content: data.attachment.data,
              contentType: data.attachment.contentType,
            }]
        : undefined,
    };

    const info = await this.transporter.sendMail(mailOptions);

    // Emit event for audit logging
    this.eventEmitter.emit('SMTP_EMAIL_SENT', {
      to: data.to,
      response: info,
    });

    return {
      id: info.messageId,
      message: 'Email sent via SMTP',
      status: 250, // SMTP success code
    };
  }
}
```

**Well-Known Service Presets:**

Nodemailer supports service shortcuts for popular providers:

```typescript
// Instead of configuring host/port, use service name:
{
  service: 'gmail',  // or 'outlook', 'yahoo', 'hotmail', etc.
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-app-password',
  }
}
```

**SMTP Service Presets:**
- `gmail` → smtp.gmail.com:587
- `outlook` → smtp-mail.outlook.com:587
- `yahoo` → smtp.mail.yahoo.com:465
- `hotmail` → smtp-mail.outlook.com:587
- `sendgrid` → smtp.sendgrid.net:587

### 3. EmailService (Core Email Service)

### 3. EmailService (Core Email Service)

**File:** `src/shared/email/email.service.ts`

This is the primary service that consuming modules interact with. It delegates to the active provider (selected via `MAIL_SYSTEM` env var) and provides template rendering capabilities.

#### Provider-Agnostic Interfaces

Define these interfaces for loose coupling (don't import Mailgun types into EmailService):

```typescript
export interface IEmailAttachment {
  filename: string;
  data: Buffer | string;
}

export interface IEmailMessageData {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachment?: IEmailAttachment | IEmailAttachment[];
  options?: Record<string, any>;
}

export type IEmailTemplateData = Omit<IEmailMessageData, 'html' | 'subject'> & {
  templateData?: Record<string, any>;
};

export interface IEmailSendResult {
  id: string;
  message: string;
  status?: number;
}

export interface IEmailTemplate {
  subject: string;
  file: string;  // Relative path from src/ e.g., "notifications/email/user/welcome.njk"
}
```

#### Constructor & Dependency Injection

The constructor takes:

1. `IEmailProvider` — The active email provider (MailgunService or SmtpService), injected via factory pattern based on `MAIL_SYSTEM` environment variable.
2. `EventEmitter2` — from `@nestjs/event-emitter`, used for audit event emission.
3. `moduleTemplates?: Record<string, IEmailTemplate>` — **optional** (`@Optional()` decorator), allows module-specific templates to be merged with base templates at construction time.

**Provider Injection via Factory:**

The active provider is selected at module initialization time using a factory provider:

```typescript
// In SharedModule providers array:
{
  provide: 'EMAIL_PROVIDER',
  useFactory: (
    configService: ConfigService,
    mailgunService: MailgunService,
    smtpService: SmtpService,
  ): IEmailProvider => {
    const mailSystem = configService.get<string>('MAIL_SYSTEM');
    return createEmailProvider(mailSystem, mailgunService, smtpService);
  },
  inject: [ConfigService, MailgunService, SmtpService],
}
```

EmailService then injects this provider:

```typescript
@Injectable()
export class EmailService {
  constructor(
    @Inject('EMAIL_PROVIDER') private readonly emailProvider: IEmailProvider,
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly moduleTemplates?: Record<string, IEmailTemplate>,
  ) {
    // Merge base templates with module-specific templates
    this.emailTemplates = {
      ...baseEmailTemplateNames,
      ...(moduleTemplates || {}),
    };
  }
}
```

**Factory pattern for module-specific templates:**

Modules can provide custom templates by creating their own factory:

```typescript
// In any module's providers array:
{
  provide: EmailService,
  useFactory: (
    emailProvider: IEmailProvider,
    eventEmitter: EventEmitter2,
  ) => {
    const moduleTemplates = {
      accountActivation: {
        subject: 'Activate Your Account',
        file: 'notifications/email/user/activation.njk'
      }
    };
    return new EmailService(emailProvider, eventEmitter, moduleTemplates);
  },
  inject: ['EMAIL_PROVIDER', EventEmitter2]
}
```

#### Base Template Registry

```typescript
export const baseEmailTemplateNames: Record<string, IEmailTemplate> = {
  welcome: {
    subject: 'Welcome to Our Service!',
    file: 'notifications/email/user/welcome.njk',
  },
  passwordReset: {
    subject: 'Password Reset Request',
    file: 'notifications/email/user/passwordReset.njk',
  }
};
```

Templates are merged: `{ ...baseEmailTemplateNames, ...(moduleTemplates || {}) }`.

Additional templates can also be added at runtime via `setEmailTemplateNames(templates)`.

#### Core Methods

| Method | Purpose |
|--------|---------|
| `send(data: IEmailMessageData)` | Sends a raw email (with HTML/text provided directly). Delegates to the active provider (`emailProvider.send()`). |
| `sendHtml(templateName, data: IEmailTemplateData)` | Sends a template-based email. Loads and renders the template, then calls `send()`. |
| `loadTemplate(templateName, data)` | Loads a `.njk` template file, renders it with Nunjucks, then compiles the MJML output to responsive HTML. |
| `setEmailTemplateNames(templates)` | Merges additional templates into the registry at runtime. |
| `getEmailTemplateNames()` | Returns a shallow copy of the current template registry. |

#### Event Handling

The service listens for its own `EMAIL_SENT` event via `@OnEvent(EmailEventNames.EMAIL_SENT)` and re-emits it as an audit event (`AuditEventNames.EMAIL_SENT` or `AuditEventNames.EMAIL_FAILED`) for the audit system to pick up.

---

## Template System (MJML + Nunjucks)

The templating pipeline works in two stages:

1. **Nunjucks** renders the `.njk` template with data variables and template inheritance.
2. **MJML** compiles the rendered output into responsive HTML email markup.

### Base Layout Template

**File:** `src/notifications/email/common/layout.nunj`

This is a Nunjucks parent template that provides the full MJML document skeleton with overridable blocks:

```xml
<mjml>
  <mj-head>
    <mj-title>{% block title %}Email from Your Service{% endblock %}</mj-title>
    <mj-font name="Helvetica" href="https://fonts.googleapis.com/css?family=Helvetica" />
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="14px" color="#333333" line-height="1.5" />
      <mj-section background-color="#ffffff" padding="20px" />
    </mj-attributes>
  </mj-head>
  
  <mj-body background-color="#f4f4f4">
    <!-- Header Section -->
    <mj-section background-color="#ffffff" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="24px" font-weight="bold" color="#333333">
          {% block header %}Your Company Name{% endblock %}
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- Main Content Section -->
    <mj-section background-color="#ffffff" padding="30px 20px">
      <mj-column>
        {% block content %}
        <mj-text>Default content area.</mj-text>
        {% endblock %}
      </mj-column>
    </mj-section>

    <!-- Footer Section -->
    <mj-section background-color="#f4f4f4" padding="20px">
      <mj-column>
        <mj-text align="center" font-size="12px" color="#666666">
          {% block footer %}
          © {{ year|default(2026) }} Your Company. All rights reserved.
          <br/>
          <a href="#">Unsubscribe</a> | <a href="#">Privacy Policy</a>
          {% endblock %}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

**Overridable blocks:** `title`, `header`, `content`, `footer`.

### Child Templates

Child templates extend the base layout using `{% extends "common/layout.nunj" %}` and override specific blocks:

```nunjucks
{% extends "common/layout.nunj" %}

{% block title %}Welcome to Our Service!{% endblock %}

{% block header %}Welcome to Our Service{% endblock %}

{% block content %}
  <mj-text font-size="18px" font-weight="bold" color="#333333">
    Hello {{ user.first_name|default('there') }}!
  </mj-text>
  
  <mj-text padding-top="20px">
    We're excited to have you on board.
  </mj-text>
  
  <mj-button background-color="#007bff" color="#ffffff" href="{{ activationLink|default('#') }}">
    Activate Your Account
  </mj-button>
{% endblock %}
```

### Template Loading Mechanics

In `loadTemplate()`, the critical path resolution logic is:

```typescript
// Template file path (IEmailTemplate.file is relative to src/)
const templatePath = path.join(process.cwd(), 'src', template.file);

// Nunjucks root is the email templates directory
const emailTemplatesRoot = path.join(process.cwd(), 'src', 'notifications', 'email');

// Configure Nunjucks with the root directory (enables {% extends %})
nunjucks.configure(emailTemplatesRoot, {
  autoescape: false,       // MJML handles its own escaping
  throwOnUndefined: false, // Gracefully handle missing variables
});

// Resolve relative path for rendering
const relativeTemplatePath = path.relative(emailTemplatesRoot, templatePath);
const mjmlOutput = nunjucks.render(relativeTemplatePath, data);

// Compile MJML to HTML
const htmlOutput = mjml2html(mjmlOutput, {
  validationLevel: 'soft',
  minify: false,
});
```

**Important:** The Nunjucks root directory must be `src/notifications/email/` for `{% extends "common/layout.nunj" %}` to resolve correctly.

---

## NestJS Module Configuration

### SharedModule

The `SharedModule` registers and exports all email services and uses a factory to select the active provider based on environment configuration.

```typescript
import { Logger, Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailgunService } from './mailgun/mailgun.service';
import { SmtpService } from './smtp/smtp.service';
import { EmailService } from './email/email.service';
import type { IEmailProvider } from './email/email-provider.interface';
import { createEmailProvider } from './email/email.service';

@Module({
  imports: [
    ConfigModule,  // For ConfigService
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      verboseMemoryLeak: true,
      maxListeners: 50,
    }),
    // ... other imports as needed
  ],
  providers: [
    // Provider implementations (both are instantiated)
    // NOTE: The factory approach avoids SharedModule from directly instantiating both
    // Instead, we only instantiate the one indicated by MAIL_SYSTEM
    {
      provide: MailgunService,
      useFactory: (eventEmitter: EventEmitter2) => {
        const mailSystem = process.env.MAIL_SYSTEM?.toLowerCase();
        if (mailSystem === 'mailgun') {
          return new MailgunService(eventEmitter, new Logger(MailgunService.name));
        }
        return null; // Don't instantiate if not needed
      },
      inject: [EventEmitter2],
    },
    {
      provide: SmtpService,
      useFactory: (eventEmitter: EventEmitter2) => {
        const mailSystem = process.env.MAIL_SYSTEM?.toLowerCase();
        if (mailSystem === 'smtp') {
          return new SmtpService(eventEmitter, new Logger(SmtpService.name));
        }
        return null; // Don't instantiate if not needed
      },
      inject: [EventEmitter2],
    },
    
    // Provider selector factory
    {
      provide: 'EMAIL_PROVIDER',
      useFactory: (
        configService: ConfigService,
        mailgunService: MailgunService | null,
        smtpService: SmtpService | null,
      ): IEmailProvider => {
        const mailSystem = configService.get<string>('MAIL_SYSTEM') || process.env.MAIL_SYSTEM;
        return createEmailProvider(mailSystem, mailgunService, smtpService);
      },
      inject: [ConfigService, MailgunService, SmtpService],
    },
    
    // Core email service
    EmailService,
  ],
  exports: [
    MailgunService,
    SmtpService,
    'EMAIL_PROVIDER',
    EmailService,
  ],
})
export class SharedModule {}
```

**Important Notes:**

1. **Conditional Instantiation**: Only the selected provider (based on `MAIL_SYSTEM`) is instantiated via factory. The other provider returns `null` to avoid unnecessary initialization.

2. **Factory Provider**: The `EMAIL_PROVIDER` token uses a factory that calls `createEmailProvider()` to select the appropriate service.

3. **Error Handling**: If `MAIL_SYSTEM` is invalid or the selected provider is unavailable, `createEmailProvider()` will throw a descriptive error at startup.

4. **EmailService Injection**: `EmailService` injects `@Inject('EMAIL_PROVIDER')` to get the active provider instance.

**Alternative Simpler Approach (Trade-off):**

If you prefer simplicity over conditional instantiation, you can register both services normally and let the factory pattern handle selection:

```typescript
@Module({
  imports: [ConfigModule, EventEmitterModule.forRoot()],
  providers: [
    MailgunService,  // Always instantiated (simpler, but may log warnings if not configured)
    SmtpService,     // Always instantiated
    {
      provide: 'EMAIL_PROVIDER',
      useFactory: (config: ConfigService, mailgun: MailgunService, smtp: SmtpService) => {
        return createEmailProvider(config.get('MAIL_SYSTEM'), mailgun, smtp);
      },
      inject: [ConfigService, MailgunService, SmtpService],
    },
    EmailService,
  ],
  exports: ['EMAIL_PROVIDER', EmailService],
})
export class SharedModule {}
```

**Trade-offs:**
- **Simpler approach**: Both services instantiate even if not used → may log warnings for missing config
- **Conditional approach**: Only selected service instantiates → cleaner, but slightly more complex setup

### App Module

Import `SharedModule` in your root `AppModule`:

```typescript
@Module({
  imports: [SharedModule],
})
export class AppModule {}
```

Any feature module that needs email should import `SharedModule`:

```typescript
@Module({
  imports: [SharedModule],
  // ...
})
export class UserModule {}
```

---

## Event & Audit Integration

The email system emits events at two levels:

### Level 1: MailgunService Events

```typescript
export enum MailGunEventNames {
  EMAIL_SENT = 'MAILGUN_EMAIL_SENT',
}
```

Emitted via `SharedModule.eventEmitter.emit(...)` after a successful Mailgun API call. Payload:

```typescript
export interface IEmailSentEventPayload {
  to: string | string[];
  response: MessagesSendResult;
}
```

### Level 2: EmailService Events

```typescript
export enum EmailEventNames {
  EMAIL_SENT = 'EMAIL_SENT',
}
```

Emitted via `SharedModule.eventEmitter.emit(...)` after `EmailService.send()` succeeds. Payload:

```typescript
export interface IEmailSentEventPayload {
  to: string | string[];
  result: IEmailSendResult;
  payload?: Record<string, any>; // Email data minus the html body
}
```

### Level 3: Audit Events (Optional)

The `EmailService` listens for its own `EMAIL_SENT` event with `@OnEvent(EmailEventNames.EMAIL_SENT)` and re-emits it as an audit event:

- `AuditEventNames.EMAIL_SENT` = `'audit.email.sent'` — on success
- `AuditEventNames.EMAIL_FAILED` = `'audit.email.failed'` — on failure

The audit payload follows the `IAuditEventPayload` interface which includes `eventType`, `entityType`, `action`, `success`, `description`, and `metadata`.

**If you don't need audit logging**, you can omit the `@OnEvent` handler and the audit-related imports entirely. The core email sending will still work.

---

## TypeScript Path Aliases

The source project uses these tsconfig path aliases. Reproduce the ones relevant to email:

```jsonc
// tsconfig.json → compilerOptions.paths
{
  "@shared/*": ["src/shared/*"],
  "@audit/*": ["src/audit/*"]
}
```

Also configure matching aliases in your Jest config (`moduleNameMapper`) if you write tests:

```jsonc
// package.json → jest.moduleNameMapper
{
  "^@shared/(.*)$": "<rootDir>/shared/$1",
  "^@audit/(.*)$": "<rootDir>/audit/$1"
}
```

---

## Step-by-Step Reproduction Checklist

Follow these steps in order to reproduce the email functionality in a new NestJS app:

### 1. Install Dependencies

```bash
# Using bun (preferred)
bun add mailgun.js form-data nodemailer mjml nunjucks @nestjs/event-emitter
bun add -d @types/nodemailer

# Using npm
npm install mailgun.js form-data nodemailer mjml nunjucks @nestjs/event-emitter
npm install -D @types/nodemailer
```

### 2. Configure Environment Variables

Add provider selection and credentials to `.env`:

```env
# Provider Selection
MAIL_SYSTEM=smtp  # or 'mailgun'

# SMTP Configuration (if using smtp)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user@ethereal.email
SMTP_PASSWORD=your-password

# Mailgun Configuration (if using mailgun)
MAILGUN_API_KEY=key-xxxxxxxx
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_BASE_URL=https://api.mailgun.net

# Common sender config
EMAIL_FROM_NAME=Your App Name
EMAIL_FROM_EMAIL=noreply@yourdomain.com
```

Also add to `.env.example` with placeholder values.

### 3. Create the IEmailProvider Interface

Create `src/shared/email/email-provider.interface.ts`:
- Define `IEmailAttachment`, `IEmailMessageData`, `IEmailSendResult` interfaces.
- Define `IEmailProvider` interface with `send(data, domain?)` method signature.

### 4. Create the Mailgun Service

Create `src/shared/mailgun/mailgun.service.ts`:
- Import `Mailgun` from `mailgun.js` and `FormData` from `form-data`.
- Decorate with `@Injectable()` and implement `IEmailProvider`.
- Initialize the Mailgun client in the constructor using env vars.
- Inject `EventEmitter2` and `Logger` in constructor.
- Implement `send(data, domain?)` that maps `IEmailMessageData` to Mailgun format and calls `this.mailgunClient.messages.create()`.
- Emit `MAILGUN_EMAIL_SENT` event on success.
- Log warnings if env vars missing.

### 5. Create the SMTP Service

Create `src/shared/smtp/smtp.service.ts`:
- Import `nodemailer` and types: `Transporter`, `SendMailOptions`.
- Decorate with `@Injectable()` and implement `IEmailProvider`.
- Initialize nodemailer transporter in constructor using SMTP env vars.
- Inject `EventEmitter2` and `Logger` in constructor.
- Support well-known service presets (Gmail, Outlook, etc.).
- Implement `send(data, domain?)` that maps `IEmailMessageData` to `SendMailOptions` and calls `this.transporter.sendMail()`.
- Implement optional `verifyConnection()` method.
- Emit `SMTP_EMAIL_SENT` event on success.

### 6. Create the Email Service

Create `src/shared/email/email.service.ts`:
- Define `IEmailTemplateData` and `IEmailTemplate` interfaces.
- Define `baseEmailTemplateNames` as a `Record<string, IEmailTemplate>`.
- Implement the constructor with `@Inject('EMAIL_PROVIDER') emailProvider: IEmailProvider`, `EventEmitter2`, and optional `@Optional() moduleTemplates`.
- Merge base templates with module templates in constructor.
- Implement `loadTemplate(templateName, data)`:
  - Look up template in the registry.
  - Build the absolute path: `path.join(process.cwd(), 'src', template.file)`.
  - Set Nunjucks root to `path.join(process.cwd(), 'src', 'notifications', 'email')`.
  - Render with Nunjucks, then compile with `mjml2html()`.
- Implement `sendHtml(templateName, data)`:
  - Load the template subject from the registry.
  - Call `loadTemplate()`, then `send()`.
- Implement `send(data)`:
  - Delegate to `this.emailProvider.send(data)`.
  - Emit `EMAIL_SENT` event on success.
- Add helper methods: `setEmailTemplateNames()`, `getEmailTemplateNames()`.

### 7. Create Email Templates

- Create `src/notifications/email/common/layout.nunj` — base MJML layout with blocks: `title`, `header`, `content`, `footer`.
- Create child templates (e.g., `src/notifications/email/user/welcome.njk`) that `{% extends "common/layout.nunj" %}` and override blocks.
- Use Nunjucks syntax for variables: `{{ variable|default('fallback') }}`.

### 8. Create the Provider Factory Function

In `src/shared/email/email.service.ts` or separate file, add:

```typescript
export function createEmailProvider(
  mailSystem: string | undefined,
  mailgunService: MailgunService | null,
  smtpService: SmtpService | null,
): IEmailProvider {
  const system = mailSystem?.toLowerCase();
  
  switch (system) {
    case 'mailgun':
      if (!mailgunService) {
        throw new Error('MailgunService not available but MAIL_SYSTEM=mailgun');
      }
      return mailgunService;
      
    case 'smtp':
      if (!smtpService) {
        throw new Error('SmtpService not available but MAIL_SYSTEM=smtp');
      }
      return smtpService;
      
    default:
      throw new Error(
        `Unknown MAIL_SYSTEM: ${mailSystem}. Expected 'smtp' or 'mailgun'`,
      );
  }
}
```

### 9. Configure the Shared Module

- Import `EventEmitterModule.forRoot()`, `ConfigModule` in your SharedModule (or AppModule).
- Use factory providers for conditional instantiation:
  ```typescript
  {
    provide: MailgunService,
    useFactory: (eventEmitter: EventEmitter2) => {
      if (process.env.MAIL_SYSTEM === 'mailgun') {
        return new MailgunService(eventEmitter, new Logger(MailgunService.name));
      }
      return null;
    },
    inject: [EventEmitter2],
  }
  ```
- Repeat for `SmtpService` with `MAIL_SYSTEM === 'smtp'` check.
- Create `EMAIL_PROVIDER` factory that calls `createEmailProvider()`:
  ```typescript
  {
    provide: 'EMAIL_PROVIDER',
    useFactory: (config: ConfigService, mailgun, smtp) => {
      return createEmailProvider(config.get('MAIL_SYSTEM'), mailgun, smtp);
    },
    inject: [ConfigService, MailgunService, SmtpService],
  }
  ```
- Register `EmailService` as a provider.
- Export `'EMAIL_PROVIDER'` and `EmailService`.

### 10. Wire Up Audit Logging (Optional)

- Create `AuditEventNames` enum with `EMAIL_SENT` and `EMAIL_FAILED` entries.
- Define `IAuditEventPayload` interface.
- Add the `@OnEvent(EmailEventNames.EMAIL_SENT)` handler in `EmailService` that re-emits as audit events.
- Create an `AuditLogService` that listens for `audit.*` events and persists them.

### 11. Use in Feature Modules

```typescript
// In any service
@Injectable()
export class UserService {
  constructor(private readonly emailService: EmailService) {}

  async sendWelcomeEmail(user: User) {
    await this.emailService.sendHtml('welcome', {
      from: 'noreply@yourcompany.com',
      to: user.email,
      templateData: {
        user: { first_name: user.firstName },
        activationLink: `https://yourapp.com/activate?token=${user.activationToken}`,
      },
    });
  }

  async sendDirectEmail() {
    await this.emailService.send({
      from: 'noreply@yourcompany.com',
      to: 'user@example.com',
      subject: 'Direct Email',
      html: '<h1>Hello</h1>',
      text: 'Hello',
    });
  }
}
```

### 12. Extend with Module-Specific Templates

Use the factory provider pattern to inject module-specific templates:

```typescript
// user.module.ts
@Module({
  imports: [SharedModule],
  providers: [
    {
      provide: EmailService,
      useFactory: (
        emailProvider: IEmailProvider,
        eventEmitter: EventEmitter2,
      ) => {
        return new EmailService(emailProvider, eventEmitter, {
          accountActivation: {
            subject: 'Activate Your Account',
            file: 'notifications/email/user/activation.njk',
          },
        });
      },
      inject: ['EMAIL_PROVIDER', EventEmitter2],
    },
  ],
})
export class UserModule {}
```

Or add templates at runtime:

```typescript
this.emailService.setEmailTemplateNames({
  orderConfirmation: {
    subject: 'Order Confirmed',
    file: 'notifications/email/order/confirmation.njk',
  },
});
```

### 13. Test Provider Switching

To verify the dual-provider system works:

**Test SMTP:**
```bash
# .env
MAIL_SYSTEM=smtp
SMTP_HOST=smtp.ethereal.email
# ... other SMTP config

# Restart and send test email
bun run start:dev
# Check logs: "Email provider initialized: smtp"
```

**Test Mailgun:**
```bash
# .env
MAIL_SYSTEM=mailgun
MAILGUN_API_KEY=key-xxx
# ... other Mailgun config

# Restart and send test email
bun run start:dev
# Check logs: "Email provider initialized: mailgun"
```

**No code changes required** — just environment variables!

---

## Notes & Gotchas

### Provider Architecture

1. **IEmailProvider Interface:** Both `MailgunService` and `SmtpService` implement the same `IEmailProvider` interface, making them interchangeable. This is the key to zero-code switching between providers.

2. **Factory Pattern:** The `createEmailProvider()` function selects the appropriate provider based on `MAIL_SYSTEM` environment variable. This happens once at application startup.

3. **Conditional Instantiation:** The recommended approach is to conditionally instantiate only the selected provider to avoid unnecessary initialization and configuration warnings. However, the simpler approach (instantiating both) also works.

4. **Provider Selection Validation:** If `MAIL_SYSTEM` is not set or invalid, the application will fail at startup with a clear error message. This is intentional — better to fail fast than send emails via the wrong provider.

### SMTP-Specific Notes

5. **App Passwords Required (Gmail):** If using Gmail with 2-Factor Authentication enabled, you **must** use an App Password, not your account password. Generate one at https://myaccount.google.com/apppasswords.

6. **Port Selection:** 
   - Port 587 → Use `SMTP_SECURE=false` (STARTTLS)
   - Port 465 → Use `SMTP_SECURE=true` (SSL/TLS)
   - Port 25 → Avoid (often blocked by ISPs)

7. **Connection Verification:** Call `smtpService.verifyConnection()` at startup to test connectivity before sending emails. This helps catch configuration errors early.

8. **Well-Known Services:** Nodemailer supports service shortcuts like `gmail`, `outlook`, `yahoo`. When using these, you don't need to specify `SMTP_HOST` or `SMTP_PORT`.

9. **Rate Limits:** Free SMTP providers have daily limits:
   - Gmail: 500 emails/day
   - Outlook: 300 emails/day
   - Use Mailgun for higher volumes

### Mailgun-Specific Notes

10. **Domain Parameter:** The `domain` parameter in `send(data, domain?)` is only used by MailgunService. SmtpService ignores it. This allows the interface to remain provider-agnostic while supporting Mailgun's multi-domain feature.

11. **EU Region:** If your Mailgun account is in the EU region, set `MAILGUN_BASE_URL=https://api.eu.mailgun.net`.

12. **Sandbox vs Production:** Mailgun sandbox domains work for testing but have recipient restrictions. For production, use a verified custom domain.

### Template System

13. **Template path resolution:** All template file paths in `IEmailTemplate.file` are relative to `src/`. The Nunjucks root for `{% extends %}` resolution is `src/notifications/email/`. Ensure the base layout file is at `src/notifications/email/common/layout.nunj`.

14. **MJML version:** MJML v4 is used. Do not use MJML v3 syntax — the tag names and attributes differ.

15. **Nunjucks `autoescape: false`:** This is intentional because MJML handles its own escaping. Do not set `autoescape: true` or MJML tags will be escaped.

16. **Template file extensions:** The base layout uses `.nunj` extension, child templates use `.njk`. Both are Nunjucks templates — the extension is purely conventional.

### Dependency Imports

17. **form-data:** The `form-data` package import must be the default import: `import FormData from 'form-data'`. Not `import { FormData } from 'form-data'`.

18. **nodemailer:** Import nodemailer as `import * as nodemailer from 'nodemailer'` or `import nodemailer from 'nodemailer'`. Both work, but `import *` is more compatible with CommonJS/ESM interop.

### Event Emissions

19. **Provider Events vs Email Events:** Providers emit low-level events (`MAILGUN_EMAIL_SENT`, `SMTP_EMAIL_SENT`) while EmailService emits high-level `EMAIL_SENT` event. If you need audit logging, listen for the EmailService event, not provider events.

20. **EventEmitter Injection:** The current implementation injects `EventEmitter2` directly into services (recommended). The original code used a static `SharedModule.eventEmitter` — both patterns work, but direct injection is more idiomatic NestJS.

### Testing & Development

21. **Ethereal Email:** For development testing, use https://ethereal.email to create free throwaway SMTP accounts. Emails are captured and viewable in a web inbox (not delivered).

22. **Template Testing:** Render templates without sending by calling `emailService.loadTemplate()` directly. Save the HTML output to a file and open in a browser to preview.

23. **Provider Testing:** Test both providers in your CI/CD pipeline to ensure neither breaks. Use Ethereal for SMTP tests and Mailgun sandbox for API tests.
