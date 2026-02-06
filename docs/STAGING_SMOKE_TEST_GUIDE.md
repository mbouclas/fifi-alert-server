# Staging Smoke Test Guide

**Purpose:** Validate FiFi Alert backend is production-ready before deploying to production  
**Environment:** Staging (staging.fifialert.com or equivalent)  
**Duration:** ~2 hours  
**Prerequisites:** Staging deployment complete, database migrated, environment variables configured

---

## Pre-Test Setup

### 1. Verify Staging Environment

```bash
# Check environment variables
curl https://staging.fifialert.com/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2026-02-06T...",
  "uptime": 12345,
  "checks": {
    "database": { "status": "healthy", "latency_ms": 5 },
    "redis": { "status": "healthy", "latency_ms": 2 },
    "disk": { "status": "healthy", "available_mb": 50000 }
  }
}
```

**Checklist:**
- [ ] Health check returns 200 OK
- [ ] Database connection healthy
- [ ] Redis connection healthy
- [ ] Disk space >10GB available

---

### 2. Create Test User Accounts

```bash
# Create test user 1 (alert creator)
curl -X POST https://staging.fifialert.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-creator@staging.com",
    "password": "StrongPassword123!",
    "name": "Test Creator"
  }'

# Create test user 2 (nearby user)
curl -X POST https://staging.fifialert.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-nearby@staging.com",
    "password": "StrongPassword123!",
    "name": "Test Nearby User"
  }'

# Login and get tokens
curl -X POST https://staging.fifialert.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-creator@staging.com",
    "password": "StrongPassword123!"
  }'
```

**Save tokens:**
- `CREATOR_TOKEN=<access_token from login response>`
- `NEARBY_TOKEN=<access_token from user 2 login>`

---

## Test 1: Alert Creation & Publishing

### 1.1 Create Alert

```bash
curl -X POST https://staging.fifialert.com/alerts \
  -H "Authorization: Bearer $CREATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pet": {
      "name": "Buddy",
      "species": "DOG",
      "breed": "Golden Retriever",
      "description": "Friendly golden retriever with red collar",
      "color": "Golden",
      "ageYears": 3,
      "photos": []
    },
    "location": {
      "lat": 37.7897,
      "lon": -122.4082,
      "address": "San Francisco, CA",
      "radiusKm": 5,
      "lastSeenTime": "2026-02-06T10:00:00Z"
    },
    "contact": {
      "phone": "+14155551234",
      "email": "test-creator@staging.com",
      "isPhonePublic": true
    },
    "notes": "Last seen near Golden Gate Park",
    "reward": {
      "offered": true,
      "amount": 100
    }
  }'
```

**Expected:**
- ✅ Status: 201 Created
- ✅ Response includes `id`, `status: "ACTIVE"`, `expiresAt` (7 days from now)
- ✅ `petName: "Buddy"`, `petSpecies: "DOG"`

**Checklist:**
- [ ] Alert created successfully
- [ ] Alert ID returned
- [ ] Status is ACTIVE
- [ ] Expiration date set to 7 days from now

---

### 1.2 Verify Alert Details

```bash
curl https://staging.fifialert.com/alerts/{ALERT_ID} \
  -H "Authorization: Bearer $CREATOR_TOKEN"
```

**Expected:**
- ✅ Status: 200 OK
- ✅ All alert details match create request
- ✅ `contactPhone` visible (creator viewing own alert)
- ✅ `contactEmail` visible (creator viewing own alert)

**Checklist:**
- [ ] Alert details returned correctly
- [ ] Contact info visible to creator
- [ ] Location coordinates correct
- [ ] Reward information present

---

## Test 2: Device Registration & GPS Update

### 2.1 Register Device (Test User 2)

```bash
curl -X POST https://staging.fifialert.com/devices/register \
  -H "Authorization: Bearer $NEARBY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_uuid": "test-device-nearby-001",
    "platform": "IOS",
    "push_token": "test-fcm-token-nearby-001-xxxxxxxxxxxxxxxxxxxx",
    "os_version": "16.0",
    "app_version": "1.0.0"
  }'
```

**Expected:**
- ✅ Status: 201 Created
- ✅ Device registered with UUID
- ✅ Push token stored

**Checklist:**
- [ ] Device registered successfully
- [ ] Device ID returned
- [ ] Push token accepted

---

### 2.2 Update Device GPS Location (Near Alert)

```bash
curl -X PUT https://staging.fifialert.com/devices/test-device-nearby-001/location \
  -H "Authorization: Bearer $NEARBY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 37.7897,
    "lon": -122.4082,
    "accuracy": 10,
    "timestamp": "2026-02-06T10:30:00Z",
    "source": "GPS"
  }'
```

**Expected:**
- ✅ Status: 200 OK
- ✅ GPS location updated
- ✅ Device now within 5km of alert

**Checklist:**
- [ ] Location updated successfully
- [ ] GPS point stored (verify with geospatial query)

---

## Test 3: Geospatial Queries

### 3.1 Find Nearby Alerts

```bash
curl "https://staging.fifialert.com/alerts/nearby?lat=37.7897&lon=-122.4082&radiusKm=10" \
  -H "Authorization: Bearer $NEARBY_TOKEN"
```

**Expected:**
- ✅ Status: 200 OK
- ✅ Array includes alert created in Test 1
- ✅ Distance calculated correctly
- ✅ Contact phone visible (marked public)
- ✅ Contact email NOT visible (not creator)

**Checklist:**
- [ ] Nearby alert returned
- [ ] Distance within expected range
- [ ] Contact visibility rules enforced
- [ ] PostGIS query successful

---

### 3.2 Verify GIST Index Usage

```sql
-- Run on staging database
EXPLAIN ANALYZE
SELECT id, pet_name, ST_Distance(
  location_point::geography,
  ST_SetSRID(ST_MakePoint(-122.4082, 37.7897), 4326)::geography
) / 1000 as distance_km
FROM alert
WHERE status = 'ACTIVE'
  AND ST_DWithin(
    location_point::geography,
    ST_SetSRID(ST_MakePoint(-122.4082, 37.7897), 4326)::geography,
    10000
  )
ORDER BY distance_km
LIMIT 20;
```

**Expected:**
- ✅ Query plan shows "Index Scan using alert_location_point_idx"
- ✅ Query execution time < 50ms

**Checklist:**
- [ ] GIST index used
- [ ] Query performance acceptable

---

## Test 4: Sighting Reports

### 4.1 Report Sighting (Test User 2)

```bash
curl -X POST https://staging.fifialert.com/sightings \
  -H "Authorization: Bearer $NEARBY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "alert_id": {ALERT_ID},
    "location": {
      "lat": 37.7897,
      "lon": -122.4082,
      "address": "Near Golden Gate Park"
    },
    "sighting_time": "2026-02-06T11:00:00Z",
    "description": "Saw a golden retriever matching the description",
    "photos": [],
    "reporter_contact": {
      "phone": "+14155559999",
      "email": "test-nearby@staging.com",
      "is_phone_public": false
    }
  }'
```

**Expected:**
- ✅ Status: 201 Created
- ✅ Sighting created and linked to alert
- ✅ Alert creator should receive notification (if push configured)

**Checklist:**
- [ ] Sighting created successfully
- [ ] Sighting linked to correct alert
- [ ] Sighting within alert radius validation passed

---

### 4.2 Verify Sighting in Alert Details

```bash
curl https://staging.fifialert.com/alerts/{ALERT_ID} \
  -H "Authorization: Bearer $CREATOR_TOKEN"
```

**Expected:**
- ✅ `sightingCount: 1`
- ✅ Sighting details visible to creator

**Checklist:**
- [ ] Sighting count updated
- [ ] Sighting details available

---

## Test 5: Push Notifications (Manual)

### 5.1 Register Real Device

**iOS Device:**
1. Install TestFlight build on iPhone
2. Allow notifications when prompted
3. Log in with test account
4. Register device with real APNs token

**Android Device:**
1. Install debug APK on Android phone
2. Allow notifications when prompted
3. Log in with test account
4. Register device with real FCM token

**Save real device UUID and push token for testing**

---

### 5.2 Create Alert and Verify Notification

```bash
# Create new alert near your test device location
curl -X POST https://staging.fifialert.com/alerts \
  -H "Authorization: Bearer $CREATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pet": { ... },
    "location": {
      "lat": <YOUR_DEVICE_LAT>,
      "lon": <YOUR_DEVICE_LON>,
      "radiusKm": 10,
      ...
    },
    ...
  }'
```

**Expected:**
- ✅ Alert created successfully
- ✅ Push notification received on device within 30 seconds
- ✅ Notification title: "Missing DOG: Buddy nearby"
- ✅ Notification body includes location address

**Checklist:**
- [ ] Push notification received
- [ ] Notification content correct
- [ ] Tapping notification opens alert detail

---

### 5.3 Verify Notification Records

```bash
curl "https://staging.fifialert.com/notifications?alert_id={ALERT_ID}" \
  -H "Authorization: Bearer $CREATOR_TOKEN"
```

**Expected:**
- ✅ Notification records created
- ✅ Status: `QUEUED` or `SENT`
- ✅ Confidence levels assigned correctly

**Checklist:**
- [ ] Notification records exist
- [ ] Status updated correctly
- [ ] Confidence levels match location freshness

---

## Test 6: File Uploads

### 6.1 Upload Pet Photo

```bash
curl -X POST https://staging.fifialert.com/upload \
  -H "Authorization: Bearer $CREATOR_TOKEN" \
  -F "file=@test-pet-photo.jpg"
```

**Expected:**
- ✅ Status: 201 Created
- ✅ Response includes `url` field
- ✅ File saved to `uploads/` directory

**Checklist:**
- [ ] File uploaded successfully
- [ ] URL returned
- [ ] File accessible via URL

---

### 6.2 Verify File Storage

```bash
# Check file exists
curl https://staging.fifialert.com/uploads/{FILENAME}
```

**Expected:**
- ✅ Status: 200 OK
- ✅ Content-Type: image/jpeg
- ✅ File downloads correctly

**Checklist:**
- [ ] File accessible
- [ ] Correct MIME type
- [ ] Image displays in browser

---

## Test 7: Rate Limiting

### 7.1 Test Login Rate Limit (5/minute)

```bash
# Attempt 10 logins in rapid succession
for i in {1..10}; do
  curl -X POST https://staging.fifialert.com/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test-creator@staging.com",
      "password": "WrongPassword123!"
    }'
  echo "Attempt $i"
done
```

**Expected:**
- ✅ First 5 attempts: 401 Unauthorized (wrong password)
- ✅ 6th-10th attempts: 429 Too Many Requests
- ✅ Response includes `retry_after_seconds: 60`

**Checklist:**
- [ ] Rate limit enforced after 5 attempts
- [ ] 429 status code returned
- [ ] Retry-After header present

---

### 7.2 Test Alert Creation Rate Limit (5/hour)

```bash
# Create 6 alerts in rapid succession
for i in {1..6}; do
  curl -X POST https://staging.fifialert.com/alerts \
    -H "Authorization: Bearer $CREATOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "pet": { "name": "Test Pet '$i'", ... },
      ...
    }'
  echo "Alert $i"
done
```

**Expected:**
- ✅ First 5 alerts: 201 Created
- ✅ 6th alert: 429 Too Many Requests
- ✅ Message: "Alert creation limit exceeded: 5 alerts per hour"

**Checklist:**
- [ ] Rate limit enforced after 5 alerts
- [ ] 429 status code returned
- [ ] Error message clear

---

## Test 8: Alert Lifecycle

### 8.1 Renew Alert

```bash
curl -X POST https://staging.fifialert.com/alerts/{ALERT_ID}/renew \
  -H "Authorization: Bearer $CREATOR_TOKEN"
```

**Expected:**
- ✅ Status: 200 OK
- ✅ `expiresAt` extended by 7 days
- ✅ `renewalCount` incremented
- ✅ Status remains `ACTIVE`

**Checklist:**
- [ ] Renewal successful
- [ ] Expiration extended
- [ ] Renewal count updated

---

### 8.2 Resolve Alert

```bash
curl -X POST https://staging.fifialert.com/alerts/{ALERT_ID}/resolve \
  -H "Authorization: Bearer $CREATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "outcome": "FOUND_SAFE",
    "resolution_notes": "Found safe at home!"
  }'
```

**Expected:**
- ✅ Status: 200 OK
- ✅ Alert status changed to `RESOLVED`
- ✅ Resolution notes stored

**Checklist:**
- [ ] Resolution successful
- [ ] Status updated to RESOLVED
- [ ] Notes stored correctly

---

### 8.3 Verify Resolved Alert Not in Nearby Search

```bash
curl "https://staging.fifialert.com/alerts/nearby?lat=37.7897&lon=-122.4082&radiusKm=10" \
  -H "Authorization: Bearer $NEARBY_TOKEN"
```

**Expected:**
- ✅ Resolved alert NOT included in results
- ✅ Only ACTIVE alerts returned

**Checklist:**
- [ ] Resolved alert filtered out
- [ ] Only active alerts visible

---

## Test 9: Error Handling

### 9.1 Test Invalid Input (422)

```bash
curl -X POST https://staging.fifialert.com/alerts \
  -H "Authorization: Bearer $CREATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pet": {
      "name": "",
      "species": "INVALID_SPECIES"
    },
    "location": {
      "lat": 999,
      "lon": -999,
      "radiusKm": -5
    }
  }'
```

**Expected:**
- ✅ Status: 422 Unprocessable Entity
- ✅ Error details for each invalid field
- ✅ Clear validation messages

**Checklist:**
- [ ] Validation errors returned
- [ ] Field-specific messages
- [ ] 422 status code

---

### 9.2 Test Not Found (404)

```bash
curl https://staging.fifialert.com/alerts/99999 \
  -H "Authorization: Bearer $CREATOR_TOKEN"
```

**Expected:**
- ✅ Status: 404 Not Found
- ✅ Message: "Alert with ID 99999 not found"

**Checklist:**
- [ ] 404 status code
- [ ] Clear error message

---

### 9.3 Test Unauthorized Access (403)

```bash
# Try to update another user's alert
curl -X PUT https://staging.fifialert.com/alerts/{ALERT_ID_FROM_USER1} \
  -H "Authorization: Bearer $NEARBY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "notes": "Trying to hijack this alert" }'
```

**Expected:**
- ✅ Status: 403 Forbidden
- ✅ Message: "You can only update your own alerts"

**Checklist:**
- [ ] 403 status code
- [ ] Ownership validation enforced

---

## Test 10: Logging & Monitoring

### 10.1 Check Application Logs

```bash
# SSH into staging server
ssh staging-server

# Check recent logs
tail -n 100 /var/log/fifialert/app.log

# Search for errors
grep -i "error" /var/log/fifialert/app.log | tail -n 50
```

**Expected:**
- ✅ No critical errors during smoke test
- ✅ Warnings (if any) are expected and documented
- ✅ Structured JSON log format

**Checklist:**
- [ ] No critical errors
- [ ] Logs properly formatted
- [ ] No memory leaks or crashes

---

### 10.2 Check Database Query Performance

```sql
-- Run on staging database
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%alert%'
ORDER BY mean_exec_time DESC
LIMIT 20;
```

**Expected:**
- ✅ Mean execution time < 100ms for most queries
- ✅ No queries taking >1s
- ✅ Geospatial queries using indexes

**Checklist:**
- [ ] Query performance acceptable
- [ ] No slow queries
- [ ] Indexes being used

---

### 10.3 Check Redis Connection

```bash
# Connect to Redis
redis-cli -h staging-redis-host

# Check stats
INFO stats

# Check memory
INFO memory

# Check rate limit keys
KEYS "rate-limit:*"
```

**Expected:**
- ✅ Redis responding
- ✅ Memory usage < 100MB
- ✅ Rate limit keys present

**Checklist:**
- [ ] Redis healthy
- [ ] Memory usage reasonable
- [ ] Rate limiting working

---

## Test 11: Background Jobs (BullMQ)

### 11.1 Verify Notification Queue Processing

```bash
# Check BullMQ dashboard (if configured)
# Or query database for notification status
curl "https://staging.fifialert.com/admin/queue-stats" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Expected:**
- ✅ Jobs being processed
- ✅ No stuck jobs
- ✅ Failed jobs < 5%

**Checklist:**
- [ ] Queue processing active
- [ ] No deadlocked jobs
- [ ] Retry logic working

---

## Final Checklist

### Critical Tests (Must Pass)
- [ ] ✅ Health check returns 200 OK
- [ ] ✅ Alert creation successful
- [ ] ✅ Device registration successful
- [ ] ✅ GPS location update successful
- [ ] ✅ Geospatial query returns nearby alerts
- [ ] ✅ Sighting report successful
- [ ] ✅ Push notification received (real device)
- [ ] ✅ File upload successful
- [ ] ✅ Rate limiting enforced
- [ ] ✅ Alert renewal successful
- [ ] ✅ Alert resolution successful
- [ ] ✅ Authentication guards enforced
- [ ] ✅ Ownership validation enforced
- [ ] ✅ No critical errors in logs

### Non-Critical Tests (Should Pass)
- [ ] ⚠️ Performance benchmarks met (p95 < 500ms)
- [ ] ⚠️ GIST index usage verified
- [ ] ⚠️ Redis memory usage < 100MB
- [ ] ⚠️ Background jobs processing smoothly
- [ ] ⚠️ Error responses properly formatted

---

## Post-Test Actions

### If All Tests Pass ✅
1. ✅ Mark Task 8.24 complete
2. ✅ Document any minor issues in technical debt log
3. ✅ Proceed with production deployment
4. ✅ Schedule production smoke test after deployment

### If Any Critical Tests Fail ❌
1. ❌ DO NOT deploy to production
2. ❌ Document failing test in issue tracker
3. ❌ Fix issues and re-run smoke test
4. ❌ Update this document with lessons learned

---

## Appendix A: Test Data Cleanup

```bash
# Clean up test data after smoke test
curl -X DELETE https://staging.fifialert.com/alerts/{ALERT_ID} \
  -H "Authorization: Bearer $CREATOR_TOKEN"

curl -X DELETE https://staging.fifialert.com/devices/test-device-nearby-001 \
  -H "Authorization: Bearer $NEARBY_TOKEN"

# Or reset staging database
bunx prisma migrate reset --schema prisma/schema.prisma
```

---

## Appendix B: Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Health check fails | Database not connected | Verify DATABASE_URL in .env |
| Push notification not received | Invalid token or FCM/APNs config | Check FCM_SERVICE_ACCOUNT_KEY |
| Geospatial query returns no results | GIST index missing | Run migration 20260205155301 |
| Rate limit not enforced | Redis not connected | Verify REDIS_URL in .env |
| File upload fails | uploads/ folder permissions | `chmod 755 uploads/` |

---

**Last Updated:** February 6, 2026  
**Status:** Ready for execution  
**Estimated Time:** 2 hours  
**Next Steps:** Deploy to staging, execute smoke test, document results
