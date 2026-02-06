# Device Module Documentation

## Overview

The Device module manages mobile device registration, location updates, saved zones, and push notification token management. It tracks device locations for alert targeting and provides location-aware services.

**Module Path:** `src/device/`  
**Database Tables:** `Device`, `SavedZone`  
**Dependencies:** PrismaService, LocationService

---

## Table of Contents

1. [Architecture](#architecture)
2. [API Endpoints](#api-endpoints)
3. [Business Logic](#business-logic)
4. [Data Model](#data-model)
5. [Location Tracking](#location-tracking)
6. [Saved Zones](#saved-zones)
7. [Testing](#testing)

---

## Architecture

```
┌──────────────────┐
│ DeviceController │  ← HTTP Layer (REST endpoints)
└────────┬─────────┘
         │
         ├──→ BearerTokenGuard (authentication)
         ├──→ DeviceOwnerGuard (authorization)
         └──→ ValidationPipe (DTO validation)
         │
┌────────▼─────────┐
│  DeviceService   │  ← Business Logic
└────────┬─────────┘
         │
         ├──→ PrismaService (database access)
         ├──→ LocationService (geolocation)
         └──→ SavedZoneService (saved zone management)
```

### Module Structure

```
src/device/
├── device.controller.ts      # HTTP endpoints
├── device.service.ts          # Business logic
├── device.module.ts           # Module definition
├── dto/
│   ├── register-device.dto.ts     # Device registration
│   ├── update-location.dto.ts     # Location update
│   ├── create-saved-zone.dto.ts   # Saved zone creation
│   └── device-response.dto.ts     # Device response format
├── guards/
│   └── device-owner.guard.ts  # Ownership verification
└── services/
    └── saved-zone.service.ts  # Saved zone logic
```

---

## API Endpoints

### POST /devices
**Register New Device**

**Authentication:** Required (Bearer token)

**Request Body:**
```typescript
{
  "platform": "IOS",  // Or "ANDROID"
  "osVersion": "17.2",
  "appVersion": "1.0.0",
  "deviceIdentifier": "unique-device-id",
  "pushToken": "fcm-token-or-apns-token",
  "location": {
    "type": "GPS",
    "lat": 40.7128,
    "lon": -74.0060,
    "accuracy": 10  // meters
  }
}
```

**Response (201 Created):**
```typescript
{
  "id": "device-uuid",
  "owner_id": "user-uuid",
  "platform": "IOS",
  "osVersion": "17.2",
  "appVersion": "1.0.0",
  "pushToken": "fcm-token-or-apns-token",
  "location": {
    "type": "GPS",
    "lat": 40.7128,
    "lon": -74.0060,
    "accuracy": 10,
    "updatedAt": "2026-02-05T10:30:00Z"
  },
  "savedZones": [],
  "createdAt": "2026-02-05T10:30:00Z",
  "lastActiveAt": "2026-02-05T10:30:00Z"
}
```

**Error Responses:**
- `401 Unauthorized` - Missing or invalid token
- `422 Unprocessable Entity` - Validation errors

---

### PATCH /devices/:id/location
**Update Device Location**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be device owner

**Request Body:**
```typescript
{
  "type": "GPS",  // Or "IP"
  "lat": 40.7128,
  "lon": -74.0060,
  "accuracy": 10,  // Optional: meters
  "postalCode": "10001"  // Optional: for IP geolocation
}
```

**Response (200 OK):**
```typescript
{
  "id": "device-uuid",
  "location": {
    "type": "GPS",
    "lat": 40.7128,
    "lon": -74.0060,
    "accuracy": 10,
    "updatedAt": "2026-02-05T11:00:00Z"
  },
  "locationFreshness": "FRESH",  // FRESH, STALE, or NONE
  "lastActiveAt": "2026-02-05T11:00:00Z"
}
```

---

### PATCH /devices/:id/push-token
**Update Push Notification Token**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be device owner

**Request Body:**
```typescript
{
  "pushToken": "new-fcm-token-or-apns-token"
}
```

**Response (200 OK):**
```typescript
{
  "id": "device-uuid",
  "pushToken": "new-fcm-token-or-apns-token",
  "updatedAt": "2026-02-05T11:15:00Z"
}
```

**Use Cases:**
- Token refresh (FCM tokens expire periodically)
- App reinstallation (new APNs token)
- Platform migration (Android → iOS)

---

### GET /devices/:id
**Get Device Details**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be device owner

**Response (200 OK):**
```typescript
{
  "id": "device-uuid",
  "owner_id": "user-uuid",
  "platform": "IOS",
  "osVersion": "17.2",
  "appVersion": "1.0.0",
  "pushToken": "fcm-token-or-apns-token",
  "location": {
    "type": "GPS",
    "lat": 40.7128,
    "lon": -74.0060,
    "accuracy": 10,
    "updatedAt": "2026-02-05T11:00:00Z"
  },
  "locationFreshness": "FRESH",
  "savedZones": [
    {
      "id": "zone-uuid",
      "name": "Home",
      "lat": 40.7128,
      "lon": -74.0060,
      "radiusKm": 1,
      "isPrimary": true
    }
  ],
  "createdAt": "2026-02-05T10:30:00Z",
  "lastActiveAt": "2026-02-05T11:00:00Z"
}
```

---

### POST /devices/:id/saved-zones
**Create Saved Zone**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be device owner  
**Limit:** Maximum 5 saved zones per device

**Request Body:**
```typescript
{
  "name": "Home",
  "lat": 40.7128,
  "lon": -74.0060,
  "radiusKm": 1,
  "isPrimary": true  // Only one zone can be primary
}
```

**Response (201 Created):**
```typescript
{
  "id": "zone-uuid",
  "device_id": "device-uuid",
  "name": "Home",
  "lat": 40.7128,
  "lon": -74.0060,
  "radiusKm": 1,
  "isPrimary": true,
  "createdAt": "2026-02-05T12:00:00Z"
}
```

**Error:**
- `422 Unprocessable Entity` - Max saved zones exceeded (5)

---

### PATCH /devices/:id/saved-zones/:zoneId
**Update Saved Zone**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be device owner

**Request Body (Partial):**
```typescript
{
  "name": "Updated Home",
  "radiusKm": 2,
  "isPrimary": false
}
```

**Response (200 OK):**
```typescript
{
  "id": "zone-uuid",
  "name": "Updated Home",
  "radiusKm": 2,
  "isPrimary": false,
  "updatedAt": "2026-02-05T12:30:00Z"
}
```

---

### DELETE /devices/:id/saved-zones/:zoneId
**Delete Saved Zone**

**Authentication:** Required (Bearer token)  
**Authorization:** Must be device owner

**Response (204 No Content)**

---

## Business Logic

### Device Registration Workflow

1. **Validation:**
   - Validate platform (IOS, ANDROID)
   - Validate push token format
   - Validate location coordinates

2. **Duplicate Check:**
   - Check if `deviceIdentifier` already exists for user
   - If exists: Update existing device (push token, location)
   - If not: Create new device

3. **Location Processing:**
   - Store GPS point using PostGIS `ST_MakePoint`
   - Extract postal code if GPS coordinates provided
   - Set `location_type` (GPS or IP)

4. **Return Response:**
   - Return device with location freshness status

---

### Location Update Workflow

1. **Update Location:**
   - Update GPS/IP point using PostGIS
   - Update `location_updated_at` timestamp
   - Update `last_active_at` timestamp

2. **Calculate Freshness:**
   - **FRESH:** Updated within last 2 hours
   - **STALE:** Updated within last 24 hours
   - **NONE:** No location or updated > 24 hours ago

3. **Postal Code Extraction:**
   - If GPS: Extract postal code using reverse geocoding
   - If IP: Use postal code from IP geolocation service

---

### Saved Zone Rules

- **Maximum Zones:** 5 per device
- **Primary Zone:** Only one zone can be primary
- **Confidence:** Saved zone matches get HIGH confidence notifications
- **Overlap:** Zones can overlap (user may have Home + Work nearby)

---

## Data Model

### Device Table Schema

```prisma
model Device {
  id                       String       @id @default(uuid())
  owner_id                 String
  
  // Platform Info
  platform                 Platform
  os_version               String       @db.VarChar(20)
  app_version              String       @db.VarChar(20)
  device_identifier        String       @db.VarChar(255)  // Unique per user
  
  // Push Notifications
  push_token               String       @db.Text
  push_token_updated_at    DateTime     @default(now())
  
  // Location (PostGIS)
  location_type            LocationType?
  gps_point                Unsupported("geometry(Point, 4326)")?
  gps_accuracy             Float?       // meters
  location_updated_at      DateTime?
  
  ip_point                 Unsupported("geometry(Point, 4326)")?
  ip_postal_code           String?      @db.VarChar(10)
  
  // Lifecycle
  created_at               DateTime     @default(now())
  updated_at               DateTime     @updatedAt
  last_active_at           DateTime     @default(now())
  
  // Relations
  owner                    User         @relation("UserDevices", fields: [owner_id], references: [id])
  saved_zones              SavedZone[]
  notifications            Notification[]
  
  @@unique([owner_id, device_identifier])
  @@index([owner_id])
  @@index([gps_point], type: Gist)
  @@index([ip_point], type: Gist)
  @@index([ip_postal_code])
}

enum Platform {
  IOS
  ANDROID
}

enum LocationType {
  GPS
  IP
}
```

---

### SavedZone Table Schema

```prisma
model SavedZone {
  id                       String       @id @default(uuid())
  device_id                String
  
  // Zone Details
  name                     String       @db.VarChar(100)
  location_point           Unsupported("geometry(Point, 4326)")
  radius_km                Float
  is_primary               Boolean      @default(false)
  
  // Lifecycle
  created_at               DateTime     @default(now())
  updated_at               DateTime     @updatedAt
  
  // Relations
  device                   Device       @relation(fields: [device_id], references: [id], onDelete: Cascade)
  
  @@index([device_id])
  @@index([location_point], type: Gist)
}
```

---

## Location Tracking

### Location Freshness

Location freshness determines notification targeting confidence:

| Freshness | Time Range | Confidence | Use Case |
|-----------|------------|------------|----------|
| **FRESH** | < 2 hours | HIGH | Active users, real-time location |
| **STALE** | 2-24 hours | MEDIUM | Recent location, reasonable accuracy |
| **NONE** | > 24 hours | LOW | IP fallback only, low accuracy |

**Calculation:**
```typescript
function calculateFreshness(locationUpdatedAt: Date): LocationFreshness {
  const hoursSinceUpdate = (Date.now() - locationUpdatedAt.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceUpdate < 2) return 'FRESH';
  if (hoursSinceUpdate < 24) return 'STALE';
  return 'NONE';
}
```

---

### GPS vs IP Geolocation

| Type | Accuracy | Confidence | Use Case |
|------|----------|------------|----------|
| **GPS** | ~10-50m | HIGH (fresh) / MEDIUM (stale) | Primary targeting |
| **IP** | ~1-50km | LOW | Fallback when no GPS |

**Priority:** GPS > Saved Zones > IP

---

### Location Update Strategy

**Client-Side:**
- Update location on app launch
- Update location when moving >500m
- Update location every 5 minutes if app in foreground
- Update location on alert creation

**Server-Side:**
- Store both GPS and IP locations
- Use GPS for targeting if available
- Fall back to IP if GPS > 24 hours old
- Extract postal code for IP matching

---

## Saved Zones

### Use Cases

1. **Home Zone (Primary):**
   - User's primary residence
   - Highest priority for notifications
   - 1km radius typical

2. **Work Zone:**
   - Office or workplace
   - Receives alerts during work hours
   - 1km radius typical

3. **Frequently Visited:**
   - Gym, park, family home
   - Context-aware notifications
   - Variable radius

---

### Zone Matching Logic

**Priority Order:**
1. Primary saved zone match → **HIGH confidence**
2. Any saved zone match → **HIGH confidence**
3. Fresh GPS match → **HIGH confidence**
4. Stale GPS match → **MEDIUM confidence**
5. Postal code match → **MEDIUM confidence**
6. IP geolocation match → **LOW confidence**

**Query Example:**
```sql
-- Check if alert location overlaps with device's saved zones
SELECT sz.id, sz.name
FROM "SavedZone" sz
WHERE sz.device_id = $1
  AND ST_DWithin(
    sz.location_point::geography,
    ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
    sz.radius_km * 1000  -- Convert to meters
  );
```

---

### Primary Zone Enforcement

**Rule:** Only one saved zone can be primary per device.

**Enforcement:**
- When creating zone with `isPrimary=true`: Set all other zones to `isPrimary=false`
- When updating zone to `isPrimary=true`: Set all other zones to `isPrimary=false`
- Use database transaction to ensure consistency

**Implementation:**
```typescript
async setPrimaryZone(deviceId: string, zoneId: string): Promise<void> {
  await this.prisma.$transaction([
    // Unset all other zones
    this.prisma.savedZone.updateMany({
      where: { device_id: deviceId, id: { not: zoneId } },
      data: { is_primary: false },
    }),
    // Set this zone as primary
    this.prisma.savedZone.update({
      where: { id: zoneId },
      data: { is_primary: true },
    }),
  ]);
}
```

---

## Testing

### Unit Tests

**Location:** `src/device/device.service.spec.ts`

**Coverage:**
- ✅ Register device (new vs existing)
- ✅ Update location (GPS vs IP)
- ✅ Calculate location freshness (FRESH, STALE, NONE)
- ✅ Update push token
- ✅ Create saved zone (max 5 limit)
- ✅ Update saved zone
- ✅ Delete saved zone
- ✅ Primary zone enforcement (only one primary)

**Run:**
```bash
bun test device.service.spec.ts
```

---

### Integration Tests

**Location:** `test/device.e2e-spec.ts`

**Scenarios:**
- Register device with authentication
- Update location (authorized vs unauthorized)
- Create saved zone (within limit)
- Exceed saved zone limit (422 error)
- Set primary zone (other zones unset)
- Push token refresh

**Run:**
```bash
bun test:e2e test/device.e2e-spec.ts
```

---

## Performance Considerations

### Geospatial Query Optimization

**Index:** GIST indexes on GPS, IP, and SavedZone location columns

```sql
CREATE INDEX "Device_gps_point_idx"
ON "Device" USING GIST (gps_point);

CREATE INDEX "SavedZone_location_point_idx"
ON "SavedZone" USING GIST (location_point);
```

**Query Performance:**
- Target: p95 < 50ms for device matching
- Use `ST_DWithin` for proximity checks
- Combine with other filters (freshness, platform) to reduce scan

---

### Push Token Management

**Best Practices:**
- Store push token in database (not Redis) for persistence
- Update token on every app launch (handles expiration)
- Track `push_token_updated_at` for staleness checks
- Mark tokens as invalid after delivery failures

**Invalid Token Handling:**
```typescript
// After FCM/APNs returns "InvalidRegistration"
await this.prisma.device.update({
  where: { id: deviceId },
  data: { push_token: null, push_token_updated_at: null },
});
```

---

## Error Handling

### Common Errors

| Error Code | Reason | Solution |
|------------|--------|----------|
| 401 | Missing/invalid token | Include valid Bearer token |
| 403 | Not device owner | Use DeviceOwnerGuard |
| 422 | Validation failed | Check DTO constraints |
| 422 | Max saved zones (5) | Delete existing zone first |
| 404 | Device not found | Verify device ID exists |

---

## Related Documentation

- [Location Module](./location-module.md) - Geospatial matching
- [Notification Module](./notification-module.md) - Push notification delivery
- [Alert Module](./alert-module.md) - Alert targeting
- [System Behavior Spec](../SYSTEM_BEHAVIOR_SPEC.md) - Location freshness rules
- [API Contract](../API_CONTRACT.md) - Complete API reference

---

## Support

For issues with Device module:
- Check logs: `logs/application-*.log`
- Verify device registration: `SELECT * FROM "Device" WHERE owner_id = 'user-uuid';`
- Test geospatial query: `EXPLAIN ANALYZE SELECT ...`
- Verify saved zones: `SELECT * FROM "SavedZone" WHERE device_id = 'device-uuid';`
- Consult [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)
