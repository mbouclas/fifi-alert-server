# End-to-End Scenario Test Plan

## Overview
This document outlines 7 comprehensive end-to-end scenarios for testing the complete FiFi Alert system. These scenarios validate the full user journey and system integration.

**Status:** Manual testing recommended due to better-auth ESM module compatibility issues with Jest.

**Alternative:** Use Postman collection ([FiFi_Alert_API.postman_collection.json](../FiFi_Alert_API.postman_collection.json)) to manually execute these scenarios.

---

## Scenario 1: Complete Alert Lifecycle ✅

**Description:** End-to-end flow from alert creation through notification delivery, sighting reporting, and alert resolution.

### Prerequisites
- 2 test users created
- Device registered for User 2 with valid push token
- User 2's device has fresh GPS location (<2h old)

### Test Steps

1. **User 2: Register Device**
   ```
   POST /devices
   Authorization: Bearer {user2_token}
   Body:
   {
     "device_uuid": "test-device-001",
     "platform": "IOS",
     "os_version": "16.0",
     "app_version": "1.0.0",
     "push_token": "{valid_apns_token}",
     "gps": {
       "latitude": 40.7589,
       "longitude": -73.9851
     },
     "postal_codes": ["10036"]
   }
   ```
   **Expected:** 201 Created, device registered with location

2. **User 1: Create Alert (Times Square)**
   ```
   POST /alerts
   Authorization: Bearer {user1_token}
   Body:
   {
     "pet": {
       "name": "Max",
       "species": "DOG",
       "breed": "Golden Retriever",
       "description": "Friendly golden retriever, wearing blue collar",
       "color": "Golden",
       "age_years": 3,
       "photos": []
     },
     "location": {
       "latitude": 40.7580,
       "longitude": -73.9855,
       "address": "Times Square, New York, NY",
       "last_seen_time": "2026-02-06T10:00:00Z",
       "radius_km": 5
     },
     "contact": {
       "phone": "+1234567890",
       "email": "user1@test.com",
       "is_phone_public": true
     },
     "reward": {
       "offered": true,
       "amount": 500
     }
   }
   ```
   **Expected:** 201 Created, alert in ACTIVE status, alert_id returned

3. **Verify Notification Queued**
   - Check BullMQ dashboard or logs
   - Check database: `SELECT * FROM "Notification" WHERE alert_id = '{alert_id}'`
   **Expected:** Notification records created for matching devices

4. **Verify Push Notification Sent (on User 2's device)**
   - Check device receives push notification
   - Notification should show HIGH confidence (fresh GPS < 2h)
   - Title: "🚨 Missing DOG: Max — Last seen 0.9 km from you"
   **Expected:** Push notification received with HIGH confidence styling

5. **User 2: Report Sighting**
   ```
   POST /sightings
   Authorization: Bearer {user2_token}
   Body:
   {
     "alert_id": "{alert_id}",
     "location": {
       "latitude": 40.7600,
       "longitude": -73.9850,
       "address": "Near Times Square, New York, NY"
     },
     "notes": "Saw the dog near a coffee shop",
     "confidence": 80,
     "sighting_time": "2026-02-06T11:30:00Z",
     "direction": "NORTH"
   }
   ```
   **Expected:** 201 Created, sighting_id returned

6. **User 1: View Sightings**
   ```
   GET /sightings/alert/{alert_id}
   Authorization: Bearer {user1_token}
   ```
   **Expected:** 200 OK, array with 1 sighting

7. **User 1: Resolve Alert**
   ```
   POST /alerts/{alert_id}/resolve
   Authorization: Bearer {user1_token}
   Body:
   {
     "outcome": "FOUND",
     "notes": "Found Max thanks to the sighting report!",
     "share_success_story": true
   }
   ```
   **Expected:** 200 OK, alert status = RESOLVED, resolved_at timestamp set

8. **Verify Alert No Longer in Active Searches**
   ```
   GET /alerts?latitude=40.7580&longitude=-73.9855&radius_km=10&status=ACTIVE
   ```
   **Expected:** 200 OK, resolved alert NOT in results

---

## Scenario 2: Alert Expiration ✅

**Description:** Verify alerts expire after 7 days and notifications stop.

### Prerequisites
- 1 test user created
- Alert created 8 days ago (manually manipulate database)

### Test Steps

1. **Create Expired Alert (Database Manipulation)**
   ```sql
   INSERT INTO "Alert" (
     id, creator_id, status, pet_name, pet_species, pet_breed,
     pet_description, location_point, location_address,
     location_radius_km, contact_phone, contact_email,
     created_at, expires_at, renewal_count
   ) VALUES (
     gen_random_uuid(),
     '{user_id}',
     'ACTIVE',
     'Buddy',
     'DOG',
     'Labrador',
     'Black lab, very friendly',
     ST_SetSRID(ST_MakePoint(-73.9855, 40.7580), 4326),
     'Times Square, NY',
     5,
     '+1234567890',
     'expired@test.com',
     NOW() - INTERVAL '8 days',
     NOW() - INTERVAL '1 day',
     0
   );
   ```

2. **Manually Trigger Expiration Check**
   - Wait for cron job (runs hourly)
   - OR manually run: Call AlertService.checkExpired()
   
3. **Verify Alert Status Changed**
   ```sql
   SELECT status, expires_at FROM "Alert" WHERE pet_name = 'Buddy';
   ```
   **Expected:** status = 'EXPIRED'

4. **Verify Notifications Stopped**
   - Create new device and check if it receives notification for expired alert
   **Expected:** No notifications sent for expired alerts

---

## Scenario 3: Alert Renewal (Max 3 Times) ✅

**Description:** Verify users can renew alerts up to 3 times, each extending expiration by 7 days.

### Prerequisites
- 1 test user created

### Test Steps

1. **User: Create Alert**
   ```
   POST /alerts
   Authorization: Bearer {user_token}
   Body: {standard alert body}
   ```
   **Expected:** 201 Created, renewal_count = 0, expires_at = created_at + 7 days

2. **User: Renew Alert (1st time)**
   ```
   POST /alerts/{alert_id}/renew
   Authorization: Bearer {user_token}
   ```
   **Expected:** 200 OK, renewal_count = 1, renewals_remaining = 2, expires_at extended

3. **User: Renew Alert (2nd time)**
   ```
   POST /alerts/{alert_id}/renew
   Authorization: Bearer {user_token}
   ```
   **Expected:** 200 OK, renewal_count = 2, renewals_remaining = 1

4. **User: Renew Alert (3rd time)**
   ```
   POST /alerts/{alert_id}/renew
   Authorization: Bearer {user_token}
   ```
   **Expected:** 200 OK, renewal_count = 3, renewals_remaining = 0

5. **User: Try to Renew 4th Time (Should Fail)**
   ```
   POST /alerts/{alert_id}/renew
   Authorization: Bearer {user_token}
   ```
   **Expected:** 422 Unprocessable Entity, error message contains "maximum"

---

## Scenario 4: Saved Zone HIGH Confidence Notification ✅

**Description:** Verify users with saved zones receive HIGH confidence notifications even if GPS is far away.

###Prerequisites
- 2 test users created

### Test Steps

1. **User 2: Register Device with GPS Far from Alert**
   ```
   POST /devices
   Authorization: Bearer {user2_token}
   Body:
   {
     "device_uuid": "savedzone-device",
     "platform": "ANDROID",
     "os_version": "13",
     "app_version": "1.0.0",
     "push_token": "{valid_fcm_token}",
     "gps": {
       "latitude": 40.7500,  // Downtown Manhattan (far from Times Square)
       "longitude": -74.0050
     },
     "postal_codes": ["10004"]
   }
   ```
   **Expected:** 201 Created, device_id returned

2. **User 2: Create Saved Zone Near Times Square**
   ```
   POST /devices/{device_id}/saved-zones
   Authorization: Bearer {user2_token}
   Body:
   {
     "name": "Work Area",
     "latitude": 40.7590,  // Near Times Square
     "longitude": -73.9845,
     "radius_km": 2,
     "priority": 10
   }
   ```
   **Expected:** 201 Created, saved_zone_id returned

3. **User 1: Create Alert in Times Square**
   ```
   POST /alerts
   Authorization: Bearer {user1_token}
   Body: {alert with location in Times Square, radius 5km}
   ```
   **Expected:** 201 Created, alert_id returned

4. **Verify HIGH Confidence Notification**
   ```sql
   SELECT confidence, match_reason FROM "Notification"
   WHERE alert_id = '{alert_id}' AND device_id = '{device_id}';
   ```
   **Expected:** confidence = 'HIGH', match_reason contains 'SAVED_ZONE'

5. **Check Push Notification on Device**
   **Expected:** Notification title shows HIGH confidence emoji: "🚨 Missing {species}: {name} — Last seen in your saved zone"

---

## Scenario 5: Rate Limiting Enforcement ✅

**Description:** Verify rate limits prevent spam: 5 alerts/hour, 20/24h, 50/7days.

### Prerequisites
- 1 test user created
- Redis rate limiting enabled

### Test Steps

1. **User: Create 5 Alerts Rapidly**
   ```
   POST /alerts (repeat 5 times with different pet names/locations)
   Authorization: Bearer {user_token}
   ```
   **Expected:** All 5 succeed (201 Created)

2. **User: Attempt 6th Alert Within Same Hour**
   ```
   POST /alerts
   Authorization: Bearer {user_token}
   Body: {6th alert}
   ```
   **Expected:** 429 Too Many Requests
   ```json
   {
     "error_code": "RATE_LIMIT_EXCEEDED",
     "message": "Rate limit exceeded. Maximum 5 alerts per hour allowed.",
     "retry_after_seconds": {positive_number},
     "limits": {
       "hourly": { "limit": 5, "remaining": 0, "resets_in_seconds": {...} },
       "daily": { "limit": 20, "remaining": 15, "resets_in_seconds": {...} },
       "weekly": { "limit": 50, "remaining": 45, "resets_in_seconds": {...} }
     }
   }
   ```

3. **Wait for 1 Hour**
   - OR manually reset Redis: `redis-cli DEL rate-limit:alerts:hourly:{user_id}`

4. **User: Create Another Alert**
   ```
   POST /alerts
   Authorization: Bearer {user_token}
   ```
   **Expected:** 201 Created (rate limit window reset)

---

## Scenario 6: Non-Owner Access Control ✅

**Description:** Verify users cannot modify alerts they don't own.

### Prerequisites
- 2 test users created

### Test Steps

1. **User 1: Create Alert**
   ```
   POST /alerts
   Authorization: Bearer {user1_token}
   Body: {standard alert}
   ```
   **Expected:** 201 Created, alert_id returned

2. **User 2: Attempt to Update User 1's Alert**
   ```
   PATCH /alerts/{alert_id}
   Authorization: Bearer {user2_token}
   Body:
   {
     "pet_description": "Unauthorized update attempt"
   }
   ```
   **Expected:** 403 Forbidden

3. **User 2: Attempt to Resolve User 1's Alert**
   ```
   POST /alerts/{alert_id}/resolve
   Authorization: Bearer {user2_token}
   Body:
   {
     "outcome": "FOUND",
     "notes": "Unauthorized resolution"
   }
   ```
   **Expected:** 403 Forbidden

4. **User 2: Attempt to Renew User 1's Alert**
   ```
   POST /alerts/{alert_id}/renew
   Authorization: Bearer {user2_token}
   ```
   **Expected:** 403 Forbidden

5. **Verify Alert Unchanged**
   ```
   GET /alerts/{alert_id}
   ```
   **Expected:** 200 OK, alert data unchanged, status still ACTIVE

---

## Scenario 7: Sighting Dismissal by Alert Creator ✅

**Description:** Verify only alert creators can dismiss sightings (false positives).

### Prerequisites
- 2 test users created

### Test Steps

1. **User 1: Create Alert**
   ```
   POST /alerts
   Authorization: Bearer {user1_token}
   Body: {standard alert}
   ```
   **Expected:** 201 Created, alert_id returned

2. **User 2: Report Sighting**
   ```
   POST /sightings
   Authorization: Bearer {user2_token}
   Body:
   {
     "alert_id": "{alert_id}",
     "location": {...},
     "notes": "Saw a similar cat",
     "confidence": 60,
     "sighting_time": "2026-02-06T14:00:00Z"
   }
   ```
   **Expected:** 201 Created, sighting_id returned

3. **User 1: Dismiss Sighting (Alert Creator)**
   ```
   POST /sightings/{sighting_id}/dismiss
   Authorization: Bearer {user1_token}
   Body:
   {
     "reason": "Different cat - mine has a white patch"
   }
   ```
   **Expected:** 200 OK, dismissed = true, dismissed_reason set

4. **User 2: Attempt to Dismiss Own Sighting (Should Fail)**
   ```
   POST /sightings/{sighting_id}/dismiss
   Authorization: Bearer {user2_token}
   Body:
   {
     "reason": "Changed my mind"
   }
   ```
   **Expected:** 403 Forbidden (only alert creator can dismiss)

5. **Verify Dismissed Sighting Not Shown to Public**
   ```
   GET /sightings/alert/{alert_id}
   Authorization: Bearer {user2_token}
   ```
   **Expected:** 200 OK, dismissed sighting NOT in results (unless requester is alert creator)

6. **Verify Alert Creator Can Still See Dismissed Sighting**
   ```
   GET /sightings/alert/{alert_id}
   Authorization: Bearer {user1_token}
   ```
   **Expected:** 200 OK, dismissed sighting IS in results with dismissed=true

---

## Execution Checklist

### Before Testing
- [ ] Start dev server: `bun run start:dev`
- [ ] Verify PostgreSQL + PostGIS running
- [ ] Verify Redis running
- [ ] Clear test data from previous runs
- [ ] Create test users (use signup endpoints or seed script)
- [ ] Have Postman/REST client ready

### During Testing
- [ ] Execute each scenario step-by-step
- [ ] Record responses for verification
- [ ] Check database state after critical operations
- [ ] Monitor logs for errors
- [ ] Check BullMQ dashboard for job processing

### After Testing
- [ ] Clean up test data
- [ ] Document any issues found
- [ ] Update test results in tasks.md

---

## Test Results Template

```
Scenario: {scenario_name}
Date: {date}
Tester: {name}
Result: ✅ PASS / ❌ FAIL

Issues Found:
- {issue_description}
- {issue_description}

Notes:
- {observation}
```

---

## Known Issues

### 1. Jest E2E Tests with better-auth
**Issue:** Jest cannot parse better-auth ESM modules (.mjs files)  
**Error:** `SyntaxError: Cannot use import statement outside a module`  
**Workaround:** Use manual API testing with Postman or REST client  
**Fix Required:** Configure Jest to handle ESM modules or mock better-auth in tests

### 2. Real Push Notification Testing
**Issue:** Requires actual APNs/.p8 key and FCM service account  
**Workaround:** Test notification creation and queuing, verify with mock tokens  
**Manual Test:** Deploy to staging with real credentials and test on physical devices

---

## Future Improvements

1. **Automated E2E Tests**
   - Fix Jest ESM module compatibility
   - Create custom test module without better-auth dependency
   - Add Playwright/Cypress for UI e2e tests (when frontend exists)

2. **Performance Testing**
   - Add load testing with k6 or Artillery
   - Measure notification targeting speed with 10k devices
   - Profile geospatial query performance

3. **Continuous Integration**
   - Add GitHub Actions workflow to run e2e tests on PR
   - Auto-deploy to staging environment
   - Run smoke tests after deployment

---

**Last Updated:** February 6, 2026  
**Status:** Ready for manual execution  
**Contact:** Development Team
