# Alert Module Documentation

## Overview

The Alert module manages the core functionality of missing pet alerts, including creation, updates, geospatial search, renewal, and resolution. It handles rate limiting, validation, and notification triggering for new alerts.

**Module Path:** `src/alert/`  
**Database Tables:** `Alert`  
**Dependencies:** PrismaService, NotificationService, RateLimitService, UploadService

---

## Table of Contents

1. [Architecture](#architecture)
2. [API Endpoints](#api-endpoints)
3. [Business Logic](#business-logic)
4. [Data Model](#data-model)
5. [Rate Limiting](#rate-limiting)
6. [Notification Integration](#notification-integration)
7. [Testing](#testing)

---

## Architecture

```
┌──────────────────┐
│ AlertController  │  ← HTTP Layer (REST endpoints)
└────────┬─────────┘
         │
         ├──→ BearerTokenGuard (authentication)
         ├──→ AlertOwnerGuard (authorization)
         └──→ ValidationPipe (DTO validation)
         │
┌────────▼─────────┐
│  AlertService    │  ← Business Logic
└────────┬─────────┘
         │
         ├──→ PrismaService (database access)
         ├──→ RateLimitService (rate limit checks)
         ├──→ NotificationService (queue notifications)
         └──→ UploadService (photo management)
```

### Module Structure

```
src/alert/
├── alert.controller.ts      # HTTP endpoints
├── alert.service.ts          # Business logic
├── alert.module.ts           # Module definition
├── dto/
│   ├── create-alert.dto.ts   # Create alert request
│   ├── update-alert.dto.ts   # Update alert request
│   ├── resolve-alert.dto.ts  # Resolve alert request
│   ├── list-alerts-query.dto.ts  # Search parameters
│   └── alert-response.dto.ts # Alert response format
└── guards/
    └── alert-owner.guard.ts  # Ownership verification
```

---

## API Endpoints

### POST /alerts
**Create Missing Pet Alert**

**Authentication:** Required (Bearer token)  
**Rate Limit:** 5 alerts/hour, 20/day, 50/week per user

**Request Body:**
```typescript
{
  "petDetails": {
    "name": "Max",
    "species": "DOG",
    "breed": "Golden Retriever",
    "description": "Friendly, answers to Max",
    "color": "Golden",
    "ageYears": 3,
    "photos": [
      "http://localhost:3000/uploads/alerts/1234567890-photo1.jpg"
    ]
  },
  "location": {
    "lat": 40.7128,
    "lon": -74.0060,
    "address": "123 Main St, New York, NY",
    "lastSeenTime": "2026-02-05T10:30:00Z",
    "radiusKm": 10
  },
  "contactDetails": {
    "phone": "+1234567890",
    "email": "owner@example.com",
    "isPhonePublic": true
  },
  "rewardDetails": {
    "offered": true,
    "amount": 500
  }
}
```

**Response (201 Created):**
```typescript
{
  "id": "alert-uuid",
  "status": "ACTIVE",
  "petDetails": { ... },
  "location": { ... },
  "contactDetails": { ... },
  "rewardDetails": { ... },
  "createdAt": "2026-02-05T10:30:00Z",
  "expiresAt": "2026-02-12T10:30:00Z",
  "renewalsRemaining": 3,
  "estimatedReach": 1234  // Approximate devices notified
}
```

**Error Responses:**
- `401 Unauthorized` - Missing or invalid token
- `422 Unprocessable Entity` - Validation errors
- `429 Too Many Requests` - Rate limit exceeded

---

### GET /alerts/:id
**Get Alert Details**

**Authentication:** Optional (public endpoint)

**Response (200 OK):**
```typescript
{
  "id": "alert-uuid",
  "status": "ACTIVE",
  "petDetails": { ... },
  "location": {
    "lat": 40.7128,
    "lon": -74.0060,
    "address": "123 Main St, New York, NY",
    "radiusKm": 10
  },
  "contactDetails": {
    // Only shows public fields if requester is not creator
    "phone": "+1234567890",  // Only if isPhonePublic=true
    "email": null  // Hidden from non-creators
  },
  "sightings": [
    {
      "id": "sighting-uuid",
      "confidence": "HIGH",
      "notes": "Saw near Central Park",
      "sightingTime": "2026-02-05T14:30:00Z"
    }
  ],
  "createdAt": "2026-02-05T10:30:00Z",
  "expiresAt": "2026-02-12T10:30:00Z"
}
```

---

### GET /alerts
**Search Nearby Alerts (Geospatial)**

**Authentication:** Optional (public endpoint)

**Query Parameters:**
- `lat` (required): Latitude
- `lon` (required): Longitude
- `radiusKm` (optional): Search radius (default: 10km, max: 100km)
- `species` (optional): Filter by species (DOG, CAT, etc.)
- `status` (optional): Filter by status (ACTIVE, RESOLVED, EXPIRED)
- `limit` (optional): Results per page (default: 20, max: 100)
- `offset` (optional): Pagination offset

**Example:**
```
GET /alerts?lat=40.7128&lon=-74.0060&radiusKm=10&species=DOG&limit=20
```

**Response (200 OK):**
```typescript
{
  "alerts": [
    {
      "id": "alert-uuid",
      "petName": "Max",
      "species": "DOG",
      "status": "ACTIVE",
      "distanceKm": 2.3,
      "lastSeenTime": "2026-02-05T10:30:00Z",
      "photos": ["..."],
      "rewardOffered": true
    },
    // ... more alerts
  ],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

---

### PATCH /alerts/:id
**Update Alert Details**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be alert creator

**Request Body (Partial):**
```typescript
{
  "petDetails": {
    "description": "Updated description"  // Only pet description allowed
  },
  "contactDetails": {
    "phone": "+1234567890",
    "isPhonePublic": false
  },
  "notes": "Additional information"
}
```

**Note:** Location and radius cannot be changed after creation.

**Response (200 OK):**
```typescript
{
  "id": "alert-uuid",
  "status": "ACTIVE",
  // ... updated fields
  "updatedAt": "2026-02-05T12:00:00Z"
}
```

---

### POST /alerts/:id/photos
**Upload Photos to Alert**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be alert creator  
**Content-Type:** `multipart/form-data`

**Request:**
```
POST /alerts/:id/photos
Content-Type: multipart/form-data

files: [File, File, ...]  // Max 5 files, 10MB each
```

**Response (200 OK):**
```typescript
{
  "photos": [
    "http://localhost:3000/uploads/alerts/1234567890-photo1.jpg",
    "http://localhost:3000/uploads/alerts/1234567891-photo2.jpg"
  ]
}
```

---

### POST /alerts/:id/resolve
**Mark Alert as Resolved**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be alert creator

**Request Body:**
```typescript
{
  "outcome": "FOUND_PET",  // Or "FALSE_ALARM", "OWNER_RESOLVED"
  "notes": "Found at neighbor's house",
  "shareSuccessStory": true  // Optional: share publicly
}
```

**Response (200 OK):**
```typescript
{
  "id": "alert-uuid",
  "status": "RESOLVED",
  "resolvedAt": "2026-02-06T15:30:00Z",
  "outcome": "FOUND_PET",
  "notes": "Found at neighbor's house"
}
```

**Side Effects:**
- Cancels any queued notifications
- Sends resolution notification to sighting reporters
- Updates alert status to RESOLVED

---

### POST /alerts/:id/renew
**Renew Expiring Alert**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be alert creator

**Request:** Empty body

**Response (200 OK):**
```typescript
{
  "id": "alert-uuid",
  "status": "ACTIVE",
  "expiresAt": "2026-02-13T10:30:00Z",  // Extended by 7 days
  "renewalCount": 1,
  "renewalsRemaining": 2  // Max 3 renewals
}
```

**Error:**
- `422 Unprocessable Entity` - Max renewals exceeded (3)

---

## Business Logic

### Alert Creation Workflow

1. **Validation:**
   - Validate input DTO (coordinates, species, phone format)
   - Check user authentication

2. **Rate Limit Check:**
   - Query Redis for user's recent alerts
   - Enforce limits: 5/hour, 20/day, 50/week
   - Return 429 if exceeded

3. **Create Alert:**
   - Insert into database with PostGIS `ST_MakePoint`
   - Set `expires_at` = `created_at` + 7 days
   - Set `status` = ACTIVE

4. **Queue Notifications:**
   - Add job to BullMQ: `send-alert-notifications`
   - Job payload: `{ alertId }`
   - Processed asynchronously by NotificationService

5. **Return Response:**
   - Return created alert with estimated reach
   - Reach estimate based on device count in radius

---

### Expiration Logic

**Cron Job:** Runs every hour (`@Cron('0 * * * *')`)

**Process:**
1. Query alerts where `expires_at < now()` AND `status = ACTIVE`
2. Update `status` to `EXPIRED`
3. Cancel queued notifications in BullMQ
4. Log audit event

---

### Renewal Rules

- **Max Renewals:** 3 per alert
- **Extension:** +7 days from current expiration
- **Increment:** `renewal_count` by 1
- **Restriction:** Cannot renew if already expired

---

## Data Model

### Alert Table Schema

```prisma
model Alert {
  id                       String       @id @default(uuid())
  creator_id               String
  status                   AlertStatus  @default(ACTIVE)
  
  // Pet Details
  pet_name                 String       @db.VarChar(100)
  pet_species              PetSpecies
  pet_breed                String?      @db.VarChar(100)
  pet_description          String       @db.Text
  pet_color                String?      @db.VarChar(50)
  pet_age_years            Int?
  pet_photos               String[]     // Array of URLs
  
  // Location (PostGIS)
  location_point           Unsupported("geometry(Point, 4326)")
  location_address         String       @db.Text
  last_seen_time           DateTime
  radius_km                Float
  affected_postal_codes    String[]     // Pre-computed for matching
  
  // Contact
  contact_phone            String       @db.VarChar(20)
  contact_email            String?      @db.VarChar(255)
  is_phone_public          Boolean      @default(false)
  
  // Reward
  reward_offered           Boolean      @default(false)
  reward_amount            Float?
  
  // Lifecycle
  created_at               DateTime     @default(now())
  updated_at               DateTime     @updatedAt
  expires_at               DateTime
  renewal_count            Int          @default(0)
  resolved_at              DateTime?
  resolved_outcome         String?
  resolved_notes           String?
  
  // Relations
  creator                  User         @relation("CreatedAlerts", fields: [creator_id], references: [id])
  sightings                Sighting[]
  notifications            Notification[]
  
  @@index([creator_id])
  @@index([status])
  @@index([expires_at])
  @@index([affected_postal_codes], type: Gin)
  @@index([location_point], type: Gist)
}

enum AlertStatus {
  DRAFT
  ACTIVE
  RESOLVED
  EXPIRED
}

enum PetSpecies {
  DOG
  CAT
  BIRD
  RABBIT
  OTHER
}
```

---

## Rate Limiting

### Configuration

```typescript
// .env
RATE_LIMIT_ALERTS_PER_HOUR=5
RATE_LIMIT_ALERTS_PER_DAY=20
RATE_LIMIT_ALERTS_PER_WEEK=50
```

### Implementation

Uses Redis sorted sets to track alert creation timestamps per user:

```typescript
// Redis key: rate-limit:alerts:user:{userId}
// Value: sorted set of timestamps

ZADD rate-limit:alerts:user:123 1707134400 "alert-uuid-1"
ZADD rate-limit:alerts:user:123 1707134500 "alert-uuid-2"
```

### Enforcement

1. Check hourly limit: Count alerts in last 3600 seconds
2. Check daily limit: Count alerts in last 86400 seconds
3. Check weekly limit: Count alerts in last 604800 seconds
4. Return 429 with `retry_after_seconds` if any limit exceeded

---

## Notification Integration

### Alert Creation Notification Flow

```
1. AlertService.create()
   ↓
2. notificationService.queueAlertNotifications({ alertId })
   ↓
3. BullMQ Job Added: 'send-alert-notifications'
   ↓
4. NotificationProcessor.processAlertNotifications()
   ↓
5. LocationService.findDevicesForAlert(alertId)
   ↓
6. For each device match:
   - Create Notification record (QUEUED)
   - Queue 'send-push' job
   ↓
7. NotificationProcessor.processPushNotification()
   ↓
8. FCMService or APNsService sends push
   ↓
9. Update Notification status (SENT or FAILED)
```

### Notification Targeting

Devices are notified based on location match confidence:

- **HIGH:** Saved zone match OR Fresh GPS (<2h)
- **MEDIUM:** Stale GPS (<24h) OR Postal code match
- **LOW:** IP geolocation match

See [Notification Module](./notification-module.md) for details.

---

## Testing

### Unit Tests

**Location:** `src/alert/alert.service.spec.ts`

**Coverage:**
- ✅ Create alert with valid input
- ✅ Rate limit enforcement (5/hour, 20/day, 50/week)
- ✅ Geospatial search with ST_DWithin
- ✅ Update alert (ownership validation)
- ✅ Resolve alert workflow
- ✅ Renew alert (max renewal check)
- ✅ Expiration cron job

**Run:**
```bash
bun test alert.service.spec.ts
```

---

### Integration Tests

**Location:** `test/alert.e2e-spec.ts`

**Scenarios:**
- Create alert with authentication
- Search alerts by location
- Update alert (authorized vs unauthorized)
- Resolve alert
- Rate limit exceeded (429)
- Invalid coordinates (422)

**Run:**
```bash
bun test:e2e test/alert.e2e-spec.ts
```

---

## Performance Considerations

### Geospatial Query Optimization

**Index:** GIST index on `location_point` column

```sql
CREATE INDEX "Alert_location_point_idx"
ON "Alert" USING GIST (location_point);
```

**Query Performance:**
- Target: p95 < 100ms for 10,000 alerts
- Use `ST_DWithin` (index-optimized) instead of `ST_Distance` in WHERE clause

**Example:**
```sql
-- Good: Uses GIST index
SELECT * FROM "Alert"
WHERE ST_DWithin(
  location_point::geography,
  ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography,
  10000  -- 10km in meters
);

-- Bad: Forces full table scan
SELECT * FROM "Alert"
WHERE ST_Distance(location_point::geography, ...) < 10000;
```

---

## Error Handling

### Common Errors

| Error Code | Reason | Solution |
|------------|--------|----------|
| 401 | Missing/invalid token | Include valid Bearer token |
| 403 | Not alert owner | Use AlertOwnerGuard |
| 422 | Validation failed | Check DTO constraints |
| 429 | Rate limit exceeded | Wait for retry_after_seconds |
| 404 | Alert not found | Verify alert ID exists |

---

## Related Documentation

- [Notification Module](./notification-module.md) - Notification targeting
- [Location Module](./location-module.md) - Geospatial matching
- [Device Module](./device-module.md) - Device management
- [System Behavior Spec](../SYSTEM_BEHAVIOR_SPEC.md) - Business rules
- [API Contract](../API_CONTRACT.md) - Complete API reference

---

## Support

For issues with Alert module:
- Check logs: `logs/application-*.log`
- Verify rate limits in Redis: `redis-cli ZRANGE rate-limit:alerts:user:{userId} 0 -1 WITHSCORES`
- Test geospatial query: `EXPLAIN ANALYZE SELECT ...`
- Consult [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)
