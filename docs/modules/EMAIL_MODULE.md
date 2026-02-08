# Email Module Documentation

> **Module:** `SharedModule` (Email Services)  
> **Version:** 1.0.0  
> **Status:** Production Ready  
> **Last Updated:** February 8, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Provider Selection](#provider-selection)
4. [Email Service API](#email-service-api)
5. [Template System](#template-system)
6. [Usage Examples](#usage-examples)
7. [Event System](#event-system)
8. [Configuration](#configuration)
9. [Troubleshooting](#troubleshooting)
10. [FAQs](#faqs)

---

## Overview

The Email Module provides a **provider-agnostic email sending system** with support for multiple email providers (SMTP and Mailgun) and a powerful template engine (MJML + Nunjucks).

### Key Features

- ✅ **Multiple Providers**: Switch between SMTP and Mailgun without code changes
- ✅ **Template Engine**: MJML for responsive emails + Nunjucks for dynamic content
- ✅ **Provider-Agnostic API**: Same interface regardless of provider
- ✅ **Event-Driven**: Emits events for audit logging and monitoring
- ✅ **Extensible Templates**: Add custom templates at runtime
- ✅ **Type-Safe**: Full TypeScript support with interfaces and types
- ✅ **Production Ready**: Comprehensive error handling and logging

### Use Cases

- **User Notifications**: Welcome emails, password resets, account verification
- **Alert System**: Real-time notifications for pet alerts (FiFi Alert specific)
- **Transactional Emails**: Order confirmations, receipts, status updates
- **Marketing Campaigns**: Newsletters, announcements (with proper unsubscribe)

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Application                          │
│                     (Controllers/Services)                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
                ┌──────────────────┐
                │  EmailService    │ ◄─── Core service (provider-agnostic)
                │  - send()        │
                │  - sendHtml()    │
                │  - loadTemplate()│
                └────────┬─────────┘
                         │
                         │ Delegates to selected provider
                         ▼
         ┌───────────────────────────────┐
         │   IEmailProvider Interface    │
         │   - send(data)                │
         └───────────────┬───────────────┘
                         │
            ┏━━━━━━━━━━━━┻━━━━━━━━━━━━┓
            ▼                          ▼
    ┌──────────────┐          ┌──────────────┐
    │SmtpService   │          │MailgunService│
    │- Nodemailer  │          │- Mailgun SDK │
    │- SMTP Server │          │- Mailgun API │
    └──────────────┘          └──────────────┘
```

### Provider Selection Flow

```
Application Startup
    ↓
Read MAIL_SYSTEM from .env
    ↓
    ├─ 'smtp' → Create SmtpService → Register as IEmailProvider
    └─ 'mailgun' → Create MailgunService → Register as IEmailProvider
    ↓
EmailService injects IEmailProvider
    ↓
Application uses EmailService (provider-agnostic)
```

### Key Components

| Component | Responsibility | Location |
|-----------|---------------|----------|
| **EmailService** | High-level API, template rendering, event emission | `src/shared/email/email.service.ts` |
| **IEmailProvider** | Interface for email providers | `src/shared/email/interfaces/email-provider.interface.ts` |
| **SmtpService** | SMTP provider implementation (Nodemailer) | `src/shared/smtp/smtp.service.ts` |
| **MailgunService** | Mailgun provider implementation | `src/shared/mailgun/mailgun.service.ts` |
| **EmailProviderFactory** | Creates the correct provider based on config | `src/shared/email/factories/email-provider.factory.ts` |

---

## Provider Selection

### How It Works

The email provider is selected **once at application startup** based on the `MAIL_SYSTEM` environment variable.

```typescript
// In SharedModule
{
  provide: 'IEmailProvider',
  useFactory: (eventEmitter: EventEmitter2): IEmailProvider => {
    const mailSystem = process.env.MAIL_SYSTEM || 'smtp';
    return createEmailProvider(mailSystem, eventEmitter);
  },
  inject: [EventEmitter2],
}
```

### Switching Providers

1. Update `.env`: `MAIL_SYSTEM=mailgun` (or `smtp`)
2. Configure provider-specific credentials
3. Restart server: `bun run start:dev`
4. **No code changes required!**

### Provider Comparison

| Feature | SMTP | Mailgun |
|---------|------|---------|
| **Setup Complexity** | Low (free Gmail account) | Medium (paid account + domain) |
| **Cost** | Free (most providers) | Paid ($0.80/1000 emails) |
| **Speed** | 100-500ms per email | 50-200ms per email |
| **Reliability** | Good | Excellent |
| **Deliverability** | Good (with SPF/DKIM) | Excellent (built-in reputation) |
| **Tracking** | None | Built-in (opens, clicks) |
| **Best For** | Development, small apps | Production, high volume |

---

## Email Service API

### Core Methods

#### `send(data: IEmailMessageData): Promise<IEmailSendResult>`

Send a raw email with HTML/text provided directly.

**Parameters:**
- `data.from` (string): Sender email address
- `data.to` (string | string[]): Recipient(s)
- `data.subject` (string): Email subject line
- `data.html` (string, optional): HTML body
- `data.text` (string, optional): Plain text body
- `data.cc` (string | string[], optional): CC recipients
- `data.bcc` (string | string[], optional): BCC recipients
- `data.attachment` (IEmailAttachment | IEmailAttachment[], optional): Attachments

**Returns:** `Promise<IEmailSendResult>`
- `id` (string): Message ID from provider
- `message` (string): Status message
- `status` (number, optional): HTTP status code
- `metadata` (object, optional): Provider-specific details

**Example:**
```typescript
const result = await emailService.send({
  from: 'noreply@fifi-alert.com',
  to: 'user@example.com',
  subject: 'Test Email',
  text: 'Plain text body',
  html: '<h1>HTML Body</h1>',
});

console.log(`Email sent: ${result.id}`);
```

---

#### `sendHtml(templateName: string, data: IEmailTemplateData): Promise<IEmailSendResult>`

Send a template-based email using MJML + Nunjucks.

**Parameters:**
- `templateName` (string): Template name from registry
- `data.from` (string): Sender email
- `data.to` (string | string[]): Recipient(s)
- `data.templateData` (object, optional): Variables for template rendering
- Other fields: Same as `send()` (cc, bcc, attachment)

**Note:** Subject is taken from template definition.

**Example:**
```typescript
await emailService.sendHtml('welcome', {
  from: 'noreply@fifi-alert.com',
  to: 'newuser@example.com',
  templateData: {
    user: { firstName: 'John' },
    activationLink: 'https://app.com/activate?token=abc123',
  },
});
```

---

#### `loadTemplate(templateName: string, data: object): Promise<string>`

Load and render a template to HTML (without sending).

**Parameters:**
- `templateName` (string): Template name
- `data` (object): Template variables

**Returns:** Rendered HTML string

**Example:**
```typescript
const html = await emailService.loadTemplate('welcome', {
  user: { firstName: 'Jane' },
  activationLink: 'https://app.com/activate?token=xyz789',
});

console.log(html); // Full responsive HTML email
```

---

#### `setEmailTemplateNames(templates: Record<string, IEmailTemplate>): void`

Register or update templates at runtime.

**Parameters:**
- `templates` (object): Map of template name → template definition

**Example:**
```typescript
emailService.setEmailTemplateNames({
  orderConfirmation: {
    subject: 'Order Confirmed',
    file: 'notifications/email/orders/confirmation.njk',
  },
  shippingUpdate: {
    subject: 'Your Order Has Shipped',
    file: 'notifications/email/orders/shipping.njk',
  },
});
```

---

#### `getEmailTemplateNames(): Record<string, IEmailTemplate>`

Get a copy of the current template registry.

**Returns:** Object mapping template names to definitions

---

## Template System

### Architecture

```
Nunjucks Template (.njk) → MJML Output → Responsive HTML Email
     ↓                          ↓                  ↓
 Variables & Logic        Layout Components    Final Email
```

### Template Structure

#### Base Layout (`src/notifications/email/common/layout.nunj`)

Provides the skeleton for all emails:

```xml
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" />
      <mj-button background-color="#007bff" />
    </mj-attributes>
  </mj-head>
  <mj-body>
    <mj-section>
      <mj-column>
        {% block header %}{% endblock %}
        {% block content %}{% endblock %}
        {% block footer %}{% endblock %}
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

#### Child Template Example (`welcome.njk`)

```nunjucks
{% extends "common/layout.nunj" %}

{% block header %}
<mj-text font-size="24px" font-weight="bold">
  Welcome to FiFi Alert!
</mj-text>
{% endblock %}

{% block content %}
<mj-text font-size="16px">
  Hello {{ user.firstName|default('there') }},
</mj-text>
<mj-text>
  Thank you for joining FiFi Alert. Click below to activate your account.
</mj-text>
<mj-button href="{{ activationLink }}">
  Activate Account
</mj-button>
{% endblock %}

{% block footer %}
<mj-text font-size="12px" color="#666">
  © 2026 FiFi Alert. All rights reserved.
</mj-text>
{% endblock %}
```

### Default Templates

The module comes with 6 pre-built templates:

| Template | Subject | Use Case |
|----------|---------|----------|
| `welcome` | "Welcome to FiFi Alert!" | User registration |
| `passwordReset` | "Reset Your Password" | Password reset flow |
| `forgotPassword` | "Forgot Your Password?" | Forgot password flow |
| `invite` | "You're Invited!" | User invitations |
| `newAlert` | "New Pet Alert Near You" | Alert notifications |
| `alertResolved` | "Pet Alert Resolved" | Alert resolution |

### Creating Custom Templates

#### Step 1: Create Template File

Create `src/notifications/email/custom/mytemplate.njk`:

```nunjucks
{% extends "common/layout.nunj" %}

{% block content %}
<mj-text>
  Custom content here: {{ myVariable }}
</mj-text>
{% endblock %}
```

#### Step 2: Register Template

```typescript
@Module({
  imports: [SharedModule],
  providers: [
    {
      provide: EmailService,
      useFactory: (
        mailgunService: MailgunService,
        eventEmitter: EventEmitter2,
      ) => {
        const moduleTemplates = {
          mytemplate: {
            subject: 'Custom Email',
            file: 'notifications/email/custom/mytemplate.njk',
          },
        };
        return new EmailService(mailgunService, eventEmitter, moduleTemplates);
      },
      inject: [MailgunService, EventEmitter2],
    },
  ],
})
export class MyModule {}
```

#### Step 3: Use Template

```typescript
await emailService.sendHtml('mytemplate', {
  from: 'sender@example.com',
  to: 'recipient@example.com',
  templateData: {
    myVariable: 'Hello World',
  },
});
```

---

### Decentralized Template Pattern (Recommended)

**New in v1.0:** Each service now maintains its own email template registry for better separation of concerns and maintainability.

#### Why Decentralized?

- ✅ **Isolation**: Each service owns its email templates
- ✅ **Maintainability**: Templates live close to the code that uses them
- ✅ **Type Safety**: Service-specific template names are strongly typed
- ✅ **Testability**: Easier to mock and test email functionality per service

#### Pattern Implementation

**Step 1: Define Service-Local Template Registry**

```typescript
// In your service file (e.g., user.service.ts)
const userServiceEmailTemplates: Record<string, IEmailTemplate> = {
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
    subject: 'Invitation to Join',
    file: 'notifications/email/user/invite.njk',
  },
};
```

**Step 2: Inject Email Provider**

```typescript
import type { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';

@Injectable()
export class UserService {
  constructor(
    @Inject('IEmailProvider') private readonly emailProvider: IEmailProvider,
    private readonly eventEmitter: EventEmitter2,
  ) {}
}
```

**Step 3: Create Email Sending Methods**

```typescript
async sendWelcomeEmail(user: User): Promise<{ success: boolean; message: string }> {
  // Instantiate EmailService with service-local templates
  const emailService = new EmailService(
    this.emailProvider,
    this.eventEmitter,
    userServiceEmailTemplates, // Pass local template registry
  );

  try {
    await emailService.sendHtml('welcome', {
      from: String(process.env.MAIL_NOTIFICATIONS_FROM),
      to: user.email,
      templateData: {
        user: { ...user, password: undefined }, // Sanitize sensitive data
        appUrl: process.env.APP_URL,
      },
    });

    this.logger.log(`Welcome email sent to user ${user.id}`);

    return {
      success: true,
      message: `Welcome email sent to ${user.email}`,
    };
  } catch (error) {
    this.logger.error(`Failed to send welcome email to user ${user.id}:`, error);
    throw new Error('FAILED_TO_SEND_WELCOME_EMAIL');
  }
}
```

**Step 4: Integrate into Service Lifecycle**

```typescript
async createUser(data: CreateUserDto): Promise<User> {
  // Create user
  const user = await this.prisma.user.create({ data });

  // Send welcome email (non-blocking)
  try {
    await this.sendWelcomeEmail(user);
  } catch (error) {
    this.logger.error('Welcome email failed but user creation succeeded:', error);
    // Don't fail user creation if email fails
  }

  return user;
}
```

#### Real-World Examples

**UserService:**
- Templates: `welcome`, `passwordReset`, `forgotPassword`, `invite`
- File: `src/user/user.service.ts`

**AlertService:**
- Templates: `alertCreated`, `alertPublished`, `alertResolved`, `alertNearYou`
- File: `src/alert/alert.service.ts`

**SightingService:**
- Templates: `sightingReported`, `sightingConfirmed`, `sightingDismissed`
- File: `src/sighting/sighting.service.ts`

**AuthEmailService:**
- Templates: `emailVerification`, `accountActivation`, `loginNotification`, `passwordChanged`
- File: `src/auth/services/auth-email.service.ts`

#### Benefits Over Centralized Approach

| Aspect | Centralized | Decentralized |
|--------|------------|---------------|
| Template Location | Shared registry | Service-specific registry |
| Coupling | High (all services share one registry) | Low (each service owns its templates) |
| Maintainability | Harder (one large registry) | Easier (small, focused registries) |
| Testing | Complex (must mock entire registry) | Simple (mock only service templates) |
| Scalability | Degrades with more services | Scales linearly |

---

## Usage Examples (Legacy Pattern)

> **Note:** The following examples use the older centralized pattern. For new code, prefer the [Decentralized Template Pattern](#decentralized-template-pattern-recommended) above.

### Example 1: Send Welcome Email on User Registration (Legacy)

```typescript
@Injectable()
export class UserService {
  constructor(private readonly emailService: EmailService) {}

  async registerUser(dto: RegisterDto) {
    // Create user in database
    const user = await this.createUser(dto);

    // Generate activation token
    const token = this.generateActivationToken(user.id);

    // Send welcome email
    await this.emailService.sendHtml('welcome', {
      from: process.env.EMAIL_FROM_EMAIL,
      to: user.email,
      templateData: {
        user: { firstName: user.firstName },
        activationLink: `${process.env.API_BASE_URL}/auth/activate?token=${token}`,
      },
    });

    return user;
  }
}
```

### Example 2: Send Password Reset Email

```typescript
@Injectable()
export class AuthService {
  constructor(private readonly emailService: EmailService) {}

  async requestPasswordReset(email: string) {
    const user = await this.findUserByEmail(email);
    if (!user) return; // Don't reveal if user exists

    // Generate reset token (expires in 1 hour)
    const resetToken = await this.generateResetToken(user.id);

    await this.emailService.sendHtml('passwordReset', {
      from: process.env.EMAIL_FROM_EMAIL,
      to: user.email,
      templateData: {
        user: { firstName: user.firstName },
        resetLink: `${process.env.API_BASE_URL}/auth/reset-password?token=${resetToken}`,
        expiresIn: '1 hour',
      },
    });
  }
}
```

### Example 3: Send Alert Notification to Nearby Users

```typescript
@Injectable()
export class AlertService {
  constructor(private readonly emailService: EmailService) {}

  async notifyNearbyUsers(alert: Alert) {
    const nearbyUsers = await this.findUsersNearLocation(
      alert.location,
      alert.radius,
    );

    // Send emails in parallel
    const emailPromises = nearbyUsers.map((user) =>
      this.emailService.sendHtml('newAlert', {
        from: 'alerts@fifi-alert.com',
        to: user.email,
        templateData: {
          user: { firstName: user.firstName },
          alert: {
            petName: alert.petName,
            petType: alert.petType,
            location: alert.locationAddress,
            distance: `${alert.distanceKm.toFixed(1)} km away`,
            viewUrl: `${process.env.API_BASE_URL}/alerts/${alert.id}`,
          },
        },
      }),
    );

    await Promise.all(emailPromises);
  }
}
```

### Example 4: Send Email with Attachment

```typescript
const pdfBuffer = await this.generatePdfReport(reportId);

await emailService.send({
  from: 'reports@fifi-alert.com',
  to: 'user@example.com',
  subject: 'Your Monthly Report',
  text: 'Please find your report attached.',
  html: '<p>Please find your report attached.</p>',
  attachment: {
    filename: 'monthly-report.pdf',
    data: pdfBuffer,
    contentType: 'application/pdf',
  },
});
```

### Example 5: Send Bulk Emails with Different Content

```typescript
const users = await this.getAllActiveUsers();

for (const user of users) {
  await emailService.sendHtml('monthlyNewsletter', {
    from: 'newsletter@fifi-alert.com',
    to: user.email,
    templateData: {
      user: { firstName: user.firstName },
      personalizedContent: await this.getPersonalizedContent(user.id),
      unsubscribeLink: `${process.env.API_BASE_URL}/unsubscribe?token=${user.unsubscribeToken}`,
    },
  });

  // Rate limiting: wait 100ms between emails
  await new Promise((resolve) => setTimeout(resolve, 100));
}
```

---

## Event System

The email module emits events for audit logging and monitoring.

### Event Flow

```
EmailService.send()
    ↓
Provider sends email
    ↓
    ├─ Success → EMAIL_SENT event
    └─ Failure → EMAIL_FAILED event
```

### Event Types

| Event | When Emitted | Payload |
|-------|--------------|---------|
| `EMAIL_SENT` | Email sent successfully | `{ to, result, payload }` |
| `EMAIL_FAILED` | Email send failed | `{ to, error, payload }` |
| `SMTP_EMAIL_SENT` | SMTP provider succeeded | `{ to, response }` |
| `MAILGUN_EMAIL_SENT` | Mailgun provider succeeded | `{ to, response }` |

### Listening to Events

```typescript
@Injectable()
export class AuditService {
  constructor(private readonly eventEmitter: EventEmitter2) {
    // Listen for all email sent events
    this.eventEmitter.on(EmailEventNames.EMAIL_SENT, (payload) => {
      this.logEmailSent(payload);
    });

    // Listen for email failures
    this.eventEmitter.on(EmailEventNames.EMAIL_FAILED, (payload) => {
      this.logEmailFailed(payload);
    });
  }

  private async logEmailSent(payload: IEmailSentEventPayload) {
    await this.auditLogRepository.create({
      eventType: 'EMAIL_SENT',
      userId: payload.payload.userId,
      metadata: {
        to: payload.to,
        subject: payload.payload.subject,
        messageId: payload.result.id,
      },
    });
  }
}
```

---

## Configuration

### Environment Variables

#### Required for All Providers

```env
MAIL_SYSTEM=smtp  # or 'mailgun'
EMAIL_FROM_NAME=FiFi Alert
EMAIL_FROM_EMAIL=noreply@fifi-alert.com
```

#### SMTP Provider (when MAIL_SYSTEM=smtp)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

#### Mailgun Provider (when MAIL_SYSTEM=mailgun)

```env
MAILGUN_API_KEY=key-your-mailgun-api-key
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_BASE_URL=https://api.mailgun.net
```

### Configuration Validation

The module validates configuration at startup:

```typescript
// src/config/email.config.ts
export default registerAs('email', () => {
  const provider = process.env.MAIL_SYSTEM || 'smtp';
  
  // Validates required variables based on provider
  // Throws clear errors if configuration is invalid
  
  return validateEmailConfig();
});
```

---

## Troubleshooting

### Issue: "Parameter 'key' is required" Error

**Cause:** `MAILGUN_API_KEY` is missing or empty when `MAIL_SYSTEM=mailgun`

**Solution:**
1. If using SMTP: Set `MAIL_SYSTEM=smtp` in `.env`
2. If using Mailgun: Set `MAILGUN_API_KEY` with your API key
3. Restart server

---

### Issue: Emails Not Sending (SMTP)

**Diagnosis:**
```bash
# Check logs for SMTP errors
tail -f logs/app.log | grep SMTP
```

**Common Causes:**
1. **Wrong credentials**: Verify `SMTP_USER` and `SMTP_PASSWORD`
2. **Gmail**: Use App Password, not account password
3. **Firewall**: Ensure outbound connections to port 587/465 allowed
4. **2FA**: Enable App Passwords if using Gmail with 2FA

**Solution:**
```env
# For Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx  # 16-char App Password
```

---

### Issue: Template Not Found

**Error:** `Template file not found: /path/to/template.njk`

**Causes:**
1. Template file doesn't exist at specified path
2. File path is incorrect in template registry
3. File extension mismatch (.njk vs .nunj)

**Solution:**
```typescript
// Verify file exists
const fileExists = fs.existsSync('src/notifications/email/user/welcome.njk');

// Check template registry
const templates = emailService.getEmailTemplateNames();
console.log(templates.welcome); // { subject: '...', file: '...' }
```

---

### Issue: MJML Compilation Errors

**Symptoms:** Email sends but layout is broken

**Diagnosis:**
```bash
# Check logs for MJML warnings
tail -f logs/app.log | grep MJML
```

**Solution:**
1. Validate MJML syntax: https://mjml.io/try-it-live
2. Check for unclosed tags
3. Ensure proper MJML component nesting

---

### Issue: Emails Going to Spam

**Causes:**
- No SPF/DKIM/DMARC records
- Sending from unverified domain
- Spammy subject lines or content
- Low sender reputation

**Solution:**
1. **Verify domain**: Add SPF, DKIM, DMARC DNS records
2. **Use verified domain**: Don't send from @gmail.com in production
3. **Test deliverability**: Use https://mail-tester.com
4. **Warm up domain**: Start with low volume, gradually increase

---

## FAQs

### How do I switch email providers?

1. Update `.env`: Change `MAIL_SYSTEM=mailgun` to `smtp` (or vice versa)
2. Configure new provider credentials
3. Restart server: `bun run start:dev`
4. Test with a sample email

**No code changes required!**

---

### Can I use multiple providers simultaneously?

Not out of the box. The current architecture selects one provider at startup.

**Workaround:** Create multiple EmailService instances with different providers:

```typescript
const smtpProvider = new SmtpService(eventEmitter);
const mailgunProvider = new MailgunService(eventEmitter);

const transactionalEmails = new EmailService(smtpProvider, eventEmitter);
const marketingEmails = new EmailService(mailgunProvider, eventEmitter);
```

---

### How do I add a new email provider (e.g., SendGrid)?

1. Create `src/shared/sendgrid/sendgrid.service.ts` implementing `IEmailProvider`
2. Update factory in `email-provider.factory.ts`:
   ```typescript
   case 'sendgrid':
     return new SendGridService(eventEmitter);
   ```
3. Add environment variables for SendGrid
4. Set `MAIL_SYSTEM=sendgrid`

---

### How do I preview emails without sending them?

Use `loadTemplate()` to render HTML without sending:

```typescript
const html = await emailService.loadTemplate('welcome', {
  user: { firstName: 'Preview' },
  activationLink: 'https://example.com',
});

// Save to file for preview
fs.writeFileSync('preview.html', html);
```

Or use Ethereal Email for fake SMTP: https://ethereal.email

---

### How do I handle email sending failures?

**Option 1: Try/Catch**
```typescript
try {
  await emailService.send({...});
} catch (error) {
  logger.error('Email send failed', error);
  // Handle failure (retry, notify admin, etc.)
}
```

**Option 2: Event Listener**
```typescript
eventEmitter.on(EmailEventNames.EMAIL_FAILED, (payload) => {
  // Log failure, retry, alert monitoring
});
```

**Option 3: Queue with BullMQ** (recommended for production)
```typescript
// Add email to queue
await emailQueue.add('send-email', emailData, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
});
```

---

### How do I test emails in development?

**Option 1: Ethereal Email** (Recommended)
- Free fake SMTP server
- View emails at https://ethereal.email/messages
- No real emails sent

**Option 2: Mailtrap**
- Email testing service
- Inspect HTML/spam score
- Requires account

**Option 3: Gmail**
- Send real emails to your own account
- Use App Password for authentication

See [TESTING_GUIDE.md](../plans/email-sending/TESTING_GUIDE.md) for detailed setup.

---

### How do I customize email styling?

Edit `src/notifications/email/common/layout.nunj`:

```xml
<mj-head>
  <mj-attributes>
    <!-- Change default font -->
    <mj-all font-family="'Helvetica', 'Arial', sans-serif" />
    
    <!-- Change button color -->
    <mj-button background-color="#28a745" color="#ffffff" />
    
    <!-- Change text color -->
    <mj-text color="#333333" />
  </mj-attributes>
  
  <!-- Add custom styles -->
  <mj-style>
    .custom-header { font-weight: bold; }
  </mj-style>
</mj-head>
```

---

### How do I track email opens/clicks?

**Mailgun:** Built-in tracking
```typescript
await emailService.send({
  from: 'sender@example.com',
  to: 'recipient@example.com',
  subject: 'Test',
  html: '<p>Test</p>',
  options: {
    'o:tracking': true,
    'o:tracking-clicks': true,
    'o:tracking-opens': true,
  },
});
```

**SMTP:** Use a third-party service or implement custom tracking:
1. Add transparent 1x1 tracking pixel for opens
2. Redirect all links through tracking endpoint for clicks

---

### Where are the logs?

Email logs use NestJS Logger:

```typescript
// Development: Console output
[EmailService] Email sent successfully: <message-id>

// Production: Structured logs
{
  "level": "info",
  "context": "EmailService",
  "message": "Email sent successfully",
  "messageId": "<message-id>",
  "to": "recipient@example.com"
}
```

**View logs:**
```bash
# Development
bun run start:dev  # Logs to console

# Production
tail -f logs/app.log | grep Email
```

---

## Additional Resources

- **Quick Start Guide**: [EMAIL_QUICKSTART.md](../EMAIL_QUICKSTART.md)
- **Testing Guide**: [TESTING_GUIDE.md](../plans/email-sending/TESTING_GUIDE.md)
- **Testing Checklist**: [TESTING_CHECKLIST.md](../plans/email-sending/TESTING_CHECKLIST.md)
- **Migration Guide**: [EMAIL_MIGRATION_GUIDE.md](../EMAIL_MIGRATION_GUIDE.md)
- **Reproduction Guide**: [email-sending-reproduction-guide.md](../plans/email-sending/email-sending-reproduction-guide.md)

---

**Module Status:** ✅ Production Ready  
**Maintainer:** FiFi Alert Team  
**Support:** File issues on GitHub or contact dev team
