# Performance Testing Guide

## Overview
This guide documents how to test FiFi Alert's production performance. Tests validate the system can handle the target loads specified in MVP Phase 1 requirements.

**Status:** Manual execution recommended due to Prisma client configuration complexity in standalone scripts.

---

## Test 8.5: Alert Creation Performance ⏱️

**Target:** p95 < 500ms

### Overview
Tests the latency of creating alerts sequentially. Measures how quickly the system can process alert creation requests.

### Prerequisites
- PostgreSQL + PostGIS running
- Redis running  
- Dev server NOT required (direct database access)

### Test Procedure

1. **Create test user:**
   ```sql
   INSERT INTO "User" (id, email, name, "emailVerified", "createdAt", "updatedAt")
   VALUES (
     gen_random_uuid(),
     'perf-test@test.com',
     'Performance Test User',
     false,
     NOW(),
     NOW()
   )
   RETURNING id;
   ```

2. **Create 100 alerts and measure latency:**
   ```typescript
   const latencies: number[] = [];
   
   for (let i = 0; i < 100; i++) {
     const start = performance.now();
     
     await prisma.alert.create({
       data: {
         creator_id: userId,
         status: 'ACTIVE',
         pet_name: `PerfTestPet${i}`,
         pet_species: 'DOG',
         pet_breed: 'Labrador',
         pet_description: `Performance test pet ${i}`,
         // ... other fields
         expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
       },
     });
     
     const latency = performance.now() - start;
     latencies.push(latency);
   }
   ```

3. **Calculate metrics:**
   ```typescript
   const sorted = latencies.sort((a, b) => a - b);
   const p50 = sorted[Math.floor(sorted.length * 0.50)];
   const p95 = sorted[Math.floor(sorted.length * 0.95)];
   const p99 = sorted[Math.floor(sorted.length * 0.99)];
   
   console.log(`P50: ${p50}ms, P95: ${p95}ms, P99: ${p99}ms`);
   console.log(`Target: P95 < 500ms - ${p95 < 500 ? 'PASS' : 'FAIL'}`);
   ```

4. **Clean up:**
   ```sql
   DELETE FROM "Alert" WHERE creator_id = '{userId}';
   DELETE FROM "User" WHERE email = 'perf-test@test.com';
   ```

### Expected Results
- P50: 50-150ms
- P95: 200-400ms  
- P99: 300-500ms

### Performance Factors
- Database connection pool (10-20 connections)
- PostGIS geometry creation (ST_MakePoint overhead)
- Index updates (GIST on location_point, GIN on postal_codes)
- Rate limiting check (Redis query)

### Optimization Tips
- Enable Prisma query logging to identify slow queries
- Check EXPLAIN ANALYZE for alert INSERT queries
- Verify GIST/GIN indexes exist and are used
- Monitor Redis latency for rate limit checks

---

## Test 8.6: Geospatial Query Performance 🗺️

**Target:** p95 < 300ms

### Overview
Tests proximity queries using PostGIS ST_DWithin. Measures how quickly the system can find devices within a radius of an alert.

### Prerequisites
- 10,000 devices seeded in database
- PostgreSQL + PostGIS with GIST indexes
- Alert created at known coordinates

### Seed 10,000 Devices

```sql
-- Create 10,000 test devices distributed across NYC
DO $$
DECLARE
  test_user_id UUID;
  i INTEGER;
  lat DOUBLE PRECISION;
  lon DOUBLE PRECISION;
BEGIN
  -- Get or create test user
  INSERT INTO "User" (id, email, name, "emailVerified", "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid(),
    'geo-test@test.com',
    'Geo Test User',
    false,
    NOW(),
    NOW()
  )
  ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
  RETURNING id INTO test_user_id;
  
  -- Create 10,000 devices
  FOR i IN 1..10000 LOOP
    lat := 40.7128 + (random() - 0.5) * 0.2; -- NYC ±0.1° (~11km)
    lon := -74.0060 + (random() - 0.5) * 0.2;
    
    INSERT INTO "Device" (
      id, user_id, device_uuid, platform, os_version, app_version,
      push_token, gps_latitude, gps_longitude, gps_point, gps_updated_at,
      postal_codes, last_app_open, "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(),
      test_user_id,
      'perf-device-' || i,
      CASE WHEN i % 2 = 0 THEN 'IOS' ELSE 'ANDROID' END,
      '16.0',
      '1.0.0',
      'token' || i || repeat('x', 100),
      lat,
      lon,
      ST_SetSRID(ST_MakePoint(lon, lat), 4326),
      NOW(),
      ARRAY['10001'],
      NOW(),
      NOW(),
      NOW()
    );
    
    IF i % 1000 = 0 THEN
      RAISE NOTICE 'Progress: % devices created', i;
    END IF;
  END LOOP;
  
  RAISE NOTICE '✅ 10,000 devices seeded';
END $$;
```

### Test Procedure

1. **Create test alert:**
   ```sql
   INSERT INTO "Alert" (
     id, creator_id, status, pet_name, pet_species, pet_breed,
     pet_description, pet_color, pet_age_years, pet_photos,
     location_latitude, location_longitude, location_address,
     location_radius_km, last_seen_at, contact_phone, contact_email,
     is_contact_phone_public, "createdAt", "updatedAt", expires_at,
     renewal_count
   ) VALUES (
     gen_random_uuid(),
     (SELECT id FROM "User" WHERE email = 'geo-test@test.com'),
     'ACTIVE',
     'GeoTestPet',
     'DOG',
     'Mixed',
     'Geospatial performance test',
     'Brown',
     2,
     '{}',
     40.7128, -- NYC center
     -74.0060,
     'NYC, New York',
     10, -- 10km radius
     NOW(),
     '+1234567890',
     'geo-test@test.com',
     false,
     NOW(),
     NOW(),
     NOW() + INTERVAL '7 days',
     0
   )
   RETURNING id, location_latitude, location_longitude, location_radius_km;
   ```

2. **Run geospatial query 50 times and measure:**
   ```sql
   -- Enable timing
   \timing on
   
   -- Run query (repeat 50 times)
   SELECT 
     d.id,
     d.device_uuid,
     ST_Distance(
       d.gps_point::geography,
       ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography
     ) / 1000 as distance_km
   FROM "Device" d
   WHERE d.gps_point IS NOT NULL
     AND ST_DWithin(
       d.gps_point::geography,
       ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography,
       10000 -- 10km in meters
     )
   ORDER BY distance_km
   LIMIT 100;
   ```

3. **Check GIST index usage:**
   ```sql
   EXPLAIN ANALYZE
   SELECT 
     d.id,
     d.device_uuid,
     ST_Distance(
       d.gps_point::geography,
       ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography
     ) / 1000 as distance_km
   FROM "Device" d
   WHERE d.gps_point IS NOT NULL
     AND ST_DWithin(
       d.gps_point::geography,
       ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography,
       10000
     )
   ORDER BY distance_km
   LIMIT 100;
   ```

   **Expected:** Should show "Index Scan using Device_gps_point_idx"

### Expected Results
- P50: 50-100ms
- P95: 150-250ms
- P99: 200-300ms
- GIST index usage: 100% of queries

### Performance Factors
- GIST index quality (run VACUUM ANALYZE "Device" periodically)
- Result set size (more devices = longer query)
- Geography casting overhead (::geography conversion)
- ORDER BY distance_km sorting

### Optimization Tips
- Ensure GIST index exists: `CREATE INDEX IF NOT EXISTS "Device_gps_point_idx" ON "Device" USING GIST (gps_point);`
- Run VACUUM ANALYZE regularly to update statistics
- Consider materialized views for frequently-accessed radii
- Use ST_Distance only when needed (ST_DWithin is faster for filtering)

---

## Test 8.7: Notification Targeting Performance 🎯

**Target:** < 5 seconds for 10,000 devices

### Overview
Tests the complete notification targeting pipeline: finding matching devices, creating notification records, and queuing push jobs.

### Prerequisites
- 10,000 devices seeded (from Test 8.6)
- BullMQ/Redis running
- Alert created

### Test Procedure

1. **Create test alert:**
   ```sql
   INSERT INTO "Alert" (
     id, creator_id, status, pet_name, pet_species, pet_breed,
     pet_description, pet_color, pet_age_years, pet_photos,
     location_latitude, location_longitude, location_address,
     location_radius_km, last_seen_at, contact_phone, contact_email,
     is_contact_phone_public, "createdAt", "updatedAt", expires_at,
     renewal_count
   ) VALUES (
     gen_random_uuid(),
     (SELECT id FROM "User" WHERE email = 'geo-test@test.com'),
     'ACTIVE',
     'NotifTestPet',
     'CAT',
     'Siamese',
     'Notification targeting test',
     'White',
     1,
     '{}',
     40.7128,
     -74.0060,
     'NYC, New York',
     10,
     NOW(),
     '+1234567890',
     'notif-test@test.com',
     false,
     NOW(),
     NOW(),
     NOW() + INTERVAL '7 days',
     0
   )
   RETURNING id;
   ```

2. **Time the notification targeting process:**
   ```typescript
   const startTime = performance.now();
   
   // Step 1: Find matching devices
   const step1Start = performance.now();
   const devices = await prisma.$queryRaw`
     SELECT 
       d.id,
       d.device_uuid,
       d.platform,
       d.push_token,
       ST_Distance(
         d.gps_point::geography,
         ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography
       ) / 1000 as distance_km
     FROM "Device" d
     WHERE d.gps_point IS NOT NULL
       AND ST_DWithin(
         d.gps_point::geography,
         ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography,
         10000
       )
   `;
   const step1Time = performance.now() - step1Start;
   console.log(`Step 1: Found ${devices.length} devices in ${step1Time}ms`);
   
   // Step 2: Create notification records
   const step2Start = performance.now();
   const notifications = devices.map(device => ({
     alert_id: alertId,
     device_id: device.id,
     status: 'QUEUED',
     confidence: 'HIGH',
     match_reason: 'GPS_FRESH',
     distance_km: parseFloat(device.distance_km),
     notification_title: `Missing CAT: NotifTestPet`,
     notification_body: 'Notification targeting test',
     excluded: false,
     created_at: new Date(),
     updated_at: new Date(),
   }));
   
   await prisma.notification.createMany({ data: notifications });
   const step2Time = performance.now() - step2Start;
   console.log(`Step 2: Created ${notifications.length} records in ${step2Time}ms`);
   
   const totalTime = performance.now() - startTime;
   console.log(`\nTotal Time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
   console.log(`Target: < 5000ms - ${totalTime < 5000 ? 'PASS' : 'FAIL'}`);
   ```

3. **Monitor BullMQ queue:**
   ```typescript
   // Check queue stats
   const jobCounts = await notificationQueue.getJobCounts();
   console.log('Queue stats:', jobCounts);
   ```

### Expected Results
- Step 1 (Geospatial query): 150-300ms
- Step 2 (createMany): 500-1500ms
- Total time: 1000-3000ms
- Well under 5000ms target

### Performance Factors
- Geospatial query performance (see Test 8.6)
- Bulk insert performance (createMany vs individual inserts)
- Transaction overhead
- BullMQ queue add latency

### Optimization Tips
- Use createMany for bulk inserts (10x faster than individual inserts)
- Batch notification jobs (e.g., 100 devices per job instead of 1-per-device)
- Consider async queueing (don't wait for job add confirmation)
- Monitor Redis memory and connection pool

---

##Performance Test Results Template

```markdown
## Performance Test Results

**Date:** YYYY-MM-DD  
**Tester:** Name  
**Environment:** Development/Staging/Production  
**Database:** PostgreSQL XX.X + PostGIS X.X  
**Device Count:** X,XXX devices  

### Test 8.5: Alert Creation
- **Samples:** 100 alerts
- **P50:** XXXms
- **P95:** XXXms (Target: <500ms)
- **P99:** XXXms
- **Result:** ✅ PASS / ❌ FAIL
- **Notes:** {Any observations}

### Test 8.6: Geospatial Queries
- **Samples:** 50 queries
- **Device Count:** 10,000 devices
- **P50:** XXXms
- **P95:** XXXms (Target: <300ms)
- **P99:** XXXms
- **GIST Index Usage:** YES/NO
- **Result:** ✅ PASS / ❌ FAIL
- **Notes:** {Any observations}

### Test 8.7: Notification Targeting
- **Device Count:** 10,000 devices
- **Devices Matched:** X,XXX
- **Step 1 (Geospatial):** XXXms
- **Step 2 (createMany):** XXXms
- **Total Time:** XXXms (Target: <5000ms)
- **Result:** ✅ PASS / ❌ FAIL
- **Notes:** {Any observations}

### Overall Assessment
- All tests: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
- Production Ready: YES/NO
- Recommendations: {Any optimization suggestions}
```

---

## Troubleshooting

### Slow Alert Creation (>500ms p95)
- **Check:** Prisma query logging - identify slow INSERT
- **Fix:** Verify GIST/GIN indexes exist
- **Fix:** Check Redis latency (rate limiting)
- **Fix:** Increase database connection pool size

### Slow Geospatial Queries (>300ms p95)
- **Check:** EXPLAIN ANALYZE - verify GIST index usage
- **Fix:** Run VACUUM ANALYZE "Device"
- **Fix:** Rebuild GIST index: `REINDEX INDEX CONCURRENTLY "Device_gps_point_idx"`
- **Fix:** Check if too many devices returned (reduce radius or add LIMIT)

### Slow Notification Targeting (>5s)
- **Check:** Step 1 vs Step 2 timing - identify bottleneck
- **Fix Step 1:** Optimize geospatial query (see above)
- **Fix Step 2:** Use createMany instead of individual inserts
- **Fix Step 2:** Batch notifications (reduce insert count)
- **Fix:** Check Redis connection pool size for BullMQ

### Database Connection Pool Exhausted
- **Symptom:** "Cannot get connection from pool" errors
- **Fix:** Increase connection pool: `CONNECTION_POOL_SIZE=20` in .env
- **Fix:** Check for connection leaks (ensure prisma.$disconnect())
- **Fix:** Monitor active connections: `SELECT count(*) FROM pg_stat_activity;`

---

## Production Recommendations

Based on performance test results from staging:

### ✅ If All Tests Pass
- System is production-ready for target load
- Monitor performance metrics in production:
  - Alert creation latency (p95)
  - Geospatial query latency (p95)
  - Notification targeting time
  - Database connection pool usage
  - Redis memory usage

### ⚠️ If Some Tests Fail
- Identify root cause using troubleshooting guide
- Apply optimizations and re-test
- Consider staged rollout with monitoring
- Set up alerting for latency thresholds

### ❌ If Multiple Tests Fail
- Database indexing issues (check GIST/GIN indexes)
- Insufficient resources (CPU, memory, disk)
- Network latency (check database/Redis connections)
- Do NOT deploy to production until fixed

---

## Monitoring & Alerting

### Key Metrics to Monitor
1. **Alert Creation Latency**
   - Target: p95 < 500ms
   - Alert if: p95 > 750ms for 5 minutes

2. **Geospatial Query Latency**
   - Target: p95 < 300ms
   - Alert if: p95 > 500ms for 5 minutes

3. **Notification Targeting Time**
   - Target: < 5s for 10k devices
   - Alert if: > 10s for 3 consecutive alerts

4. **Database Connection Pool**
   - Target: < 80% utilization
   - Alert if: > 90% for 5 minutes

5. **Redis Memory**
   - Target: < 80% of max memory
   - Alert if: > 90% for 5 minutes

### Tools
- **Application:** Sentry for error tracking
- **Infrastructure:** CloudWatch/Datadog for metrics
- **Database:** pg_stat_statements for query analysis
- **Queue:** BullMQ dashboard for job monitoring

---

**Last Updated:** February 6, 2026  
**Status:** Ready for manual execution  
**Next Steps:** Run tests on staging environment with 10k devices
