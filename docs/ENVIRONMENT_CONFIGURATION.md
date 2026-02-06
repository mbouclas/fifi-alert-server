# Environment-Specific Configuration Guide

## Overview

FiFi Alert uses environment-specific configuration to manage settings across development, staging, and production environments. This guide documents the differences between environments and provides templates for each.

---

## Environment Files

### File Structure

```
.env                    # Local development (gitignored)
.env.example           # Template with all variables (committed to git)
.env.development       # Development-specific defaults
.env.staging           # Staging environment settings
.env.production        # Production environment settings (never commit!)
```

### Loading Priority

```
1. .env.local (highest priority, never committed)
2. .env.[environment] (e.g., .env.production)
3. .env
4. .env.example (lowest priority, for documentation only)
```

---

## Quick Reference: Environment Differences

| Setting | Development | Staging | Production |
|---------|-------------|---------|------------|
| **NODE_ENV** | `development` | `staging` | `production` |
| **LOG_LEVEL** | `debug` | `info` | `info` or `warn` |
| **Database** | Local PostgreSQL | Cloud DB (dev account) | Cloud DB (prod account) |
| **Redis** | Local Docker | Managed Redis (t3.micro) | Managed Redis (t3.medium+) |
| **CORS** | `*` (allow all) | Specific domains | Production domains only |
| **JWT_SECRET** | Simple string | Strong random | Strong random (rotated) |
| **Push Notifications** | Disabled or sandbox | Sandbox APNs | Production APNs |
| **File Upload** | Local filesystem | Local or S3 dev bucket | S3 production bucket |
| **Rate Limits** | Relaxed | Same as production | Strict enforcement |
| **Swagger** | Enabled | Enabled | Disabled or restricted |
| **Error Details** | Full stack traces | Partial details | Minimal details |
| **Database Pool** | 5 connections | 10 connections | 20+ connections |
| **Prisma Logging** | Enabled | Disabled | Disabled |

---

## .env.development

**Use Case:** Local development on developer machines

```bash
#########################################
# DEVELOPMENT ENVIRONMENT
#########################################
NODE_ENV=development
PORT=3000

#########################################
# DATABASE (Local PostgreSQL)
#########################################
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fifi_alert_dev?schema=public"
DATABASE_POOL_SIZE=5
DATABASE_QUERY_TIMEOUT_MS=10000  # Longer timeout for debugging
PRISMA_LOG_QUERIES=true  # Log all SQL queries for debugging

#########################################
# REDIS (Local Docker)
#########################################
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # No password for local
REDIS_DB=0

#########################################
# APPLICATION
#########################################
API_BASE_URL=http://localhost:3000
LOG_LEVEL=debug  # Verbose logging for development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:5173

#########################################
# AUTHENTICATION
#########################################
# Simple secrets for development (DO NOT use in production)
JWT_SECRET=dev-jwt-secret-change-me
JWT_REFRESH_SECRET=dev-refresh-secret-change-me
JWT_ACCESS_EXPIRATION=24h  # Longer for convenience
JWT_REFRESH_EXPIRATION=30d
AUTH_PASSWORD_MIN_LENGTH=6  # Relaxed for testing

#########################################
# PUSH NOTIFICATIONS (Optional - Sandbox)
#########################################
# Leave blank to disable push notifications in development
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=

# APNs Sandbox (for testing with real devices)
APNS_KEY_PATH=./certs/apns-dev-key.p8
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_BUNDLE_ID=com.yourapp.fifi.dev
APNS_PRODUCTION=false  # Always sandbox in development

#########################################
# FILE UPLOAD (Local Filesystem)
#########################################
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760  # 10MB
ALLOWED_IMAGE_TYPES=image/jpeg,image/jpg,image/png,image/webp,image/heic

#########################################
# RATE LIMITING (Relaxed)
#########################################
RATE_LIMIT_ALERTS_PER_HOUR=100  # Higher for testing
RATE_LIMIT_ALERTS_PER_DAY=500
RATE_LIMIT_ALERTS_PER_WEEK=1000
THROTTLE_TTL=60000
THROTTLE_LIMIT=1000  # High limit for local testing

#########################################
# GEOSPATIAL (Same as production)
#########################################
DEFAULT_SEARCH_RADIUS_KM=10
MAX_SEARCH_RADIUS_KM=100
GPS_FRESH_THRESHOLD_HOURS=2
GPS_STALE_THRESHOLD_HOURS=24
STALE_GPS_RADIUS_EXPANSION_KM=5
IP_GEO_RADIUS_EXPANSION_KM=15

#########################################
# NOTIFICATION (Same as production)
#########################################
NOTIFICATION_MAX_RETRIES=3
NOTIFICATION_RETRY_DELAY_MS=1000
NOTIFICATION_JOB_TIMEOUT_MS=30000

#########################################
# DEVELOPMENT FEATURES
#########################################
SWAGGER_ENABLED=true  # Always enabled in dev
DETAILED_ERRORS=true  # Show full error messages
SEED_DATABASE_ON_START=false  # Set to true to auto-seed
```

---

## .env.staging

**Use Case:** Staging/QA environment for testing before production

```bash
#########################################
# STAGING ENVIRONMENT
#########################################
NODE_ENV=staging
PORT=3000

#########################################
# DATABASE (Cloud PostgreSQL - Staging)
#########################################
DATABASE_URL="postgresql://fifi_staging:STRONG_PASSWORD@staging-db.region.rds.amazonaws.com:5432/fifi_alert_staging?schema=public"
DATABASE_POOL_SIZE=10
DATABASE_QUERY_TIMEOUT_MS=5000
PRISMA_LOG_QUERIES=false

#########################################
# REDIS (Managed Redis - Small Instance)
#########################################
REDIS_URL=redis://default:PASSWORD@staging-redis.cache.amazonaws.com:6379
# Or separate settings:
# REDIS_HOST=staging-redis.cache.amazonaws.com
# REDIS_PORT=6379
# REDIS_PASSWORD=PASSWORD
# REDIS_TLS=true

#########################################
# APPLICATION
#########################################
API_BASE_URL=https://api-staging.yourapp.com
LOG_LEVEL=info  # Less verbose than development
ALLOWED_ORIGINS=https://staging.yourapp.com,https://staging-admin.yourapp.com

#########################################
# AUTHENTICATION
#########################################
# CRITICAL: Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
JWT_SECRET=STAGING_JWT_SECRET_64_CHARS_MIN
JWT_REFRESH_SECRET=STAGING_REFRESH_SECRET_64_CHARS_MIN
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
AUTH_PASSWORD_MIN_LENGTH=8

#########################################
# PUSH NOTIFICATIONS (Sandbox)
#########################################
# Use sandbox/development FCM and APNs
FCM_PROJECT_ID=fifi-staging-project
FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@fifi-staging.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

APNS_KEY_PATH=./certs/apns-staging-key.p8
APNS_KEY_ID=STAGING_KEY_ID
APNS_TEAM_ID=TEAM_ID
APNS_BUNDLE_ID=com.yourapp.fifi.staging
APNS_PRODUCTION=false  # Sandbox for staging

#########################################
# FILE UPLOAD (S3 Staging Bucket)
#########################################
UPLOAD_DIR=./uploads  # Fallback if S3 not configured
MAX_FILE_SIZE=10485760
ALLOWED_IMAGE_TYPES=image/jpeg,image/jpg,image/png,image/webp,image/heic

# Future: S3 configuration
# S3_BUCKET=fifi-alert-staging-uploads
# S3_REGION=us-east-1
# S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
# S3_SECRET_ACCESS_KEY=SECRET_KEY

#########################################
# RATE LIMITING (Production Settings)
#########################################
RATE_LIMIT_ALERTS_PER_HOUR=5
RATE_LIMIT_ALERTS_PER_DAY=20
RATE_LIMIT_ALERTS_PER_WEEK=50
THROTTLE_TTL=60000
THROTTLE_LIMIT=60

#########################################
# GEOSPATIAL (Same as production)
#########################################
DEFAULT_SEARCH_RADIUS_KM=10
MAX_SEARCH_RADIUS_KM=100
GPS_FRESH_THRESHOLD_HOURS=2
GPS_STALE_THRESHOLD_HOURS=24
STALE_GPS_RADIUS_EXPANSION_KM=5
IP_GEO_RADIUS_EXPANSION_KM=15

#########################################
# NOTIFICATION (Same as production)
#########################################
NOTIFICATION_MAX_RETRIES=3
NOTIFICATION_RETRY_DELAY_MS=1000
NOTIFICATION_JOB_TIMEOUT_MS=30000

#########################################
# MONITORING
#########################################
# Optional: Sentry staging project
# SENTRY_DSN=https://staging-key@sentry.io/staging-project

#########################################
# STAGING FEATURES
#########################################
SWAGGER_ENABLED=true  # Enabled for QA testing
DETAILED_ERRORS=true  # Show errors for debugging
```

---

## .env.production

**Use Case:** Live production environment

```bash
#########################################
# PRODUCTION ENVIRONMENT
#########################################
NODE_ENV=production
PORT=3000

#########################################
# DATABASE (Cloud PostgreSQL - Production)
#########################################
DATABASE_URL="postgresql://fifi_prod:VERY_STRONG_PASSWORD@prod-db.region.rds.amazonaws.com:5432/fifi_alert_prod?schema=public&connection_limit=20"
DATABASE_POOL_SIZE=20  # Higher for production load
DATABASE_QUERY_TIMEOUT_MS=5000
PRISMA_LOG_QUERIES=false  # Never log in production

#########################################
# REDIS (Managed Redis - Production Instance)
#########################################
REDIS_URL=rediss://default:STRONG_PASSWORD@prod-redis.cache.amazonaws.com:6379
# Note: 'rediss://' for TLS/SSL
# Or separate settings:
# REDIS_HOST=prod-redis.cache.amazonaws.com
# REDIS_PORT=6379
# REDIS_PASSWORD=STRONG_PASSWORD
# REDIS_TLS=true

#########################################
# APPLICATION
#########################################
API_BASE_URL=https://api.yourapp.com
LOG_LEVEL=info  # Or 'warn' for less verbosity
ALLOWED_ORIGINS=https://app.yourapp.com,https://www.yourapp.com,https://admin.yourapp.com

#########################################
# AUTHENTICATION
#########################################
# CRITICAL: Generate strong secrets and NEVER commit to git
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
JWT_SECRET=PRODUCTION_JWT_SECRET_MINIMUM_64_CHARS_ROTATE_ANNUALLY
JWT_REFRESH_SECRET=PRODUCTION_REFRESH_SECRET_MINIMUM_64_CHARS_ROTATE_ANNUALLY
JWT_ACCESS_EXPIRATION=15m  # Short-lived for security
JWT_REFRESH_EXPIRATION=7d
AUTH_PASSWORD_MIN_LENGTH=8

#########################################
# PUSH NOTIFICATIONS (Production)
#########################################
FCM_PROJECT_ID=fifi-prod-project
FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@fifi-prod.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

APNS_KEY_PATH=./certs/apns-prod-key.p8
APNS_KEY_ID=PROD_KEY_ID
APNS_TEAM_ID=TEAM_ID
APNS_BUNDLE_ID=com.yourapp.fifi
APNS_PRODUCTION=true  # CRITICAL: Must be true for App Store builds

#########################################
# FILE UPLOAD (S3 Production Bucket)
#########################################
UPLOAD_DIR=./uploads  # Fallback if S3 fails
MAX_FILE_SIZE=10485760
ALLOWED_IMAGE_TYPES=image/jpeg,image/jpg,image/png,image/webp,image/heic

# S3 Configuration (recommended for production)
# S3_BUCKET=fifi-alert-prod-uploads
# S3_REGION=us-east-1
# S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
# S3_SECRET_ACCESS_KEY=SECRET_KEY
# S3_CDN_URL=https://cdn.yourapp.com  # CloudFront distribution

#########################################
# RATE LIMITING (Strict Enforcement)
#########################################
RATE_LIMIT_ALERTS_PER_HOUR=5
RATE_LIMIT_ALERTS_PER_DAY=20
RATE_LIMIT_ALERTS_PER_WEEK=50
THROTTLE_TTL=60000
THROTTLE_LIMIT=60

#########################################
# GEOSPATIAL
#########################################
DEFAULT_SEARCH_RADIUS_KM=10
MAX_SEARCH_RADIUS_KM=100
GPS_FRESH_THRESHOLD_HOURS=2
GPS_STALE_THRESHOLD_HOURS=24
STALE_GPS_RADIUS_EXPANSION_KM=5
IP_GEO_RADIUS_EXPANSION_KM=15

#########################################
# NOTIFICATION
#########################################
NOTIFICATION_MAX_RETRIES=3
NOTIFICATION_RETRY_DELAY_MS=1000
NOTIFICATION_JOB_TIMEOUT_MS=30000

#########################################
# MONITORING & OBSERVABILITY
#########################################
# Sentry for error tracking
SENTRY_DSN=https://production-key@sentry.io/production-project
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1  # Sample 10% of transactions

# Optional: Additional monitoring
# NEW_RELIC_LICENSE_KEY=...
# DATADOG_API_KEY=...

#########################################
# PRODUCTION SECURITY
#########################################
SWAGGER_ENABLED=false  # CRITICAL: Disable in production
DETAILED_ERRORS=false  # Never expose internals
SEED_DATABASE_ON_START=false  # Never seed in production

#########################################
# ALERT CONFIGURATION
#########################################
ALERT_EXPIRATION_DAYS=7
MAX_ALERT_RENEWALS=3
MAX_ALERT_PHOTOS=5

#########################################
# SAVED ZONE CONFIGURATION
#########################################
MAX_SAVED_ZONES_PER_DEVICE=5
MIN_SAVED_ZONE_RADIUS_KM=1
MAX_SAVED_ZONE_RADIUS_KM=20
```

---

## Environment Variable Validation

### Required Variables (All Environments)

```typescript
// src/config/env-validation.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.string().transform(Number),
  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  API_BASE_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string(),
}).refine(data => data.REDIS_HOST || data.REDIS_URL, {
  message: 'Either REDIS_HOST or REDIS_URL must be provided',
});

export function validateEnv() {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }
  
  return result.data;
}
```

### Production-Specific Validation

```typescript
// Additional checks for production
if (process.env.NODE_ENV === 'production') {
  if (process.env.SWAGGER_ENABLED === 'true') {
    console.warn('⚠️ WARNING: Swagger is enabled in production');
  }
  
  if (process.env.DETAILED_ERRORS === 'true') {
    console.warn('⚠️ WARNING: Detailed errors enabled in production');
  }
  
  if (process.env.JWT_SECRET.includes('dev') || process.env.JWT_SECRET.length < 32) {
    console.error('❌ CRITICAL: Weak JWT secret in production');
    process.exit(1);
  }
  
  if (process.env.APNS_PRODUCTION !== 'true') {
    console.warn('⚠️ WARNING: APNs production mode not enabled');
  }
}
```

---

## Deployment Checklist

### Switching Environments

- [ ] **1. Update Environment File**
  - Copy appropriate `.env.[environment]` to `.env`
  - Or set `NODE_ENV` environment variable

- [ ] **2. Verify Database Connection**
  ```bash
  bunx prisma migrate status
  ```

- [ ] **3. Verify Redis Connection**
  ```bash
  redis-cli -h <host> -p <port> -a <password> ping
  ```

- [ ] **4. Run Migrations**
  ```bash
  bunx prisma migrate deploy
  ```

- [ ] **5. Generate Prisma Client**
  ```bash
  bunx prisma generate
  ```

- [ ] **6. Test Application**
  ```bash
  bun run start:prod
  curl http://localhost:3000/health
  ```

- [ ] **7. Verify Critical Features**
  - Create test alert
  - Register test device
  - Verify push notifications work
  - Check file upload
  - Test geospatial queries

---

## Secrets Management

### Development

Store in `.env` file (gitignored)

### Staging/Production

**Recommended Approaches:**

1. **AWS Secrets Manager**
   ```bash
   # Store secret
   aws secretsmanager create-secret --name fifi-alert/prod/jwt-secret --secret-string "YOUR_SECRET"
   
   # Retrieve in application startup
   const secret = await secretsManager.getSecretValue({ SecretId: 'fifi-alert/prod/jwt-secret' });
   ```

2. **HashiCorp Vault**
   ```bash
   vault kv put secret/fifi-alert/prod jwt_secret="YOUR_SECRET"
   ```

3. **Environment Variables (Cloud Provider)**
   - AWS Elastic Beanstalk: Configuration → Software → Environment properties
   - Heroku: Settings → Config Vars
   - Vercel/Netlify: Project Settings → Environment Variables
   - Docker: Use `--env-file` or Kubernetes Secrets

4. **CI/CD Pipeline Secrets**
   - GitHub Actions: Repository Settings → Secrets
   - GitLab CI: Settings → CI/CD → Variables
   - Jenkins: Credentials Plugin

---

## Best Practices

### DO

✅ **Use strong random secrets in production** (64+ characters)  
✅ **Never commit `.env.production` to git**  
✅ **Rotate secrets annually or after security incidents**  
✅ **Use different databases for each environment**  
✅ **Enable TLS/SSL for production Redis and PostgreSQL**  
✅ **Disable Swagger in production**  
✅ **Use minimal log levels in production** (`info` or `warn`)  
✅ **Validate environment variables on startup**  
✅ **Document environment-specific differences**  
✅ **Test staging with production-like configuration**

### DON'T

❌ **Don't use development secrets in production**  
❌ **Don't commit secrets to git (even in private repos)**  
❌ **Don't hardcode environment-specific values in code**  
❌ **Don't share production credentials in chat/email**  
❌ **Don't log sensitive environment variables**  
❌ **Don't skip environment validation on startup**  
❌ **Don't use `NODE_ENV=development` in production**  
❌ **Don't expose detailed errors in production**

---

## Troubleshooting

### "Environment variable not found"

```bash
# Check current environment
echo $NODE_ENV

# List all environment variables
printenv | grep FIFI

# Verify .env file loaded
node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL)"
```

### "Database connection failed"

```bash
# Test PostgreSQL connection
psql $DATABASE_URL -c "SELECT 1;"

# Check if PostGIS enabled
psql $DATABASE_URL -c "SELECT PostGIS_Version();"
```

### "Redis connection timeout"

```bash
# Test Redis connection
redis-cli -u $REDIS_URL ping

# Or with separate settings
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD ping
```

---

## Additional Resources

- **12-Factor App Config:** https://12factor.net/config
- **NestJS Configuration:** https://docs.nestjs.com/techniques/configuration
- **AWS Secrets Manager:** https://docs.aws.amazon.com/secretsmanager/
- **FiFi Alert Deployment Runbook:** [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)

---

## Quick Reference

### Generate Strong Secrets

```bash
# Generate 64-character base64 secret
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"

# Or using openssl
openssl rand -base64 64
```

### Switch Environments

```bash
# Development
export NODE_ENV=development
cp .env.development .env
bun run start:dev

# Staging
export NODE_ENV=staging
cp .env.staging .env
bun run start:prod

# Production
export NODE_ENV=production
cp .env.production .env
bun run start:prod
```

### Verify Configuration

```bash
# Check current environment
bun run start:prod 2>&1 | grep "NODE_ENV"

# Test health endpoint
curl http://localhost:3000/health | jq
```
