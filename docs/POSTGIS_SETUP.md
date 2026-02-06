# PostGIS Setup Guide

## Overview

FiFi Alert uses PostgreSQL with the PostGIS extension for geospatial queries and distance calculations. This guide covers installation, verification, and troubleshooting for both development and production environments.

**PostGIS Version:** 3.0+ recommended  
**PostgreSQL Version:** 14+ recommended

---

## Table of Contents

1. [Development Setup](#development-setup)
2. [Production Setup](#production-setup)
3. [Verification](#verification)
4. [Index Management](#index-management)
5. [Performance Testing](#performance-testing)
6. [Troubleshooting](#troubleshooting)
7. [Common Queries](#common-queries)

---

## Development Setup

### Option 1: Docker (Recommended)

The easiest way to get started is using our Docker Compose setup with PostGIS included:

```bash
# Start PostgreSQL with PostGIS
docker-compose up -d postgres

# Verify PostGIS is available
docker exec -it fifi-postgres psql -U postgres -d fifi_alert -c "SELECT PostGIS_Version();"
```

### Option 2: Local Installation

**On Ubuntu/Debian:**
```bash
# Install PostgreSQL and PostGIS
sudo apt-get update
sudo apt-get install -y postgresql-14 postgresql-14-postgis-3

# Enable PostGIS extension
sudo -u postgres psql -d fifi_alert -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

**On macOS (Homebrew):**
```bash
# Install PostgreSQL and PostGIS
brew install postgresql@14 postgis

# Start PostgreSQL
brew services start postgresql@14

# Enable PostGIS extension
psql -d fifi_alert -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

**On Windows:**
- Download PostgreSQL installer from https://www.postgresql.org/download/windows/
- During installation, select "PostGIS" in Stack Builder
- After installation, enable extension:
  ```sql
  CREATE EXTENSION IF NOT EXISTS postgis;
  ```

---

## Production Setup

### AWS RDS (PostgreSQL)

1. **Create RDS Instance:**
   - Choose PostgreSQL 14 or higher
   - Enable "PostGIS" in the database parameter group
   - Note: PostGIS comes pre-installed on RDS PostgreSQL

2. **Enable PostGIS Extension:**
   ```sql
   -- Connect as master user
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS postgis_topology; -- optional
   ```

3. **Verify Installation:**
   ```sql
   SELECT PostGIS_Version();
   SELECT PostGIS_Full_Version();
   ```

### Google Cloud SQL (PostgreSQL)

1. **Create Cloud SQL Instance:**
   - Choose PostgreSQL 14 or higher
   - PostGIS is pre-installed

2. **Enable PostGIS Extension:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

### Azure Database for PostgreSQL

1. **Create Azure PostgreSQL Server:**
   - Choose version 14 or higher

2. **Enable PostGIS Extension:**
   ```sql
   -- Azure requires explicit allowlisting
   -- In Azure Portal: Server parameters → azure.extensions → Add "postgis"
   
   -- Then enable in database
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

### DigitalOcean Managed PostgreSQL

1. **Create Managed Database:**
   - Choose PostgreSQL 14+

2. **Enable PostGIS:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

---

## Verification

### Check PostGIS Installation

```sql
-- Check PostGIS version
SELECT PostGIS_Version();
-- Expected: "3.3 USE_GEOS=1 USE_PROJ=1 USE_STATS=1"

-- Check full version details
SELECT PostGIS_Full_Version();

-- List installed extensions
SELECT * FROM pg_extension WHERE extname = 'postgis';

-- Verify geometry types available
SELECT typname FROM pg_type WHERE typname = 'geometry';
```

### Test Basic Geometry Operations

```sql
-- Create a test point (NYC coordinates)
SELECT ST_AsText(ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326));
-- Expected: "POINT(-74.006 40.7128)"

-- Calculate distance between two points (in meters)
SELECT ST_Distance(
  ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography,
  ST_SetSRID(ST_MakePoint(-73.9352, 40.7306), 4326)::geography
) / 1000 AS distance_km;
-- Expected: ~6.3 km

-- Test ST_DWithin (used for proximity queries)
SELECT ST_DWithin(
  ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography,
  ST_SetSRID(ST_MakePoint(-73.9352, 40.7306), 4326)::geography,
  10000 -- 10km radius in meters
);
-- Expected: true
```

---

## Index Management

### Verify GIST Indexes

After running Prisma migrations, verify that GIST indexes are created on all geometry columns:

```sql
-- List all GIST indexes in the database
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexdef LIKE '%GIST%'
ORDER BY tablename, indexname;
```

**Expected Indexes (from Prisma schema):**
- `Alert.location_point` → `Alert_location_point_idx`
- `Device.gps_point` → `Device_gps_point_idx`
- `Device.ip_point` → `Device_ip_point_idx`
- `SavedZone.location_point` → `SavedZone_location_point_idx`
- `Sighting.location_point` → `Sighting_location_point_idx`

### Check Index Usage

```sql
-- Check if indexes are being used (run after some queries)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE indexname LIKE '%location_point%'
ORDER BY idx_scan DESC;
```

### Manually Create GIST Index (if missing)

```sql
-- Example: Create GIST index on Alert.location_point
CREATE INDEX IF NOT EXISTS "Alert_location_point_idx"
ON "Alert" USING GIST (location_point);

-- Analyze table to update statistics
ANALYZE "Alert";
```

---

## Performance Testing

### Test Geospatial Query Performance

```sql
-- Test proximity query with EXPLAIN ANALYZE
EXPLAIN ANALYZE
SELECT
  id,
  pet_name,
  ST_Distance(
    location_point::geography,
    ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography
  ) / 1000 AS distance_km
FROM "Alert"
WHERE status = 'ACTIVE'
  AND ST_DWithin(
    location_point::geography,
    ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography,
    10000 -- 10km radius in meters
  )
ORDER BY distance_km
LIMIT 50;
```

**What to Look For:**
- ✅ **"Index Scan using Alert_location_point_idx"** - GIST index is being used
- ✅ **Execution time < 100ms** for 10,000 alerts
- ❌ **"Seq Scan"** - Missing or unused index (bad performance)

### Benchmark Distance Calculations

```sql
-- Test with 1,000 alerts
SELECT COUNT(*)
FROM "Alert"
WHERE ST_DWithin(
  location_point::geography,
  ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography,
  10000
);

-- Should complete in < 50ms with GIST index
```

### Query Optimization Tips

1. **Always cast to `geography` for accurate distance calculations:**
   ```sql
   -- Good: Accurate distances in meters
   ST_Distance(point1::geography, point2::geography)
   
   -- Bad: Inaccurate (degrees, not meters)
   ST_Distance(point1, point2)
   ```

2. **Use `ST_DWithin` instead of `ST_Distance` for proximity filtering:**
   ```sql
   -- Good: Uses spatial index efficiently
   WHERE ST_DWithin(point1::geography, point2::geography, 10000)
   
   -- Bad: Forces full table scan
   WHERE ST_Distance(point1::geography, point2::geography) < 10000
   ```

3. **Specify SRID 4326 for WGS84 coordinates:**
   ```sql
   ST_SetSRID(ST_MakePoint(lon, lat), 4326)
   ```

---

## Troubleshooting

### Error: "type 'geometry' does not exist"

**Cause:** PostGIS extension not enabled.

**Solution:**
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

If you get permission errors, connect as a superuser or database owner.

---

### Error: "cannot cast type geometry to geography"

**Cause:** Missing explicit cast.

**Solution:**
```sql
-- Add ::geography cast
SELECT ST_Distance(location_point::geography, other_point::geography);
```

---

### Error: "Geometry SRID (0) does not match column SRID (4326)"

**Cause:** Geometry created without SRID.

**Solution:**
```sql
-- Always specify SRID when creating points
ST_SetSRID(ST_MakePoint(lon, lat), 4326)
```

---

### Slow Queries (Seq Scan instead of Index Scan)

**Cause:** GIST index missing or not being used.

**Diagnosis:**
```sql
EXPLAIN ANALYZE
SELECT * FROM "Alert"
WHERE ST_DWithin(location_point::geography, ST_MakePoint(-74, 40)::geography, 10000);
```

**Solutions:**

1. **Ensure GIST index exists:**
   ```sql
   CREATE INDEX IF NOT EXISTS "Alert_location_point_idx"
   ON "Alert" USING GIST (location_point);
   ```

2. **Update table statistics:**
   ```sql
   ANALYZE "Alert";
   ```

3. **Check if index is valid:**
   ```sql
   SELECT indexname, indexdef
   FROM pg_indexes
   WHERE tablename = 'Alert' AND indexname LIKE '%location%';
   ```

4. **If index exists but not used, check query casting:**
   - Ensure you're using `::geography` cast
   - Ensure you're using `ST_DWithin` (not `ST_Distance` in WHERE clause)

---

### "Out of memory" during large distance calculations

**Cause:** Calculating distances for too many points at once.

**Solution:**
- Use pagination (LIMIT/OFFSET)
- Filter by bounding box first:
  ```sql
  WHERE ST_DWithin(location_point::geography, center_point::geography, radius)
  LIMIT 100;
  ```

---

### Incorrect distances (in degrees instead of meters)

**Cause:** Missing `::geography` cast.

**Solution:**
```sql
-- Wrong: Returns degrees
SELECT ST_Distance(point1, point2);

-- Correct: Returns meters
SELECT ST_Distance(point1::geography, point2::geography);
```

---

## Common Queries

### Find Devices Within Radius of Alert

```sql
-- Find all devices within 10km of an alert
SELECT
  d.id,
  d.device_uuid,
  ST_Distance(
    d.gps_point::geography,
    a.location_point::geography
  ) / 1000 AS distance_km
FROM "Device" d
CROSS JOIN "Alert" a
WHERE a.id = 'alert-123'
  AND d.gps_point IS NOT NULL
  AND ST_DWithin(
    d.gps_point::geography,
    a.location_point::geography,
    10000 -- 10km in meters
  )
ORDER BY distance_km
LIMIT 100;
```

### Find Saved Zones Overlapping Alert

```sql
-- Find saved zones within alert radius + zone radius
SELECT
  sz.id,
  sz.name,
  sz.device_id,
  ST_Distance(
    sz.location_point::geography,
    a.location_point::geography
  ) / 1000 AS distance_km
FROM "SavedZone" sz
CROSS JOIN "Alert" a
WHERE a.id = 'alert-123'
  AND sz.is_active = true
  AND ST_DWithin(
    sz.location_point::geography,
    a.location_point::geography,
    (a.radius_km + sz.radius_km) * 1000 -- Combined radii in meters
  )
ORDER BY distance_km;
```

### Find Nearest Alerts to a Location

```sql
-- Find 10 nearest active alerts to a point
SELECT
  id,
  pet_name,
  species,
  ST_Distance(
    location_point::geography,
    ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography
  ) / 1000 AS distance_km
FROM "Alert"
WHERE status = 'ACTIVE'
ORDER BY location_point <-> ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geometry
LIMIT 10;
```

### Calculate Bounding Box for Map Display

```sql
-- Get bounding box for all active alerts
SELECT
  ST_XMin(extent) AS min_lon,
  ST_YMin(extent) AS min_lat,
  ST_XMax(extent) AS max_lon,
  ST_YMax(extent) AS max_lat
FROM (
  SELECT ST_Extent(location_point) AS extent
  FROM "Alert"
  WHERE status = 'ACTIVE'
) AS bounds;
```

---

## Migration Checklist

When deploying to production:

- [ ] **1. Enable PostGIS extension:**
  ```sql
  CREATE EXTENSION IF NOT EXISTS postgis;
  ```

- [ ] **2. Run Prisma migrations:**
  ```bash
  bunx prisma migrate deploy
  ```

- [ ] **3. Verify GIST indexes created:**
  ```sql
  SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%GIST%';
  ```

- [ ] **4. Test sample geospatial query:**
  ```sql
  SELECT PostGIS_Version();
  SELECT ST_AsText(ST_MakePoint(-74, 40));
  ```

- [ ] **5. Run ANALYZE on all tables:**
  ```sql
  ANALYZE "Alert";
  ANALYZE "Device";
  ANALYZE "SavedZone";
  ANALYZE "Sighting";
  ```

- [ ] **6. Test proximity query performance:**
  ```sql
  EXPLAIN ANALYZE
  SELECT COUNT(*) FROM "Alert"
  WHERE ST_DWithin(location_point::geography, ST_MakePoint(-74, 40)::geography, 10000);
  ```
  - Target: < 100ms execution time

- [ ] **7. Configure connection pooling:**
  - Set `DATABASE_POOL_SIZE` in .env (recommended: 10-20 for production)

- [ ] **8. Enable query logging (temporarily) to monitor slow queries:**
  ```sql
  -- In postgresql.conf or RDS parameter group
  log_min_duration_statement = 1000  -- Log queries > 1s
  ```

---

## Additional Resources

- **PostGIS Documentation:** https://postgis.net/documentation/
- **PostGIS Performance Tuning:** https://postgis.net/workshops/postgis-intro/tuning.html
- **Prisma PostGIS Guide:** https://www.prisma.io/docs/orm/prisma-schema/data-model/unsupported-types
- **FiFi Alert System Behavior Spec:** [SYSTEM_BEHAVIOR_SPEC.md](./SYSTEM_BEHAVIOR_SPEC.md)

---

## Support

If you encounter issues with PostGIS setup:

1. Check PostgreSQL logs for errors
2. Verify PostGIS version: `SELECT PostGIS_Version();`
3. Verify GIST indexes exist: `SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%GIST%';`
4. Run EXPLAIN ANALYZE on slow queries
5. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues

For production database issues, consult your DBA or cloud provider support.
