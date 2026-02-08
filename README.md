# FiFi Alert - Backend Server

**Geolocation-Based Missing Pet Notification System**

FiFi Alert is a real-time notification platform that helps reunite lost pets with their owners by intelligently targeting nearby community members based on their location. The system leverages PostGIS for geospatial queries, BullMQ for asynchronous notification processing, and Firebase Cloud Messaging (FCM) + Apple Push Notification service (APNs) for multi-platform push delivery.

## 📋 Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
- [Monitoring](#monitoring)
- [Contributing](#contributing)

---

## ✨ Features

### Core Functionality
- **Alert Management**: Create, update, resolve, and renew missing pet alerts with photos
- **Geospatial Targeting**: Intelligent device targeting based on GPS, saved zones, postal codes, and IP geolocation
- **Confidence-Based Notifications**: HIGH/MEDIUM/LOW confidence levels based on location accuracy
- **Sighting Reports**: Community members can report pet sightings with photos and locations
- **Rate Limiting**: Prevents abuse with Redis-backed rate limits (5 alerts/hour, 20/24h, 50/7days)
- **File Upload**: Local storage with planned S3 migration support
- **Authentication & Authorization**: JWT bearer token authentication with role-based and level-based access control

### Location Intelligence
- **Alert Zones**: User-scoped geographic zones (50m-5km radius) for receiving alerts on all devices
- **Saved Zones**: Device-specific priority areas (home, work, etc.) for HIGH confidence alerts
- **GPS Freshness**: Fresh GPS (<2h) → HIGH confidence, Stale (<24h) → MEDIUM confidence
- **Multi-Source Matching**: Matches devices via alert zones, saved zones, GPS, postal codes, or IP geolocation
- **Distance Calculations**: Accurate PostGIS-based distance calculations with configurable radii

### Notification System
- **Async Processing**: BullMQ job queue with retry strategies and exponential backoff
- **Multi-Platform**: iOS (APNs) and Android (FCM) push notification support
- **Exclusion Tracking**: Transparent logging of why devices were excluded from notifications
- **Delivery Tracking**: Status tracking (QUEUED → SENT → DELIVERED → OPENED/FAILED)

---

## 🛠 Technology Stack

- **Framework**: NestJS 11
- **Runtime**: Bun (Node.js compatible)
- **Database**: PostgreSQL + PostGIS extension
- **ORM**: Prisma 7
- **Queue**: BullMQ (Redis-backed)
- **Push Notifications**: Firebase Cloud Messaging (Android) + APNs (iOS)
- **Storage**: Local filesystem (migrate to S3 later)
- **Testing**: Jest + Supertest
- **Documentation**: Swagger/OpenAPI

---

## 📦 Prerequisites

### Required Software
- **Bun** v1.0+ (or Node.js v20+)
- **PostgreSQL** v14+ with **PostGIS** extension
- **Redis** v6+ (for BullMQ job queue and rate limiting)
- **Git**

### External Services
- **Firebase Project** (for FCM push notifications)
- **Apple Developer Account** (for APNs, optional if iOS not supported initially)

---

## 🚀 Quick Start

### 1. Clone Repository
```bash
git clone <repository-url>
cd fifi-alert-server
```

### 2. Install Dependencies
```bash
bun install
```

### 3. Set Up Environment Variables
```bash
cp .env.example .env
# Edit .env with your configuration (see Environment Variables section)
```

### 4. Set Up Database
```bash
# Start PostgreSQL (if using Docker)
docker-compose up -d postgres

# Enable PostGIS extension
psql -U postgres -d fifi_alert_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Run migrations
bunx prisma migrate deploy

# (Optional) Seed test data
bunx prisma db seed
```

### 5. Start Redis
```bash
# Using Docker
docker-compose up -d redis

# Or install locally (Windows: use WSL or Redis for Windows)
```

### 6. Run Development Server
```bash
bun run start:dev
```

Server will start on `http://localhost:3000`

### 7. Verify Setup
```bash
# Check health endpoint
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2026-02-05T...",
#   "uptime": 123,
#   "checks": {
#     "database": { "status": "healthy", "latency_ms": 5 },
#     "redis": { "status": "healthy", "latency_ms": 2 },
#     "disk": { "status": "healthy", "available_mb": 50000 }
#   }
# }
```

### 8. Access API Documentation
Open browser: `http://localhost:3000/api`

---

## 🔐 Environment Variables

### Database
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/fifi_alert_dev"
```

### Redis
```bash
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_PASSWORD=""  # Leave empty for local development
```

### Firebase Cloud Messaging (Android Push)
```bash
FCM_PROJECT_ID="your-firebase-project-id"
FCM_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Apple Push Notification Service (iOS Push)
```bash
APNS_KEY_PATH="./certs/apns-key.p8"
APNS_KEY_ID="ABC123XYZ"
APNS_TEAM_ID="TEAM123456"
APNS_BUNDLE_ID="com.yourapp.fifi"
APNS_PRODUCTION=false  # Use sandbox for development
```

### File Upload
```bash
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=10485760  # 10MB in bytes
API_BASE_URL="http://localhost:3000"  # For generating file URLs
```

### Application
```bash
NODE_ENV="development"  # development | staging | production
PORT=3000
LOG_LEVEL="debug"  # error | warn | info | debug
```

### Rate Limiting
```bash
RATE_LIMIT_ALERTS_PER_HOUR=5
RATE_LIMIT_ALERTS_PER_DAY=20
RATE_LIMIT_ALERTS_PER_WEEK=50
```

**See [.env.example](.env.example) for complete list with descriptions**

---

## 🗄 Database Setup

### PostGIS Extension
```sql
-- Connect to your database
psql -U postgres -d fifi_alert_dev

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify installation
SELECT PostGIS_Version();
-- Expected: "3.3 USE_GEOS=1 USE_PROJ=1 ..."
```

### Migrations
```bash
# Create new migration
bunx prisma migrate dev --name migration_name

# Apply migrations (production)
bunx prisma migrate deploy

# Reset database (WARNING: deletes all data)
bunx prisma migrate reset
```

### Seed Data
```bash
# Run seed script (creates test users, devices, alerts)
bunx prisma db seed
```

### Database Indexes
Critical GIST indexes for geospatial performance:
- `Alert.location_point` (GIST)
- `Device.gps_point` (GIST)
- `Device.ip_point` (GIST)
- `SavedZone.location_point` (GIST)
- `Sighting.location_point` (GIST)

Verify indexes:
```sql
SELECT tablename, indexname, indexdef 
FROM pg_indexes 
WHERE indexdef LIKE '%GIST%';
```

---

## 📡 API Documentation

### Swagger UI
Interactive API documentation: `http://localhost:3000/api`

### Core Endpoints

#### Alerts
- `POST /alerts` - Create missing pet alert (requires auth)
- `GET /alerts` - Search alerts by location (public)
- `GET /alerts/:id` - Get alert details (public)
- `PATCH /alerts/:id` - Update alert (owner only)
- `POST /alerts/:id/resolve` - Mark alert as resolved (owner only)
- `POST /alerts/:id/renew` - Extend alert expiration (owner only)
- `POST /alerts/:id/photos` - Upload alert photos (owner only)

#### Sightings
- `POST /sightings` - Report pet sighting (requires auth)
- `GET /sightings/alert/:alertId` - List sightings for alert
- `POST /sightings/:id/dismiss` - Dismiss false sighting (alert owner only)
- `POST /sightings/:id/photo` - Upload sighting photo

#### Devices
- `POST /devices` - Register device (requires auth)
- `GET /devices` - List user's devices
- `PATCH /devices/:id/location` - Update device GPS location
- `PATCH /devices/:id/push-token` - Update push notification token
- `POST /devices/:id/saved-zones` - Create saved zone (home, work, etc.)
- `GET /devices/:id/saved-zones` - List saved zones
- `PATCH /devices/saved-zones/:zoneId` - Update saved zone
- `DELETE /devices/saved-zones/:zoneId` - Delete saved zone

#### Alert Zones
- `POST /users/me/alert-zones` - Create user-scoped alert zone (requires auth)
- `GET /users/me/alert-zones` - List user's alert zones
- `GET /users/me/alert-zones/:id` - Get specific alert zone
- `PATCH /users/me/alert-zones/:id` - Update alert zone (owner only)
- `DELETE /users/me/alert-zones/:id` - Delete alert zone (owner only)

#### Health & Monitoring
- `GET /health` - System health check (database, Redis, disk)

### Authentication
All protected endpoints require Bearer token:
```bash
Authorization: Bearer <access_token>
```

Obtain token via authentication flow (not part of MVP Phase 1).

---

## 🧪 Testing

### Unit Tests
```bash
# Run all unit tests
bun test

# Run with coverage
bun test --coverage

# Run specific test file
bun test alert.service.spec.ts

# Watch mode
bun test --watch
```

### Integration Tests
```bash
# Run e2e tests
bun test:e2e

# Run with coverage
bun test:e2e --coverage
```

### Coverage Goals
- **Overall**: >80%
- **Services**: >85%
- **Controllers**: >75%

### Current Coverage (Phase 1)
- Location Service: **94.36%** ✅
- Device Module: **74.3%** ✅
- Notification Module: **37.82%** ✅
- Upload Service: **48.35%** ⚠️
- Alert Module: **14.66%** ⚠️
- Sighting Module: **6.48%** ⚠️

---

## 📂 Project Structure

```
src/
├── alert/               # Alert management module
│   ├── alert.controller.ts
│   ├── alert.service.ts
│   ├── alert.module.ts
│   └── dto/
├── sighting/            # Sighting reports module
│   ├── sighting.controller.ts
│   ├── sighting.service.ts
│   └── dto/
├── device/              # Device registration & management
│   ├── device.service.ts
│   ├── saved-zone.service.ts
│   └── dto/
├── location/            # Geospatial matching logic
│   ├── location.service.ts
│   └── geospatial.service.ts
├── notification/        # Push notification infrastructure
│   ├── notification.service.ts
│   ├── notification-queue.processor.ts
│   ├── fcm.service.ts
│   ├── apns.service.ts
│   └── dto/
├── upload/              # File upload & storage
│   ├── upload.service.ts
│   ├── local-storage.strategy.ts
│   └── s3-storage.strategy.ts (stub)
├── auth/                # Authentication & authorization
│   ├── guards/
│   ├── decorators/
│   └── services/
├── health/              # Health monitoring
│   ├── health.controller.ts
│   └── health.service.ts
├── shared/              # Shared utilities
│   ├── logger.config.ts
│   └── helpers/
└── prisma/
    ├── schema.prisma
    └── migrations/
```

---

## 🚢 Deployment

### Production Checklist

1. **Environment Variables**
   - Set `NODE_ENV=production`
   - Use strong database credentials
   - Configure production Redis (ElastiCache, Redis Cloud)
   - Set `APNS_PRODUCTION=true` for iOS

2. **Database**
   - Run migrations: `bunx prisma migrate deploy`
   - Verify PostGIS extension enabled
   - Check GIST indexes created: `\di` in psql

3. **Redis**
   - Enable persistence (RDB snapshots)
   - Set max memory policy: `allkeys-lru`
   - Monitor queue depth and job failures

4. **File Storage**
   - Migrate to S3 for production (implement S3StorageStrategy)
   - Configure CloudFront CDN for uploads

5. **Monitoring**
   - Set up health check endpoint monitoring
   - Configure alerts for Redis queue depth
   - Monitor push notification failure rates
   - Track geospatial query performance

6. **Security**
   - Enable CORS with specific origins
   - Use HTTPS only
   - Rotate FCM/APNs credentials regularly
   - Enable rate limiting on all public endpoints

### Docker Deployment
```bash
# Build image
docker build -t fifi-alert-server .

# Run container
docker run -p 3000:3000 --env-file .env.production fifi-alert-server
```

### Health Checks
```bash
# Kubernetes liveness probe
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

# Docker health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD curl -f http://localhost:3000/health || exit 1
```

---

## 📊 Monitoring

### Key Metrics

**Application Health**
- `/health` endpoint status (200 OK vs 503)
- Database connection latency
- Redis connection latency
- Available disk space

**Notification Pipeline**
- Alerts created per hour
- Devices targeted per alert (avg, p95)
- Notifications sent per hour
- Push delivery success rate
- Average notification latency (alert → push sent)

**Geospatial Performance**
- Alert search query time (p50, p95, p99)
- Device matching query time
- Distance calculation performance

**Rate Limiting**
- Rate limit violations per hour
- Top users hitting limits

### Logging
Structured JSON logs with Winston:
```json
{
  "level": "info",
  "timestamp": "2026-02-05T10:30:00.000Z",
  "context": "AlertService",
  "message": "Alert created",
  "alert_id": "abc123",
  "user_id": "user456",
  "species": "DOG",
  "radius_km": 10
}
```

**Never logged:**
- User PII (names, emails, phone numbers)
- Push notification tokens (only IDs)
- Exact GPS coordinates (only approximate distance)

---

## 🤝 Contributing

### Development Workflow

1. Create feature branch: `git checkout -b feature/my-feature`
2. Write tests first (TDD approach)
3. Implement feature
4. Run tests: `bun test`
5. Check coverage: `bun test --coverage`
6. Commit with conventional commits: `feat: add sighting photos`
7. Push and create pull request

### Code Standards
- **ESLint**: Run `bun run lint`
- **Prettier**: Run `bun run format`
- **TypeScript**: Strict mode enabled
- **Tests**: >80% coverage required
- **Documentation**: Update README and Swagger docs

---

## 📚 Additional Documentation

- [High-Level Design](docs/HIGH_LEVEL_DESIGN.md)
- [System Behavior Specification](docs/SYSTEM_BEHAVIOR_SPEC.md)
- [API Contract](docs/API_CONTRACT.md)
- [Notification Playbook](docs/NOTIFICATION_PLAYBOOK.md)
- [PostGIS Setup Guide](docs/postgis-setup.md)
- [Push Notifications Setup](docs/push-notifications-setup.md)
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Operational Runbook](docs/OPERATIONAL_RUNBOOK.md)

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

Built with:
- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [PostGIS](https://postgis.net/) - Spatial database extender
- [BullMQ](https://docs.bullmq.io/) - Redis-based job queue
- [Bun](https://bun.sh/) - Fast JavaScript runtime
