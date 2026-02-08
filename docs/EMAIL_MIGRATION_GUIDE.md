# Email Provider Migration Guide

> **Safely switch between SMTP and Mailgun providers in development, staging, and production**

---

## Table of Contents

- [Overview](#overview)
- [Quick Reference](#quick-reference)
- [Migration Scenarios](#migration-scenarios)
  - [SMTP → Mailgun (Development)](#smtp--mailgun-development)
  - [SMTP → Mailgun (Production)](#smtp--mailgun-production)
  - [Mailgun → SMTP (Rollback)](#mailgun--smtp-rollback)
  - [SMTP Provider Changes (Gmail → Outlook)](#smtp-provider-changes-gmail--outlook)
- [Pre-Migration Checklist](#pre-migration-checklist)
- [Post-Migration Testing](#post-migration-testing)
- [Rollback Procedures](#rollback-procedures)
- [Provider Comparison](#provider-comparison)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

The FiFi Alert email system supports dynamic provider switching via **environment variables only**. No code changes are required to switch between SMTP (Nodemailer) and Mailgun providers.

**Key Features:**
- ✅ **Zero-downtime switching**: Just update .env and restart
- ✅ **Environment-specific configs**: Different providers per environment
- ✅ **Safe rollback**: Revert by restoring previous .env values
- ✅ **No data migration**: Email history stored in audit logs (not provider-dependent)
- ✅ **Template compatibility**: All templates work with both providers

---

## Quick Reference

### Provider Selection

| Environment Variable | Value | Description |
|----------------------|-------|-------------|
| `MAIL_SYSTEM` | `smtp` | Use SMTP provider (Nodemailer) |
| `MAIL_SYSTEM` | `mailgun` | Use Mailgun provider |

### Required Environment Variables by Provider

**SMTP:**
```env
MAIL_SYSTEM=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM_NAME=FiFi Alert
EMAIL_FROM_EMAIL=noreply@fifi-alert.com
```

**Mailgun:**
```env
MAIL_SYSTEM=mailgun
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_BASE_URL=https://api.mailgun.net
EMAIL_FROM_NAME=FiFi Alert
EMAIL_FROM_EMAIL=noreply@yourdomain.com
```

---

## Migration Scenarios

### SMTP → Mailgun (Development)

**Use Case:** Upgrade from Gmail/Ethereal to Mailgun for better deliverability and features

**Prerequisites:**
1. Mailgun account created (sandbox mode OK for dev)
2. API key obtained
3. Domain verified (or use sandbox domain)

**Migration Steps:**

#### 1. Back Up Current Configuration

```bash
# Save current .env
cp .env .env.backup.smtp

# Save current config to version control (if not already)
git add .env.backup.smtp
git commit -m "chore: backup SMTP config before Mailgun migration"
```

#### 2. Update Environment Variables

Edit `.env`:

```env
# OLD: SMTP configuration (comment out or remove)
# MAIL_SYSTEM=smtp
# SMTP_HOST=smtp.ethereal.email
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=old-user@ethereal.email
# SMTP_PASSWORD=old-password

# NEW: Mailgun configuration
MAIL_SYSTEM=mailgun
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=sandboxXXX.mailgun.org  # Or your verified domain
MAILGUN_BASE_URL=https://api.mailgun.net

# Keep these the same
EMAIL_FROM_NAME=FiFi Alert
EMAIL_FROM_EMAIL=noreply@fifi-alert.com  # Update if needed
```

#### 3. Restart Server

```bash
# Stop server (if running)
# Ctrl+C

# Start server
bun run start:dev

# Check logs for successful initialization
# You should see: "Email provider initialized: mailgun"
```

#### 4. Test Email Delivery

Run test script:

```bash
bun run scripts/test-email.ts
```

Expected output:
```
✅ Email sent successfully!
📧 Message ID: <abc123@mg.yourdomain.com>
```

Check Mailgun dashboard:
1. Go to https://app.mailgun.com/app/sending/domains
2. Select your domain
3. Click "Logs" tab
4. Verify email appears with "Delivered" status

#### 5. Verify Application Integration

Test emails in your app:
- User registration (welcome email)
- Password reset
- Alert notifications

Check that:
- ✅ Emails are sent without errors
- ✅ Templates render correctly
- ✅ Event listeners fire (`email.sent` event)
- ✅ Audit logs contain email records

---

### SMTP → Mailgun (Production)

**Use Case:** Production migration for better scalability and delivery rates

**⚠️ WARNING:** Production migrations require careful planning and gradual rollout.

**Prerequisites:**
1. ✅ Mailgun account with verified domain (not sandbox)
2. ✅ DNS records configured (SPF, DKIM, DMARC)
3. ✅ Domain warming scheduled (if new domain)
4. ✅ Test environment validated with Mailgun
5. ✅ Rollback plan documented
6. ✅ Monitoring and alerts configured

**Migration Timeline:**

#### Phase 1: Pre-Migration (1 week before)

**Day -7: Domain Setup**
1. Add domain to Mailgun account
2. Configure DNS records:
   ```
   TXT  @ "v=spf1 include:mailgun.org ~all"
   TXT  mailo._domainkey.[domain] [DKIM-key-from-mailgun]
   TXT  _dmarc "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
   ```
3. Wait for DNS propagation (24-48 hours)
4. Verify domain in Mailgun dashboard

**Day -5: Test Environment Migration**
1. Update staging `.env` to use Mailgun
2. Restart staging server
3. Run full test suite:
   ```bash
   bun run test:e2e
   ```
4. Send test emails from staging app
5. Monitor for 2-3 days

**Day -3: Load Testing**
1. Run load tests to simulate production email volume:
   ```bash
   bun run test:load -- --emails=1000 --provider=mailgun
   ```
2. Monitor Mailgun metrics:
   - Delivery rate
   - Bounce rate
   - Response times
3. Adjust rate limits if needed

**Day -1: Production Preparation**
1. Create production `.env.mailgun` file:
   ```env
   MAIL_SYSTEM=mailgun
   MAILGUN_API_KEY=key-prod-xxxxxxxx
   MAILGUN_DOMAIN=mg.yourdomain.com
   MAILGUN_BASE_URL=https://api.mailgun.net
   EMAIL_FROM_NAME=FiFi Alert
   EMAIL_FROM_EMAIL=noreply@yourdomain.com
   ```
2. Review rollback procedure (see below)
3. Schedule maintenance window (if downtime required)
4. Notify team and stakeholders

#### Phase 2: Migration (Day 0)

**Step 1: Create Backup**
```bash
# SSH to production server
ssh user@production-server

# Navigate to app directory
cd /var/www/fifi-alert-server

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Verify backup
ls -la .env.backup.*
```

**Step 2: Update Environment Variables**
```bash
# Stop server gracefully (waits for in-flight requests)
pm2 stop fifi-alert-server --wait-ready

# Update .env with Mailgun config
nano .env  # Or use your preferred editor

# Apply new configuration
source .env  # Optional: depends on your deployment setup

# Start server
pm2 start fifi-alert-server

# Check logs
pm2 logs fifi-alert-server --lines 50
```

**Step 3: Verify Startup**
```bash
# Check process status
pm2 status

# Health check
curl http://localhost:3000/health

# Check email provider initialization
grep "Email provider initialized" ~/.pm2/logs/fifi-alert-server-out.log
```

**Step 4: Send Test Email**
```bash
# Use production API to send test email
curl -X POST http://localhost:3000/api/v1/emails/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"to": "test@yourdomain.com"}'

# Check Mailgun logs
# Dashboard → Logs → Filter by last 5 minutes
```

**Step 5: Monitor for 1 Hour**
- Watch application logs for errors
- Monitor Mailgun dashboard for delivery status
- Check alert webhook for failures
- Verify user-facing email features work

#### Phase 3: Post-Migration Validation (Day 1-7)

**Day 0 (First 24 hours):**
- Monitor email delivery rates (target: >98%)
- Track bounce rates (target: <2%)
- Watch for spam complaints (target: <0.1%)
- Check application error logs

**Day 1-3:**
- Review Mailgun analytics dashboard
- Compare delivery metrics to SMTP baseline
- Validate all email templates render correctly
- Test edge cases (attachments, HTML vs plaintext)

**Day 4-7:**
- Confirm no unexpected issues
- Review cost vs. SMTP (Mailgun pricing)
- Update documentation with production config
- Schedule .env backup cleanup (keep 30 days)

---

### Mailgun → SMTP (Rollback)

**Use Case:** Revert to SMTP due to issues or cost concerns

**When to Rollback:**
- ❌ Delivery rate drops below 95%
- ❌ High bounce rate (>5%)
- ❌ Mailgun API errors persist
- ❌ Cost exceeds budget
- ❌ Critical bugs in Mailgun integration

**Rollback Steps (5-10 minutes):**

#### 1. Identify Backup Configuration

```bash
# List backups
ls -la .env.backup.*

# Review backup content
cat .env.backup.smtp  # Or specific timestamped backup
```

#### 2. Restore Previous Configuration

```bash
# Stop server
pm2 stop fifi-alert-server --wait-ready

# Restore backup
cp .env.backup.smtp .env

# Verify restoration
diff .env.backup.smtp .env
```

#### 3. Restart Server

```bash
# Start server
pm2 start fifi-alert-server

# Check logs
pm2 logs fifi-alert-server --lines 50 | grep "Email provider"
# Should see: "Email provider initialized: smtp"
```

#### 4. Verify SMTP Delivery

```bash
# Send test email
curl -X POST http://localhost:3000/api/v1/emails/test \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"to": "test@gmail.com"}'

# Check logs for SMTP connection
pm2 logs fifi-alert-server | grep "SMTP"
```

#### 5. Monitor for Stability

- Verify emails deliver successfully
- Check error logs for SMTP connection issues
- Confirm application functionality restored

**Rollback Verification Checklist:**
- [ ] Server started without errors
- [ ] Email provider initialized as "smtp"
- [ ] Test email sent successfully
- [ ] User registration emails work
- [ ] Password reset emails work
- [ ] Alert notification emails work
- [ ] No errors in application logs

---

### SMTP Provider Changes (Gmail → Outlook)

**Use Case:** Switch between SMTP providers (e.g., Gmail → Outlook, Ethereal → SendGrid)

**Example: Gmail → Outlook**

#### 1. Obtain Outlook SMTP Credentials

1. Create Microsoft 365 account (or use existing)
2. Enable SMTP authentication:
   - Go to https://admin.microsoft.com
   - Navigate to: Users → Active Users → Select user
   - Mail tab → Manage email apps
   - Enable "Authenticated SMTP"
3. Note credentials:
   - User: `your-email@outlook.com`
   - Password: Microsoft account password (or app password if 2FA enabled)

#### 2. Update Environment Variables

Edit `.env`:

```env
MAIL_SYSTEM=smtp

# OLD: Gmail configuration
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=old@gmail.com
# SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# NEW: Outlook configuration
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false  # Use STARTTLS
SMTP_USER=your-email@outlook.com
SMTP_PASSWORD=your-outlook-password

# Update sender email to match
EMAIL_FROM_EMAIL=your-email@outlook.com
```

#### 3. Restart and Test

```bash
bun run start:dev

# Send test email
bun run scripts/test-email.ts
```

Check Outlook sent items to verify email sent.

**Common SMTP Providers:**

| Provider | Host | Port | Secure | Notes |
|----------|------|------|--------|-------|
| Gmail | `smtp.gmail.com` | 587 | false | Requires App Password |
| Outlook | `smtp-mail.outlook.com` | 587 | false | Use account password |
| SendGrid | `smtp.sendgrid.net` | 587 | false | Use API key as password |
| Mailgun SMTP | `smtp.mailgun.org` | 587 | false | Alternative to API |
| Amazon SES | `email-smtp.us-east-1.amazonaws.com` | 587 | false | SMTP credentials from IAM |
| Ethereal | `smtp.ethereal.email` | 587 | false | Testing only |

---

## Pre-Migration Checklist

Before migrating to a new email provider:

### Technical Preparation
- [ ] New provider account created and verified
- [ ] API keys / SMTP credentials obtained
- [ ] DNS records configured (SPF, DKIM, DMARC) if applicable
- [ ] Test environment migrated and validated
- [ ] Load testing completed with new provider
- [ ] Monitoring dashboards configured

### Documentation
- [ ] `.env.backup` file created with current configuration
- [ ] Rollback procedure documented and reviewed
- [ ] Team notified of migration timeline
- [ ] Runbook updated with new provider details
- [ ] Provider-specific troubleshooting notes added

### Testing
- [ ] All email templates tested with new provider
- [ ] Attachment delivery verified
- [ ] Event listeners (`email.sent`) working
- [ ] Error handling validated (network failures, auth errors)
- [ ] Rate limiting tested (if applicable)

### Operational
- [ ] Maintenance window scheduled (if downtime required)
- [ ] On-call engineer assigned
- [ ] Stakeholders notified
- [ ] Budget approved for new provider
- [ ] Compliance requirements reviewed (GDPR, etc.)

---

## Post-Migration Testing

After switching providers, run these tests:

### 1. Functional Tests

```bash
# Run E2E test suite
bun run test:e2e

# Should pass all tests:
# ✓ Email service E2E tests
#   ✓ should switch providers via environment
#   ✓ should send email with active provider
#   ✓ should load and send template
#   ✓ should emit email.sent event
```

### 2. Manual Testing Checklist

Test these user flows in the application:

**User Registration:**
- [ ] Register new user
- [ ] Verify welcome email received
- [ ] Check template renders correctly (logo, styling, links)
- [ ] Click activation link → should activate account

**Password Reset:**
- [ ] Request password reset
- [ ] Verify reset email received within 1 minute
- [ ] Check reset link works
- [ ] Verify link expires after 1 hour

**Alert Notifications:**
- [ ] Create new alert
- [ ] Verify nearby users receive email notification
- [ ] Check alert details render correctly (pet name, location, distance)
- [ ] Click "View Alert" link → should open alert page

**Attachments (if applicable):**
- [ ] Send email with PDF attachment
- [ ] Verify attachment received (not corrupted)
- [ ] Check attachment filename and MIME type correct

### 3. Delivery Monitoring

Monitor these metrics for 24-48 hours:

**Key Metrics:**
- **Delivery Rate**: Should be ≥98%
- **Bounce Rate**: Should be <2%
- **Spam Complaint Rate**: Should be <0.1%
- **Average Delivery Time**: Should be <5 seconds

**Where to Monitor:**
- **Mailgun**: Dashboard → Sending → Analytics
- **SMTP (Gmail)**: Check sent items and bounce notifications
- **Application Logs**: `grep "email.sent" logs/app.log`

### 4. Error Testing

Test failure scenarios:

```typescript
// Test invalid recipient (should return error)
await emailService.send({
  to: 'invalid-email@nonexistent-domain-123456.com',
  subject: 'Test',
  html: '<p>Test</p>',
});
// Expected: Error thrown, logged, but app doesn't crash

// Test provider downtime (temporarily set wrong API key)
// Expected: Graceful error handling, retry logic kicks in

// Test rate limiting (send 100 emails rapidly)
// Expected: Rate limiter applied, no provider errors
```

---

## Rollback Procedures

### Emergency Rollback (< 5 minutes)

**Scenario:** Production is broken, emails not sending

```bash
# 1. Restore backup immediately
cp .env.backup.[timestamp] .env

# 2. Restart server
pm2 restart fifi-alert-server

# 3. Verify
curl http://localhost:3000/health
pm2 logs --lines 100 | grep "Email provider"

# 4. Test
curl -X POST http://localhost:3000/api/v1/emails/test \
  -H "Authorization: Bearer $TOKEN"

# 5. Monitor for 10 minutes
pm2 logs fifi-alert-server --lines 0
```

**Rollback Decision Criteria:**

| Severity | Symptoms | Action | Timeline |
|----------|----------|--------|----------|
| **Critical** | No emails sending, >50% failure rate | Immediate rollback | < 5 min |
| **High** | 10-50% failure rate, slow delivery | Rollback within 1 hour | < 1 hour |
| **Medium** | <10% failure rate, minor issues | Investigate, consider rollback | 2-4 hours |
| **Low** | Isolated issues, <1% impact | Fix forward, don't rollback | N/A |

### Planned Rollback (Testing/Staging)

If testing reveals issues before production migration:

1. **Document Issues:**
   - What didn't work?
   - Error messages/logs
   - Steps to reproduce

2. **Revert Configuration:**
   ```bash
   cp .env.backup.smtp .env
   bun run start:dev
   ```

3. **Notify Team:**
   - Slack/email team about rollback
   - Share issue documentation
   - Reschedule migration

4. **Root Cause Analysis:**
   - Investigate why migration failed
   - Fix issues in test environment
   - Re-validate before retry

---

## Provider Comparison

### When to Use SMTP

**Pros:**
- ✅ Free (with Gmail, Outlook)
- ✅ Simple setup (just credentials)
- ✅ Good for low-volume (<100 emails/day)
- ✅ No vendor lock-in (standard protocol)

**Cons:**
- ❌ Daily send limits (Gmail: 500/day, Outlook: 300/day)
- ❌ Rate limiting by provider
- ❌ Limited analytics
- ❌ Provider may block if too many emails
- ❌ Poor deliverability for marketing emails

**Best For:**
- Development and testing
- Small apps (<100 users)
- Internal notifications
- Cost-sensitive projects

### When to Use Mailgun

**Pros:**
- ✅ High deliverability (>98%)
- ✅ Scalable (millions of emails/month)
- ✅ Detailed analytics and tracking
- ✅ Webhook events (opens, clicks, bounces)
- ✅ No daily send limits
- ✅ Dedicated IPs available
- ✅ Better spam reputation

**Cons:**
- ❌ Costs money (Free: 5,000 emails/month, then $35/month)
- ❌ Requires domain verification
- ❌ DNS setup required (SPF, DKIM, DMARC)
- ❌ More complex configuration

**Best For:**
- Production apps (>100 users)
- Marketing campaigns
- Transactional emails at scale
- Apps requiring email analytics
- When deliverability is critical

---

## Best Practices

### 1. Environment-Specific Configurations

Use different providers per environment:

```bash
# .env.development
MAIL_SYSTEM=smtp
SMTP_HOST=smtp.ethereal.email  # Free testing

# .env.staging
MAIL_SYSTEM=mailgun
MAILGUN_DOMAIN=sandbox123.mailgun.org  # Sandbox mode

# .env.production
MAIL_SYSTEM=mailgun
MAILGUN_DOMAIN=mg.yourdomain.com  # Verified domain
```

### 2. Always Keep Backups

```bash
# Before any changes
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Keep backups for 30 days
find . -name ".env.backup.*" -mtime +30 -delete
```

### 3. Test in Staging First

**Never** migrate production without staging validation:

1. Update staging .env
2. Restart staging server
3. Run full test suite
4. Monitor for 24-48 hours
5. If stable, proceed to production

### 4. Monitor Post-Migration

Set up alerts for:
- Email delivery failures (>5%)
- Provider API errors
- Slow email sending (>10 seconds)
- Bounce rate increase (>2%)

### 5. Document Configuration

Keep provider configs in secure documentation:

```markdown
## Production Email Configuration (Mailgun)
- Provider: Mailgun
- Domain: mg.fifi-alert.com
- API Key: Stored in 1Password (vault: Production)
- Region: US
- Verified: Yes (2026-01-15)
- Daily Limit: 50,000 emails
- Cost: $35/month + overage
```

### 6. Use Environment Variables (Never Hardcode)

❌ **BAD:**
```typescript
const apiKey = 'key-123456789'; // NEVER do this
```

✅ **GOOD:**
```typescript
const apiKey = process.env.MAILGUN_API_KEY;
```

### 7. Plan for Provider Downtime

Implement graceful degradation:
```typescript
try {
  await emailService.send({ ... });
} catch (error) {
  // Log error
  logger.error('Email send failed', { error, to });
  
  // Queue for retry
  await emailQueue.add('retry', { to, subject, html });
  
  // Don't break user flow
  return { success: false, queued: true };
}
```

---

## Troubleshooting

### Migration Fails Immediately

**Symptom:** Server crashes on startup after changing provider

**Causes:**
1. Invalid API key / SMTP credentials
2. Missing required environment variables
3. Syntax error in .env file

**Solutions:**

```bash
# Check logs
pm2 logs fifi-alert-server --err

# Common errors:
# "Parameter 'key' is required" → MAILGUN_API_KEY missing
# "Invalid login" → Wrong SMTP credentials
# "ENOTFOUND" → Wrong SMTP_HOST

# Validate .env syntax
cat .env | grep MAIL

# Restore backup
cp .env.backup.smtp .env
pm2 restart fifi-alert-server
```

### Emails Not Sending After Migration

**Symptom:** No errors, but emails not arriving

**Checks:**

1. **Verify provider initialization:**
   ```bash
   pm2 logs | grep "Email provider initialized"
   # Should match your MAIL_SYSTEM value
   ```

2. **Check application logs:**
   ```bash
   grep "email.sent" logs/app.log
   # Should see email send events
   ```

3. **Test provider directly:**
   ```bash
   bun run scripts/test-email.ts
   ```

4. **Check spam folder:**
   - Emails may be filtered as spam
   - Test with mail-tester.com

5. **Verify DNS records (Mailgun):**
   ```bash
   dig TXT yourdomain.com | grep spf
   dig TXT mailo._domainkey.yourdomain.com
   ```

### Emails Go to Spam After Migration

**Symptom:** Emails deliver but end up in spam/junk folder

**Causes:**
- Missing SPF/DKIM/DMARC records
- Poor sender reputation
- Spammy content (too many links, certain keywords)

**Solutions:**

1. **Verify DNS records:**
   ```bash
   # Check SPF
   dig TXT yourdomain.com +short | grep spf
   # Should contain: "v=spf1 include:mailgun.org ~all"

   # Check DKIM
   dig TXT mailo._domainkey.yourdomain.com +short
   # Should return public key

   # Check DMARC
   dig TXT _dmarc.yourdomain.com +short
   # Should contain: "v=DMARC1; p=none"
   ```

2. **Test spam score:**
   - Send email to address from https://mail-tester.com
   - Check score (aim for 9/10 or higher)
   - Follow recommendations to improve

3. **Warm up domain (new domains):**
   - Start with low volume (100 emails/day)
   - Gradually increase over 2-4 weeks
   - Monitor bounce/complaint rates

4. **Use verified "From" address:**
   - Don't use @gmail.com in production
   - Use domain matching your verified domain
   - Example: `noreply@yourdomain.com`

### Performance Degradation

**Symptom:** Emails sending slowly after migration

**Checks:**

1. **Measure send time:**
   ```typescript
   const start = Date.now();
   await emailService.send({ ... });
   console.log(`Send took ${Date.now() - start}ms`);
   // Should be <5000ms (5 seconds)
   ```

2. **Check provider API latency:**
   - Mailgun: Dashboard → Sending → Analytics → API Latency
   - SMTP: Check connection time in logs

3. **Network issues:**
   ```bash
   # Test connectivity to Mailgun
   curl -I https://api.mailgun.net
   # Should return 200 OK

   # Test SMTP connection
   telnet smtp.gmail.com 587
   # Should connect successfully
   ```

**Solutions:**
- Switch to closer region (e.g., EU if users in Europe)
- Increase connection pool size (for SMTP)
- Implement email queueing for non-critical emails

---

## Need Help?

- 📖 **Full Documentation**: [EMAIL_MODULE.md](modules/EMAIL_MODULE.md)
- 🚀 **Quick Start**: [EMAIL_QUICKSTART.md](EMAIL_QUICKSTART.md)
- ✅ **Testing Guide**: [TESTING_GUIDE.md](plans/email-sending/TESTING_GUIDE.md)
- 🔍 **Troubleshooting**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- 🐛 **Report Issues**: GitHub Issues or contact dev team

---

**Safe migrations! 📧🔄**
