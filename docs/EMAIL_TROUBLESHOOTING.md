# Email Troubleshooting Guide

> **Last Updated:** February 8, 2026  
> **Module:** Email System (SMTP/Mailgun)

---

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Common Issues](#common-issues)
3. [Email Provider Issues](#email-provider-issues)
4. [Template Problems](#template-problems)
5. [Testing Tools](#testing-tools)
6. [Monitoring & Logs](#monitoring--logs)
7. [FAQ](#faq)

---

## Quick Diagnostics

### Checklist: Email Not Sending

- [ ] Check logs for error messages: `tail -f logs/combined.log | grep EmailService`
- [ ] Verify environment variables are set (see [Configuration](#configuration))
- [ ] Test email provider connectivity
- [ ] Check if email template exists
- [ ] Verify recipient email address is valid
- [ ] Check rate limits haven't been exceeded
- [ ] Ensure MAIL_SYSTEM is set correctly (`smtp` or `mailgun`)

### Quick Test Commands

```bash
# Test SMTP connection
curl -X POST http://localhost:3000/admin/test-email \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "test@example.com", "provider": "smtp"}'

# Check email service logs
bun run logs:email

# Validate email template
bun run cli validate-template welcome
```

---

## Common Issues

### Issue 1: No Emails Being Sent

**Symptoms:**
- No error messages in logs
- Users report not receiving emails
- Email operations complete successfully

**Possible Causes:**

1. **Provider Not Configured**
   ```bash
   # Check .env
   cat .env | grep MAIL_
   ```
   
   **Solution:** Set required environment variables:
   ```env
   MAIL_SYSTEM=smtp
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   MAIL_NOTIFICATIONS_FROM=noreply@yourapp.com
   ```

2. **Invalid "From" Address**
   
   **Error:** `Invalid email address: undefined`
   
   **Solution:** Set `MAIL_NOTIFICATIONS_FROM` in `.env`

3. **Provider Service Down**
   
   **Check:** Visit status pages:
   - SMTP: Check your email provider's status
   - Mailgun: https://status.mailgun.com/

**Quick Fix:**
```typescript
// Test email provider manually
import { SmtpService } from '@shared/smtp/smtp.service';

const smtp = new SmtpService(eventEmitter);
await smtp.send({
  from: 'test@example.com',
  to: 'recipient@example.com',
  subject: 'Test Email',
  text: 'If you receive this, SMTP is working!',
});
```

---

### Issue 2: Emails Going to Spam

**Symptoms:**
- Emails send successfully but land in spam folder
- Gmail shows "This message may not be from who it claims to be"

**Solutions:**

1. **Set Up SPF Record** (DNS)
   ```
   v=spf1 include:_spf.google.com ~all
   ```

2. **Set Up DKIM** (DNS)
   - For Gmail: Follow [Google Workspace DKIM setup](https://support.google.com/a/answer/174124)
   - For Mailgun: Configure in Mailgun dashboard

3. **Set Up DMARC** (DNS)
   ```
   v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourapp.com
   ```

4. **Use Reputable Provider**
   - Switch from `MAIL_SYSTEM=smtp` to `MAIL_SYSTEM=mailgun`
   - Mailgun has better IP reputation

5. **Improve Email Content**
   - Avoid spam trigger words: "FREE", "CLICK HERE", "ACT NOW"
   - Include unsubscribe link
   - Use text + HTML versions
   - Add physical mailing address in footer

---

### Issue 3: Template Rendering Errors

**Symptoms:**
```
Error: filter not found: date
Error: Template file not found: notifications/email/user/welcome.njk
Template render error: undefined is not an object
```

**Solutions:**

1. **Template Not Found**
   
   **Error:** `Template file not found`
   
   ```bash
   # Verify template exists
   ls -la src/notifications/email/user/welcome.njk
   ```
   
   **Solution:** Check file path matches template registry:
   ```typescript
   const templates = {
     welcome: {
       subject: 'Welcome!',
       file: 'notifications/email/user/welcome.njk', // Must be relative to src/
     },
   };
   ```

2. **Nunjucks Filter Not Found**
   
   **Error:** `filter not found: date`
   
   **Solution:** Format dates in JavaScript before passing to template:
   ```typescript
   // ❌ Don't use Nunjucks filters
   {{ timestamp|date('MMMM Do YYYY') }}
   
   // ✅ Format in service code
   templateData: {
     timestampFormatted: timestamp.toLocaleString('en-US', {
       year: 'numeric',
       month: 'long',
       day: 'numeric',
     }),
   }
   ```

3. **Missing Template Variables**
   
   **Error:** `Cannot read property 'firstName' of undefined`
   
   **Solution:** Use Nunjucks default filters:
   ```nunjucks
   {# Safe - provides fallback #}
   Hello {{ user.firstName|default('there') }}!
   
   {# Unsafe - will error if user is undefined #}
   Hello {{ user.firstName }}!
   ```

4. **MJML Compilation Errors**
   
   **Check logs for warnings:**
   ```
   MJML compilation warnings for welcome:
   [{ line: 23, message: "mj-button doesn't exist", tagName: "mj-button" }]
   ```
   
   **Solution:** Fix MJML syntax (check [MJML documentation](https://mjml.io/documentation/))

---

### Issue 4: Rate Limiting

**Symptoms:**
- Email sends fail after several attempts
- Error: `Rate limit exceeded`
- HTTP 429 responses

**Solutions:**

1. **Check Current Limits** (in logs)
   ```
   [RateLimitService] Rate limit exceeded for user 123: 5 emails sent in past hour (limit: 5)
   ```

2. **Adjust Rate Limits** (if legitimate use case)
   ```typescript
   // In alert.service.ts or user.service.ts
   const RATE_LIMITS = {
     EMAIL_PER_HOUR: 10,      // Increase if needed
     EMAIL_PER_DAY: 50,
     EMAIL_PER_WEEK: 200,
   };
   ```

3. **Implement Queueing**
   
   For bulk emails, use BullMQ queue:
   ```typescript
   // Instead of sending immediately
   await emailService.send({ ... });
   
   // Queue for later
   await emailQueue.add('send-email', {
     to: user.email,
     template: 'welcome',
     data: { ... },
   });
   ```

4. **Provider-Side Limits**
   
   - **SMTP (Gmail):** 500 emails/day (free), 2000/day (Google Workspace)
   - **Mailgun:** Check your plan limits in dashboard
   
   **Solution:** Upgrade plan or switch provider

---

## Email Provider Issues

### SMTP Issues

#### Connection Refused / Timeout

**Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:587
Error: Connection timeout
```

**Solutions:**

1. **Check SMTP Credentials**
   ```bash
   # Test connection manually
   telnet smtp.gmail.com 587
   ```

2. **Enable "Less Secure App Access"** (Gmail)
   - Or use App Password: https://myaccount.google.com/apppasswords

3. **Check Firewall/Network**
   - Port 587 (TLS) or 465 (SSL) must be open
   - Some networks block SMTP ports

4. **Verify SMTP Host**
   ```env
   # Common SMTP hosts
   SMTP_HOST=smtp.gmail.com          # Gmail
   SMTP_HOST=smtp.office365.com      # Outlook
   SMTP_HOST=smtp.sendgrid.net       # SendGrid
   ```

#### Authentication Failed

**Error:**
```
Error: Invalid login: 535-5.7.8 Username and Password not accepted
```

**Solutions:**

1. **Use App Password** (Gmail)
   - Go to: https://myaccount.google.com/apppasswords
   - Generate app-specific password
   - Use in `SMTP_PASS`

2. **Check Username Format**
   ```env
   # Gmail/Google Workspace
   SMTP_USER=your-email@gmail.com    # Full email
   
   # Some providers
   SMTP_USER=username                # Without @domain
   ```

3. **Enable SMTP Access** (Gmail)
   - Settings → Forwarding and POP/IMAP → Enable IMAP

### Mailgun Issues

#### Invalid API Key

**Error:**
```
Error: Forbidden - No permission to send mail
Status: 403
```

**Solution:**
```env
# Get from: https://app.mailgun.com/app/account/security/api_keys
MAILGUN_API_KEY=your-private-api-key-here
MAILGUN_DOMAIN=mg.yourdomain.com
```

#### Domain Not Verified

**Error:**
```
Error: Domain not found
Status: 404
```

**Solution:**
1. Verify domain in Mailgun dashboard
2. Add DNS records (SPF, DKIM, CNAME)
3. Wait for verification (can take 24-48 hours)

#### Rate Limited

**Error:**
```
Error: Too many requests
Status: 429
```

**Solution:**
- Check your plan limits: https://app.mailgun.com/app/account/settings
- Upgrade plan if needed
- Implement exponential backoff

---

## Template Problems

### Debugging Templates

#### 1. Preview Template Locally

```bash
# Generate HTML preview
bun run cli preview-template welcome --data='{"user":{"firstName":"John"}}'

# Opens in browser
open tmp/email-preview.html
```

#### 2. Validate Template Syntax

```bash
# Check for MJML errors
bun run cli validate-template welcome

# Output:
# ✓ Template found: src/notifications/email/user/welcome.njk
# ✓ Nunjucks syntax valid
# ✓ MJML compilation successful
# ✗ Warning: mj-section should have at least one child
```

#### 3. Test with Sample Data

```typescript
// In your test file
describe('Email Templates', () => {
  it('should render welcome email', async () => {
    const emailService = new EmailService(mockProvider, eventEmitter);
    
    const html = await emailService.loadTemplate('welcome', {
      user: { firstName: 'John', email: 'john@example.com' },
      activationLink: 'https://app.com/activate?token=abc',
    });
    
    expect(html).toContain('Hello John');
    expect(html).toContain('Activate');
  });
});
```

### Common Template Issues

#### Issue: Broken Layout on Mobile

**Cause:** Missing MJML viewport settings

**Solution:**
```xml
<mj-head>
  <mj-attributes>
    <mj-all font-family="Arial, sans-serif" />
    <mj-text font-size="14px" line-height="1.6" />
    <mj-button font-size="16px" border-radius="4px" />
  </mj-attributes>
  <mj-style>
    @media only screen and (max-width: 480px) {
      .mobile-padding { padding: 10px !important; }
    }
  </mj-style>
</mj-head>
```

#### Issue: Images Not Loading

**Cause:** Relative image paths

**Solution:** Use absolute URLs:
```nunjucks
{# ❌ Won't work in email #}
<mj-image src="/assets/logo.png" />

{# ✅ Use absolute URL #}
<mj-image src="{{ appUrl }}/assets/logo.png" />
```

#### Issue: Inconsistent Styling Across Email Clients

**Cause:** CSS not supported by all clients

**Solution:** Use inline styles (MJML does this automatically):
```xml
{# MJML compiles to inline styles #}
<mj-text color="#333333" font-size="16px">
  This will work everywhere
</mj-text>
```

---

## Testing Tools

### 1. Mailgun Email Logs

```bash
# View recent deliveries
curl -s --user "api:$MAILGUN_API_KEY" \
  https://api.mailgun.net/v3/$MAILGUN_DOMAIN/events \
  | jq '.items[] | {event: .event, recipient: .recipient, timestamp: .timestamp}'
```

### 2. Test Email Endpoints

```bash
# Admin test endpoint
POST /admin/test-email
{
  "to": "test@example.com",
  "template": "welcome",
  "data": {
    "user": {
      "firstName": "Test"
    }
  }
}
```

### 3. Email Preview Tools

- **Litmus**: https://litmus.com/ (paid)
- **Email on Acid**: https://www.emailonacid.com/ (paid)
- **MJML Playground**: https://mjml.io/try-it-live (free)
- **Mailtrap**: https://mailtrap.io/ (free tier available)

### 4. Local Testing with Mailtrap

```env
# Use Mailtrap for development
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your-mailtrap-username
SMTP_PASS=your-mailtrap-password
```

All emails will be caught by Mailtrap instead of being sent to real users.

---

## Monitoring & Logs

### Log Locations

```bash
# Email service logs
logs/combined.log          # All logs
logs/error.log            # Errors only

# Search for email events
grep "EmailService" logs/combined.log
grep "Failed to send" logs/error.log
```

### Log Patterns to Watch

**Successful Email:**
```json
{
  "level": "log",
  "message": "Email sent successfully",
  "metadata": {
    "recipients": 1,
    "subject": "Welcome to FiFi Alert!",
    "duration_ms": 234,
    "messageId": "20230815123456.1.ABCD@mg.example.com"
  }
}
```

**Failed Email:**
```json
{
  "level": "error",
  "message": "Failed to send email",
  "metadata": {
    "recipients": 1,
    "subject": "Welcome to FiFi Alert!",
    "duration_ms": 5012,
    "error": "ETIMEDOUT"
  }
}
```

### Metrics to Monitor

1. **Email Success Rate**
   ```bash
   # Count successful vs failed
   grep "Email sent successfully" logs/combined.log | wc -l
   grep "Failed to send email" logs/error.log | wc -l
   ```

2. **Average Send Time**
   ```bash
   # Extract duration_ms from logs
   grep "duration_ms" logs/combined.log | awk -F'duration_ms":' '{print $2}' | awk -F',' '{print $1}'
   ```

3. **Rate Limit Hits**
   ```bash
   grep "Rate limit exceeded" logs/combined.log
   ```

### Setting Up Alerts

Monitor these conditions:

- Email failure rate > 5%
- Average send time > 3 seconds
- Rate limits hit > 10 times/hour
- Provider errors (4xx/5xx responses)

---

## FAQ

### Q: Why are my emails slow?

**A:** Several factors affect email speed:

1. **SMTP is slower than Mailgun**
   - SMTP: 100-500ms per email
   - Mailgun: 50-200ms per email
   - Solution: Switch to `MAIL_SYSTEM=mailgun`

2. **DNS resolution delays**
   - First email always slower (DNS lookup)
   - Subsequent emails use cached DNS
   - Normal behavior

3. **Large attachments**
   - Emails with attachments take longer
   - Solution: Link to files instead of attaching

4. **Network latency**
   - Check network connection to email provider
   - Run: `ping smtp.gmail.com`

### Q: Can I test emails without sending to real users?

**A:** Yes! Use one of these methods:

1. **Mailtrap** (recommended for development)
   ```env
   SMTP_HOST=smtp.mailtrap.io
   SMTP_PORT=2525
   ```

2. **Test mode in code**
   ```typescript
   if (process.env.NODE_ENV === 'development') {
     console.log('Would send email:', emailData);
     return mockSuccess();
   }
   ```

3. **Admin test endpoint**
   - Only sends to specified test address
   - Requires admin token

### Q: How do I resend a failed email?

**A:** Emails are not automatically retried. Options:

1. **Trigger action again** (if idempotent)
   - Re-create alert
   - Re-request password reset

2. **Manual resend** (admin only)
   ```bash
   POST /admin/resend-email
   {
     "userId": 123,
     "template": "welcome",
     "reason": "Initial send failed"
   }
   ```

3. **Implement queue with retries** (future enhancement)
   - Use BullMQ
   - Automatic retry with exponential backoff

### Q: Can users opt out of emails?

**A:** Currently, all transactional emails are sent automatically. Future enhancements:

- Phase 7: Email preferences per user
- Unsubscribe links in non-critical emails
- Preference endpoint: `PATCH /users/me/preferences`

### Q: What email clients are supported?

**A:** Our MJML templates are tested and supported on:

- ✅ Gmail (Web, iOS, Android)
- ✅ Outlook (Web, Desktop, Mobile)
- ✅ Apple Mail (macOS, iOS)
- ✅ Yahoo Mail
- ✅ ProtonMail
- ⚠️ Older Outlook (2007-2010) - Limited CSS support

### Q: How do I add a new email template?

**A:** See [Email Module Documentation](./modules/EMAIL_MODULE.md) for detailed instructions. Quick steps:

1. Create `.njk` file in `src/notifications/email/`
2. Add to service template registry
3. Create email method in service
4. Write unit tests
5. Test with real data

### Q: Why is the email HTML so large?

**A:** MJML generates inline styles for email client compatibility. This is normal:

- Source MJML: ~2KB
- Compiled HTML: ~50-100KB (with inline styles)
- Gzipped size: ~10-20KB (what's actually transmitted)

Email clients don't support external CSS, so inline styles are required.

---

## Getting Help

If you're still experiencing issues:

1. **Check logs** - 90% of issues are visible in logs
2. **Review this guide** - Most common issues are documented here
3. **Test provider directly** - Rule out email provider issues
4. **Contact support** - Include:
   - Error message
   - Log excerpts
   - Steps to reproduce
   - Email template name
   - Environment (dev/staging/prod)

**Support Contacts:**
- Email: dev-team@example.com
- Slack: #email-support
- Docs: [Email Module Documentation](./modules/EMAIL_MODULE.md)

---

**Last Updated:** February 8, 2026
