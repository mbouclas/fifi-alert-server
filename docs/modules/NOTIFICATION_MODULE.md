# Notification Module Documentation

## Overview

The Notification module handles push notification delivery to iOS and Android devices via Firebase Cloud Messaging (FCM) and Apple Push Notification service (APNs). It queues notifications asynchronously, targets devices based on geospatial matching, and tracks delivery status.

**Module Path:** `src/notification/`  
**Database Tables:** `Notification`  
**Dependencies:** BullMQ, Firebase Admin SDK, node-apn, LocationService, DeviceService

---

## Table of Contents

1. [Architecture](#architecture)
2. [Notification Flow](#notification-flow)
3. [Targeting Logic](#targeting-logic)
4. [Queue Processing](#queue-processing)
5. [Data Model](#data-model)
6. [Confidence-Based Styling](#confidence-based-styling)
7. [Delivery Tracking](#delivery-tracking)
8. [Testing](#testing)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Notification Flow                        │
└─────────────────────────────────────────────────────────────┘

1. Alert Created
   ↓
2. AlertService.create()
   ↓
3. NotificationService.queueAlertNotifications({ alertId })
   ↓
4. BullMQ: Add job 'send-alert-notifications' to queue
   ↓
5. NotificationQueueProcessor.processAlertNotifications()
   ↓
6. LocationService.findDevicesForAlert(alertId)
   ↓
   Returns: [
     { deviceId, confidence: 'HIGH', matchType: 'SAVED_ZONE' },
     { deviceId, confidence: 'MEDIUM', matchType: 'POSTAL_CODE' },
     ...
   ]
   ↓
7. For each device match:
   - Create Notification record (status: QUEUED)
   - Queue 'send-push' job
   ↓
8. NotificationQueueProcessor.processPushNotification()
   ↓
9. Determine device platform (iOS or Android)
   ↓
10. FCMService or APNsService sends push
   ↓
11. Update Notification status (SENT or FAILED)
   ↓
12. Log delivery event for monitoring
```

### Module Structure

```
src/notification/
├── notification.controller.ts     # HTTP endpoints (minimal)
├── notification.service.ts        # Business logic (queuing)
├── notification.module.ts         # Module definition
├── processors/
│   └── notification-queue.processor.ts  # BullMQ job processor
├── services/
│   ├── fcm.service.ts             # Firebase Cloud Messaging
│   ├── apns.service.ts            # Apple Push Notifications
│   └── notification-formatter.service.ts  # Payload formatting
└── dto/
    └── notification-response.dto.ts  # Notification response format
```

---

## Notification Flow

### 1. Alert Creation Triggers Notifications

When an alert is created:

```typescript
// AlertService.create()
const alert = await this.prisma.alert.create({ data: ... });

// Queue notifications asynchronously
await this.notificationService.queueAlertNotifications({
  alertId: alert.id,
});

return alert;  // Don't wait for notifications
```

---

### 2. Queue Alert Notifications

```typescript
// NotificationService.queueAlertNotifications()
async queueAlertNotifications(params: { alertId: string }): Promise<void> {
  await this.notificationQueue.add('send-alert-notifications', {
    alertId: params.alertId,
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,  // 2s, 4s, 8s
    },
  });
}
```

---

### 3. Process Alert Notifications (Background Job)

```typescript
// NotificationQueueProcessor.processAlertNotifications()
@Process('send-alert-notifications')
async processAlertNotifications(job: Job<{ alertId: string }>): Promise<void> {
  const { alertId } = job.data;
  
  // 1. Get alert details
  const alert = await this.prisma.alert.findUnique({ where: { id: alertId } });
  
  // 2. Find matching devices (geospatial query)
  const matches = await this.locationService.findDevicesForAlert(alertId);
  
  // 3. Queue individual push notifications
  for (const match of matches) {
    // Create notification record
    const notification = await this.prisma.notification.create({
      data: {
        alert_id: alertId,
        device_id: match.deviceId,
        confidence: match.confidence,
        match_type: match.matchType,
        status: 'QUEUED',
      },
    });
    
    // Queue push job
    await this.notificationQueue.add('send-push', {
      notificationId: notification.id,
    });
  }
}
```

---

### 4. Send Push Notification (Background Job)

```typescript
// NotificationQueueProcessor.processPushNotification()
@Process('send-push')
async processPushNotification(job: Job<{ notificationId: string }>): Promise<void> {
  const { notificationId } = job.data;
  
  // 1. Get notification with device and alert
  const notification = await this.prisma.notification.findUnique({
    where: { id: notificationId },
    include: { device: true, alert: true },
  });
  
  // 2. Format notification payload
  const payload = this.formatPayload(notification);
  
  // 3. Send via FCM or APNs
  try {
    if (notification.device.platform === 'ANDROID') {
      await this.fcmService.send(notification.device.push_token, payload);
    } else if (notification.device.platform === 'IOS') {
      await this.apnsService.send(notification.device.push_token, payload);
    }
    
    // 4. Update status
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'SENT', sent_at: new Date() },
    });
    
    this.logger.log(`Notification sent: ${notificationId}`);
  } catch (error) {
    // 5. Handle failure
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'FAILED', error_message: error.message },
    });
    
    this.logger.error(`Notification failed: ${notificationId}`, error);
  }
}
```

---

## Targeting Logic

### Device Matching (5 Tiers)

The LocationService finds devices that should be notified based on proximity and location freshness:

| Priority | Match Type | Confidence | Criteria |
|----------|------------|------------|----------|
| 1 | **SAVED_ZONE** | HIGH | Alert overlaps device's saved zone |
| 2 | **GPS_FRESH** | HIGH | GPS location < 2 hours old, within radius |
| 3 | **GPS_STALE** | MEDIUM | GPS location 2-24 hours old, within radius |
| 4 | **POSTAL_CODE** | MEDIUM | Postal code matches alert's affected area |
| 5 | **IP_GEO** | LOW | IP geolocation within radius |

---

### Confidence Levels

**HIGH Confidence:**
- Saved zone match (user explicitly marked area)
- Fresh GPS location (< 2 hours)
- **Notification Style:** Urgent, full details, actionable

**MEDIUM Confidence:**
- Stale GPS location (2-24 hours)
- Postal code match
- **Notification Style:** Normal priority, moderate details

**LOW Confidence:**
- IP geolocation match (1-50km accuracy)
- **Notification Style:** Low priority, minimal details

---

### Example Query (Simplified)

```typescript
// LocationService.findDevicesForAlert()
async findDevicesForAlert(alertId: string): Promise<DeviceMatch[]> {
  const alert = await this.prisma.alert.findUnique({ where: { id: alertId } });
  const matches: DeviceMatch[] = [];
  
  // Tier 1: Saved Zone Match
  const savedZoneMatches = await this.prisma.$queryRaw`
    SELECT DISTINCT d.id AS device_id, 'SAVED_ZONE' AS match_type
    FROM "Device" d
    JOIN "SavedZone" sz ON sz.device_id = d.id
    WHERE ST_DWithin(
      sz.location_point::geography,
      ${alert.location_point}::geography,
      sz.radius_km * 1000
    )
  `;
  matches.push(...savedZoneMatches.map(m => ({ ...m, confidence: 'HIGH' })));
  
  // Tier 2: Fresh GPS (< 2 hours)
  const freshGpsMatches = await this.prisma.$queryRaw`
    SELECT id AS device_id, 'GPS_FRESH' AS match_type
    FROM "Device"
    WHERE location_type = 'GPS'
      AND location_updated_at > NOW() - INTERVAL '2 hours'
      AND ST_DWithin(
        gps_point::geography,
        ${alert.location_point}::geography,
        ${alert.radius_km * 1000}
      )
  `;
  matches.push(...freshGpsMatches.map(m => ({ ...m, confidence: 'HIGH' })));
  
  // ... Continue for Tiers 3-5
  
  return matches;
}
```

---

## Queue Processing

### BullMQ Configuration

**Queue Name:** `notification-queue`  
**Redis:** Configured via `REDIS_URL` env var

**Job Types:**
1. **send-alert-notifications:** Finds devices for alert, queues push jobs
2. **send-push:** Sends individual push notification to device

---

### Job Options

```typescript
// send-alert-notifications job
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,  // 2s, 4s, 8s
  },
  removeOnComplete: 100,  // Keep last 100 completed
  removeOnFail: 500,      // Keep last 500 failed
}

// send-push job
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,  // 1s, 2s, 4s
  },
  timeout: 30000,  // 30 seconds
}
```

---

### Concurrency

**Workers:** 5 concurrent push notification jobs

```typescript
@Processor('notification-queue', {
  concurrency: 5,  // Process 5 push jobs simultaneously
})
```

---

### Monitoring

**Key Metrics:**
- Queue depth (waiting jobs)
- Processing rate (jobs/second)
- Failure rate (%)
- Average latency (ms)

**Redis Commands:**
```bash
# Check queue depth
redis-cli LLEN bull:notification-queue:wait

# Check failed jobs
redis-cli LLEN bull:notification-queue:failed

# Get queue stats
redis-cli HGETALL bull:notification-queue:meta
```

---

## Data Model

### Notification Table Schema

```prisma
model Notification {
  id                       String       @id @default(uuid())
  alert_id                 String
  device_id                String
  
  // Targeting
  confidence               Confidence
  match_type               MatchType
  
  // Delivery
  status                   NotificationStatus  @default(QUEUED)
  sent_at                  DateTime?
  error_message            String?      @db.Text
  
  // Lifecycle
  created_at               DateTime     @default(now())
  updated_at               DateTime     @updatedAt
  
  // Relations
  alert                    Alert        @relation(fields: [alert_id], references: [id])
  device                   Device       @relation(fields: [device_id], references: [id])
  
  @@index([alert_id])
  @@index([device_id])
  @@index([status])
  @@index([created_at])
}

enum Confidence {
  HIGH
  MEDIUM
  LOW
}

enum MatchType {
  SAVED_ZONE
  GPS_FRESH
  GPS_STALE
  POSTAL_CODE
  IP_GEO
}

enum NotificationStatus {
  QUEUED
  SENT
  FAILED
  CANCELLED
}
```

---

## Confidence-Based Styling

### HIGH Confidence Notifications

**Recipients:**
- Saved zone users
- Fresh GPS users (< 2 hours)

**Notification Payload (iOS):**
```json
{
  "aps": {
    "alert": {
      "title": "🐕 Missing Pet Alert Nearby",
      "subtitle": "Max - Golden Retriever",
      "body": "Last seen at 123 Main St, 2.3 km away. Tap to view details."
    },
    "sound": "urgent.caf",
    "badge": 1,
    "category": "ALERT_HIGH"
  },
  "data": {
    "alertId": "alert-uuid",
    "confidence": "HIGH",
    "distanceKm": 2.3
  }
}
```

**Android Payload:**
```json
{
  "notification": {
    "title": "🐕 Missing Pet Alert Nearby",
    "body": "Max - Golden Retriever - Last seen at 123 Main St, 2.3 km away",
    "sound": "urgent",
    "priority": "high",
    "channelId": "alerts_high"
  },
  "data": {
    "alertId": "alert-uuid",
    "confidence": "HIGH",
    "distanceKm": "2.3"
  }
}
```

---

### MEDIUM Confidence Notifications

**Recipients:**
- Stale GPS users (2-24 hours)
- Postal code matches

**Notification Payload (iOS):**
```json
{
  "aps": {
    "alert": {
      "title": "Missing Pet in Your Area",
      "subtitle": "Max - Golden Retriever",
      "body": "Last seen in 10001 postal code area."
    },
    "sound": "default",
    "badge": 1,
    "category": "ALERT_MEDIUM"
  },
  "data": {
    "alertId": "alert-uuid",
    "confidence": "MEDIUM"
  }
}
```

---

### LOW Confidence Notifications

**Recipients:**
- IP geolocation matches

**Notification Payload (iOS):**
```json
{
  "aps": {
    "alert": {
      "title": "Missing Pet - General Area",
      "subtitle": "Max - Golden Retriever",
      "body": "Possible sighting in your general area."
    },
    "sound": "default",
    "badge": 1,
    "category": "ALERT_LOW"
  },
  "data": {
    "alertId": "alert-uuid",
    "confidence": "LOW"
  }
}
```

---

## Delivery Tracking

### Notification Status Flow

```
QUEUED → SENT (success)
       → FAILED (error)
       → CANCELLED (alert resolved before sending)
```

---

### Delivery Monitoring

**Key Metrics:**

| Metric | Target | Description |
|--------|--------|-------------|
| Delivery Rate | > 90% | % of notifications successfully sent |
| Failure Rate | < 10% | % of notifications that failed |
| Invalid Token Rate | < 20% | % of failures due to invalid tokens |
| Avg Latency | < 5s | Time from alert creation to push sent |

**Queries:**
```sql
-- Delivery rate (last 24 hours)
SELECT 
  COUNT(*) FILTER (WHERE status = 'SENT') * 100.0 / COUNT(*) AS delivery_rate_pct
FROM "Notification"
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Failure breakdown
SELECT error_message, COUNT(*)
FROM "Notification"
WHERE status = 'FAILED'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY error_message
ORDER BY COUNT(*) DESC;
```

---

### Invalid Token Handling

**FCM Error:** `messaging/registration-token-not-registered`  
**APNs Error:** `BadDeviceToken`, `Unregistered`

**Action:**
1. Mark notification as FAILED
2. Update device: Set `push_token` to NULL
3. Log event for monitoring

```typescript
// Handle invalid token
if (error.code === 'messaging/registration-token-not-registered') {
  await this.prisma.device.update({
    where: { id: notification.device_id },
    data: { push_token: null, push_token_updated_at: null },
  });
  
  this.logger.warn(`Invalid push token for device ${notification.device_id}`);
}
```

---

## Testing

### Unit Tests

**Location:** `src/notification/notification.service.spec.ts`

**Coverage:**
- ✅ Queue alert notifications
- ✅ Process alert notifications (device matching)
- ✅ Send push notification (FCM mocked)
- ✅ Send push notification (APNs mocked)
- ✅ Handle FCM errors (invalid token)
- ✅ Handle APNs errors (bad device token)
- ✅ Confidence-based payload formatting
- ✅ Retry logic (exponential backoff)

**Run:**
```bash
bun test notification.service.spec.ts
```

---

### Integration Tests

**Location:** `test/notification.e2e-spec.ts`

**Scenarios:**
- Create alert → notifications queued
- Process notification job → FCM/APNs called
- Invalid push token → device updated
- Alert resolved → pending notifications cancelled

**Run:**
```bash
bun test:e2e test/notification.e2e-spec.ts
```

---

### Manual Testing

**Firebase Console:**
1. Go to Firebase Console → Cloud Messaging
2. Send test message with device token
3. Verify notification received on device

**Pusher App (macOS):**
1. Download Pusher app
2. Configure APNs .p8 key
3. Send test notification
4. Verify notification received on iOS device

---

## Performance Considerations

### Queue Optimization

**Batch Processing:**
- Process 100 devices per batch
- Use `Promise.all()` for parallel processing
- Limit concurrency to 5 workers

**Job Deduplication:**
- Use idempotency key: `alert-${alertId}-device-${deviceId}`
- Prevents duplicate notifications for same alert/device

---

### Push Service Rate Limits

**FCM:**
- Batch sending: 500 tokens per request
- Rate limit: 10,000 messages/minute (free tier)

**APNs:**
- HTTP/2 multiplexing: 500 concurrent connections
- No explicit rate limit (Apple manages)

---

### Redis Memory Management

**Job Retention:**
- Keep last 100 completed jobs
- Keep last 500 failed jobs
- Set job TTL: 7 days

**Configuration:**
```typescript
{
  removeOnComplete: {
    count: 100,  // Keep last 100
    age: 7 * 24 * 60 * 60,  // 7 days in seconds
  },
  removeOnFail: {
    count: 500,
    age: 7 * 24 * 60 * 60,
  },
}
```

---

## Error Handling

### Common Errors

| Error | Reason | Solution |
|-------|--------|----------|
| **FCM: registration-token-not-registered** | Token expired or app uninstalled | Update device: `push_token = NULL` |
| **APNs: BadDeviceToken** | Wrong environment (sandbox vs prod) | Check `APNS_PRODUCTION` setting |
| **APNs: Unregistered** | Device token invalid | Update device: `push_token = NULL` |
| **Queue timeout** | Job exceeded 30s timeout | Check Redis connection, reduce batch size |
| **Redis connection failed** | Redis unavailable | Check Redis health, connection pool |

---

## Related Documentation

- [Alert Module](./alert-module.md) - Alert creation triggers notifications
- [Device Module](./device-module.md) - Device registration and push tokens
- [Location Module](./location-module.md) - Geospatial device targeting
- [Push Notifications Setup](../PUSH_NOTIFICATIONS_SETUP.md) - FCM/APNs configuration
- [Redis Production Setup](../REDIS_PRODUCTION_SETUP.md) - BullMQ queue configuration
- [System Behavior Spec](../SYSTEM_BEHAVIOR_SPEC.md) - Notification targeting rules

---

## Support

For issues with Notification module:
- Check logs: `logs/application-*.log`
- Check queue status: `redis-cli LLEN bull:notification-queue:wait`
- Verify notifications: `SELECT * FROM "Notification" WHERE alert_id = 'alert-uuid';`
- Test FCM: Firebase Console → Cloud Messaging → Send test message
- Test APNs: Pusher app with .p8 key
- Consult [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)
