# Deployment Runbook

## Overview

This runbook provides step-by-step procedures for deploying the FiFi Alert backend to staging and production environments. It covers pre-deployment checks, deployment steps, verification procedures, rollback instructions, and incident response.

**Target Environments:**
- **Staging:** Pre-production testing environment
- **Production:** Live environment serving end users

**Deployment Strategy:** Blue-green deployment with zero downtime

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Preparation](#environment-preparation)
3. [Database Migration](#database-migration)
4. [Application Deployment](#application-deployment)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Rollback Procedures](#rollback-procedures)
7. [Monitoring & Alerts](#monitoring--alerts)
8. [Incident Response](#incident-response)
9. [Common Issues](#common-issues)

---

## Pre-Deployment Checklist

### 1. Code Review & Testing

- [ ] All tests passing in CI/CD pipeline
  ```bash
  bun test
  bun test:e2e
  ```
- [ ] Code reviewed and approved (minimum 1 approver)
- [ ] No critical or high-severity security vulnerabilities
- [ ] Test coverage ≥ 80% for new code
- [ ] Staging deployment successful (staging → production only)

### 2. Database Preparation

- [ ] Database migrations reviewed and tested in staging
- [ ] Backup created (automated or manual)
  ```bash
  # PostgreSQL backup
  pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -b -v -f backup_$(date +%Y%m%d_%H%M%S).dump
  ```
- [ ] Migration is backward-compatible (for zero-downtime)
- [ ] Rollback SQL script prepared (if needed)

### 3. Infrastructure Checks

- [ ] Redis instance healthy and available
  ```bash
  redis-cli -u $REDIS_URL ping
  # Expected: PONG
  ```
- [ ] PostgreSQL instance healthy
  ```bash
  psql $DATABASE_URL -c "SELECT 1;"
  # Expected: 1 row
  ```
- [ ] PostGIS extension enabled
  ```bash
  psql $DATABASE_URL -c "SELECT PostGIS_Version();"
  ```
- [ ] Disk space sufficient (≥ 20% free)
- [ ] SSL/TLS certificates valid (≥ 30 days until expiry)

### 4. Environment Variables

- [ ] All required env vars set in deployment environment
  ```bash
  # Verify critical variables
  printenv | grep -E "DATABASE_URL|REDIS_URL|JWT_SECRET|APNS_PRODUCTION"
  ```
- [ ] Secrets rotated (if scheduled)
- [ ] `APNS_PRODUCTION=true` for production (CRITICAL)
- [ ] `SWAGGER_ENABLED=false` for production (CRITICAL)

### 5. Stakeholder Communication

- [ ] Maintenance window scheduled (if downtime expected)
- [ ] Stakeholders notified (email, Slack, status page)
- [ ] On-call engineer identified and available
- [ ] Rollback window planned (typically 2 hours)

---

## Environment Preparation

### Staging Deployment

**Purpose:** Validate deployment process before production

**Steps:**

1. **Pull latest code:**
   ```bash
   cd /var/www/fifi-alert-staging
   git fetch origin
   git checkout staging
   git pull origin staging
   ```

2. **Install dependencies:**
   ```bash
   bun install --frozen-lockfile
   ```

3. **Build application:**
   ```bash
   bun run build
   ```

4. **Verify build:**
   ```bash
   ls -lh dist/
   # Should contain compiled .js files
   ```

---

### Production Deployment

**Purpose:** Deploy to live environment

**Steps:**

1. **Pull latest code:**
   ```bash
   cd /var/www/fifi-alert-production
   git fetch origin
   git checkout main
   git pull origin main
   
   # Tag release
   git tag -a v1.2.3 -m "Release v1.2.3 - Feature XYZ"
   git push origin v1.2.3
   ```

2. **Install dependencies:**
   ```bash
   bun install --frozen-lockfile
   ```

3. **Build application:**
   ```bash
   bun run build
   ```

---

## Database Migration

### Strategy 1: Standard Migration (Brief Downtime)

**Use when:** Schema changes are not backward-compatible

**Steps:**

1. **Stop application servers:**
   ```bash
   pm2 stop fifi-alert
   ```

2. **Create database backup:**
   ```bash
   pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -b -v -f backup_pre_migration_$(date +%Y%m%d_%H%M%S).dump
   ```

3. **Run migrations:**
   ```bash
   bunx prisma migrate deploy
   ```

4. **Verify migration:**
   ```bash
   bunx prisma migrate status
   # Expected: All migrations applied
   ```

5. **Generate Prisma Client:**
   ```bash
   bunx prisma generate
   ```

6. **Restart application:**
   ```bash
   pm2 start fifi-alert
   ```

**Downtime:** 2-5 minutes

---

### Strategy 2: Zero-Downtime Migration (Blue-Green)

**Use when:** Schema changes are backward-compatible

**4-Phase Approach:**

#### Phase 1: Add New Columns (Nullable)

```sql
-- Example: Add new_email column
ALTER TABLE "User" ADD COLUMN new_email VARCHAR(255);
```

Deploy application (old code still works with new schema).

#### Phase 2: Backfill Data

```typescript
// data-migration.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillNewEmail() {
  await prisma.$executeRaw`
    UPDATE "User"
    SET new_email = email
    WHERE new_email IS NULL;
  `;
}

backfillNewEmail().then(() => process.exit(0));
```

Run migration script:
```bash
bunx ts-node scripts/data-migration.ts
```

#### Phase 3: Make Column Non-Nullable

```sql
ALTER TABLE "User" ALTER COLUMN new_email SET NOT NULL;
```

Deploy new application code (uses `new_email` instead of `email`).

#### Phase 4: Drop Old Column

```sql
ALTER TABLE "User" DROP COLUMN email;
ALTER TABLE "User" RENAME COLUMN new_email TO email;
```

**Downtime:** None (all phases deployed independently)

---

### Migration Verification

```bash
# Check migration status
bunx prisma migrate status

# Verify table structure
psql $DATABASE_URL -c "\d \"User\""

# Verify GIST indexes
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%GIST%';"

# Expected indexes:
# - Alert_location_point_idx
# - Device_gps_point_idx
# - Device_ip_point_idx
# - SavedZone_location_point_idx
```

---

## Application Deployment

### Using PM2 (Process Manager)

#### Initial Setup

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start ecosystem.config.cjs --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

#### Standard Deployment

```bash
# 1. Pull latest code
cd /var/www/fifi-alert-production
git pull origin main

# 2. Install dependencies
bun install --frozen-lockfile

# 3. Build application
bun run build

# 4. Generate Prisma Client
bunx prisma generate

# 5. Restart application (zero-downtime)
pm2 reload fifi-alert

# 6. Verify status
pm2 status
pm2 logs fifi-alert --lines 50
```

---

### Using Docker (Alternative)

#### Build Docker Image

```dockerfile
# Dockerfile
FROM oven/bun:1.0

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
RUN bunx prisma generate
RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "start:prod"]
```

#### Deploy with Docker Compose

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  fifi-alert:
    image: fifi-alert:v1.2.3
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env.production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

#### Blue-Green Deployment

```bash
# 1. Build new image
docker build -t fifi-alert:v1.2.3 .

# 2. Start new container (green)
docker-compose -f docker-compose.prod.yml up -d --scale fifi-alert=2

# 3. Wait for health check
sleep 30
curl http://localhost:3001/health

# 4. Update load balancer to point to new container

# 5. Stop old container (blue)
docker stop fifi-alert-old

# 6. Remove old container after 1 hour (safety window)
sleep 3600
docker rm fifi-alert-old
```

---

## Post-Deployment Verification

### 1. Health Check

```bash
# Check application health
curl http://localhost:3000/health

# Expected response:
{
  "status": "healthy",
  "uptime": 123,
  "database": "connected",
  "redis": "connected",
  "disk": { "free": "45.2 GB", "total": "100 GB" }
}
```

### 2. Critical Endpoint Tests

```bash
# Test authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123"}'

# Test alert creation (requires auth token)
curl -X POST http://localhost:3000/api/alerts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "petDetails": { "name": "Test", "species": "DOG" },
    "location": { "lat": 40.7128, "lon": -74.0060, "radiusKm": 10 }
  }'

# Test device registration
curl -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "IOS",
    "osVersion": "17.2",
    "appVersion": "1.0.0",
    "pushToken": "test-token"
  }'
```

### 3. Database Connectivity

```bash
# Verify PostgreSQL connection
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"User\";"

# Verify PostGIS
psql $DATABASE_URL -c "SELECT PostGIS_Version();"

# Check recent alerts
psql $DATABASE_URL -c "SELECT id, status, created_at FROM \"Alert\" ORDER BY created_at DESC LIMIT 5;"
```

### 4. Redis Connectivity

```bash
# Verify Redis connection
redis-cli -u $REDIS_URL ping

# Check queue depth
redis-cli -u $REDIS_URL LLEN bull:notification-queue:wait

# Check recent jobs
redis-cli -u $REDIS_URL LRANGE bull:notification-queue:completed 0 10
```

### 5. Log Analysis

```bash
# Check for errors in last 100 lines
pm2 logs fifi-alert --lines 100 --err

# Monitor logs in real-time
pm2 logs fifi-alert --lines 0

# Check application logs
tail -f logs/application-*.log | grep ERROR

# Check error logs
tail -f logs/error-*.log
```

### 6. Monitoring Metrics

**Key Metrics to Monitor (First 30 Minutes):**

| Metric | Target | Action if Outside Range |
|--------|--------|-------------------------|
| Response Time (p95) | < 500ms | Investigate slow queries |
| Error Rate | < 1% | Check logs for errors |
| CPU Usage | < 70% | Check for CPU-intensive tasks |
| Memory Usage | < 80% | Check for memory leaks |
| Database Connections | < 80% of pool | Check connection leaks |
| Redis Queue Depth | < 1000 jobs | Check worker processing |

---

## Rollback Procedures

### When to Rollback

- Critical bugs discovered (data loss, security breach)
- Error rate > 5% after deployment
- Database migration failure
- Performance degradation (p95 > 2x baseline)
- External service failures (FCM/APNs down)

---

### Rollback Option 1: Code Rollback (No Schema Changes)

**Use when:** No database schema changes

**Steps:**

1. **Stop current application:**
   ```bash
   pm2 stop fifi-alert
   ```

2. **Checkout previous version:**
   ```bash
   git checkout v1.2.2  # Previous stable version
   ```

3. **Rebuild application:**
   ```bash
   bun install --frozen-lockfile
   bun run build
   bunx prisma generate
   ```

4. **Restart application:**
   ```bash
   pm2 start fifi-alert
   ```

5. **Verify health:**
   ```bash
   curl http://localhost:3000/health
   pm2 logs fifi-alert --lines 50
   ```

**Downtime:** 2-5 minutes

---

### Rollback Option 2: Database Rollback (Schema Changes)

**Use when:** Database schema was modified

**Steps:**

1. **Stop application:**
   ```bash
   pm2 stop fifi-alert
   ```

2. **Restore database backup:**
   ```bash
   # Drop and recreate database
   psql $DATABASE_URL -c "DROP SCHEMA public CASCADE;"
   psql $DATABASE_URL -c "CREATE SCHEMA public;"
   psql $DATABASE_URL -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
   
   # Restore from backup
   pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME -v backup_pre_migration_20260205_120000.dump
   ```

3. **Rollback code:**
   ```bash
   git checkout v1.2.2
   bun install --frozen-lockfile
   bun run build
   bunx prisma generate
   ```

4. **Restart application:**
   ```bash
   pm2 start fifi-alert
   ```

**Downtime:** 5-15 minutes (depending on database size)

---

### Rollback Option 3: Prisma Migrate Resolve

**Use when:** Migration partially failed

**Steps:**

1. **Mark migration as rolled back:**
   ```bash
   bunx prisma migrate resolve --rolled-back "20260205_migration_name"
   ```

2. **Apply previous migrations:**
   ```bash
   bunx prisma migrate deploy
   ```

3. **Verify migration status:**
   ```bash
   bunx prisma migrate status
   ```

---

## Monitoring & Alerts

### Application Monitoring

**Tools:**
- **Sentry:** Error tracking and alerting
- **CloudWatch / Datadog:** Metrics and dashboards
- **PM2 Plus:** Process monitoring

**Critical Alerts:**

| Alert | Threshold | Severity | Action |
|-------|-----------|----------|--------|
| Error Rate | > 5% | Critical | Immediate rollback |
| Response Time | p95 > 2s | High | Investigate performance |
| Memory Usage | > 90% | High | Restart application |
| Database Connections | > 90% | Critical | Check connection leaks |
| Redis Queue Depth | > 5000 | High | Scale workers |
| Disk Space | < 10% free | Critical | Clear logs, scale storage |

---

### Log Monitoring

**Log Levels:**
- **Production:** `info` (warnings and errors only)
- **Staging:** `debug` (all logs)

**Key Log Patterns to Monitor:**

```bash
# Database connection errors
grep "Could not connect to database" logs/error-*.log

# Redis connection errors
grep "Redis connection failed" logs/error-*.log

# Push notification failures
grep "Notification failed" logs/application-*.log

# Rate limit violations
grep "Rate limit exceeded" logs/application-*.log
```

---

### Database Monitoring

**Queries to Monitor:**

```sql
-- Active connections
SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active';

-- Long-running queries (> 10s)
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '10 seconds';

-- Table sizes
SELECT 
  schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- Index usage
SELECT 
  schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexname LIKE '%idx';
```

---

## Incident Response

### Severity Levels

**P0 - Critical (Production Down):**
- Complete service outage
- Database unavailable
- Security breach
- **Response Time:** Immediate
- **Resolution Time:** < 1 hour

**P1 - High (Degraded Service):**
- Error rate > 10%
- Performance degradation (p95 > 5s)
- Push notifications failing
- **Response Time:** < 15 minutes
- **Resolution Time:** < 4 hours

**P2 - Medium (Partial Outage):**
- Non-critical feature broken
- Error rate 5-10%
- **Response Time:** < 1 hour
- **Resolution Time:** < 24 hours

**P3 - Low (Minor Issue):**
- UI glitches
- Non-critical bugs
- **Response Time:** < 24 hours
- **Resolution Time:** < 1 week

---

### Incident Response Workflow

1. **Acknowledge Incident:**
   - Update status page
   - Notify stakeholders

2. **Assess Severity:**
   - Check error rates, response times
   - Determine impact (users affected)

3. **Mitigate:**
   - Rollback if critical (P0/P1)
   - Apply hotfix if minor (P2/P3)

4. **Investigate:**
   - Check logs, metrics, database
   - Identify root cause

5. **Resolve:**
   - Deploy fix
   - Verify resolution

6. **Post-Mortem:**
   - Document incident
   - Identify preventive measures
   - Update runbook

---

## Common Issues

### Issue 1: Database Connection Errors

**Symptoms:**
- Logs: `Could not connect to database`
- Health check failing

**Diagnosis:**
```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# Check connection pool
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'fifi_alert_prod';"
```

**Solutions:**
1. Verify `DATABASE_URL` is correct
2. Check database is running: `pg_isready -h $DB_HOST`
3. Increase connection pool size: `DATABASE_POOL_SIZE=20`
4. Restart application: `pm2 restart fifi-alert`

---

### Issue 2: Redis Connection Timeout

**Symptoms:**
- Logs: `Redis connection timeout`
- Notifications not sending

**Diagnosis:**
```bash
# Test Redis connection
redis-cli -u $REDIS_URL ping

# Check Redis memory
redis-cli -u $REDIS_URL INFO memory
```

**Solutions:**
1. Verify `REDIS_URL` is correct
2. Check Redis is running
3. Clear Redis cache: `redis-cli -u $REDIS_URL FLUSHALL` (CAUTION)
4. Restart Redis service

---

### Issue 3: High Memory Usage

**Symptoms:**
- Memory usage > 90%
- Application crashes

**Diagnosis:**
```bash
# Check memory usage
pm2 status
free -h

# Check heap snapshot
node --expose-gc --inspect dist/main.js
```

**Solutions:**
1. Restart application: `pm2 restart fifi-alert`
2. Reduce database connection pool: `DATABASE_POOL_SIZE=10`
3. Reduce BullMQ concurrency: `concurrency: 3`
4. Scale horizontally (add more instances)

---

### Issue 4: Slow Geospatial Queries

**Symptoms:**
- Response time > 2s for alert search
- Logs: Query took > 500ms

**Diagnosis:**
```sql
EXPLAIN ANALYZE
SELECT * FROM "Alert"
WHERE ST_DWithin(location_point::geography, ST_MakePoint(-74, 40)::geography, 10000);
```

**Solutions:**
1. Verify GIST index exists: `SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%GIST%';`
2. Create missing index: `CREATE INDEX "Alert_location_point_idx" ON "Alert" USING GIST (location_point);`
3. Analyze table: `ANALYZE "Alert";`
4. Vacuum table: `VACUUM ANALYZE "Alert";`

---

### Issue 5: Push Notifications Not Sending

**Symptoms:**
- Notifications stuck in QUEUED status
- Logs: `Notification failed: InvalidRegistration`

**Diagnosis:**
```bash
# Check queue depth
redis-cli -u $REDIS_URL LLEN bull:notification-queue:wait

# Check failed jobs
redis-cli -u $REDIS_URL LLEN bull:notification-queue:failed
```

**Solutions:**
1. Verify FCM credentials: `printenv | grep FCM`
2. Verify APNs configuration: `printenv | grep APNS`
3. Check `APNS_PRODUCTION=true` in production
4. Retry failed jobs: `redis-cli -u $REDIS_URL RPUSH bull:notification-queue:wait ...`

---

## Emergency Contacts

**On-Call Engineer:** [Your Name]  
**Phone:** +1-XXX-XXX-XXXX  
**Email:** oncall@yourcompany.com

**Escalation Path:**
1. On-Call Engineer (0-15 minutes)
2. Engineering Manager (15-30 minutes)
3. CTO (30+ minutes)

**External Services:**
- **AWS Support:** https://console.aws.amazon.com/support
- **Firebase Support:** https://firebase.google.com/support
- **Redis Cloud Support:** https://redis.com/support

---

## Deployment Checklist Summary

### Pre-Deployment
- [ ] Tests passing
- [ ] Code reviewed
- [ ] Database backup created
- [ ] Migrations tested in staging
- [ ] Environment variables verified
- [ ] Stakeholders notified

### Deployment
- [ ] Code pulled and built
- [ ] Database migrations applied
- [ ] Prisma Client generated
- [ ] Application restarted

### Post-Deployment
- [ ] Health check passing
- [ ] Critical endpoints tested
- [ ] Logs monitored (30 minutes)
- [ ] Metrics within targets
- [ ] Stakeholders notified of success

### Rollback (If Needed)
- [ ] Incident severity assessed
- [ ] Rollback executed
- [ ] Health verified
- [ ] Post-mortem scheduled

---

## Related Documentation

- [Database Migration Checklist](./DATABASE_MIGRATION_CHECKLIST.md) - Detailed migration procedures
- [Environment Configuration](./ENVIRONMENT_CONFIGURATION.md) - Environment-specific settings
- [Redis Production Setup](./REDIS_PRODUCTION_SETUP.md) - Redis deployment guide
- [Troubleshooting Guide](./TROUBLESHOOTING.md) - Common issues and solutions
- [Operational Runbook](./OPERATIONAL_RUNBOOK.md) - Daily operations guide

---

**Last Updated:** February 5, 2026  
**Version:** 1.0.0  
**Maintained By:** DevOps Team
