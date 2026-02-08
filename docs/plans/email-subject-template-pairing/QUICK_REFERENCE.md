# Email Implementation Quick Reference

Quick reference guide for implementing emails using the service-local template pattern.

## Quick Start Checklist

When adding email functionality to a service:

- [ ] 1. Define template registry constant
- [ ] 2. Create `.njk` template files
- [ ] 3. Inject email provider in constructor
- [ ] 4. Create email-sending method(s)
- [ ] 5. Call method in service workflow
- [ ] 6. Write unit tests
- [ ] 7. Test email delivery

## Code Templates

### 1. Template Registry Definition

```typescript
import { IEmailTemplate } from '@shared/email/email.service';

const yourServiceEmailTemplates: Record<string, IEmailTemplate> = {
  // Template key should match what you'll use in sendHtml()
  yourTemplateName: {
    subject: 'Your Email Subject',
    file: 'notifications/email/yourModule/yourTemplate.njk',
  },
  anotherTemplate: {
    subject: 'Another Subject',
    file: 'notifications/email/yourModule/anotherTemplate.njk',
  },
};
```

**Naming conventions:**
- Use camelCase for template keys
- File path is relative from `src/`
- Template files use camelCase with `.njk` extension

---

### 2. Service Constructor (with Email Provider Injection)

```typescript
import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';
import { EmailService } from '@shared/email/email.service';

@Injectable()
export class YourService {
  private readonly logger = new Logger(YourService.name);

  constructor(
    @Inject('EMAIL_PROVIDER') private readonly emailProvider: IEmailProvider,
    private readonly eventEmitter: EventEmitter2,
    // ... other dependencies
  ) {}
}
```

---

### 3. Email Sending Method

```typescript
/**
 * Send notification email to user
 * @param user User to send email to
 * @param additionalData Any additional template data
 */
async sendYourEmail(
  user: User,
  additionalData?: Record<string, any>
): Promise<{ success: boolean; message: string }> {
  this.logger.log(`Sending email to user ${user.id}: ${user.email}`);

  // Instantiate EmailService with local templates
  const emailService = new EmailService(
    this.emailProvider,
    this.eventEmitter,
    yourServiceEmailTemplates,
  );

  try {
    await emailService.sendHtml('yourTemplateName', {
      from: String(process.env.MAIL_NOTIFICATIONS_FROM),
      to: user.email,
      templateData: {
        user: {
          ...user,
          password: undefined, // ALWAYS exclude sensitive data
        },
        ...additionalData,
      },
    });

    this.logger.log(`Email sent successfully to user ${user.id}`);
    
    return {
      success: true,
      message: `Email sent to ${user.email}`,
    };
  } catch (error) {
    this.logger.error(`Failed to send email to user ${user.id}:`, error);
    throw new Error('FAILED_TO_SEND_EMAIL');
  }
}
```

---

### 4. Using the Email Method in Service Logic

```typescript
async yourBusinessMethod(userId: number, dto: YourDto) {
  // 1. Business logic
  const result = await this.prisma.your.create({ data: dto });
  
  // 2. Get user
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  });

  // 3. Send email notification
  try {
    await this.sendYourEmail(user, { result });
  } catch (error) {
    // Log error but don't fail the operation
    this.logger.error('Email send failed but operation succeeded:', error);
  }

  return result;
}
```

**Important:** Consider whether email failure should fail the entire operation or just be logged.

---

### 5. Email Template File (.njk)

Create file at: `src/notifications/email/yourModule/yourTemplate.njk`

```nunjucks
{% extends "common/layout.nunj" %}

{% block title %}Your Email Title{% endblock %}

{% block header %}📧 Your Email Header{% endblock %}

{% block content %}
  <mj-text font-size="18px" font-weight="bold" color="#333333" padding-bottom="20px">
    Hi {{ user.firstName|default('there') }},
  </mj-text>
  
  <mj-text padding-bottom="20px">
    Your email content goes here. You can use variables like {{ user.email }}.
  </mj-text>
  
  <mj-divider border-width="1px" border-color="#e0e0e0" padding="20px 0px" />
  
  {% if someLink %}
  <mj-button background-color="#007bff" color="#ffffff" href="{{ someLink }}" padding="15px 0px">
    Click Here
  </mj-button>
  {% endif %}
  
  <mj-text padding-top="20px" font-size="12px" color="#666666">
    If you have questions, contact us at support@fifi-alert.com
  </mj-text>
{% endblock %}
```

**Template variables:**
- Access via `{{ variableName }}`
- Use filters like `|default('fallback')`
- Conditional blocks: `{% if variable %}`
- Extends base layout: `{% extends "common/layout.nunj" %}`

---

### 6. Unit Test Template

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { YourService } from './your.service';
import { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';

describe('YourService - Email Methods', () => {
  let service: YourService;
  let mockEmailProvider: jest.Mocked<IEmailProvider>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    // Mock email provider
    mockEmailProvider = {
      send: jest.fn().mockResolvedValue({ id: 'test-id', success: true }),
    } as any;

    // Mock event emitter
    mockEventEmitter = {
      emit: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YourService,
        {
          provide: 'EMAIL_PROVIDER',
          useValue: mockEmailProvider,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        // ... other providers
      ],
    }).compile();

    service = module.get<YourService>(YourService);
  });

  describe('sendYourEmail', () => {
    it('should send email with correct template data', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = await service.sendYourEmail(mockUser, { extra: 'data' });

      expect(result.success).toBe(true);
      expect(mockEmailProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          from: expect.any(String),
          subject: expect.any(String),
          html: expect.any(String),
        }),
      );
    });

    it('should handle email send failure', async () => {
      mockEmailProvider.send.mockRejectedValue(new Error('Send failed'));
      
      const mockUser = { id: 1, email: 'test@example.com' };

      await expect(service.sendYourEmail(mockUser)).rejects.toThrow(
        'FAILED_TO_SEND_EMAIL',
      );
    });
  });
});
```

---

## Environment Variables

Required in `.env`:

```env
# Email Provider
MAIL_SYSTEM=mailgun              # or 'smtp'
MAIL_NOTIFICATIONS_FROM=noreply@fifi-alert.com
MAIL_FROM_NAME=FiFi Alert

# Mailgun (if using)
MAILGUN_API_KEY=your_key
MAILGUN_DOMAIN=mg.fifi-alert.com

# SMTP (if using)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_user
SMTP_PASSWORD=your_password
SMTP_SECURE=false
```

---

## Common Patterns

### Pattern 1: Email with Generated Link

```typescript
async sendEmailWithLink(user: User): Promise<{ success: boolean; message: string }> {
  // Generate token/link
  const token = await this.generateToken(user.id);
  const link = `${process.env.APP_URL}/verify?token=${token}`;
  
  const emailService = new EmailService(
    this.emailProvider,
    this.eventEmitter,
    templates,
  );

  await emailService.sendHtml('templateName', {
    from: process.env.MAIL_NOTIFICATIONS_FROM,
    to: user.email,
    templateData: {
      user: { ...user, password: undefined },
      link,
      expiresIn: '24 hours',
    },
  });

  return { success: true, message: 'Email sent' };
}
```

---

### Pattern 2: Batch Email Sending

```typescript
async sendBatchEmails(users: User[], alertData: any): Promise<void> {
  this.logger.log(`Sending emails to ${users.length} users`);
  
  const emailService = new EmailService(
    this.emailProvider,
    this.eventEmitter,
    templates,
  );

  // Send emails in parallel
  const emailPromises = users.map(user =>
    emailService.sendHtml('templateName', {
      from: process.env.MAIL_NOTIFICATIONS_FROM,
      to: user.email,
      templateData: { user, ...alertData },
    }).catch(error => {
      this.logger.error(`Failed to send to ${user.email}:`, error);
      // Don't throw - continue with other emails
    })
  );

  await Promise.all(emailPromises);
  this.logger.log('Batch email send completed');
}
```

---

### Pattern 3: Conditional Email (with User Preferences)

```typescript
async sendConditionalEmail(user: User, data: any): Promise<void> {
  // Check if user wants this email type
  const preferences = await this.getUserEmailPreferences(user.id);
  
  if (!preferences.receiveAlerts) {
    this.logger.log(`User ${user.id} opted out of emails`);
    return;
  }

  await this.sendYourEmail(user, data);
}
```

---

## Testing Checklist

- [ ] Email sent with correct recipient
- [ ] Template data formatted correctly
- [ ] Sensitive data excluded (passwords, tokens)
- [ ] Error handling works properly
- [ ] Email provider called with correct parameters
- [ ] Events emitted correctly
- [ ] Logs contain useful information

---

## Troubleshooting

### Email not sending?

1. Check environment variables are set correctly
2. Verify email provider credentials (Mailgun API key, SMTP settings)
3. Check logs for error messages
4. Test email provider directly with CLI command:
   ```bash
   bun run cli send-test-email your@email.com
   ```

### Template not found?

1. Verify template file exists at correct path
2. Check template key matches registry definition
3. Ensure file has `.njk` extension
4. Check file path is relative from `src/`

### Template rendering errors?

1. Check MJML syntax in template
2. Verify all variables used in template are provided in `templateData`
3. Use default filters for optional variables: `{{ var|default('fallback') }}`
4. Check base layout exists: `src/notifications/email/common/layout.nunj`

---

## Best Practices

✅ **DO:**
- Always exclude sensitive data from templateData
- Log email send attempts and failures
- Use environment variables for sender addresses
- Test templates with real data
- Handle email failures gracefully
- Use descriptive template names

❌ **DON'T:**
- Hard-code email addresses
- Include passwords or tokens in email data
- Fail operations if email fails (unless critical)
- Send emails in loops without batching
- Forget to sanitize user input in templates

---

## Examples in Codebase

**Reference Implementation:** `src/user/user.service.ts`
- Template registry: lines 57-73
- Email method example: `sendForgotPasswordNotification()`

**Existing Templates:**
- `src/notifications/email/user/*.njk`
- `src/notifications/email/alert/*.njk`
- `src/notifications/email/common/layout.nunj` (base layout)

---

**Quick Links:**
- [Full Task List](./tasks.md)
- [Plan Overview](./README.md)
- [Email Module Docs](../../modules/EMAIL_MODULE.md)
