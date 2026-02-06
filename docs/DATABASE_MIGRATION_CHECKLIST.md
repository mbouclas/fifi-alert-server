# Database Migration Checklist

## Overview

This checklist covers the complete database migration process for FiFi Alert, including initial setup, schema changes, data migrations, and rollback procedures. Follow these steps carefully to ensure zero-downtime deployments and data integrity.

---

## Table of Contents

1. [Pre-Migration Checklist](#pre-migration-checklist)
2. [Initial Database Setup](#initial-database-setup)
3. [Schema Migration Process](#schema-migration-process)
4. [Data Migration Process](#data-migration-process)
5. [Rollback Procedures](#rollback-procedures)
6. [Post-Migration Verification](#post-migration-verification)
7. [Zero-Downtime Migration Strategy](#zero-downtime-migration-strategy)
8. [Troubleshooting](#troubleshooting)

---

## Pre-Migration Checklist

### Before Starting Any Migration

- [ ] **1. Backup Database**
  ```bash
  # PostgreSQL backup
  pg_dump -h <host> -U <user> -d fifi_alert -F c -b -v -f backup_$(date +%Y%m%d_%H%M%S).dump
  
  # Or use managed backup (AWS RDS snapshot, etc.)
  ```

- [ ] **2. Test Migration in Staging Environment**
  - Run migration on staging database first
  - Verify application works with new schema
  - Test rollback procedure

- [ ] **3. Schedule Maintenance Window**
  - Notify users if downtime required
  - Schedule during low-traffic period (e.g., 2-4 AM)
  - Prepare rollback plan with time estimates

- [ ] **4. Review Migration SQL**
  ```bash
  # Generate migration SQL without applying
  bunx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --script
  ```

- [ ] **5. Check Database Disk Space**
  ```sql
  -- Check available disk space
  SELECT pg_size_pretty(pg_database_size('fifi_alert')) AS db_size;
  
  -- Migrations may temporarily double disk usage
  ```

- [ ] **6. Document Current State**
  - Record current schema version
  - Note number of records in each table
  - Capture current performance metrics

---

## Initial Database Setup

### For Fresh Deployment (Production, Staging, etc.)

#### Step 1: Create Database

```bash
# Connect as superuser
psql -h <host> -U postgres

# Create database
CREATE DATABASE fifi_alert;

# Create application user
CREATE USER fifi_app WITH PASSWORD 'secure_password_here';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE fifi_alert TO fifi_app;
```

#### Step 2: Enable PostGIS Extension

```sql
-- Connect to fifi_alert database
\c fifi_alert

-- Enable PostGIS (requires superuser)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology; -- optional

-- Verify installation
SELECT PostGIS_Version();
SELECT PostGIS_Full_Version();
```

#### Step 3: Configure Connection String

```bash
# In .env file
DATABASE_URL="postgresql://fifi_app:secure_password@localhost:5432/fifi_alert?schema=public&connection_limit=10"
```

#### Step 4: Run Initial Migration

```bash
# Deploy all migrations
bunx prisma migrate deploy

# Expected output:
# Applying migration `20260204194228_add_bearer_token_support`
# Applying migration `20260204205052_add_audit_log_table`
# ...
```

#### Step 5: Verify Schema

```bash
# Generate Prisma Client
bunx prisma generate

# Open Prisma Studio to verify
bunx prisma studio
```

#### Step 6: Verify GIST Indexes

```sql
-- Check that PostGIS GIST indexes were created
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexdef LIKE '%GIST%'
ORDER BY tablename;

-- Expected indexes:
-- Alert_location_point_idx
-- Device_gps_point_idx
-- Device_ip_point_idx
-- SavedZone_location_point_idx
-- Sighting_location_point_idx
```

#### Step 7: Run Table Analysis

```sql
-- Update PostgreSQL statistics for query optimizer
ANALYZE "Alert";
ANALYZE "Device";
ANALYZE "SavedZone";
ANALYZE "Sighting";
ANALYZE "Notification";
ANALYZE "User";
```

#### Step 8: Test Sample Query

```sql
-- Test PostGIS functionality
SELECT
  id,
  pet_name,
  ST_AsText(location_point) AS location,
  ST_Distance(
    location_point::geography,
    ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography
  ) / 1000 AS distance_km
FROM "Alert"
WHERE status = 'ACTIVE'
LIMIT 5;
```

---

## Schema Migration Process

### For Schema Changes (Add/Remove/Alter Columns, Tables, etc.)

#### Step 1: Create Migration

```bash
# Development: Create and apply migration
bunx prisma migrate dev --name descriptive_migration_name

# This generates migration file in prisma/migrations/
```

#### Step 2: Review Generated SQL

```bash
# Review migration SQL file
cat prisma/migrations/<timestamp>_descriptive_migration_name/migration.sql

# Check for:
# - Table locks (ALTER TABLE operations)
# - Index creation (may take time on large tables)
# - Data transformations
# - Foreign key constraints
```

#### Step 3: Test Migration in Staging

```bash
# On staging server
git pull origin main
bunx prisma migrate deploy

# Verify application still works
# Run smoke tests
```

#### Step 4: Deploy to Production

```bash
# Option A: Automated deployment
bunx prisma migrate deploy

# Option B: Manual SQL execution (for complex migrations)
psql -h <prod-host> -U fifi_app -d fifi_alert -f prisma/migrations/<timestamp>_name/migration.sql
```

#### Step 5: Monitor Application

```bash
# Watch logs for errors
tail -f logs/error-*.log

# Check database connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'fifi_alert';

# Monitor query performance
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## Data Migration Process

### For Data Transformations (Not Schema Changes)

#### Step 1: Create Migration Script

```typescript
// scripts/migrate-data-<description>.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('Starting data migration...');
  
  // Example: Update all alert statuses
  const result = await prisma.alert.updateMany({
    where: { status: 'DRAFT' },
    data: { status: 'ACTIVE' },
  });
  
  console.log(`Updated ${result.count} alerts`);
}

migrate()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

#### Step 2: Test on Staging Data

```bash
# Run on staging
bun scripts/migrate-data-<description>.ts
```

#### Step 3: Run in Production

```bash
# With transaction support
psql -h <prod-host> -U fifi_app -d fifi_alert <<EOF
BEGIN;

-- Your data migration SQL here
UPDATE "Alert" SET status = 'ACTIVE' WHERE status = 'DRAFT';

-- Verify results
SELECT status, COUNT(*) FROM "Alert" GROUP BY status;

COMMIT;
-- Or ROLLBACK if something looks wrong
EOF
```

---

## Rollback Procedures

### If Migration Fails or Causes Issues

#### Option 1: Prisma Migrate Resolve (Recommended)

```bash
# Mark migration as rolled back
bunx prisma migrate resolve --rolled-back <migration_name>

# Apply previous working migration
bunx prisma migrate deploy
```

#### Option 2: Database Restore from Backup

```bash
# Stop application servers first
pm2 stop all

# Restore from backup
pg_restore -h <host> -U postgres -d fifi_alert -c backup_YYYYMMDD_HHMMSS.dump

# Verify restoration
psql -h <host> -U fifi_app -d fifi_alert -c "SELECT COUNT(*) FROM \"Alert\";"

# Restart application
pm2 start all
```

#### Option 3: Manual Rollback SQL

```sql
-- Example: Revert column addition
BEGIN;

-- Drop the new column
ALTER TABLE "Alert" DROP COLUMN IF EXISTS new_column;

-- Update migration table
DELETE FROM "_prisma_migrations"
WHERE migration_name = '<timestamp>_migration_name';

COMMIT;
```

#### Rollback Checklist

- [ ] Stop application servers (prevent writes to database)
- [ ] Restore database from backup OR run rollback SQL
- [ ] Verify data integrity
- [ ] Deploy previous application version
- [ ] Test critical functionality
- [ ] Restart application servers
- [ ] Monitor logs and metrics
- [ ] Notify team of rollback completion

---

## Post-Migration Verification

### After Every Migration

#### 1. Verify Schema Changes

```bash
# Check migration history
bunx prisma migrate status

# Expected output:
# Database schema is up to date!
```

#### 2. Test Application Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Create test alert
curl -X POST http://localhost:3000/alerts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"petDetails": {...}, "location": {...}}'

# Verify geospatial queries
curl "http://localhost:3000/alerts?lat=40.7128&lon=-74.0060&radiusKm=10"
```

#### 3. Check Database Performance

```sql
-- Check for missing indexes
SELECT
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND tablename IN ('Alert', 'Device', 'Notification')
ORDER BY tablename, attname;

-- Check for slow queries
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%Alert%' OR query LIKE '%Device%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

#### 4. Verify Data Integrity

```sql
-- Check for null values in required fields
SELECT COUNT(*) FROM "Alert" WHERE pet_name IS NULL;
SELECT COUNT(*) FROM "Device" WHERE user_id IS NULL;

-- Check for orphaned records
SELECT COUNT(*) FROM "Sighting" s
LEFT JOIN "Alert" a ON s.alert_id = a.id
WHERE a.id IS NULL;

-- Check PostGIS geometry validity
SELECT id FROM "Alert" WHERE NOT ST_IsValid(location_point);
```

#### 5. Monitor Logs

```bash
# Check for errors in last 10 minutes
cat logs/error-*.log | jq 'select(.timestamp > "'$(date -u -d '10 minutes ago' '+%Y-%m-%d %H:%M:%S')'")' 

# Check for slow queries
cat logs/application-*.log | jq 'select(.duration_ms > 1000)'
```

---

## Zero-Downtime Migration Strategy

### For Production Deployments Without Downtime

#### Approach 1: Backward-Compatible Migrations

**Phase 1: Add New Schema (Backward Compatible)**
```sql
-- Add new column with default value
ALTER TABLE "Alert" ADD COLUMN new_field VARCHAR(255) DEFAULT 'default_value';

-- Deploy application (supports both old and new schema)
```

**Phase 2: Backfill Data**
```typescript
// Background job to populate new field
await prisma.alert.updateMany({
  where: { new_field: 'default_value' },
  data: { new_field: computeNewValue() },
});
```

**Phase 3: Make Required (After Backfill Complete)**
```sql
-- Remove default, make NOT NULL
ALTER TABLE "Alert" ALTER COLUMN new_field DROP DEFAULT;
ALTER TABLE "Alert" ALTER COLUMN new_field SET NOT NULL;
```

**Phase 4: Remove Old Schema (If Applicable)**
```sql
-- After all app instances updated
ALTER TABLE "Alert" DROP COLUMN old_field;
```

#### Approach 2: Blue-Green Deployment

1. **Deploy new version to "green" environment**
2. **Run migrations on green database**
3. **Test green environment thoroughly**
4. **Switch traffic from blue to green**
5. **Keep blue as rollback option for 24 hours**

#### Approach 3: Shadow Database Testing

```bash
# Create shadow database for testing
CREATE DATABASE fifi_alert_shadow;

# Apply migrations to shadow
DATABASE_URL="postgresql://...fifi_alert_shadow" bunx prisma migrate deploy

# Test application against shadow database
# If successful, apply to production
```

---

## Troubleshooting

### Common Migration Issues

#### "Migration already applied"

```bash
# Check migration status
bunx prisma migrate status

# Mark as resolved
bunx prisma migrate resolve --applied <migration_name>
```

#### "Migration failed in the middle"

```bash
# Mark as rolled back
bunx prisma migrate resolve --rolled-back <migration_name>

# Fix the migration SQL
# Re-run migration
bunx prisma migrate deploy
```

#### "PostGIS functions not found"

```sql
-- Ensure PostGIS extension is enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Check extension version
SELECT PostGIS_Version();
```

#### "Lock timeout" or "Deadlock detected"

```sql
-- Check for long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- Terminate blocking query (if safe)
SELECT pg_terminate_backend(<pid>);
```

#### "Disk full" during migration

```bash
# Check disk space
df -h

# Free up space by removing old log files
rm logs/*.log.*.gz

# Or increase disk size (cloud provider)
```

---

## Migration Templates

### Adding a New Column

```sql
-- Migration: Add optional column
ALTER TABLE "Alert" ADD COLUMN notes TEXT;

-- Migration: Add required column with default
ALTER TABLE "Alert" ADD COLUMN priority INTEGER NOT NULL DEFAULT 1;
```

### Adding an Index

```sql
-- Migration: Add B-tree index
CREATE INDEX "Alert_creator_id_status_idx" ON "Alert"("creator_id", "status");

-- Migration: Add GIST index for PostGIS
CREATE INDEX "Alert_location_point_idx" ON "Alert" USING GIST (location_point);

-- Analyze table after index creation
ANALYZE "Alert";
```

### Adding a Table

```sql
-- Migration: Add new table with relations
CREATE TABLE "Feature" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX "Feature_name_idx" ON "Feature"("name");
```

### Renaming a Column (Zero-Downtime)

```sql
-- Phase 1: Add new column
ALTER TABLE "Alert" ADD COLUMN new_name TEXT;

-- Phase 2: Backfill data
UPDATE "Alert" SET new_name = old_name WHERE new_name IS NULL;

-- Phase 3: Make new column NOT NULL
ALTER TABLE "Alert" ALTER COLUMN new_name SET NOT NULL;

-- Phase 4: Deploy application using new column
-- (Deploy happens here)

-- Phase 5: Drop old column (after all instances updated)
ALTER TABLE "Alert" DROP COLUMN old_name;
```

---

## Best Practices

### DO

✅ **Always backup before migrations**  
✅ **Test migrations in staging first**  
✅ **Review generated SQL before deploying**  
✅ **Run ANALYZE after schema changes**  
✅ **Monitor application logs during migration**  
✅ **Keep migrations small and focused**  
✅ **Use transactions when possible**  
✅ **Document complex migrations**

### DON'T

❌ **Don't run migrations in production without testing**  
❌ **Don't skip backups**  
❌ **Don't run long migrations during peak hours**  
❌ **Don't forget to update Prisma Client (`bunx prisma generate`)**  
❌ **Don't mix schema and data migrations**  
❌ **Don't use `migrate reset` in production (destroys data)**

---

## Additional Resources

- **Prisma Migrate Docs:** https://www.prisma.io/docs/orm/prisma-migrate
- **PostgreSQL Backup/Restore:** https://www.postgresql.org/docs/current/backup.html
- **FiFi Alert PostGIS Setup:** [POSTGIS_SETUP.md](./POSTGIS_SETUP.md)
- **FiFi Alert Operational Runbook:** [OPERATIONAL_RUNBOOK.md](./OPERATIONAL_RUNBOOK.md)

---

## Quick Reference

### Essential Commands

```bash
# Check migration status
bunx prisma migrate status

# Deploy pending migrations
bunx prisma migrate deploy

# Create new migration (dev only)
bunx prisma migrate dev --name migration_name

# Mark migration as applied
bunx prisma migrate resolve --applied <migration_name>

# Mark migration as rolled back
bunx prisma migrate resolve --rolled-back <migration_name>

# Generate Prisma Client after schema changes
bunx prisma generate

# Open Prisma Studio for data verification
bunx prisma studio

# Database backup
pg_dump -h <host> -U <user> -d fifi_alert -F c -f backup.dump

# Database restore
pg_restore -h <host> -U <user> -d fifi_alert -c backup.dump
```

---

## Emergency Contacts

- **Database Administrator:** [contact info]
- **DevOps Lead:** [contact info]
- **On-Call Engineer:** [on-call rotation]
- **Cloud Provider Support:** [AWS/GCP/Azure support links]
