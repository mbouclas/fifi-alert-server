# Alert Zones Performance Test Results

**Date:** 2026-02-07  
**Tester:** Automated Performance Script  
**Script:** `scripts/test-alert-zone-performance.ts`

---

## Executive Summary

Performance testing reveals that PostGIS GIST spatial indexing works **perfectly for small datasets** (<500 zones), but PostgreSQL's query planner **abandons the index for larger datasets**, causing significant performance degradation.

---

## Test Environment

- **Database:** PostgreSQL 14+ with PostGIS extension
- **Index:** `alert_zone_gist_idx` (GIST index on `location_point` geometry column)
- **Query:** Three-way JOIN between `alert_zone`, `user`, and `device` tables
- **Location:** San Francisco (37.7749, -122.4194)
- **Alert Radius:** 1km

---

## Test Results

| Test | Total Zones | Query Time | Matches Found | GIST Index Used | Pass/Fail |
|------|-------------|------------|---------------|-----------------|-----------|
| **Baseline** | 515 | **24.42ms** | 500 | ✅ YES | ✅ **PASS** |
| **100 users × 5 zones** | 1,015 | **30.38ms** | 1,000 | ❌ NO | ⚠️ **PARTIAL** |
| **1000 users × 5 zones** | 5,515 | **701.87ms** | 5,500 | ❌ NO | ❌ **FAIL** |

**Performance Target:** <50ms query time with GIST index usage

---

## Detailed Findings

### ✅ Test 1: Baseline (515 zones)
- **Query Time:** 24.42ms
- **GIST Index Used:** ✅ YES
- **Status:** **PASS** - Meets <50ms target
- **Analysis:** Ideal performance with spatial index. This represents a typical production scenario with moderate data.

### ⚠️ Test 2: 100 users × 5 zones (1,015 zones)
- **Query Time:** 30.38ms
- **GIST Index Used:** ❌ NO
- **Status:** **PARTIAL PASS** - Query time still acceptable, but index not used
- **Analysis:** Query planner switched from index scan to sequential scan. Still meeting performance target due to small dataset, but concerning trend.

### ❌ Test 3: 1000 users × 5 zones (5,515 zones)
- **Query Time:** 701.87ms
- **GIST Index Used:** ❌ NO
- **Status:** **FAIL** - 14x slower than target
- **Analysis:** Query planner chose sequential scan over GIST index. This is unacceptable for production.

---

## Root Cause Analysis

### Why the GIST Index Isn't Used

PostgreSQL's query planner uses **cost-based optimization**. For larger datasets, the planner estimates that:

1. **Sequential Scan + Hash Join** is cheaper than **Index Scan** when:
   - A large percentage of rows will match (in our tests, nearly ALL zones matched)
   - Multiple tables need to be joined (`alert_zone` → `user` → `device`)
   - Join columns lack proper indexes

2. **Missing indexes on join columns:**
   - `user.id` - likely has primary key index ✅
   - `device.user_id` - may lack index ❌
   - `alert_zone.user_id` - has index (`alert_zone_user_id_idx`) ✅

3. **Table statistics may be outdated:**
   - PostgreSQL estimates costs based on `pg_stats`
   - Need to run `ANALYZE` on `alert_zone`, `user`, and `device` tables

---

## Recommendations

### 🔥 Priority 1: Immediate Actions

#### 1. Update Table Statistics
```sql
ANALYZE alert_zone;
ANALYZE "user";
ANALYZE device;
```

#### 2. Add Missing Index on device.user_id
```sql
-- Check if index exists
SELECT indexname FROM pg_indexes 
WHERE tablename = 'device' AND indexdef LIKE '%user_id%';

-- Create if missing
CREATE INDEX IF NOT EXISTS device_user_id_idx ON device(user_id);
```

#### 3. Verify GIST Index Creation
```sql
-- Confirm GIST index exists and is healthy
SELECT 
  indexname, 
  indexdef,
  pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_indexes 
WHERE tablename = 'alert_zone' 
  AND indexdef LIKE '%gist%';
```

---

### 📊 Priority 2: Query Optimization

#### Option A: Force Index Usage (Testing Only)
```sql
-- Temporarily reduce random_page_cost to favor index scans
SET random_page_cost = 1.1;

-- Then run your query
-- WARNING: Do NOT set this globally without testing!
```

#### Option B: Rewrite Query to Narrow Scope
Instead of joining `device` in the main query, filter devices first:

```typescript
// Current approach (joins all devices)
const matches = await prisma.$queryRaw`
  SELECT d.id, d.user_id, az.id as zone_id
  FROM alert_zone az
  INNER JOIN "user" u ON az.user_id = u.id
  INNER JOIN device d ON d.user_id = u.id
  WHERE ST_DWithin(az.location_point::geography, ..., radius)
`;

// Optimized approach (filter devices first)
const nearbyZones = await prisma.$queryRaw`
  SELECT az.id, az.user_id
  FROM alert_zone az
  WHERE az.is_active = true
    AND ST_DWithin(az.location_point::geography, ..., radius)
`;

// Then join with devices in application logic or separate query
```

#### Option C: Covering Index
Create a composite index that includes all queried columns:

```sql
-- WARNING: Test impact on write performance!
CREATE INDEX alert_zone_covering_idx ON alert_zone 
  USING GIST (location_point) 
  INCLUDE (id, user_id, name, radius_meters, priority, is_active);
```

---

### 🚀 Priority 3: Caching Strategy

Given the poor performance at scale, implement **Redis caching**:

#### Cache Active Alert Zones per User
```typescript
// Cache Key: `user:{userId}:alert-zones`
// TTL: 5 minutes
// Invalidate on: CREATE, UPDATE, DELETE alert zones

async findAlertZoneMatches(alertLat: number, alertLon: number, radiusKm: number) {
  // 1. Fetch all active zones from cache
  const activeZones = await this.getActiveZonesFromCache(); // Redis GET or DB query
  
  // 2. Filter by distance in-memory (fast)
  const matches = activeZones.filter(zone => {
    const distance = calculateDistance(alertLat, alertLon, zone.lat, zone.lon);
    return distance <= (zone.radius_meters + radiusKm * 1000);
  });
  
  // 3. Fetch user/device info for matched zones
  const deviceIds = await this.getDevicesForZones(matches);
  
  return deviceIds;
}
```

**Pros:**
- ✅ Eliminates complex DB query for hot path (alert creation)
- ✅ Sub-millisecond latency for cache hits
- ✅ Scales horizontally with Redis cluster

**Cons:**
- ❌ Stale data for up to 5 minutes
- ❌ Increased complexity (cache invalidation)
- ❌ Additional infrastructure (Redis)

---

## Next Steps

1. **Immediate (Task 10.1 completion):**
   - [x] Run performance script and document findings ✅
   - [ ] Run `ANALYZE` on all three tables
   - [ ] Verify/create `device(user_id)` index
   - [ ] Re-run performance tests

2. **Short-term (Task 10.2):**
   - [ ] Implement Redis caching for alert zone matching
   - [ ] Add cache warming on server startup
   - [ ] Monitor cache hit rate in production

3. **Long-term (Phase 11+):**
   - [ ] Monitor query performance in production with real data patterns
   - [ ] Consider partitioning `alert_zone` table by geographic region
   - [ ] Explore materialized views for common queries

---

## Production Monitoring Queries

### Check Index Usage
```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'alert_zone'
ORDER BY idx_scan DESC;
```

### Check Table Statistics
```sql
SELECT 
  relname AS table_name,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE relname IN ('alert_zone', 'user', 'device');
```

### Monitor Query Performance
```sql
SELECT 
  query,
  mean_exec_time,
  calls,
  total_exec_time
FROM pg_stat_statements
WHERE query LIKE '%alert_zone%'
  AND query LIKE '%ST_DWithin%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## Conclusion

The Alert Zones feature works correctly, but **requires optimization before production deployment** at scale. The GIST index performs excellently for small datasets but is abandoned by the query planner for larger ones. 

**Immediate action required:** Update table statistics and verify join indexes. **Recommended:** Implement Redis caching for production.

---

**Generated by:** `scripts/test-alert-zone-performance.ts`  
**Last Updated:** 2026-02-07
