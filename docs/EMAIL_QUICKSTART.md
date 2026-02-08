# Email System Quick Start Guide

> **Get started with the FiFi Alert email system in 5 minutes!**

---

## Prerequisites

- Node.js/Bun installed
- FiFi Alert server cloned and dependencies installed
- Code editor (VS Code recommended)

---

## Quick Setup (Development)

### Step 1: Choose Your Email Provider

For development, we recommend **SMTP with Ethereal Email** (free, no signup, fake emails):

```bash
# Visit https://ethereal.email/create
# Copy the credentials shown
```

### Step 2: Configure Environment

Add to `.env`:

```env
# Email System
MAIL_SYSTEM=smtp

# SMTP Configuration (Ethereal Email credentials)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your-generated-user>@ethereal.email
SMTP_PASSWORD=<your-generated-password>

# Sender Defaults
EMAIL_FROM_NAME=FiFi Alert
EMAIL_FROM_EMAIL=noreply@fifi-alert.com
```

### Step 3: Restart Server

```bash
bun run start:dev
```

### Step 4: Send Your First Email

Create `test-email.ts` in `scripts/` folder:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/shared/email/email.service';

async function testEmail() {
  console.log('🚀 Sending test email...\n');

  // Bootstrap app
  const app = await NestFactory.create(AppModule, { logger: false });
  const emailService = app.get(EmailService);

  try {
    // Send a simple email
    const result = await emailService.send({
      from: 'test@fifi-alert.com',
      to: 'recipient@example.com',
      subject: 'Hello from FiFi Alert!',
      html: '<h1>It works!</h1><p>Your email system is configured correctly.</p>',
      text: 'It works! Your email system is configured correctly.',
    });

    console.log('✅ Email sent successfully!');
    console.log('📧 Message ID:', result.id);
    console.log('\n📬 View it at: https://ethereal.email/messages\n');
  } catch (error) {
    console.error('❌ Failed to send email:', error);
  } finally {
    await app.close();
  }
}

testEmail();
```

Run the test:

```bash
bun run scripts/test-email.ts
```

**Expected output:**
```
🚀 Sending test email...

✅ Email sent successfully!
📧 Message ID: <abc123@ethereal.email>

📬 View it at: https://ethereal.email/messages
```

Visit https://ethereal.email/messages to see your email!

---

## Send Your First Template Email

### Use an Existing Template

```typescript
import { EmailService } from '../src/shared/email/email.service';

// Welcome email (default template)
await emailService.sendHtml('welcome', {
  from: 'noreply@fifi-alert.com',
  to: 'newuser@example.com',
  templateData: {
    user: { firstName: 'John' },
    activationLink: 'https://fifi-alert.com/activate?token=abc123',
  },
});

// Password reset email
await emailService.sendHtml('passwordReset', {
  from: 'noreply@fifi-alert.com',
  to: 'user@example.com',
  templateData: {
    user: { firstName: 'Jane' },
    resetLink: 'https://fifi-alert.com/reset?token=xyz789',
    expiresIn: '1 hour',
  },
});

// New alert email
await emailService.sendHtml('newAlert', {
  from: 'alerts@fifi-alert.com',
  to: 'user@example.com',
  templateData: {
    user: { firstName: 'Alice' },
    alert: {
      petName: 'Max',
      petType: 'Dog',
      location: '123 Main St',
      distance: '2.5 km',
      viewUrl: 'https://fifi-alert.com/alerts/123',
    },
  },
});
```

### Available Default Templates

| Template Name | Use Case | Required Data |
|---------------|----------|---------------|
| `welcome` | User registration | `user.firstName`, `activationLink` |
| `passwordReset` | Password reset | `user.firstName`, `resetLink`, `expiresIn` |
| `forgotPassword` | Forgot password | `user.firstName`, `resetLink` |
| `invite` | User invitation | `user.firstName`, `inviteLink` |
| `newAlert` | Pet alert notification | `user.firstName`, `alert.*` |
| `alertResolved` | Alert resolution | `user.firstName`, `alert.*` |

---

## Common Use Cases

### 1. Send Email on User Registration

```typescript
@Injectable()
export class UserService {
  constructor(
    private readonly emailService: EmailService,
    private readonly userRepository: UserRepository,
  ) {}

  async register(dto: RegisterDto) {
    // Create user
    const user = await this.userRepository.create({
      email: dto.email,
      firstName: dto.firstName,
      password: await this.hashPassword(dto.password),
    });

    // Generate activation token
    const token = this.generateToken(user.id);

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

### 2. Send Password Reset Email

```typescript
@Injectable()
export class AuthService {
  constructor(private readonly emailService: EmailService) {}

  async requestPasswordReset(email: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      return;
    }

    // Generate reset token (expires in 1 hour)
    const resetToken = this.generateResetToken(user.id, '1h');

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

### 3. Send Notification to Multiple Users

```typescript
@Injectable()
export class NotificationService {
  constructor(private readonly emailService: EmailService) {}

  async notifyUsers(userIds: string[], message: string) {
    const users = await this.userRepository.findByIds(userIds);

    // Send emails in parallel
    await Promise.all(
      users.map((user) =>
        this.emailService.send({
          from: 'notifications@fifi-alert.com',
          to: user.email,
          subject: 'New Notification',
          html: `<p>Hi ${user.firstName},</p><p>${message}</p>`,
        }),
      ),
    );
  }
}
```

### 4. Send Email with Attachment

```typescript
async sendInvoice(userId: string, invoiceId: string) {
  const user = await this.userRepository.findById(userId);
  const invoice = await this.invoiceRepository.findById(invoiceId);
  
  // Generate PDF invoice
  const pdfBuffer = await this.generateInvoicePdf(invoice);

  await this.emailService.send({
    from: 'billing@fifi-alert.com',
    to: user.email,
    subject: `Invoice #${invoice.number}`,
    html: `<p>Dear ${user.firstName},</p><p>Please find your invoice attached.</p>`,
    attachment: {
      filename: `invoice-${invoice.number}.pdf`,
      data: pdfBuffer,
      contentType: 'application/pdf',
    },
  });
}
```

---

## Create a Custom Email Template

### Step 1: Create Template File

Create `src/notifications/email/custom/promotion.njk`:

```nunjucks
{% extends "common/layout.nunj" %}

{% block header %}
<mj-text font-size="28px" font-weight="bold" color="#007bff">
  Special Offer Just for You!
</mj-text>
{% endblock %}

{% block content %}
<mj-text font-size="16px">
  Hi {{ user.firstName|default('there') }},
</mj-text>

<mj-text>
  We have a special promotion for FiFi Alert users: <strong>{{ promotion.title }}</strong>
</mj-text>

<mj-text>
  {{ promotion.description }}
</mj-text>

<mj-button href="{{ promotion.ctaLink }}" background-color="#28a745">
  {{ promotion.ctaText }}
</mj-button>

<mj-text font-size="14px" color="#666">
  This offer expires on {{ promotion.expiresAt }}.
</mj-text>
{% endblock %}

{% block footer %}
<mj-divider border-color="#ccc" />
<mj-text font-size="12px" color="#999" align="center">
  © 2026 FiFi Alert. All rights reserved.
</mj-text>
<mj-text font-size="12px" color="#999" align="center">
  <a href="{{ unsubscribeLink }}" style="color: #999;">Unsubscribe</a>
</mj-text>
{% endblock %}
```

### Step 2: Register Template

In your module:

```typescript
@Injectable()
export class MarketingService {
  constructor(private readonly emailService: EmailService) {
    // Register custom template at runtime
    this.emailService.setEmailTemplateNames({
      promotion: {
        subject: 'Special Offer for FiFi Alert Users',
        file: 'notifications/email/custom/promotion.njk',
      },
    });
  }

  async sendPromotion(userId: string, promotionData: any) {
    const user = await this.userRepository.findById(userId);

    await this.emailService.sendHtml('promotion', {
      from: 'marketing@fifi-alert.com',
      to: user.email,
      templateData: {
        user: { firstName: user.firstName },
        promotion: {
          title: promotionData.title,
          description: promotionData.description,
          ctaText: 'Claim Offer',
          ctaLink: promotionData.link,
          expiresAt: promotionData.expiresAt,
        },
        unsubscribeLink: `${process.env.API_BASE_URL}/unsubscribe?token=${user.unsubscribeToken}`,
      },
    });
  }
}
```

### Step 3: Send Email

```typescript
await marketingService.sendPromotion('user-id-123', {
  title: '50% Off Premium Membership',
  description: 'Upgrade to Premium and get advanced alert features.',
  link: 'https://fifi-alert.com/premium?promo=SAVE50',
  expiresAt: 'March 31, 2026',
});
```

---

## Switch to Production Email Provider

### Option 1: Gmail (Free, Good for Small Apps)

1. **Enable 2FA**: https://myaccount.google.com/security
2. **Generate App Password**: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Name it "FiFi Alert"
   - Copy the 16-character password
3. **Update `.env`**:
   ```env
   MAIL_SYSTEM=smtp
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx  # The App Password
   EMAIL_FROM_EMAIL=your-email@gmail.com
   ```
4. **Restart server**: `bun run start:dev`

### Option 2: Mailgun (Paid, Best for Production)

1. **Sign up**: https://www.mailgun.com
2. **Verify domain**: Add DNS records (SPF, DKIM, DMARC)
3. **Get API key**: Dashboard → Settings → API Keys
4. **Update `.env`**:
   ```env
   MAIL_SYSTEM=mailgun
   MAILGUN_API_KEY=key-your-api-key
   MAILGUN_DOMAIN=mg.yourdomain.com
   MAILGUN_BASE_URL=https://api.mailgun.net
   EMAIL_FROM_EMAIL=noreply@yourdomain.com
   ```
5. **Restart server**: `bun run start:dev`

**No code changes required!** Just update environment variables and restart.

---

## Testing Your Emails

### Test in Different Email Clients

Send a test email to:
- Gmail (desktop and mobile)
- Outlook (desktop and mobile)
- Apple Mail (Mac/iOS)

### Check Spam Score

Use https://mail-tester.com:
1. Send email to the provided test address
2. Check your score (aim for 9/10 or higher)
3. Follow recommendations to improve score

### Preview Email HTML

```typescript
// Render template without sending
const html = await emailService.loadTemplate('welcome', {
  user: { firstName: 'Preview' },
  activationLink: 'https://example.com',
});

// Save to file
fs.writeFileSync('preview.html', html);

// Open in browser to preview
```

---

## Troubleshooting

### "Connection refused" or "Connection timeout"

**Problem:** Can't connect to SMTP server

**Solutions:**
- Check firewall allows outbound connections on port 587/465
- Verify SMTP_HOST and SMTP_PORT are correct
- Try using Ethereal Email (always works for testing)

### "Authentication failed"

**Problem:** Wrong credentials

**Solutions:**
- For Gmail: Use App Password (not account password)
- Verify SMTP_USER and SMTP_PASSWORD are correct
- Check for extra spaces in environment variables

### "Template not found"

**Problem:** Template file doesn't exist or wrong path

**Solutions:**
- Verify file exists: `src/notifications/email/user/welcome.njk`
- Check file extension (.njk not .nunjucks)
- Ensure template registered in EmailService

### Emails go to spam

**Problem:** Poor sender reputation or missing DNS records

**Solutions:**
- Add SPF, DKIM, DMARC DNS records
- Use verified sending domain (not @gmail.com in production)
- Test with https://mail-tester.com
- Avoid spammy words in subject/body

---

## Next Steps

- 📖 **Read full documentation**: [EMAIL_MODULE.md](modules/EMAIL_MODULE.md)
- ✅ **Run comprehensive tests**: Follow [TESTING_CHECKLIST.md](plans/email-sending/TESTING_CHECKLIST.md)
- 🚀 **Deploy to production**: Set up Mailgun or SendGrid
- 📊 **Monitor emails**: Set up logging and alerts for failures

---

## Need Help?

- **Documentation**: [EMAIL_MODULE.md](modules/EMAIL_MODULE.md)
- **Testing**: [TESTING_GUIDE.md](plans/email-sending/TESTING_GUIDE.md)
- **Migration**: [EMAIL_MIGRATION_GUIDE.md](EMAIL_MIGRATION_GUIDE.md)
- **Issues**: File on GitHub or contact dev team

---

**Happy Emailing! 📧✨**
