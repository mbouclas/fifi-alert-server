# Email System Testing Guide

## Quick Test Script

Use this simple test to verify your email system is working:

### Step 1: Create Test File

Create `test-email.ts` in the `scripts/` folder:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/shared/email/email.service';

async function testEmail() {
  console.log('🚀 Starting email test...\n');

  // Bootstrap NestJS app
  const app = await NestFactory.create(AppModule, { logger: false });
  
  // Get EmailService from DI container
  const emailService = app.get(EmailService);

  try {
    // Test 1: Send raw HTML email
    console.log('📧 Test 1: Sending raw HTML email...');
    const result1 = await emailService.send({
      from: process.env.EMAIL_FROM_EMAIL || 'noreply@fifi-alert.com',
      to: 'test@example.com', // Replace with your test email
      subject: 'Test Email from FiFi Alert',
      html: '<h1>Hello from FiFi Alert!</h1><p>This is a test email.</p>',
      text: 'Hello from FiFi Alert! This is a test email.',
    });
    console.log('✅ Success:', result1);
    console.log();

    // Test 2: Send template-based email
    console.log('📧 Test 2: Sending template-based welcome email...');
    const result2 = await emailService.sendHtml('welcome', {
      from: process.env.EMAIL_FROM_EMAIL || 'noreply@fifi-alert.com',
      to: 'test@example.com', // Replace with your test email
      templateData: {
        user: { firstName: 'Tester' },
        activationLink: 'https://fifi-alert.com/activate?token=test123',
      },
    });
    console.log('✅ Success:', result2);
    console.log();

    console.log('🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

testEmail();
```

### Step 2: Update package.json

Add test script to `package.json`:

```json
{
  "scripts": {
    "test:email": "bun run scripts/test-email.ts"
  }
}
```

### Step 3: Configure Environment

#### Option A: Gmail (Recommended for Testing)

1. Enable 2FA: https://myaccount.google.com/security
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Add to `.env`:

```env
MAIL_SYSTEM=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx  # Your 16-character App Password
EMAIL_FROM_EMAIL=your-email@gmail.com
```

#### Option B: Ethereal Email (No Setup Required)

1. Visit https://ethereal.email/create
2. Copy the SMTP credentials shown
3. Add to `.env`:

```env
MAIL_SYSTEM=smtp
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<generated-user>@ethereal.email
SMTP_PASSWORD=<generated-password>
EMAIL_FROM_EMAIL=<generated-user>@ethereal.email
```

4. View sent emails at: https://ethereal.email/messages

### Step 4: Run Test

```bash
bun run test:email
```

Expected output:
```
🚀 Starting email test...

📧 Test 1: Sending raw HTML email...
✅ Success: { id: '<message-id>', message: 'Email sent', status: 250 }

📧 Test 2: Sending template-based welcome email...
✅ Success: { id: '<message-id>', message: 'Email sent', status: 250 }

🎉 All tests passed!
```

---

## Troubleshooting

### Error: "SMTP connection verification failed"

**Cause**: Invalid SMTP credentials or server unreachable

**Solutions**:
- Verify `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
- For Gmail: Use App Password, not account password
- Check firewall/network allows SMTP connections
- Try Ethereal Email instead (always works for testing)

### Error: "Template file not found"

**Cause**: Template path incorrect or file doesn't exist

**Solution**:
```bash
# Verify template files exist
ls src/notifications/email/user/welcome.njk
ls src/notifications/email/common/layout.nunj
```

### Error: "MAILGUN_API_KEY is not set"

**Cause**: `MAIL_SYSTEM=mailgun` but Mailgun not configured

**Solution**: Either:
1. Switch to SMTP: `MAIL_SYSTEM=smtp`
2. Or configure Mailgun credentials in `.env`

### Gmail-specific: "Username and Password not accepted"

**Cause**: Using Gmail password instead of App Password

**Solution**:
1. Enable 2FA: https://myaccount.google.com/security
2. Generate App Password: https://myaccount.google.com/apppasswords
   - Select "Mail" as app
   - Select "Other" as device
   - Name it "FiFi Alert"
3. Copy the 16-character password (format: xxxx-xxxx-xxxx-xxxx)
4. Use this in `SMTP_PASSWORD` (without spaces)

### MJML Compilation Warnings

**Cause**: Minor MJML syntax warnings (non-breaking)

**Solution**: These are usually safe to ignore. If you want to fix them:
- Check MJML documentation: https://mjml.io/documentation/
- Validate templates: https://mjml.io/try-it-live

---

## Manual Email Testing

Once the script works, test in your actual application:

### 1. User Registration Flow

```typescript
// In your user.service.ts or auth.service.ts
async registerUser(dto: RegisterDto) {
  const user = await this.createUser(dto);
  
  // Send welcome email
  await this.emailService.sendHtml('welcome', {
    from: process.env.EMAIL_FROM_EMAIL,
    to: user.email,
    templateData: {
      user: { firstName: user.firstName },
      activationLink: `${process.env.API_BASE_URL}/auth/activate?token=${user.activationToken}`,
    },
  });
  
  return user;
}
```

### 2. Password Reset Flow

```typescript
async requestPasswordReset(email: string) {
  const user = await this.findByEmail(email);
  const resetToken = await this.generateResetToken(user);
  
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
```

### 3. Alert Notification

```typescript
async notifyNearbyUsers(alert: Alert) {
  const nearbyUsers = await this.findUsersNearLocation(alert.location);
  
  for (const user of nearbyUsers) {
    await this.emailService.sendHtml('newAlert', {
      from: process.env.EMAIL_FROM_EMAIL,
      to: user.email,
      templateData: {
        user: { firstName: user.firstName },
        alert: {
          petName: alert.petName,
          petType: alert.petType,
          location: alert.locationAddress,
          distance: `${alert.distanceKm.toFixed(1)} km`,
          viewUrl: `${process.env.API_BASE_URL}/alerts/${alert.id}`,
        },
      },
    });
  }
}
```

---

## Provider Switching Test

Test that provider switching works:

### Switch to Mailgun

1. Update `.env`:
```env
MAIL_SYSTEM=mailgun
MAILGUN_API_KEY=your-api-key
MAILGUN_DOMAIN=mg.yourdomain.com
```

2. Restart server
3. Run test script again
4. Verify email sent via Mailgun

### Switch to SMTP

1. Update `.env`:
```env
MAIL_SYSTEM=smtp
```

2. Restart server
3. Run test script again
4. Verify email sent via SMTP

---

## Email Client Testing

Test emails render correctly in different clients:

1. **Gmail Web**: Open email in Gmail
2. **Outlook Web**: Forward to Outlook.com
3. **Apple Mail**: Check on iPhone/Mac
4. **Mobile Gmail**: Test on Android/iPhone

**Common Issues**:
- Images not loading → Use absolute URLs
- Layout broken → MJML should prevent this
- Dark mode issues → Test in dark mode clients

---

## Performance Testing

Test email sending performance:

```typescript
async function performanceTest() {
  const start = Date.now();
  
  const promises = Array.from({ length: 10 }, (_, i) =>
    emailService.send({
      from: 'noreply@fifi-alert.com',
      to: `test${i}@example.com`,
      subject: `Test ${i}`,
      html: `<h1>Test ${i}</h1>`,
    })
  );
  
  await Promise.all(promises);
  
  const end = Date.now();
  console.log(`Sent 10 emails in ${end - start}ms`);
  console.log(`Average: ${(end - start) / 10}ms per email`);
}
```

Expected performance:
- SMTP: 100-500ms per email
- Mailgun: 50-200ms per email (API-based)

---

## Next Steps

Once testing is complete:

1. ✅ Verify all templates render correctly
2. ✅ Test provider switching works
3. ✅ Integrate into user registration/auth flows
4. ✅ Set up production email provider (Mailgun or SendGrid)
5. ✅ Configure production credentials
6. ✅ Enable email notifications for alerts
7. ✅ Monitor email delivery rates
8. ✅ Set up email tracking (optional)

---

## Production Checklist

Before deploying to production:

- [ ] Production email provider configured (Mailgun/SendGrid)
- [ ] SMTP credentials stored in secure environment variables
- [ ] `EMAIL_FROM_EMAIL` uses verified domain
- [ ] SPF/DKIM/DMARC records configured for domain
- [ ] Test emails deliver to spam folder → If yes, improve sender reputation
- [ ] Unsubscribe links implemented (if sending marketing emails)
- [ ] Email rate limiting in place
- [ ] Error handling and retry logic tested
- [ ] Monitoring/alerting set up for failed emails
- [ ] Backup email provider configured (optional)

---

**Last Updated**: February 7, 2026
**Status**: Ready for Testing ✅
