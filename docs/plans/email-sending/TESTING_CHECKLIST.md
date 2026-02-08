# Email System Manual Testing Checklist

> **Purpose:** Comprehensive checklist for manually testing the email system before deployment.
>
> **Last Updated:** February 8, 2026

---

## Pre-Testing Setup

### Environment Configuration

- [ ] Copy `.env.example` to `.env`
- [ ] Set `MAIL_SYSTEM` to desired provider ('smtp' or 'mailgun')
- [ ] Configure provider-specific credentials (see sections below)
- [ ] Set `EMAIL_FROM_NAME` and `EMAIL_FROM_EMAIL`
- [ ] Restart development server after configuration changes

### SMTP Provider Setup (Recommended for Testing)

#### Option A: Gmail (Real Email)

- [ ] Enable 2FA on Gmail account
- [ ] Generate App Password: https://myaccount.google.com/apppasswords
- [ ] Set environment variables:
  ```env
  MAIL_SYSTEM=smtp
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_SECURE=false
  SMTP_USER=your-email@gmail.com
  SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx  # App Password (16 chars)
  ```
- [ ] Save email address for test verification

#### Option B: Ethereal Email (Fake Email - No Setup Required)

- [ ] Visit https://ethereal.email/create
- [ ] Copy credentials to `.env`:
  ```env
  MAIL_SYSTEM=smtp
  SMTP_HOST=smtp.ethereal.email
  SMTP_PORT=587
  SMTP_SECURE=false
  SMTP_USER=<generated-user>@ethereal.email
  SMTP_PASSWORD=<generated-password>
  ```
- [ ] Bookmark inbox URL: https://ethereal.email/messages
- [ ] Note: Emails only visible on Ethereal web interface

#### Option C: Mailtrap (Fake Email - Requires Account)

- [ ] Sign up at https://mailtrap.io
- [ ] Get SMTP credentials from inbox settings
- [ ] Configure `.env` with Mailtrap credentials
- [ ] Access inbox at https://mailtrap.io/inboxes

### Mailgun Provider Setup (Production)

- [ ] Sign up for Mailgun account: https://www.mailgun.com
- [ ] Verify sending domain
- [ ] Get API key from dashboard
- [ ] Set environment variables:
  ```env
  MAIL_SYSTEM=mailgun
  MAILGUN_API_KEY=key-your-api-key
  MAILGUN_DOMAIN=mg.yourdomain.com
  MAILGUN_BASE_URL=https://api.mailgun.net  # or https://api.eu.mailgun.net for EU
  ```

---

## Part 1: Basic Functionality Tests

### Test 1: Raw HTML Email Sending

**Goal:** Verify basic email sending works

- [ ] Run test script: `bun run test:email` (if script exists)
- [ ] OR manually test via API/code:
  ```typescript
  await emailService.send({
    from: 'sender@test.com',
    to: 'your-test-email@test.com',
    subject: 'Test Email',
    text: 'Plain text body',
    html: '<h1>HTML Body</h1><p>This is a test.</p>',
  });
  ```
- [ ] Check inbox for received email
- [ ] Verify subject line matches
- [ ] Verify HTML content renders correctly
- [ ] Verify plain text fallback works (view as plain text in email client)

**Expected Result:**
- Email delivered successfully
- HTML renders with heading and paragraph
- Plain text shows readable alternative

---

### Test 2: Template-Based Email (Welcome Email)

**Goal:** Verify template system works end-to-end

- [ ] Send welcome email:
  ```typescript
  await emailService.sendHtml('welcome', {
    from: 'noreply@fifi-alert.com',
    to: 'your-test-email@test.com',
    templateData: {
      user: { firstName: 'Tester' },
      activationLink: 'https://fifi-alert.com/activate?token=test123',
    },
  });
  ```
- [ ] Check inbox for received email
- [ ] Verify subject: "Welcome to FiFi Alert!"
- [ ] Verify personalization: "Hello Tester" appears in email
- [ ] Verify activation link is clickable
- [ ] Verify responsive design (view on mobile)

**Expected Result:**
- Email delivered with correct subject
- Personalized content displays correctly
- MJML responsive layout works on mobile and desktop
- Activation link is functional

---

### Test 3: Password Reset Email

**Goal:** Verify security-sensitive email template

- [ ] Send password reset email:
  ```typescript
  await emailService.sendHtml('passwordReset', {
    from: 'noreply@fifi-alert.com',
    to: 'your-test-email@test.com',
    templateData: {
      user: { firstName: 'Tester' },
      resetLink: 'https://fifi-alert.com/reset-password?token=secure123',
      expiresIn: '1 hour',
    },
  });
  ```
- [ ] Check inbox for received email
- [ ] Verify subject: "Reset Your Password"
- [ ] Verify reset link is prominent and clickable
- [ ] Verify expiration warning is visible
- [ ] Verify security notice (e.g., "If you didn't request this...")

**Expected Result:**
- Email delivered securely
- Reset link works and is prominent
- Expiration notice is clear

---

### Test 4: New Alert Email

**Goal:** Verify alert notification template

- [ ] Send new alert email:
  ```typescript
  await emailService.sendHtml('newAlert', {
    from: 'alerts@fifi-alert.com',
    to: 'your-test-email@test.com',
    templateData: {
      user: { firstName: 'Tester' },
      alert: {
        petName: 'Max',
        petType: 'Dog',
        location: '123 Main St, City',
        distance: '2.5 km',
        viewUrl: 'https://fifi-alert.com/alerts/123',
      },
    },
  });
  ```
- [ ] Check inbox for received email
- [ ] Verify subject: "New Pet Alert Near You"
- [ ] Verify pet name and type display correctly
- [ ] Verify location and distance are clear
- [ ] Verify "View Alert" button is prominent

**Expected Result:**
- Alert details clearly visible
- Location and distance formatted correctly
- Call-to-action button prominent

---

## Part 2: Advanced Feature Tests

### Test 5: Email with Attachments

**Goal:** Verify attachment handling

- [ ] Send email with single attachment:
  ```typescript
  await emailService.send({
    from: 'sender@test.com',
    to: 'your-test-email@test.com',
    subject: 'Test with Attachment',
    text: 'Please find attachment',
    attachment: {
      filename: 'test.pdf',
      data: Buffer.from('test data'),
      contentType: 'application/pdf',
    },
  });
  ```
- [ ] Check inbox
- [ ] Verify attachment is downloadable
- [ ] Verify filename is correct
- [ ] Open attachment and verify content

**Expected Result:**
- Attachment delivered successfully
- Filename preserved
- Content readable

---

### Test 6: Email with CC and BCC

**Goal:** Verify multiple recipient handling

- [ ] Send email with CC/BCC:
  ```typescript
  await emailService.send({
    from: 'sender@test.com',
    to: 'primary@test.com',
    cc: 'cc-recipient@test.com',
    bcc: 'bcc-recipient@test.com',
    subject: 'CC/BCC Test',
    text: 'Testing multiple recipients',
  });
  ```
- [ ] Check all three inboxes
- [ ] Verify TO recipient sees CC in header
- [ ] Verify CC recipient sees they were CC'd
- [ ] Verify BCC recipient received email but not listed in headers

**Expected Result:**
- All recipients receive email
- CC visible in headers
- BCC hidden from TO and CC recipients

---

### Test 7: Multiple Recipients

**Goal:** Verify bulk sending

- [ ] Send to multiple recipients:
  ```typescript
  await emailService.send({
    from: 'sender@test.com',
    to: ['recipient1@test.com', 'recipient2@test.com', 'recipient3@test.com'],
    subject: 'Bulk Test',
    text: 'Testing bulk delivery',
  });
  ```
- [ ] Check all recipient inboxes
- [ ] Verify all received email
- [ ] Verify delivery timing is reasonable

**Expected Result:**
- All recipients receive email
- Delivery completes within reasonable time

---

## Part 3: Provider Switching Tests

### Test 8: Switch from SMTP to Mailgun

**Goal:** Verify provider hot-swapping

- [ ] Current provider: SMTP
- [ ] Send test email (should succeed)
- [ ] Update `.env`: `MAIL_SYSTEM=mailgun`
- [ ] Configure Mailgun credentials
- [ ] Restart server: `bun run start:dev`
- [ ] Send same test email
- [ ] Verify email delivered via Mailgun

**Expected Result:**
- Server restarts successfully
- Email sends via Mailgun
- No code changes required

---

### Test 9: Switch from Mailgun to SMTP

**Goal:** Verify reverse provider switch

- [ ] Current provider: Mailgun
- [ ] Send test email (should succeed)
- [ ] Update `.env`: `MAIL_SYSTEM=smtp`
- [ ] Configure SMTP credentials
- [ ] Restart server
- [ ] Send same test email
- [ ] Verify email delivered via SMTP

**Expected Result:**
- Server restarts successfully
- Email sends via SMTP
- No code changes required

---

## Part 4: Error Handling Tests

### Test 10: Invalid SMTP Credentials

**Goal:** Verify graceful error handling

- [ ] Set `MAIL_SYSTEM=smtp`
- [ ] Set invalid credentials: `SMTP_PASSWORD=wrong-password`
- [ ] Restart server
- [ ] Attempt to send email
- [ ] Check logs for error message
- [ ] Verify error is descriptive

**Expected Result:**
- Server starts (warns about config)
- Send attempt fails with clear error
- Error logged with details
- No server crash

---

### Test 11: Missing Template

**Goal:** Verify template error handling

- [ ] Attempt to send non-existent template:
  ```typescript
  await emailService.sendHtml('nonExistentTemplate', {...});
  ```
- [ ] Catch error
- [ ] Verify error message is clear

**Expected Result:**
- Throws error: "Template 'nonExistentTemplate' not found"
- Error is caught and handled gracefully

---

### Test 12: Network Failure Simulation

**Goal:** Verify resilience to network issues

- [ ] Set invalid SMTP host: `SMTP_HOST=invalid.smtp.server`
- [ ] Restart server
- [ ] Attempt to send email
- [ ] Verify timeout occurs
- [ ] Verify error is logged

**Expected Result:**
- Connection attempt times out
- Error logged with network details
- Server remains stable

---

## Part 5: Email Client Compatibility

### Test 13: Email Rendering Across Clients

**Goal:** Verify MJML templates render correctly

Send a template-based email to multiple addresses checked in different clients:

- [ ] Gmail Web (desktop)
- [ ] Gmail Mobile App (iOS/Android)
- [ ] Outlook Web
- [ ] Outlook Desktop (Windows/Mac)
- [ ] Apple Mail (Mac/iOS)
- [ ] Thunderbird

**Check in each client:**
- [ ] Layout is not broken
- [ ] Images load correctly
- [ ] Buttons are clickable
- [ ] Fonts render correctly
- [ ] Colors display properly
- [ ] Links work
- [ ] Responsive on mobile

**Expected Result:**
- Email renders consistently across all clients
- No layout breaks
- All interactive elements functional

---

### Test 14: Dark Mode Compatibility

**Goal:** Verify emails look good in dark mode

- [ ] Send welcome or alert email
- [ ] View in Gmail dark mode
- [ ] View in Outlook dark mode
- [ ] View in Apple Mail dark mode
- [ ] Verify text is readable
- [ ] Verify contrast is sufficient

**Expected Result:**
- Text remains readable in dark mode
- Colors adapt appropriately
- No white text on white background issues

---

## Part 6: Performance Tests

### Test 15: Single Email Performance

**Goal:** Measure baseline performance

- [ ] Send single email
- [ ] Measure time from send() call to completion
- [ ] Record result: _______ ms

**Expected Performance:**
- SMTP: 100-500ms per email
- Mailgun: 50-200ms per email (API-based)

---

### Test 16: Bulk Email Performance

**Goal:** Verify bulk sending performance

- [ ] Send 10 emails sequentially
- [ ] Measure total time
- [ ] Calculate average: _______ ms per email
- [ ] Send 10 emails in parallel (Promise.all)
- [ ] Measure total time
- [ ] Calculate throughput: _______ emails/second

**Expected Performance:**
- Sequential: Similar to single email time
- Parallel: Significant improvement (3-5x faster)

---

## Part 7: Production Readiness

### Test 17: SPF/DKIM/DMARC Verification (Production Only)

**Goal:** Verify email authentication for production domain

- [ ] Send email from production domain
- [ ] View email source/headers
- [ ] Check SPF: `Received-SPF: pass`
- [ ] Check DKIM: `DKIM-Signature` present and valid
- [ ] Check DMARC: Policy enforced
- [ ] Use mail-tester.com to verify score (aim for 10/10)

**Expected Result:**
- SPF passes
- DKIM signature valid
- DMARC policy honored
- Mail-tester score 9/10 or higher

---

### Test 18: Spam Filter Check

**Goal:** Ensure emails don't land in spam

- [ ] Send test email to Gmail
- [ ] Send test email to Outlook
- [ ] Send test email to Yahoo
- [ ] Check inbox (not spam folder)
- [ ] If in spam, review why (check headers)

**Expected Result:**
- Emails land in inbox, not spam
- No spam warnings

---

### Test 19: Unsubscribe Link (If Applicable)

**Goal:** Verify compliance with email regulations

- [ ] Check if email includes unsubscribe link (for marketing emails)
- [ ] Click unsubscribe link
- [ ] Verify user is unsubscribed from list
- [ ] Verify no more emails sent to unsubscribed user

**Expected Result:**
- Unsubscribe link present and functional
- Unsubscribe immediately honored

---

## Part 8: Security & Compliance

### Test 20: Sensitive Data in Logs

**Goal:** Ensure no sensitive data is logged

- [ ] Send email with personal data
- [ ] Check application logs
- [ ] Verify email body (HTML/text) is NOT logged
- [ ] Verify passwords/tokens are NOT logged
- [ ] Verify only metadata (to, from, subject) is logged

**Expected Result:**
- Logs contain metadata only
- No PII (Personally Identifiable Information) in logs
- No email body content in logs

---

### Test 21: Rate Limiting (If Implemented)

**Goal:** Verify rate limits prevent abuse

- [ ] Send emails rapidly (exceed rate limit)
- [ ] Verify rate limit kicks in
- [ ] Verify error message explains rate limit
- [ ] Wait for rate limit window to reset
- [ ] Verify emails can be sent again

**Expected Result:**
- Rate limit enforced
- Clear error message
- Limit resets after window

---

## Final Checklist

### Before Deployment

- [ ] All tests above completed successfully
- [ ] Production email provider configured (Mailgun/SendGrid)
- [ ] Production credentials stored in secure environment variables (not in code)
- [ ] `EMAIL_FROM_EMAIL` uses verified production domain
- [ ] SPF/DKIM/DMARC records configured for domain
- [ ] Test emails deliver to inbox (not spam)
- [ ] Unsubscribe mechanism implemented (if sending marketing emails)
- [ ] Email rate limiting enabled
- [ ] Error handling tested and logs reviewed
- [ ] Monitoring/alerting configured for failed emails
- [ ] Backup email provider configured (optional but recommended)
- [ ] Documentation updated with production setup instructions

---

## Test Results Summary

**Test Date:** _____________

**Tested By:** _____________

**Provider Tested:** [ ] SMTP  [ ] Mailgun  [ ] Both

**Total Tests Passed:** _____ / 21

**Critical Issues Found:** _____________________________________________

**Notes:** 
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

**Sign-off:** 
- [ ] Email system approved for production deployment

---

## Troubleshooting Quick Reference

**Issue:** Emails not sending
- Check `.env` configuration
- Verify provider credentials
- Check server logs for errors
- Test with Ethereal Email (always works)

**Issue:** Emails in spam
- Verify SPF/DKIM/DMARC
- Use verified sending domain
- Check mail-tester.com score
- Review email content (avoid spammy words)

**Issue:** Template not found
- Verify template file exists at correct path
- Check template registered in EmailService
- Review server logs for file path

**Issue:** Slow email delivery
- Check network latency
- Consider switching to Mailgun (faster API)
- Implement email queue for bulk sending
- Check SMTP server performance

---

**For more detailed testing guidance, see:**
- `docs/plans/email-sending/TESTING_GUIDE.md` - Detailed setup and testing guide
- `docs/plans/email-sending/email-sending-reproduction-guide.md` - Implementation details
- `scripts/test-email.ts` - Automated test script

**Last Updated:** February 8, 2026
