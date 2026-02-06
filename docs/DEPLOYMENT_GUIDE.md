# Production Deployment Guide

## Overview

This comprehensive guide covers deploying the NestJS bearer token authentication system to production with security best practices, monitoring, and rollback procedures.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [HTTPS Configuration](#https-configuration)
5. [Security Hardening](#security-hardening)
6. [Monitoring & Logging](#monitoring--logging)
7. [Deployment Process](#deployment-process)
8. [Rollback Procedures](#rollback-procedures)
9. [Performance Tuning](#performance-tuning)
10. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Code Review

- [ ] All TypeScript compilation errors resolved
- [ ] Unit tests passing (90%+ coverage recommended)
- [ ] Integration tests passing
- [ ] Security audit completed
- [ ] Code review approved
- [ ] Documentation updated

### Dependencies

- [ ] All npm/bun packages audited for vulnerabilities
- [ ] Production dependencies optimized
- [ ] Dev dependencies excluded from production build

### Configuration

- [ ] Environment variables documented
- [ ] Secrets generated and secured
- [ ] CORS origins configured
- [ ] Rate limits reviewed
- [ ] Token lifetimes appropriate for production

---

## Environment Configuration

### Required Environment Variables

Create `.env.production` file:

```bash
# Application
NODE_ENV=production
PORT=3000
ALLOWED_ORIGIN=https://yourdomain.com

# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# JWT Secrets (Generate secure random strings)
JWT_SECRET=<64+ character base64 string>
JWT_REFRESH_SECRET=<64+ character base64 string>

# JWT Token Lifetimes
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Better Auth
BETTER_AUTH_SECRET=<64+ character base64 string>
BETTER_AUTH_URL=https://api.yourdomain.com

# Logging
LOG_LEVEL=info
```

### Generating Secure Secrets

**PowerShell:**
```powershell
# Generate 64-byte random base64 string
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }))
```

**Linux/Mac:**
```bash
# Generate 64-byte random base64 string
openssl rand -base64 64
```

### Environment Variable Validation

Add validation in `main.ts`:

```typescript
function validateEnvironment() {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'BETTER_AUTH_SECRET',
    'ALLOWED_ORIGIN',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 64) {
    console.warn('Warning: JWT_SECRET should be at least 64 characters');
  }

  if (process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.length < 64) {
    console.warn('Warning: JWT_REFRESH_SECRET should be at least 64 characters');
  }
}
```

---

## Database Setup

### Production Database Checklist

- [ ] PostgreSQL version 14+ installed
- [ ] Database created with proper character encoding (UTF8)
- [ ] Database user with appropriate permissions
- [ ] Connection pooling configured
- [ ] SSL/TLS enabled
- [ ] Backup strategy implemented
- [ ] High availability configured (if applicable)

### Database Migration Strategy

#### Option 1: Automated Migrations (Recommended)

```bash
# Run migrations on deployment
bun prisma migrate deploy
```

**Deployment Script:**
```bash
#!/bin/bash
set -e

echo "Starting deployment..."

# Pull latest code
git pull origin main

# Install dependencies
bun install --production

# Run database migrations
bun prisma migrate deploy

# Build application
bun run build

# Restart application
pm2 restart fifi-alert-server

echo "Deployment complete!"
```

#### Option 2: Manual Migrations (For sensitive changes)

```bash
# Generate migration locally
bun prisma migrate dev --name descriptive_name

# Review migration file in prisma/migrations/

# Apply to production
bun prisma migrate deploy
```

### Database Connection Pooling

Configure in Prisma:

```typescript
// prisma.service.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'info', 'warn', 'error'],
  // Connection pool settings
  pool: {
    max: 10,
    min: 2,
    idle: 10000,
    acquire: 30000,
  },
});
```

---

## HTTPS Configuration

### SSL Certificate Options

#### Option 1: Let's Encrypt (Free, Recommended)

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot

# Obtain certificate
sudo certbot certonly --standalone -d api.yourdomain.com

# Certificates will be in:
# /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/api.yourdomain.com/privkey.pem
```

#### Option 2: Cloud Provider SSL (AWS, Azure, GCP)

Use load balancer SSL termination (recommended for cloud deployments).

### Nginx Configuration

**`/etc/nginx/sites-available/api`:**

```nginx
upstream nestjs_backend {
    server localhost:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers (additional to Helmet)
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proxy settings
    location / {
        proxy_pass http://nestjs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Rate limiting (additional layer)
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
    limit_req zone=api burst=20 nodelay;
}
```

Enable configuration:
```bash
sudo ln -s /etc/nginx/sites-available/api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Security Hardening

### Application Security Checklist

- [x] Helmet configured (CSP, HSTS, etc.)
- [x] CORS properly configured
- [x] Rate limiting enabled
- [x] JWT secrets securely generated
- [ ] SQL injection prevention (Prisma handles this)
- [ ] Input validation on all endpoints
- [ ] XSS protection enabled
- [ ] CSRF protection (if using cookies)

### Rate Limiting Configuration

Review and adjust in `app.module.ts`:

```typescript
ThrottlerModule.forRoot([{
  ttl: 60000, // 60 seconds
  limit: 100, // Adjust based on expected traffic
}])
```

**Endpoint-specific limits:**
- Login: 5 attempts/minute
- Signup: 3 signups/hour
- Token refresh: 10/minute
- General API: 100/minute

### Database Security

1. **Use least privilege principle:**
   ```sql
   -- Create dedicated user with minimal permissions
   CREATE USER api_user WITH PASSWORD 'secure_password';
   GRANT CONNECT ON DATABASE fifi TO api_user;
   GRANT USAGE ON SCHEMA public TO api_user;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO api_user;
   ```

2. **Enable SSL for database connections:**
   ```bash
   DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
   ```

3. **Regular backups:**
   ```bash
   # Daily backup script
   pg_dump -U postgres -h localhost -d fifi -F c -f backup_$(date +%Y%m%d).dump
   ```

### Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirects to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw deny 3000/tcp   # Block direct access to Node.js
sudo ufw enable
```

---

## Monitoring & Logging

### Application Logging

Configure Winston logger in production:

```typescript
// src/shared/logger.config.ts
import * as winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'fifi-alert-api' },
  transports: [
    // Write errors to error.log
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  ],
});

// Console logging in non-production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}
```

### Health Check Endpoint

Add health check endpoint:

```typescript
// src/app.controller.ts
@Get('health')
async healthCheck() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: await this.checkDatabase(),
  };
}
```

### Monitoring Tools

**Recommended Setup:**

1. **Application Monitoring:** PM2 or PM2 Plus
2. **Log Aggregation:** ELK Stack or CloudWatch
3. **Uptime Monitoring:** UptimeRobot or Pingdom
4. **Error Tracking:** Sentry
5. **Performance:** New Relic or DataDog

**PM2 Configuration:**

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'fifi-alert-server',
    script: 'dist/main.js',
    instances: 2,
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '500M',
    watch: false,
  }],
};
```

### Audit Log Monitoring

Monitor audit logs for suspicious activity:

```typescript
// Query failed login attempts
const failedLogins = await prisma.auditLog.findMany({
  where: {
    action: 'login_failed',
    createdAt: {
      gte: new Date(Date.now() - 3600000), // Last hour
    },
  },
  orderBy: { createdAt: 'desc' },
});

// Alert if > 10 failed attempts from same IP
```

---

## Deployment Process

### Deployment Methods

#### Method 1: PM2 (Recommended for VPS)

```bash
# Install PM2 globally
npm install -g pm2

# Build and start application
bun run build
pm2 start ecosystem.config.cjs --env production

# Save PM2 process list
pm2 save

# Setup PM2 startup script
pm2 startup
```

#### Method 2: Docker

**Dockerfile:**
```dockerfile
FROM oven/bun:latest AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --production

# Copy source
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Build application
RUN bun run build

# Expose port
EXPOSE 3000

# Start application
CMD ["bun", "run", "start:prod"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: fifi
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

#### Method 3: Cloud Platform (AWS, Azure, GCP, Heroku)

Refer to platform-specific documentation.

### CI/CD Pipeline (GitHub Actions Example)

**.github/workflows/deploy.yml:**
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Run tests
        run: bun test

      - name: Build
        run: bun run build

      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/fifi-alert-server
            git pull origin main
            bun install --production
            bun prisma migrate deploy
            bun run build
            pm2 restart fifi-alert-server
```

---

## Rollback Procedures

### Quick Rollback

**PM2:**
```bash
# List recent deployments
pm2 list

# Revert to previous version
git reset --hard HEAD~1
bun install --production
bun run build
pm2 restart fifi-alert-server
```

**Docker:**
```bash
# Tag previous image
docker tag myapp:latest myapp:backup

# Roll back to previous image
docker-compose down
docker-compose up -d myapp:previous-tag
```

### Database Rollback

**Prisma Migrations:**
```bash
# View migration history
bun prisma migrate status

# Rollback last migration (manual SQL required)
# 1. Identify migration to rollback
# 2. Create down migration manually
# 3. Apply rollback
```

**Database Backup Restore:**
```bash
# Restore from backup
pg_restore -U postgres -d fifi -c backup_20260204.dump
```

### Full System Rollback Checklist

1. [ ] Stop application (PM2/Docker)
2. [ ] Restore database from backup
3. [ ] Revert code to previous commit
4. [ ] Install dependencies
5. [ ] Rebuild application
6. [ ] Start application
7. [ ] Verify health checks
8. [ ] Monitor logs for errors

---

## Performance Tuning

### Database Optimization

```sql
-- Create indexes for frequent queries
CREATE INDEX idx_user_email ON "user"(email);
CREATE INDEX idx_session_token ON session(token);
CREATE INDEX idx_session_user_revoked ON session(userId, revoked);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM session WHERE userId = 1 AND revoked = false;
```

### Application Optimization

1. **Enable compression:**
   ```typescript
   // main.ts
   import compression from 'compression';
   app.use(compression());
   ```

2. **Connection pooling:**
   - Prisma: Configure `pool` settings
   - PostgreSQL: Use PgBouncer

3. **Caching:**
   ```typescript
   // Use Redis for session caching
   import { CacheModule } from '@nestjs/cache-manager';
   import * as redisStore from 'cache-manager-redis-store';

   CacheModule.register({
     store: redisStore,
     host: 'localhost',
     port: 6379,
     ttl: 600, // 10 minutes
   })
   ```

### Load Testing

Use tools to test performance:

```bash
# Apache Bench
ab -n 1000 -c 100 https://api.yourdomain.com/auth/me \
   -H "Authorization: Bearer YOUR_TOKEN"

# K6
k6 run load-test.js
```

---

## Troubleshooting

### Common Issues

**1. Database Connection Errors**
```bash
# Check database is running
sudo systemctl status postgresql

# Test connection
psql -U postgres -h localhost -d fifi

# Check connection string
echo $DATABASE_URL
```

**2. Port Already in Use**
```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

**3. Memory Issues**
```bash
# Check memory usage
free -h

# Restart application with more memory
NODE_OPTIONS=--max-old-space-size=4096 pm2 restart fifi-alert-server
```

**4. SSL Certificate Errors**
```bash
# Renew Let's Encrypt certificate
sudo certbot renew

# Test certificate
openssl s_client -connect api.yourdomain.com:443
```

### Log Analysis

```bash
# View PM2 logs
pm2 logs fifi-alert-server

# View error logs
tail -f logs/error.log

# Search for specific errors
grep "Error" logs/combined.log | tail -n 50
```

---

## Post-Deployment Verification

### Verification Checklist

- [ ] Application is running (health check endpoint)
- [ ] Database migrations applied successfully
- [ ] SSL certificate valid
- [ ] CORS configured correctly
- [ ] Rate limiting working
- [ ] Authentication flow working (login/signup/refresh)
- [ ] Protected endpoints require valid tokens
- [ ] Admin endpoints restricted to admin role
- [ ] Audit logging recording events
- [ ] Monitoring alerts configured
- [ ] Backup strategy in place
- [ ] Log rotation configured

### Smoke Tests

```bash
# Health check
curl https://api.yourdomain.com/health

# Signup test
curl -X POST https://api.yourdomain.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234","firstName":"Test","lastName":"User"}'

# Login test
curl -X POST https://api.yourdomain.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234"}'

# Protected endpoint test
curl https://api.yourdomain.com/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Maintenance Schedule

### Daily
- Monitor error logs
- Check disk space
- Review failed login attempts

### Weekly
- Review audit logs for suspicious activity
- Analyze performance metrics
- Update dependencies (minor versions)

### Monthly
- Database maintenance (VACUUM, ANALYZE)
- Security audit
- Backup testing
- Update dependencies (major versions)

### Quarterly
- Security penetration testing
- Disaster recovery drill
- Performance optimization review

---

## Support & Resources

- **Documentation:** `/docs` folder
- **Issues:** GitHub Issues
- **Security:** security@example.com
- **Emergency Contact:** +1-XXX-XXX-XXXX

---

**Last Updated:** February 4, 2026
