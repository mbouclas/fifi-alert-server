# Push Notifications Setup Guide

## Overview

FiFi Alert uses **Firebase Cloud Messaging (FCM)** for Android notifications and **Apple Push Notification service (APNs)** for iOS notifications. This guide covers the complete setup process for both platforms, including credential management, testing, and troubleshooting.

---

## Table of Contents

1. [Firebase Cloud Messaging (Android)](#firebase-cloud-messaging-android)
2. [Apple Push Notification Service (iOS)](#apple-push-notification-service-ios)
3. [Environment Configuration](#environment-configuration)
4. [Testing Push Notifications](#testing-push-notifications)
5. [Troubleshooting](#troubleshooting)
6. [Production Considerations](#production-considerations)

---

## Firebase Cloud Messaging (Android)

### Prerequisites

- Google account
- Access to [Firebase Console](https://console.firebase.google.com/)

### Step 1: Create Firebase Project

1. **Navigate to Firebase Console:**
   - Go to https://console.firebase.google.com/
   - Click **"Add project"** or select existing project

2. **Create New Project:**
   - **Project name:** `FiFi Alert` (or your app name)
   - **Enable Google Analytics:** Optional (recommended for production)
   - Click **"Create project"**

3. **Add Android App (Optional but Recommended):**
   - Click **"Add app"** → Select **Android**
   - **Android package name:** `com.yourcompany.fifialert` (must match your app)
   - **App nickname:** `FiFi Alert Android`
   - Click **"Register app"**
   - Download `google-services.json` (for Android app integration)

### Step 2: Generate Service Account Key

1. **Navigate to Project Settings:**
   - Click the **gear icon** ⚙️ next to "Project Overview"
   - Select **"Project settings"**

2. **Go to Service Accounts Tab:**
   - Click **"Service accounts"** tab
   - You'll see your Firebase Admin SDK configuration

3. **Generate New Private Key:**
   - Click **"Generate new private key"**
   - Confirm by clicking **"Generate key"**
   - A JSON file will download (e.g., `fifialert-firebase-adminsdk-xxxxx.json`)
   - **⚠️ IMPORTANT:** Store this file securely - it contains sensitive credentials

### Step 3: Extract Credentials

Open the downloaded JSON file. It will look like this:

```json
{
  "type": "service_account",
  "project_id": "fifialert-12345",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@fifialert-12345.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40fifialert-12345.iam.gserviceaccount.com"
}
```

**Extract these values:**
- **`project_id`** → Use for `FCM_PROJECT_ID`
- **`private_key`** → Use for `FCM_PRIVATE_KEY`
- **`client_email`** → Use for `FCM_CLIENT_EMAIL`

### Step 4: Configure Environment Variables

Add to your `.env` file:

```bash
# Firebase Cloud Messaging (FCM) - Android Push Notifications
FCM_PROJECT_ID="fifialert-12345"
FCM_CLIENT_EMAIL="firebase-adminsdk-xxxxx@fifialert-12345.iam.gserviceaccount.com"
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

**⚠️ Important:** The private key contains `\n` characters for line breaks. Keep them as-is.

### Step 5: Verify FCM Setup

Run the backend server and check logs:

```bash
bun run start:dev
```

Look for:
```
[FCMService] Firebase Admin SDK initialized successfully for project: fifialert-12345
```

---

## Apple Push Notification Service (iOS)

### Prerequisites

- **Apple Developer Account** ($99/year)
- Access to [Apple Developer Portal](https://developer.apple.com/)
- Your app's **Bundle ID** (e.g., `com.yourcompany.fifialert`)

### Step 1: Create APNs Authentication Key

1. **Log in to Apple Developer Portal:**
   - Go to https://developer.apple.com/account/
   - Navigate to **Certificates, Identifiers & Profiles**

2. **Create New Key:**
   - Click **"Keys"** in the sidebar
   - Click the **"+"** button to add a new key

3. **Configure Key:**
   - **Key Name:** `FiFi Alert APNs Key` (descriptive name)
   - **Enable:** Check **"Apple Push Notifications service (APNs)"**
   - Click **"Continue"**
   - Click **"Register"**

4. **Download Key:**
   - Click **"Download"** to get the `.p8` file
   - **⚠️ IMPORTANT:** You can only download this file **once**. Store it securely!
   - File name format: `AuthKey_XXXXXXXXXX.p8` (where X's are your Key ID)

5. **Note Your Key ID:**
   - The Key ID is displayed on the download page (10 characters, e.g., `A1B2C3D4E5`)
   - You can also find it later by clicking on the key in the Keys list

### Step 2: Get Team ID

1. **Find Your Team ID:**
   - In Apple Developer Portal, click your name/profile in top right
   - Select **"View Membership"**
   - Your **Team ID** is listed (10 characters, e.g., `F6G7H8I9J0`)
   - Alternatively, it's shown next to your team name in the top bar

### Step 3: Get Bundle ID

1. **Find or Create App ID:**
   - In **Certificates, Identifiers & Profiles**, click **"Identifiers"**
   - Select your app or create a new App ID
   - **Bundle ID** format: `com.yourcompany.fifialert`
   - **Enable Push Notifications:** Ensure "Push Notifications" capability is checked

### Step 4: Extract APNs Key from .p8 File

Open the downloaded `.p8` file in a text editor. It looks like this:

```
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXoAoGCCqGSM49AwEHoUQDQgAEYYYYYYYYYYYY
YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
YYYYYYYYYYYY==
-----END PRIVATE KEY-----
```

You'll use the **entire contents** of this file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines.

### Step 5: Configure Environment Variables

Add to your `.env` file:

```bash
# Apple Push Notification Service (APNs) - iOS Push Notifications
APNS_KEY_ID="A1B2C3D4E5"
APNS_TEAM_ID="F6G7H8I9J0"
APNS_BUNDLE_ID="com.yourcompany.fifialert"
APNS_KEY_PATH="./certs/AuthKey_A1B2C3D4E5.p8"
APNS_PRODUCTION="false"  # Set to "true" for production
```

**Option 1: Store .p8 file on server (Recommended for Development):**
- Create a `certs/` folder in your project root
- Copy the `.p8` file to `certs/AuthKey_XXXXXXXXXX.p8`
- Set `APNS_KEY_PATH` to the file path
- **Add `certs/` to `.gitignore`** to prevent committing credentials

**Option 2: Store key as environment variable (Recommended for Production):**
- Set `APNS_PRIVATE_KEY` environment variable with the entire key contents:
  ```bash
  APNS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49...\n-----END PRIVATE KEY-----\n"
  ```
- Modify `APNsService` to read from env var if `APNS_KEY_PATH` is not set

### Step 6: Verify APNs Setup

Run the backend server and check logs:

```bash
bun run start:dev
```

Look for:
```
[APNsService] APNs provider initialized for bundle: com.yourcompany.fifialert (sandbox mode)
```

---

## Environment Configuration

### Complete .env Example

```bash
#########################################
# Push Notifications - FCM (Android)
#########################################
FCM_PROJECT_ID="fifialert-12345"
FCM_CLIENT_EMAIL="firebase-adminsdk-xxxxx@fifialert-12345.iam.gserviceaccount.com"
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

#########################################
# Push Notifications - APNs (iOS)
#########################################
APNS_KEY_ID="A1B2C3D4E5"
APNS_TEAM_ID="F6G7H8I9J0"
APNS_BUNDLE_ID="com.yourcompany.fifialert"
APNS_KEY_PATH="./certs/AuthKey_A1B2C3D4E5.p8"
APNS_PRODUCTION="false"  # Set to "true" for App Store builds
```

### Development vs Production

**Development (Sandbox):**
- Use `APNS_PRODUCTION="false"`
- Notifications sent to APNs sandbox server
- Works with apps installed via Xcode or TestFlight (internal testing)

**Production:**
- Use `APNS_PRODUCTION="true"`
- Notifications sent to APNs production server
- Works with apps installed via App Store or TestFlight (external testing)

**⚠️ Important:** Using the wrong server will cause silent failures (no error, no notification).

---

## Testing Push Notifications

### Test FCM (Android)

#### Option 1: Using Firebase Console

1. Go to **Firebase Console** → **Cloud Messaging**
2. Click **"Send your first message"**
3. Enter notification title and text
4. Click **"Send test message"**
5. Enter your device's FCM token
6. Click **"Test"**

#### Option 2: Using FiFi Alert API

```bash
# Register a test device
curl -X POST http://localhost:3000/devices \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceUuid": "test-android-device",
    "platform": "ANDROID",
    "osVersion": "13",
    "appVersion": "1.0.0",
    "pushToken": "YOUR_FCM_TOKEN",
    "location": {
      "gps": {
        "lat": 40.7128,
        "lon": -74.0060
      }
    }
  }'

# Create an alert near the device location
curl -X POST http://localhost:3000/alerts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "petDetails": {
      "name": "Max",
      "species": "DOG",
      "description": "Golden Retriever"
    },
    "location": {
      "lat": 40.7130,
      "lon": -74.0062,
      "radiusKm": 5
    },
    "contactDetails": {
      "phone": "+1234567890"
    }
  }'

# Check logs for notification delivery
tail -f logs/application-*.log | grep "notification_sent"
```

### Test APNs (iOS)

#### Option 1: Using Pusher (macOS App)

1. Download [Pusher](https://github.com/noodlewerk/NWPusher/releases) (free macOS app)
2. Open Pusher
3. Select your `.p8` key file
4. Enter your device token (from iOS app logs)
5. Enter payload:
   ```json
   {
     "aps": {
       "alert": {
         "title": "Test Notification",
         "body": "This is a test"
       },
       "badge": 1,
       "sound": "default"
     }
   }
   ```
6. Click **"Push"**

#### Option 2: Using FiFi Alert API

```bash
# Register a test device
curl -X POST http://localhost:3000/devices \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceUuid": "test-ios-device",
    "platform": "IOS",
    "osVersion": "17.0",
    "appVersion": "1.0.0",
    "pushToken": "YOUR_APNS_TOKEN",
    "location": {
      "gps": {
        "lat": 40.7128,
        "lon": -74.0060
      }
    }
  }'

# Create an alert (same as Android test above)
```

### Verify Notification Delivery

**Check Database:**
```sql
SELECT
  id,
  device_id,
  status,
  confidence,
  sent_at,
  failure_reason
FROM "Notification"
ORDER BY created_at DESC
LIMIT 10;
```

**Check Logs:**
```bash
# View notification events
cat logs/events-*.log | jq 'select(.event | startswith("notification_"))'

# View errors
cat logs/error-*.log | jq 'select(.event == "notification_failed")'
```

---

## Troubleshooting

### FCM Issues

#### "Project not found" or "Invalid credentials"

**Cause:** Wrong `FCM_PROJECT_ID` or `FCM_CLIENT_EMAIL`

**Solution:**
- Verify credentials match the downloaded service account JSON
- Ensure no extra spaces or quotes in `.env` file

#### "Failed to send notification: Invalid registration token"

**Cause:** Invalid or expired push token

**Solution:**
- Verify the push token is correct (copied from Android app logs)
- Ensure the token is from FCM (not APNs)
- Check if device app is uninstalled (tokens become invalid)

#### "Authentication error"

**Cause:** Invalid `FCM_PRIVATE_KEY`

**Solution:**
- Ensure the entire private key is copied, including `-----BEGIN/END PRIVATE KEY-----`
- Ensure `\n` characters are preserved (don't replace with actual line breaks)
- Regenerate service account key if corrupted

---

### APNs Issues

#### "Invalid APNs token" or "Bad device token"

**Cause:** Wrong token format or mismatched environment

**Solution:**
- Ensure token is 64 hexadecimal characters (no spaces, no brackets)
- Verify `APNS_PRODUCTION` matches your app build:
  - Development build → `APNS_PRODUCTION="false"`
  - App Store build → `APNS_PRODUCTION="true"`

#### "InvalidProviderToken" error

**Cause:** Wrong `APNS_KEY_ID`, `APNS_TEAM_ID`, or invalid `.p8` key

**Solution:**
- Double-check Key ID from Apple Developer Portal (Keys section)
- Double-check Team ID from Apple Developer Portal (Membership section)
- Verify `.p8` file path is correct and readable
- Regenerate APNs key if corrupted

#### "BadDeviceToken" error

**Cause:** Token is for wrong environment (sandbox vs production)

**Solution:**
- If testing with Xcode-installed app: Use `APNS_PRODUCTION="false"`
- If testing with App Store/TestFlight app: Use `APNS_PRODUCTION="true"`

#### "Unregistered" status (410 error)

**Cause:** Device token is invalid (app uninstalled or token expired)

**Solution:**
- Mark device as inactive in database
- Device should re-register when app is reopened

#### "APNs certificate expired"

**Cause:** `.p8` keys don't expire, but if using old certificate-based auth, it may expire

**Solution:**
- APNs keys (`.p8`) don't expire - no action needed
- If using old `.p12` certificate, migrate to `.p8` key-based auth (recommended)

---

### General Issues

#### No notifications received, but no errors in logs

**Checklist:**
- ✅ Device push token registered in database
- ✅ Device location within alert radius
- ✅ Alert status is `ACTIVE`
- ✅ No rate limiting or exclusions applied
- ✅ Check `Notification` table for `excluded = true` records

**Debug Query:**
```sql
SELECT
  n.id,
  n.status,
  n.excluded,
  n.exclusion_reason,
  n.failure_reason,
  d.push_token
FROM "Notification" n
JOIN "Device" d ON d.id = n.device_id
WHERE n.alert_id = 'YOUR_ALERT_ID'
ORDER BY n.created_at DESC;
```

#### Notifications delayed by several minutes

**Cause:** BullMQ queue backlog or slow job processing

**Solution:**
- Check Redis queue depth: `redis-cli LLEN bull:notification-queue:wait`
- Check BullMQ worker logs for slow jobs
- Scale up workers or optimize notification targeting logic
- See [OPERATIONAL_RUNBOOK.md](./OPERATIONAL_RUNBOOK.md) for queue monitoring

---

## Production Considerations

### Security

- **Never commit credentials to Git:**
  - Add `.env` to `.gitignore`
  - Add `certs/` folder to `.gitignore`
  - Use environment variables or secrets management (AWS Secrets Manager, HashiCorp Vault)

- **Rotate credentials periodically:**
  - Firebase: Generate new service account key annually
  - APNs: Keys don't expire, but consider rotating every 2 years

- **Restrict service account permissions:**
  - Firebase service account only needs "Cloud Messaging" role
  - Don't use project owner credentials

### Monitoring

**Key Metrics to Track:**
- Notification delivery rate (SENT / QUEUED)
- Notification failure rate (FAILED / SENT)
- Invalid token rate (indicates app uninstalls)
- Notification latency (time from alert creation to delivery)

**Alerts to Set Up:**
- Alert if delivery rate < 90%
- Alert if failure rate > 10%
- Alert if invalid token rate > 20% (indicates mass uninstalls)

### Cost Optimization

**Firebase:**
- FCM is free for unlimited notifications
- No cost concerns

**APNs:**
- APNs is free, but requires $99/year Apple Developer account
- No per-notification cost

### Scaling

**Firebase:**
- Supports batch sending (500 tokens per request)
- Implement batching in `FCMService.batchSend()`
- Rate limit: 1 million requests/minute (unlikely to hit)

**APNs:**
- Supports HTTP/2 multiplexing (concurrent requests)
- No explicit rate limit, but Apple recommends < 1000 notifications/second per connection
- Use connection pooling in `APNsService`

---

## Additional Resources

- **Firebase Cloud Messaging Docs:** https://firebase.google.com/docs/cloud-messaging
- **APNs Documentation:** https://developer.apple.com/documentation/usernotifications
- **FiFi Alert Notification Playbook:** [NOTIFICATION_PLAYBOOK.md](./NOTIFICATION_PLAYBOOK.md)
- **FiFi Alert System Behavior Spec:** [SYSTEM_BEHAVIOR_SPEC.md](./SYSTEM_BEHAVIOR_SPEC.md)

---

## Support

For issues with push notifications:

1. Check server logs: `logs/application-*.log` and `logs/error-*.log`
2. Query `Notification` table for delivery status and failure reasons
3. Test with Firebase/APNs test tools to isolate backend vs platform issues
4. Consult [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues
5. Check Firebase/Apple status pages for service outages

For credential issues, regenerate keys and update environment variables.
