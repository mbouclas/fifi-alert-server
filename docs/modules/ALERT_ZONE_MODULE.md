# Alert Zone Module Documentation

## Overview

The Alert Zone module manages user-scoped geographic zones for receiving missing pet notifications. Unlike SavedZones (device-specific), Alert Zones apply to **all of a user's devices**, providing consistent notification coverage across their entire device ecosystem.

**Module Path:** `src/user/alert-zone.service.ts` (part of UserModule)  
**Database Tables:** `AlertZone`  
**Dependencies:** PrismaService, EventEmitter2

---

## Table of Contents

1. [Architecture](#architecture)
2. [API Endpoints](#api-endpoints)
3. [Business Logic](#business-logic)
4. [Data Model](#data-model)
5. [Notification Matching](#notification-matching)
6. [Differences from SavedZones](#differences-from-savedzones)
7. [Testing](#testing)
8. [Best Practices](#best-practices)

---

## Architecture

```
┌──────────────────┐
│ UserController   │  ← HTTP Layer (REST endpoints under /users/me/alert-zones)
└────────┬─────────┘
         │
         ├──→ BearerTokenGuard (authentication)
         ├──→ @Session() decorator (user context)
         └──→ ValidationPipe (DTO validation)
         │
┌────────▼─────────────┐
│ AlertZoneService     │  ← Business Logic (CRUD operations)
└────────┬─────────────┘
         │
         ├──→ PrismaService (database + PostGIS queries)
         ├──→ EventEmitter2 (audit event logging)
         └──→ LocationService (notification matching)
                     │
                     └──→ findAlertZoneMatches() ← Called during alert creation
```

### Module Structure

```
src/user/
├── user.controller.ts             # Alert zone endpoints (POST, GET, PATCH, DELETE)
├── alert-zone.service.ts          # Alert zone business logic
├── dto/
│   ├── alert-zone.dto.ts          # Create, Update, Response DTOs
│   └── index.ts                   # DTO exports
└── user.module.ts                 # Exports AlertZoneService

src/location/
└── location.service.ts            # Contains findAlertZoneMatches()
```

---

## API Endpoints

### POST /users/me/alert-zones
**Create Alert Zone**

**Authentication:** Required (Bearer token)

**Request Body:**
```typescript
{
  "name": "My Neighborhood",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "radius_meters": 500,      // 50-5000 meters
  "priority": 1,             // Optional: 0-10, default 1
  "is_active": true          // Optional: default true
}
```

**Response (201 Created):**
```typescript
{
  "id": 123,
  "name": "My Neighborhood",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "radius_meters": 500,
  "radius_km": 0.5,          // Computed for UI display
  "is_active": true,
  "priority": 1,
  "created_at": "2026-02-08T10:30:00Z",
  "updated_at": "2026-02-08T10:30:00Z"
}
```

**Error Responses:**
- `400 Bad Request` - Max zones exceeded (10 per user) or invalid input
- `401 Unauthorized` - Missing or invalid token
- `422 Unprocessable Entity` - Validation errors

**Validation Rules:**
- `name`: 1-50 characters, required
- `latitude`: -90 to 90, required
- `longitude`: -180 to 180, required
- `radius_meters`: 50 to 5000, required
- `priority`: 0-10, optional (default 1)
- `is_active`: boolean, optional (default true)

---

### GET /users/me/alert-zones
**List User's Alert Zones**

**Authentication:** Required (Bearer token)

**Query Parameters:** None

**Response (200 OK):**
```typescript
[
  {
    "id": 123,
    "name": "Home",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radius_meters": 500,
    "radius_km": 0.5,
    "is_active": true,
    "priority": 1,
    "created_at": "2026-02-08T10:30:00Z",
    "updated_at": "2026-02-08T10:30:00Z"
  },
  {
    "id": 124,
    "name": "Work",
    "latitude": 37.7849,
    "longitude": -122.4094,
    "radius_meters": 300,
    "radius_km": 0.3,
    "is_active": true,
    "priority": 0,
    "created_at": "2026-02-08T11:00:00Z",
    "updated_at": "2026-02-08T11:00:00Z"
  }
]
```

**Ordering:** Zones are returned ordered by `priority DESC, created_at DESC`

---

### GET /users/me/alert-zones/:id
**Get Specific Alert Zone**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be zone owner

**Response (200 OK):**
```typescript
{
  "id": 123,
  "name": "Home",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "radius_meters": 500,
  "radius_km": 0.5,
  "is_active": true,
  "priority": 1,
  "created_at": "2026-02-08T10:30:00Z",
  "updated_at": "2026-02-08T10:30:00Z"
}
```

**Error Responses:**
- `403 Forbidden` - Not the zone owner
- `404 Not Found` - Zone doesn't exist

---

### PATCH /users/me/alert-zones/:id
**Update Alert Zone**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be zone owner

**Request Body:** (all fields optional)
```typescript
{
  "name": "Extended Neighborhood",
  "latitude": 37.7750,      // Optional: move zone
  "longitude": -122.4195,
  "radius_meters": 1000,    // Optional: expand radius
  "priority": 2,
  "is_active": false        // Optional: deactivate temporarily
}
```

**Response (200 OK):**
```typescript
{
  "id": 123,
  "name": "Extended Neighborhood",
  "latitude": 37.7750,
  "longitude": -122.4195,
  "radius_meters": 1000,
  "radius_km": 1.0,
  "is_active": false,
  "priority": 2,
  "created_at": "2026-02-08T10:30:00Z",
  "updated_at": "2026-02-08T12:00:00Z"
}
```

**Error Responses:**
- `403 Forbidden` - Not the zone owner
- `404 Not Found` - Zone doesn't exist
- `422 Unprocessable Entity` - Validation errors

---

### DELETE /users/me/alert-zones/:id
**Delete Alert Zone**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be zone owner

**Response (204 No Content):** Empty body

**Error Responses:**
- `403 Forbidden` - Not the zone owner
- `404 Not Found` - Zone doesn't exist

---

## Business Logic

### AlertZoneService Methods

#### create(dto, userId)
**Purpose:** Create a new alert zone for the user

**Logic:**
1. Validate user exists
2. Check if user has reached max zones (10)
3. Use `$queryRaw` to insert with PostGIS geometry:
```sql
INSERT INTO alert_zones (user_id, name, location_point, radius_meters, priority, is_active)
VALUES ($userId, $name, ST_SetSRID(ST_MakePoint($lon, $lat), 4326), $radiusMeters, $priority, $isActive)
RETURNING id
```
4. Fetch created zone
5. Emit `ENTITY.CREATED` audit event
6. Return mapped `AlertZoneResponseDto`

**Constraints:**
- Max 10 zones per user (enforced in code)
- radius_meters: 50-5000 (validated by DTO)

---

#### findByUser(userId)
**Purpose:** Get all alert zones for a user

**Logic:**
1. Query with PostGIS to extract lat/lon:
```sql
SELECT id, user_id, name, radius_meters, is_active, priority,
       ST_X(location_point::geometry) as lon,
       ST_Y(location_point::geometry) as lat,
       created_at, updated_at
FROM alert_zones
WHERE user_id = $userId
ORDER BY priority DESC, created_at DESC
```
2. Map results to `AlertZoneResponseDto[]`
3. Include computed `radius_km` field (radius_meters / 1000)

**Returns:** Empty array if user has no zones

---

#### findOne(zoneId, userId)
**Purpose:** Get a specific alert zone

**Logic:**
1. Query by ID
2. Verify ownership: `zone.user_id === userId`
3. Throw `ForbiddenException` if not owner
4. Throw `NotFoundException` if not found
5. Fetch lat/lon via PostGIS
6. Return mapped `AlertZoneResponseDto`

---

#### update(zoneId, dto, userId)
**Purpose:** Update an existing alert zone

**Logic:**
1. Find zone by ID
2. Verify ownership
3. If location changed (lat/lon provided), use `$executeRaw` to update geometry:
```sql
UPDATE alert_zones
SET location_point = ST_SetSRID(ST_MakePoint($lon, $lat), 4326),
    name = $name, radius_meters = $radiusMeters, priority = $priority, is_active = $isActive
WHERE id = $zoneId
```
4. Otherwise use `prisma.alertZone.update()` for non-geometry fields
5. Emit `ENTITY.UPDATED` audit event with old/new values
6. Return updated `AlertZoneResponseDto`

---

#### delete(zoneId, userId)
**Purpose:** Delete an alert zone

**Logic:**
1. Find zone by ID
2. Verify ownership
3. Use `prisma.alertZone.delete()`
4. Emit `ENTITY.DELETED` audit event
5. Return void

**Note:** No cascade operations needed; zones don't have child records

---

## Data Model

### AlertZone Table

```sql
CREATE TABLE alert_zones (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  location_point GEOMETRY(Point, 4326) NOT NULL,  -- PostGIS
  radius_meters INTEGER NOT NULL CHECK (radius_meters >= 50 AND radius_meters <= 5000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0 AND priority <= 10),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_alert_zones_user_id ON alert_zones(user_id);
CREATE INDEX idx_alert_zones_is_active ON alert_zones(is_active);
CREATE INDEX idx_alert_zones_location_gist ON alert_zones USING GIST(location_point);
```

### Prisma Schema

```prisma
model AlertZone {
  id             Int      @id @default(autoincrement()) @map("id")
  user_id        Int      @map("user_id")
  user           User     @relation("UserAlertZones", fields: [user_id], references: [id], onDelete: Cascade)
  
  name           String   @db.VarChar(50)
  lat            Float
  lon            Float
  location_point Unsupported("geometry(Point, 4326)")
  radius_meters  Int      @map("radius_meters")
  
  is_active      Boolean  @default(true) @map("is_active")
  priority       Int      @default(0)
  
  created_at     DateTime @default(now()) @map("created_at")
  updated_at     DateTime @updatedAt @map("updated_at")
  
  @@index([user_id])
  @@index([is_active])
  @@index([location_point], type: Gist)
  @@map("alert_zones")
}
```

---

## Notification Matching

### How Alert Zones Work in Notification Flow

When an alert is created, the system queries all alert zones within range:

1. **Alert Created** at location (lat, lon) with radius R
2. **LocationService.findAlertZoneMatches()** queries:
```sql
SELECT 
  d.id as device_id,
  d.user_id,
  d.push_token,
  az.id as zone_id,
  az.name as zone_name,
  az.radius_meters,
  ST_Distance(
    az.location_point::geography,
    ST_SetSRID(ST_MakePoint($alertLon, $alertLat), 4326)::geography
  ) as distance_meters
FROM alert_zones az
INNER JOIN users u ON az.user_id = u.id
INNER JOIN devices d ON d.user_id = u.id  -- All user devices
WHERE az.is_active = true
  AND d.push_token IS NOT NULL
  AND d.push_enabled = true
  AND u.banned = false
  AND ST_DWithin(
    az.location_point::geography,
    ST_SetSRID(ST_MakePoint($alertLon, $alertLat), 4326)::geography,
    (az.radius_meters + ($alertRadiusKm * 1000))
  )
ORDER BY az.priority DESC, distance_meters ASC
```
3. **All devices** of matched users receive notifications
4. Notifications have **HIGH confidence** (same as SavedZone matches)
5. `matchedVia` field: `"Alert zone: {zoneName}"`
6. Priority: `1` (same as SavedZones)

### Deduplication

If a user matches via **both** an AlertZone and a SavedZone:
- System deduplicates by `device_id`
- User receives **only one notification per device**
- Both match reasons are logged in audit events

---

## Differences from SavedZones

| Aspect | SavedZone | AlertZone |
|--------|-----------|-----------|
| **Scope** | Device-specific | **User-specific** |
| **Setup** | Create per device | **Create once, applies to all devices** |
| **Radius Unit** | Kilometers (Float) | **Meters (Integer)** |
| **Radius Range** | 0.1-50 km | **50-5000 meters** |
| **Max Limit** | 5 per device | **10 per user** |
| **API Path** | `/devices/:id/saved-zones` | **`/users/me/alert-zones`** |
| **Use Case** | Device-specific preferences | **Consistent coverage across all devices** |
| **Database Table** | `saved_zones` | **`alert_zones`** |
| **Foreign Key** | `device_id` | **`user_id`** |

### When to Use Which?

**Use SavedZones:** 
- Different devices need different zones (e.g., work phone vs personal phone)
- Device-specific location preferences
- Kilometer-level precision is sufficient

**Use AlertZones:**
- User wants consistent notification coverage on all devices
- Meter-level precision needed (neighborhood, block-level)
- Simpler setup (configure once)

---

## Testing

### Unit Tests

**File:** `src/user/alert-zone.service.spec.ts`

**Test Coverage:**
- ✅ `create()` successfully creates zone with valid input
- ✅ `create()` throws BadRequestException when max zones exceeded
- ✅ `create()` correctly converts lat/lon to PostGIS Point
- ✅ `create()` emits ENTITY.CREATED audit event
- ✅ `findByUser()` returns zones ordered by priority
- ✅ `findByUser()` returns empty array when user has no zones
- ✅ `findOne()` throws ForbiddenException when not owner
- ✅ `findOne()` throws NotFoundException when zone doesn't exist
- ✅ `update()` successfully updates zone
- ✅ `update()` throws ForbiddenException when not owner
- ✅ `update()` emits ENTITY.UPDATED audit event with old/new values
- ✅ `delete()` successfully deletes zone
- ✅ `delete()` throws ForbiddenException when not owner
- ✅ `delete()` emits ENTITY.DELETED audit event

### E2E Tests

**File:** `test/alert-zone.e2e-spec.ts`

**Test Scenarios:**
- ✅ POST: Creates zone with valid input
- ✅ POST: Returns 400 when max zones exceeded
- ✅ POST: Returns 401 when not authenticated
- ✅ POST: Validates radius_meters range (50-5000)
- ✅ GET: Returns user's zones ordered by priority
- ✅ GET: Returns empty array for new user
- ✅ GET: Does not return other users' zones
- ✅ GET /:id: Returns specific zone
- ✅ GET /:id: Returns 403 when not owner
- ✅ PATCH: Updates zone successfully
- ✅ PATCH: Returns 403 when not owner
- ✅ PATCH: Returns 404 when zone doesn't exist
- ✅ DELETE: Deletes zone successfully
- ✅ DELETE: Returns 403 when not owner

**Test Coverage:** >80% for AlertZoneService

---

## Best Practices

### For Users

1. **Start with 2-3 zones** (Home, Work, Neighborhood)
2. **Use smaller radii for precision** (100-500m)
3. **Use larger radii for coverage** (1-3km)
4. **Name zones descriptively** ("Downtown SF" vs "Zone 1")
5. **Deactivate zones temporarily** when traveling
6. **Set priority** for most important zones (higher = more important)

### For Developers

1. **Always verify ownership** before update/delete
2. **Use PostGIS for all spatial queries** (don't calculate distance in JS)
3. **Emit audit events** for all CRUD operations
4. **Test with real coordinates** (not just 0,0)
5. **Monitor query performance** (<50ms target)
6. **Validate radius bounds** (50-5000m)
7. **Index location_point with GIST** for performance

### Performance Tips

1. **GIST indexes are critical** - Ensure `alert_zones.location_point` has GIST index
2. **Use ST_DWithin** instead of ST_Distance for range queries (more efficient)
3. **Order by priority first** to prioritize important zones
4. **Limit results** if not paginating (use LIMIT in queries)
5. **Cache user zones in Redis** if read-heavy (optional)

---

## Audit Events

All CRUD operations emit audit events:

### ENTITY.CREATED
```typescript
{
  eventType: 'ENTITY.CREATED',
  action: 'alert_zone_created',
  actorType: 'USER',
  actorId: userId,
  entityType: 'ALERT_ZONE',
  entityId: zoneId,
  metadata: {
    name: 'Home',
    radius_meters: 500,
    lat: 37.7749,
    lon: -122.4194,
    priority: 1
  }
}
```

### ENTITY.UPDATED
```typescript
{
  eventType: 'ENTITY.UPDATED',
  action: 'alert_zone_updated',
  actorType: 'USER',
  actorId: userId,
  entityType: 'ALERT_ZONE',
  entityId: zoneId,
  metadata: {
    oldValues: { name: 'Home', radius_meters: 500 },
    newValues: { name: 'Extended Home', radius_meters: 1000 }
  }
}
```

### ENTITY.DELETED
```typescript
{
  eventType: 'ENTITY.DELETED',
  action: 'alert_zone_deleted',
  actorType: 'USER',
  actorId: userId,
  entityType: 'ALERT_ZONE',
  entityId: zoneId,
  metadata: {
    name: 'Home',
    radius_meters: 500
  }
}
```

---

## Error Handling

### Common Errors

**BadRequestException (400):**
- Max zones exceeded (10 per user)
- Invalid radius (< 50 or > 5000)
- Invalid coordinates (lat > 90, lon > 180)

**ForbiddenException (403):**
- Attempting to access/modify another user's zone
- Ownership verification failed

**NotFoundException (404):**
- Zone ID doesn't exist
- Zone was deleted

**UnprocessableEntityException (422):**
- Validation errors (missing required fields)
- Invalid data types

### Error Response Format

```typescript
{
  "statusCode": 400,
  "message": "User has reached maximum limit of 10 alert zones",
  "error": "Bad Request"
}
```

---

## Security

### Authorization
- **Only zone owners** can read/update/delete their zones
- Ownership verified on every request
- User ID extracted from `@Session()` decorator (JWT token)

### Input Validation
- All DTOs use `class-validator` decorators
- Coordinates validated for valid ranges
- Radius validated for 50-5000m range
- Name sanitized and length-limited (50 chars)

### Rate Limiting
- TODO: Add rate limiting to POST endpoint (10 creates/hour per user)
- Prevents zone creation spam/abuse

---

## Future Enhancements

1. **Zone Templates** - Pre-defined zones ("500m Home", "1km Neighborhood")
2. **Auto-Detection** - Suggest zones based on device GPS patterns
3. **Zone Categories** - Tag zones as "home", "work", "frequent", etc.
4. **Zone Sharing** - Share zones with family members
5. **Smart Radius** - Auto-adjust based on alert density
6. **Admin Dashboard** - View all zones for moderation/debugging
7. **Zone Analytics** - Track match rates and effectiveness per zone

---

## References

- [FEATURE_OVERVIEW.md](../plans/add-alert-zones/FEATURE_OVERVIEW.md) - High-level feature description
- [tasks.md](../plans/add-alert-zones/tasks.md) - Implementation checklist
- [PostGIS Documentation](https://postgis.net/docs/) - Spatial functions reference
- [DEVICE_MODULE.md](./DEVICE_MODULE.md) - SavedZones implementation (comparison)
- [LOCATION_MODULE.md](./LOCATION_MODULE.md) - Notification matching logic
