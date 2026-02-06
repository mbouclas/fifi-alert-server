# MVP Phase 1: Core Alert System - Technical Design

## 1. Executive Summary

This document specifies the technical implementation for MVP Phase 1 of FiFi Alert, which delivers the core missing pet alert functionality. This phase focuses on:

- Alert creation and management (CRUD operations)
- Device registration for push notifications
- Sighting report submission
- Geospatial location matching
- Push notification delivery infrastructure

**Out of Scope for Phase 1:**
- Background location tracking (Phase 2)
- Advanced sighting clustering (Phase 3)
- User reputation systems (Phase 4)
- Social sharing features (Phase 3)

---

## 2. Database Schema Design

### 2.1 PostGIS Setup Requirements

**Prerequisites:**
```sql
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify installation
SELECT PostGIS_Version();
```

**Spatial Reference System:** EPSG:4326 (WGS 84) for GPS coordinates

### 2.2 Prisma Schema Additions

#### Alert Model

```prisma
enum AlertStatus {
  DRAFT      // Created but not published
  ACTIVE     // Live, sending notifications
  RESOLVED   // Pet found
  EXPIRED    // Auto-expired after duration
}

enum PetSpecies {
  DOG
  CAT
  BIRD
  RABBIT
  OTHER
}

model Alert {
  id                Int           @id @default(autoincrement())
  
  // Ownership
  creator_id        Int           @map("creator_id")
  creator           User          @relation("CreatedAlerts", fields: [creator_id], references: [id], onDelete: Cascade)
  
  // Pet Details
  pet_name          String
  pet_species       PetSpecies    @map("pet_species")
  pet_breed         String?
  pet_description   String        @pg.Text
  pet_color         String?
  pet_age_years     Int?          @map("pet_age_years")
  pet_photos        String[]      @default([]) @map("pet_photos") // URLs to uploaded images
  
  // Location (PostGIS geometry)
  last_seen_lat     Float         @map("last_seen_lat")
  last_seen_lon     Float         @map("last_seen_lon")
  location_point    Unsupported("geometry(Point, 4326)") @map("location_point") // PostGIS POINT
  location_address  String?       @map("location_address") // Human-readable address
  alert_radius_km   Float         @default(5.0) @map("alert_radius_km") // 1-50km range
  
  // Lifecycle
  status            AlertStatus   @default(ACTIVE)
  time_last_seen    DateTime      @map("time_last_seen")
  created_at        DateTime      @default(now()) @map("created_at")
  updated_at        DateTime      @updatedAt @map("updated_at")
  expires_at        DateTime      @map("expires_at") // Auto-calculated: created_at + 7 days
  resolved_at       DateTime?     @map("resolved_at")
  renewal_count     Int           @default(0) @map("renewal_count") // Max 3 renewals
  
  // Contact & Preferences
  contact_phone     String?       @map("contact_phone")
  contact_email     String?       @map("contact_email")
  is_phone_public   Boolean       @default(false) @map("is_phone_public")
  
  // Metadata
  affected_postal_codes String[]   @default([]) @map("affected_postal_codes") // Pre-computed for fast lookup
  notes             String?       @pg.Text
  reward_offered    Boolean       @default(false) @map("reward_offered")
  reward_amount     Decimal?      @pg.Decimal(10, 2) @map("reward_amount")
  
  // Relations
  sightings         Sighting[]
  notifications     Notification[]
  
  @@index([creator_id])
  @@index([status])
  @@index([expires_at])
  @@index([affected_postal_codes], type: Gin)
  @@index([location_point], type: Gist, name: "alert_location_gist_idx") // Spatial index
  @@map("alert")
}
```

#### Device Model

```prisma
enum DevicePlatform {
  IOS
  ANDROID
  WEB
}

enum LocationSource {
  GPS           // High accuracy GPS
  IP            // IP geolocation (low accuracy)
  POSTAL_CODE   // User-entered postal code
  MANUAL        // User-manually placed pin
}

model Device {
  id                    Int              @id @default(autoincrement())
  
  // Ownership
  user_id               Int              @map("user_id")
  user                  User             @relation("UserDevices", fields: [user_id], references: [id], onDelete: Cascade)
  
  // Device Identity
  device_uuid           String           @unique @map("device_uuid") // Client-generated UUID
  platform              DevicePlatform
  os_version            String?          @map("os_version")
  app_version           String?          @map("app_version")
  
  // Push Notification Tokens
  push_token            String?          @unique @map("push_token") // FCM/APNs token
  push_token_updated_at DateTime?        @map("push_token_updated_at")
  push_enabled          Boolean          @default(true) @map("push_enabled")
  
  // GPS Location
  gps_lat               Float?           @map("gps_lat")
  gps_lon               Float?           @map("gps_lon")
  gps_point             Unsupported("geometry(Point, 4326)")?  @map("gps_point") // PostGIS POINT
  gps_accuracy_meters   Float?           @map("gps_accuracy_meters")
  gps_updated_at        DateTime?        @map("gps_updated_at")
  
  // IP Geolocation
  ip_address            String?          @map("ip_address")
  ip_lat                Float?           @map("ip_lat")
  ip_lon                Float?           @map("ip_lon")
  ip_point              Unsupported("geometry(Point, 4326)")? @map("ip_point") // PostGIS POINT
  ip_city               String?          @map("ip_city")
  ip_country            String?          @map("ip_country")
  ip_updated_at         DateTime?        @map("ip_updated_at")
  
  // Postal Codes (user can add multiple)
  postal_codes          String[]         @default([]) @map("postal_codes")
  
  // Metadata
  last_app_open         DateTime?        @map("last_app_open")
  created_at            DateTime         @default(now()) @map("created_at")
  updated_at            DateTime         @updatedAt @map("updated_at")
  
  // Relations
  saved_zones           SavedZone[]
  notifications         Notification[]
  
  @@index([user_id])
  @@index([device_uuid])
  @@index([push_token])
  @@index([gps_point], type: Gist, name: "device_gps_gist_idx") // Spatial index
  @@index([ip_point], type: Gist, name: "device_ip_gist_idx") // Spatial index
  @@index([postal_codes], type: Gin)
  @@map("device")
}
```

#### SavedZone Model

```prisma
model SavedZone {
  id           Int        @id @default(autoincrement())
  
  // Ownership
  device_id    Int        @map("device_id")
  device       Device     @relation(fields: [device_id], references: [id], onDelete: Cascade)
  
  // Zone Details
  name         String     // e.g., "Home", "Work", "Mom's House"
  lat          Float
  lon          Float
  location_point Unsupported("geometry(Point, 4326)") @map("location_point") // PostGIS POINT
  radius_km    Float      @default(5.0) @map("radius_km") // Alert catchment area
  
  // Preferences
  is_active    Boolean    @default(true) @map("is_active")
  priority     Int        @default(0) // Higher priority zones checked first
  
  // Metadata
  created_at   DateTime   @default(now()) @map("created_at")
  updated_at   DateTime   @updatedAt @map("updated_at")
  
  @@index([device_id])
  @@index([is_active])
  @@index([location_point], type: Gist, name: "saved_zone_gist_idx") // Spatial index
  @@map("saved_zone")
}
```

#### Sighting Model

```prisma
model Sighting {
  id                Int       @id @default(autoincrement())
  
  // Relationships
  alert_id          Int       @map("alert_id")
  alert             Alert     @relation(fields: [alert_id], references: [id], onDelete: Cascade)
  reporter_id       Int       @map("reporter_id")
  reporter          User      @relation("ReportedSightings", fields: [reporter_id], references: [id], onDelete: Cascade)
  
  // Sighting Details
  sighting_lat      Float     @map("sighting_lat")
  sighting_lon      Float     @map("sighting_lon")
  location_point    Unsupported("geometry(Point, 4326)") @map("location_point") // PostGIS POINT
  location_address  String?   @map("location_address")
  
  // Evidence
  photo_url         String?   @map("photo_url")
  notes             String?   @pg.Text
  confidence        String?   // "CERTAIN", "LIKELY", "UNSURE"
  
  // Context
  sighting_time     DateTime  @map("sighting_time") // When pet was seen
  direction         String?   // "NORTH", "SOUTH", "EAST", "WEST", "STATIONARY"
  
  // Status
  dismissed         Boolean   @default(false) // Owner can dismiss false sightings
  dismissed_at      DateTime? @map("dismissed_at")
  dismissed_reason  String?   @map("dismissed_reason")
  
  // Metadata
  created_at        DateTime  @default(now()) @map("created_at")
  updated_at        DateTime  @updatedAt @map("updated_at")
  
  @@index([alert_id])
  @@index([reporter_id])
  @@index([dismissed])
  @@index([location_point], type: Gist, name: "sighting_location_gist_idx") // Spatial index
  @@map("sighting")
}
```

#### Notification Model

```prisma
enum NotificationConfidence {
  HIGH    // Saved zone match or fresh GPS
  MEDIUM  // Stale GPS or postal code match
  LOW     // IP geolocation match
}

enum NotificationStatus {
  QUEUED      // In BullMQ, not yet sent
  SENT        // Successfully sent to FCM/APNs
  DELIVERED   // Device confirmed receipt
  OPENED      // User opened notification
  FAILED      // Delivery failed
  EXCLUDED    // User excluded from targeting
}

model Notification {
  id                Int                    @id @default(autoincrement())
  
  // Relationships
  alert_id          Int                    @map("alert_id")
  alert             Alert                  @relation(fields: [alert_id], references: [id], onDelete: Cascade)
  device_id         Int                    @map("device_id")
  device            Device                 @relation(fields: [device_id], references: [id], onDelete: Cascade)
  
  // Targeting Details
  confidence        NotificationConfidence
  match_reason      String                 @map("match_reason") // "SAVED_ZONE:Home", "GPS:FRESH", "POSTAL_CODE", etc.
  distance_km       Float?                 @map("distance_km") // Distance from alert to device location
  
  // Delivery Status
  status            NotificationStatus     @default(QUEUED)
  queued_at         DateTime               @default(now()) @map("queued_at")
  sent_at           DateTime?              @map("sent_at")
  delivered_at      DateTime?              @map("delivered_at")
  opened_at         DateTime?              @map("opened_at")
  failed_at         DateTime?              @map("failed_at")
  failure_reason    String?                @map("failure_reason")
  
  // Exclusion Tracking
  excluded          Boolean                @default(false)
  exclusion_reason  String?                @map("exclusion_reason") // Canonical reason code
  
  // FCM/APNs Response
  push_message_id   String?                @map("push_message_id") // External provider's message ID
  push_response     Json?                  @map("push_response") // Full response for debugging
  
  // Metadata
  created_at        DateTime               @default(now()) @map("created_at")
  updated_at        DateTime               @updatedAt @map("updated_at")
  
  @@index([alert_id])
  @@index([device_id])
  @@index([status])
  @@index([excluded])
  @@index([sent_at])
  @@map("notification")
}
```

### 2.3 User Model Additions

Add these relations to the existing User model:

```prisma
model User {
  // ... existing fields ...
  
  // New relations for Phase 1
  devices           Device[]    @relation("UserDevices")
  created_alerts    Alert[]     @relation("CreatedAlerts")
  reported_sightings Sighting[] @relation("ReportedSightings")
}
```

### 2.4 Database Indexes Strategy

**Spatial Indexes (GIST):**
- `alert.location_point` — For finding alerts near devices
- `device.gps_point` — For finding devices near alerts
- `device.ip_point` — Fallback location matching
- `saved_zone.location_point` — For saved zone proximity
- `sighting.location_point` — For sighting clustering

**Performance Indexes:**
- `alert.status` — Filter active alerts quickly
- `alert.expires_at` — Cron job expiration checks
- `notification.status` — Queue processing
- `device.postal_codes` (GIN) — Array search optimization

---

## 3. API Endpoint Specifications

### 3.1 RESTful API Design

**Base URL:** `/api/v1`

**Authentication:** All endpoints require `Authorization: Bearer <access_token>` except where noted.

### 3.2 Alert Endpoints

#### POST /alerts — Create Alert

**Request:**
```typescript
{
  "pet": {
    "name": string,
    "species": "DOG" | "CAT" | "BIRD" | "RABBIT" | "OTHER",
    "breed": string (optional),
    "description": string,
    "color": string (optional),
    "ageYears": number (optional),
    "photos": string[] // Base64 or URLs (handled via separate upload)
  },
  "location": {
    "lat": number, // -90 to 90
    "lon": number, // -180 to 180
    "address": string (optional),
    "lastSeenTime": ISO8601 datetime,
    "radiusKm": number // 1-50, default 5
  },
  "contact": {
    "phone": string (optional),
    "email": string (optional),
    "isPhonePublic": boolean (default false)
  },
  "reward": {
    "offered": boolean (default false),
    "amount": number (optional)
  },
  "notes": string (optional)
}
```

**Response (201 Created):**
```typescript
{
  "id": number,
  "status": "ACTIVE",
  "pet": {...},
  "location": {...},
  "contact": {...},
  "createdAt": ISO8601,
  "expiresAt": ISO8601,
  "notificationsSent": number, // Initial count (async, may be 0)
  "estimatedReach": number // Estimated devices in range
}
```

**Validations:**
- `pet.name`: 1-100 chars
- `pet.species`: Enum value
- `pet.description`: 10-2000 chars
- `location.lat`: -90 to 90
- `location.lon`: -180 to 180
- `location.radiusKm`: 1 to 50
- `contact.phone`: Valid phone format (if provided)
- `contact.email`: Valid email format (if provided)
- At least one contact method required

**Rate Limits:**
- 5 alerts per user per hour (429 if exceeded)
- 20 alerts per user per 24 hours
- 50 alerts per user per 7 days

**Business Logic:**
1. Validate input against schema
2. Check rate limits (Redis)
3. Upload photos to storage (S3/local) if base64 provided
4. Calculate `location_point` from lat/lon
5. Set `expires_at` = `created_at` + 7 days
6. Pre-compute `affected_postal_codes` (async job)
7. Queue notification targeting job (BullMQ)
8. Return response immediately (don't wait for notifications)

#### GET /alerts/:id — View Alert Details

**Response (200 OK):**
```typescript
{
  "id": number,
  "status": "ACTIVE" | "RESOLVED" | "EXPIRED",
  "pet": {...},
  "location": {
    "lat": number,
    "lon": number,
    "address": string,
    "radiusKm": number
  },
  "contact": {
    "phone": string | null, // Only if isPhonePublic or requester is creator
    "email": string | null, // Only if requester is creator
    "isPhonePublic": boolean
  },
  "sightings": [
    {
      "id": number,
      "location": { lat, lon, address },
      "photo": string | null,
      "notes": string,
      "confidence": string,
      "sightingTime": ISO8601,
      "createdAt": ISO8601
    }
  ],
  "createdAt": ISO8601,
  "expiresAt": ISO8601,
  "resolvedAt": ISO8601 | null
}
```

**Authorization:**
- Anyone can view active alerts
- Creator can view DRAFT, EXPIRED, RESOLVED
- Contact info visibility controlled by privacy settings

#### GET /alerts — List Alerts (Geospatial Query)

**Query Parameters:**
- `lat`: number (required if `nearMe` not set)
- `lon`: number (required if `nearMe` not set)
- `radiusKm`: number (default 10, max 50)
- `nearMe`: boolean (use device's location)
- `status`: "ACTIVE" | "RESOLVED" | "EXPIRED" (default: ACTIVE)
- `species`: PetSpecies enum filter
- `limit`: number (default 20, max 100)
- `offset`: number (pagination)

**Response (200 OK):**
```typescript
{
  "results": [
    {
      "id": number,
      "pet": { name, species, breed, photos },
      "location": { address, radiusKm },
      "distanceKm": number, // Distance from query point
      "createdAt": ISO8601,
      "expiresAt": ISO8601,
      "sightingCount": number
    }
  ],
  "pagination": {
    "total": number,
    "limit": number,
    "offset": number
  }
}
```

**Implementation:**
- Use PostGIS `ST_DWithin` for proximity search
- Order by distance (closest first)
- Filter by status and species if provided
- Return only public fields (no creator info)

#### PATCH /alerts/:id — Update Alert

**Authorization:** Must be alert creator

**Allowed Updates:**
- `pet.description`
- `pet.photos` (append only)
- `contact.*`
- `notes`

**Response (200 OK):** Updated alert object

#### POST /alerts/:id/resolve — Mark as Resolved

**Authorization:** Must be alert creator

**Request:**
```typescript
{
  "outcome": "FOUND" | "REUNITED" | "OTHER",
  "notes": string (optional),
  "shareSuccessStory": boolean (default false)
}
```

**Response (200 OK):**
```typescript
{
  "id": number,
  "status": "RESOLVED",
  "resolvedAt": ISO8601,
  "outcome": string,
  "message": "Alert marked as resolved. Sighting reporters will be notified."
}
```

**Business Logic:**
1. Update `status` to `RESOLVED`
2. Set `resolved_at` timestamp
3. Stop any queued notifications (cancel BullMQ jobs)
4. Queue "resolution notification" to sighting reporters
5. Log audit event

#### POST /alerts/:id/renew — Extend Alert Duration

**Authorization:** Must be alert creator

**Response (200 OK):**
```typescript
{
  "id": number,
  "expiresAt": ISO8601, // +7 days from now
  "renewalCount": number, // Incremented
  "renewalsRemaining": number // Max 3 total
}
```

**Business Logic:**
1. Check `renewal_count < 3` (return 422 if exceeded)
2. Set `expires_at` = now + 7 days
3. Increment `renewal_count`
4. Return updated expiration

### 3.3 Sighting Endpoints

#### POST /alerts/:alertId/sightings — Report Sighting

**Request:**
```typescript
{
  "location": {
    "lat": number,
    "lon": number,
    "address": string (optional)
  },
  "photo": string (optional), // Base64 or pre-uploaded URL
  "notes": string (optional),
  "confidence": "CERTAIN" | "LIKELY" | "UNSURE" (default "LIKELY"),
  "sightingTime": ISO8601, // When pet was seen
  "direction": "NORTH" | "SOUTH" | "EAST" | "WEST" | "STATIONARY" (optional)
}
```

**Response (201 Created):**
```typescript
{
  "id": number,
  "alert": { id, petName },
  "location": { lat, lon, address },
  "photo": string | null,
  "sightingTime": ISO8601,
  "createdAt": ISO8601,
  "message": "Sighting reported. Alert owner will be notified."
}
```

**Validations:**
- `location.lat`: -90 to 90
- `location.lon`: -180 to 180
- `sightingTime`: Not in the future
- `notes`: Max 1000 chars

**Business Logic:**
1. Validate input
2. Upload photo if base64 provided
3. Calculate `location_point` from lat/lon
4. Store sighting
5. Queue notification to alert creator (push + in-app)
6. Return response immediately

#### GET /alerts/:alertId/sightings — List Sightings

**Authorization:** Public for active alerts, creator for resolved/expired

**Response (200 OK):**
```typescript
{
  "sightings": [
    {
      "id": number,
      "location": { lat, lon, address },
      "photo": string | null,
      "notes": string,
      "confidence": string,
      "sightingTime": ISO8601,
      "direction": string,
      "createdAt": ISO8601,
      "dismissed": boolean
    }
  ],
  "total": number
}
```

**Filtering:**
- Hide dismissed sightings unless requester is alert creator
- Order by `sighting_time` DESC (most recent first)

#### PATCH /sightings/:id/dismiss — Dismiss False Sighting

**Authorization:** Must be alert creator

**Request:**
```typescript
{
  "reason": string (optional) // "WRONG_PET", "WRONG_TIME", "DUPLICATE", "OTHER"
}
```

**Response (200 OK):**
```typescript
{
  "id": number,
  "dismissed": true,
  "dismissedAt": ISO8601,
  "dismissedReason": string
}
```

### 3.4 Device Management Endpoints

#### POST /devices — Register Device

**Request:**
```typescript
{
  "deviceUuid": string, // Client-generated UUID
  "platform": "IOS" | "ANDROID" | "WEB",
  "osVersion": string (optional),
  "appVersion": string (optional),
  "pushToken": string (optional), // FCM/APNs token
  "location": {
    "gps": {
      "lat": number,
      "lon": number,
      "accuracy": number (meters)
    } (optional),
    "ipAddress": string (optional), // Server can also capture from request
    "postalCodes": string[] (optional)
  }
}
```

**Response (201 Created or 200 OK if exists):**
```typescript
{
  "id": number,
  "deviceUuid": string,
  "platform": string,
  "pushToken": string | null,
  "lastAppOpen": ISO8601,
  "locationStatus": {
    "hasGPS": boolean,
    "gpsAge": number (hours),
    "hasSavedZones": boolean,
    "savedZoneCount": number
  }
}
```

**Business Logic:**
1. Upsert device by `deviceUuid` (idempotent)
2. Update `push_token` if provided
3. Update `last_app_open` timestamp
4. Store GPS location if provided (calculate `gps_point`)
5. Geocode IP address for fallback location (async)
6. Return device info

#### PATCH /devices/:id/location — Update Device Location

**Request:**
```typescript
{
  "gps": {
    "lat": number,
    "lon": number,
    "accuracy": number (meters)
  } (optional),
  "postalCodes": string[] (optional)
}
```

**Response (200 OK):**
```typescript
{
  "id": number,
  "gpsUpdatedAt": ISO8601 | null,
  "gpsAccuracyMeters": number | null,
  "postalCodes": string[],
  "locationStatus": {...}
}
```

**Business Logic:**
1. Update GPS coordinates and `gps_updated_at`
2. Calculate `gps_point` PostGIS geometry
3. Update `postal_codes` array if provided
4. Return updated location info

#### POST /devices/:id/saved-zones — Add Saved Zone

**Request:**
```typescript
{
  "name": string, // "Home", "Work", etc.
  "lat": number,
  "lon": number,
  "radiusKm": number (default 5, max 20),
  "priority": number (default 0)
}
```

**Response (201 Created):**
```typescript
{
  "id": number,
  "name": string,
  "lat": number,
  "lon": number,
  "radiusKm": number,
  "isActive": true,
  "createdAt": ISO8601
}
```

**Validations:**
- Max 5 saved zones per device
- `name`: 1-50 chars
- `radiusKm`: 1 to 20

#### GET /devices/:id/saved-zones — List Saved Zones

**Response (200 OK):**
```typescript
{
  "zones": [
    {
      "id": number,
      "name": string,
      "lat": number,
      "lon": number,
      "radiusKm": number,
      "isActive": boolean,
      "priority": number
    }
  ]
}
```

#### PATCH /saved-zones/:id — Update Saved Zone

**Request:**
```typescript
{
  "name": string (optional),
  "isActive": boolean (optional),
  "radiusKm": number (optional)
}
```

**Response (200 OK):** Updated zone object

#### DELETE /saved-zones/:id — Delete Saved Zone

**Response (204 No Content)**

---

## 4. Service Architecture

### 4.1 Module Structure

```
src/
├── alert/
│   ├── alert.module.ts
│   ├── alert.controller.ts
│   ├── alert.service.ts
│   ├── dto/
│   │   ├── create-alert.dto.ts
│   │   ├── update-alert.dto.ts
│   │   ├── alert-response.dto.ts
│   │   └── list-alerts-query.dto.ts
│   └── __tests__/
│       ├── alert.service.spec.ts
│       └── alert.controller.spec.ts
├── sighting/
│   ├── sighting.module.ts
│   ├── sighting.controller.ts
│   ├── sighting.service.ts
│   ├── dto/
│   │   ├── create-sighting.dto.ts
│   │   └── sighting-response.dto.ts
│   └── __tests__/
├── device/
│   ├── device.module.ts
│   ├── device.controller.ts
│   ├── device.service.ts
│   ├── saved-zone.service.ts
│   ├── dto/
│   │   ├── register-device.dto.ts
│   │   ├── update-location.dto.ts
│   │   ├── create-saved-zone.dto.ts
│   │   └── device-response.dto.ts
│   └── __tests__/
├── notification/
│   ├── notification.module.ts
│   ├── notification.service.ts
│   ├── fcm.service.ts
│   ├── apns.service.ts
│   ├── notification-queue.processor.ts
│   ├── dto/
│   │   └── notification-payload.dto.ts
│   └── __tests__/
├── location/
│   ├── location.module.ts
│   ├── location.service.ts
│   ├── geospatial.service.ts
│   ├── geocoding.service.ts (optional)
│   └── __tests__/
└── upload/
    ├── upload.module.ts
    ├── upload.service.ts
    ├── local-storage.strategy.ts
    ├── s3-storage.strategy.ts
    └── __tests__/
```

### 4.2 AlertService

**Responsibilities:**
- CRUD operations for alerts
- Business logic enforcement (rate limits, validation)
- Alert lifecycle management (expiration, renewal, resolution)
- Trigger notification targeting

**Key Methods:**
```typescript
class AlertService {
  async create(userId: number, dto: CreateAlertDto): Promise<Alert>
  async findById(id: number): Promise<Alert | null>
  async findNearby(lat: number, lon: number, radiusKm: number, options?: QueryOptions): Promise<Alert[]>
  async update(id: number, userId: number, dto: UpdateAlertDto): Promise<Alert>
  async resolve(id: number, userId: number, outcome: ResolveOutcome): Promise<Alert>
  async renew(id: number, userId: number): Promise<Alert>
  async checkExpired(): Promise<void> // Cron job
  async preComputeAffectedPostalCodes(alertId: number): Promise<void> // Async job
}
```

### 4.3 SightingService

**Responsibilities:**
- Create and manage sighting reports
- Notify alert creators of new sightings
- Dismiss false sightings

**Key Methods:**
```typescript
class SightingService {
  async create(alertId: number, reporterId: number, dto: CreateSightingDto): Promise<Sighting>
  async findByAlert(alertId: number, includeDisrupted: boolean): Promise<Sighting[]>
  async dismiss(id: number, userId: number, reason: string): Promise<Sighting>
  async notifyCreatorOfSighting(sightingId: number): Promise<void> // Async
}
```

### 4.4 DeviceService

**Responsibilities:**
- Register and update devices
- Store location data
- Manage saved zones

**Key Methods:**
```typescript
class DeviceService {
  async register(userId: number, dto: RegisterDeviceDto): Promise<Device>
  async updateLocation(id: number, dto: UpdateLocationDto): Promise<Device>
  async updatePushToken(deviceId: number, pushToken: string): Promise<void>
  async findByUserId(userId: number): Promise<Device[]>
  async getLocationStatus(deviceId: number): Promise<LocationStatus>
}

class SavedZoneService {
  async create(deviceId: number, dto: CreateSavedZoneDto): Promise<SavedZone>
  async findByDevice(deviceId: number): Promise<SavedZone[]>
  async update(id: number, dto: UpdateSavedZoneDto): Promise<SavedZone>
  async delete(id: number): Promise<void>
}
```

### 4.5 LocationService (Geospatial Matching)

**Responsibilities:**
- Find devices within alert radius
- Calculate confidence levels
- Apply location freshness rules
- Handle saved zone matching

**Key Methods:**
```typescript
class LocationService {
  async findDevicesForAlert(alert: Alert): Promise<DeviceMatch[]>
  async calculateConfidence(device: Device, alert: Alert): Promise<NotificationConfidence>
  async matchSavedZones(device: Device, alert: Alert): Promise<SavedZone | null>
  async calculateDistance(point1: Point, point2: Point): Promise<number> // PostGIS
}

interface DeviceMatch {
  device: Device;
  confidence: NotificationConfidence;
  matchReason: string;
  distanceKm: number;
}
```

**Targeting Algorithm Implementation:**
```typescript
async findDevicesForAlert(alert: Alert): Promise<DeviceMatch[]> {
  const matches: DeviceMatch[] = [];
  const alertPoint = { lat: alert.last_seen_lat, lon: alert.last_seen_lon };
  const baseRadiusMeters = alert.alert_radius_km * 1000;

  // Step 1: Saved Zone Matches (HIGH confidence)
  const savedZoneMatches = await this.prisma.$queryRaw`
    SELECT DISTINCT d.*, sz.name as zone_name
    FROM device d
    INNER JOIN saved_zone sz ON sz.device_id = d.id
    WHERE sz.is_active = true
    AND ST_DWithin(
      sz.location_point,
      ST_SetSRID(ST_MakePoint(${alert.last_seen_lon}, ${alert.last_seen_lat}), 4326)::geography,
      ${baseRadiusMeters} + (sz.radius_km * 1000)
    )
  `;
  
  for (const match of savedZoneMatches) {
    matches.push({
      device: match,
      confidence: NotificationConfidence.HIGH,
      matchReason: `SAVED_ZONE:${match.zone_name}`,
      distanceKm: await this.calculateDistance(match.gps_point || match.ip_point, alertPoint)
    });
  }

  // Step 2: Fresh GPS Matches (HIGH confidence, <2 hours)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const freshGPSMatches = await this.prisma.$queryRaw`
    SELECT d.*, 
           ST_Distance(d.gps_point::geography, 
                       ST_SetSRID(ST_MakePoint(${alert.last_seen_lon}, ${alert.last_seen_lat}), 4326)::geography
           ) / 1000 as distance_km
    FROM device d
    WHERE d.gps_point IS NOT NULL
    AND d.gps_updated_at > ${twoHoursAgo}
    AND d.push_enabled = true
    AND ST_DWithin(
      d.gps_point::geography,
      ST_SetSRID(ST_MakePoint(${alert.last_seen_lon}, ${alert.last_seen_lat}), 4326)::geography,
      ${baseRadiusMeters}
    )
    AND d.id NOT IN (${matches.map(m => m.device.id)})
  `;

  // ... continue with stale GPS, postal codes, IP geolocation ...

  // Deduplicate and return
  return Array.from(new Map(matches.map(m => [m.device.id, m])).values());
}
```

### 4.6 NotificationService

**Responsibilities:**
- Queue notifications via BullMQ
- Send push notifications via FCM/APNs
- Log delivery status
- Handle retries and failures
- Track exclusion reasons

**Key Methods:**
```typescript
class NotificationService {
  async queueAlertNotifications(alertId: number): Promise<void>
  async sendPushNotification(notificationId: number): Promise<void>
  async handleDeliveryReceipt(messageId: string, status: string): Promise<void>
  async trackExclusion(deviceId: number, alertId: number, reason: string): Promise<void>
}

class FCMService {
  async sendNotification(pushToken: string, payload: NotificationPayload): Promise<FCMResponse>
  async batchSend(tokens: string[], payload: NotificationPayload): Promise<FCMResponse[]>
}

class APNsService {
  async sendNotification(pushToken: string, payload: NotificationPayload): Promise<APNsResponse>
}
```

**BullMQ Queue Configuration:**
```typescript
// notification.queue.ts
@Processor('notification-queue')
export class NotificationQueueProcessor {
  @Process('send-alert-notifications')
  async processAlertNotifications(job: Job<{ alertId: number }>) {
    const matches = await this.locationService.findDevicesForAlert(job.data.alertId);
    
    for (const match of matches) {
      await this.notificationService.sendPushNotification(match.device.id, job.data.alertId, match);
    }
  }

  @Process('send-push')
  async processPushNotification(job: Job<{ notificationId: number }>) {
    // Actual FCM/APNs delivery
    const notification = await this.getNotification(job.data.notificationId);
    
    try {
      const response = await this.fcmService.sendNotification(notification.device.push_token, {
        title: this.buildTitle(notification),
        body: this.buildBody(notification),
        data: { alertId: notification.alert_id }
      });
      
      await this.markAsSent(notification.id, response.messageId);
    } catch (error) {
      await this.markAsFailed(notification.id, error.message);
      throw error; // Trigger retry
    }
  }
}
```

### 4.7 UploadService

**Responsibilities:**
- Handle file uploads (pet photos, sighting images)
- Validate file types and sizes
- Store files (local or S3)
- Generate public URLs

**Key Methods:**
```typescript
class UploadService {
  async uploadPetPhoto(file: Express.Multer.File, userId: number): Promise<string> // Returns URL
  async uploadSightingPhoto(file: Express.Multer.File, sightingId: number): Promise<string>
  async deleteFile(url: string): Promise<void>
}

// Strategy pattern for storage backend
interface StorageStrategy {
  upload(file: Express.Multer.File, folder: string): Promise<string>;
  delete(url: string): Promise<void>;
  getPublicUrl(key: string): string;
}

class LocalStorageStrategy implements StorageStrategy { /* ... */ }
class S3StorageStrategy implements StorageStrategy { /* ... */ }
```

**Configuration:**
```env
# .env additions
UPLOAD_STORAGE=local # or 's3'
UPLOAD_MAX_SIZE_MB=10
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,image/webp

# S3 Config (if using S3)
AWS_S3_BUCKET=fifi-alert-uploads
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

---

## 5. Third-Party Integrations

### 5.1 Firebase Cloud Messaging (FCM) for Android

**Installation:**
```bash
bun add firebase-admin
```

**Configuration:**
```typescript
// notification/fcm.service.ts
import * as admin from 'firebase-admin';

@Injectable()
export class FCMService {
  private readonly app: admin.app.App;

  constructor(private configService: ConfigService) {
    this.app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: configService.get('FCM_PROJECT_ID'),
        privateKey: configService.get('FCM_PRIVATE_KEY').replace(/\\n/g, '\n'),
        clientEmail: configService.get('FCM_CLIENT_EMAIL'),
      }),
    });
  }

  async sendNotification(token: string, payload: NotificationPayload): Promise<string> {
    const message: admin.messaging.Message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl,
      },
      data: payload.data,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK', // For React Native
        },
      },
    };

    try {
      const messageId = await admin.messaging(this.app).send(message);
      return messageId;
    } catch (error) {
      if (error.code === 'messaging/invalid-registration-token') {
        // Token expired, mark for removal
        await this.markTokenInvalid(token);
      }
      throw error;
    }
  }
}
```

**Environment Variables:**
```env
FCM_PROJECT_ID=fifi-alert-xxxxx
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@fifi-alert-xxxxx.iam.gserviceaccount.com
```

### 5.2 Apple Push Notification service (APNs) for iOS

**Installation:**
```bash
bun add apn
```

**Configuration:**
```typescript
// notification/apns.service.ts
import apn from 'apn';

@Injectable()
export class APNsService {
  private readonly provider: apn.Provider;

  constructor(private configService: ConfigService) {
    this.provider = new apn.Provider({
      token: {
        key: configService.get('APNS_KEY_PATH'), // Path to .p8 file
        keyId: configService.get('APNS_KEY_ID'),
        teamId: configService.get('APNS_TEAM_ID'),
      },
      production: configService.get('NODE_ENV') === 'production',
    });
  }

  async sendNotification(token: string, payload: NotificationPayload): Promise<void> {
    const notification = new apn.Notification();
    notification.alert = {
      title: payload.title,
      body: payload.body,
    };
    notification.sound = 'default';
    notification.badge = 1;
    notification.topic = this.configService.get('APNS_BUNDLE_ID'); // e.g., com.fifialert.app
    notification.payload = payload.data;

    const result = await this.provider.send(notification, token);
    
    if (result.failed.length > 0) {
      const failure = result.failed[0];
      if (failure.response && failure.response.reason === 'BadDeviceToken') {
        await this.markTokenInvalid(token);
      }
      throw new Error(`APNs delivery failed: ${failure.response?.reason}`);
    }
  }
}
```

**Environment Variables:**
```env
APNS_KEY_PATH=./config/AuthKey_ABCD1234.p8
APNS_KEY_ID=ABCD1234
APNS_TEAM_ID=XYZ98765
APNS_BUNDLE_ID=com.fifialert.app
```

### 5.3 BullMQ (Redis-Backed Job Queue)

**Installation:**
```bash
bun add @nestjs/bull bullmq ioredis
```

**Configuration:**
```typescript
// app.module.ts
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
      },
    }),
    BullModule.registerQueue({
      name: 'notification-queue',
    }),
  ],
})
```

**Environment Variables:**
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### 5.4 Image Storage (Local + S3)

**For MVP:** Use local storage, migrate to S3 later.

**Local Storage Configuration:**
```typescript
// upload/local-storage.strategy.ts
@Injectable()
export class LocalStorageStrategy implements StorageStrategy {
  private readonly uploadDir = path.join(process.cwd(), 'uploads');

  async upload(file: Express.Multer.File, folder: string): Promise<string> {
    const filename = `${Date.now()}-${file.originalname}`;
    const filepath = path.join(this.uploadDir, folder, filename);
    
    await fs.promises.mkdir(path.dirname(filepath), { recursive: true });
    await fs.promises.writeFile(filepath, file.buffer);
    
    return `/uploads/${folder}/${filename}`;
  }

  getPublicUrl(key: string): string {
    return `${process.env.API_BASE_URL}${key}`;
  }
}
```

**Serve Static Files:**
```typescript
// main.ts
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.useStaticAssets(join(__dirname, '..', 'uploads'), {
  prefix: '/uploads/',
});
```

---

## 6. Geospatial Query Implementation

### 6.1 PostGIS Query Patterns

**Find Alerts Near Point:**
```sql
-- Using ST_DWithin (more efficient than ST_Distance for proximity)
SELECT 
  a.id,
  a.pet_name,
  a.pet_species,
  ST_Distance(
    a.location_point::geography,
    ST_SetSRID(ST_MakePoint($lon, $lat), 4326)::geography
  ) / 1000 AS distance_km
FROM alert a
WHERE a.status = 'ACTIVE'
AND ST_DWithin(
  a.location_point::geography,
  ST_SetSRID(ST_MakePoint($lon, $lat), 4326)::geography,
  $radius_meters
)
ORDER BY distance_km ASC
LIMIT $limit;
```

**Find Devices in Alert Radius:**
```sql
-- Combine GPS and saved zones
SELECT DISTINCT d.id, d.user_id, d.push_token,
  CASE 
    WHEN sz.id IS NOT NULL THEN 'SAVED_ZONE'
    WHEN d.gps_updated_at > NOW() - INTERVAL '2 hours' THEN 'GPS_FRESH'
    WHEN d.gps_updated_at > NOW() - INTERVAL '24 hours' THEN 'GPS_STALE'
    ELSE 'NONE'
  END AS match_type,
  COALESCE(
    ST_Distance(d.gps_point::geography, $alert_point::geography) / 1000,
    ST_Distance(d.ip_point::geography, $alert_point::geography) / 1000,
    999999
  ) AS distance_km
FROM device d
LEFT JOIN saved_zone sz ON sz.device_id = d.id 
  AND sz.is_active = true
  AND ST_DWithin(sz.location_point::geography, $alert_point::geography, $alert_radius_meters + (sz.radius_km * 1000))
WHERE d.push_enabled = true
AND (
  -- Saved zone match
  sz.id IS NOT NULL
  OR
  -- GPS match
  (d.gps_point IS NOT NULL 
   AND ST_DWithin(d.gps_point::geography, $alert_point::geography, $alert_radius_meters * $expansion_factor))
  OR
  -- Postal code match
  (d.postal_codes && $affected_postal_codes)
  OR
  -- IP geolocation match (expanded radius)
  (d.ip_point IS NOT NULL 
   AND ST_DWithin(d.ip_point::geography, $alert_point::geography, ($alert_radius_meters + 15000)))
)
ORDER BY distance_km ASC;
```

### 6.2 Prisma Integration with PostGIS

**Using Raw SQL for Spatial Queries:**
```typescript
// location.service.ts
async findDevicesNearAlert(alert: Alert): Promise<DeviceMatch[]> {
  const alertPoint = Prisma.sql`ST_SetSRID(ST_MakePoint(${alert.last_seen_lon}, ${alert.last_seen_lat}), 4326)::geography`;
  const radiusMeters = alert.alert_radius_km * 1000;

  const devices = await this.prisma.$queryRaw<RawDevice[]>`
    SELECT 
      d.*,
      ST_Distance(
        COALESCE(d.gps_point, d.ip_point)::geography,
        ${alertPoint}
      ) / 1000 AS distance_km,
      CASE
        WHEN sz.id IS NOT NULL THEN 'SAVED_ZONE'
        WHEN d.gps_updated_at > NOW() - INTERVAL '2 hours' THEN 'GPS_FRESH'
        WHEN d.gps_updated_at > NOW() - INTERVAL '24 hours' THEN 'GPS_STALE'
        WHEN d.postal_codes && ${alert.affected_postal_codes}::text[] THEN 'POSTAL_CODE'
        WHEN d.ip_point IS NOT NULL THEN 'IP_GEO'
        ELSE 'NONE'
      END AS match_type
    FROM device d
    LEFT JOIN saved_zone sz ON sz.device_id = d.id AND sz.is_active = true
    WHERE d.push_enabled = true
    AND (
      ST_DWithin(sz.location_point::geography, ${alertPoint}, ${radiusMeters})
      OR ST_DWithin(d.gps_point::geography, ${alertPoint}, ${radiusMeters})
      OR d.postal_codes && ${alert.affected_postal_codes}::text[]
      OR ST_DWithin(d.ip_point::geography, ${alertPoint}, ${radiusMeters + 15000})
    )
    LIMIT 10000
  `;

  return devices.map(d => this.mapToDeviceMatch(d));
}
```

**Creating Geometry Values in Prisma:**
```typescript
// When creating an alert
await this.prisma.$executeRaw`
  INSERT INTO alert (
    creator_id, pet_name, pet_species, last_seen_lat, last_seen_lon, 
    location_point, alert_radius_km, status, expires_at, created_at, updated_at
  ) VALUES (
    ${userId}, ${dto.pet.name}, ${dto.pet.species}, 
    ${dto.location.lat}, ${dto.location.lon},
    ST_SetSRID(ST_MakePoint(${dto.location.lon}, ${dto.location.lat}), 4326),
    ${dto.location.radiusKm}, 'ACTIVE', ${expiresAt}, NOW(), NOW()
  )
  RETURNING id
`;
```

---

## 7. Security & Validation

### 7.1 Input Validation (DTOs)

**Example: CreateAlertDto**
```typescript
import { IsString, IsEnum, IsNumber, Min, Max, IsOptional, IsBoolean, ValidateNested, IsISO8601, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

class PetDetailsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsEnum(PetSpecies)
  species: PetSpecies;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  breed?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  ageYears?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}

class LocationDetailsDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lon: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsISO8601()
  lastSeenTime: string;

  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
  radiusKm?: number = 5;
}

export class CreateAlertDto {
  @ValidateNested()
  @Type(() => PetDetailsDto)
  pet: PetDetailsDto;

  @ValidateNested()
  @Type(() => LocationDetailsDto)
  location: LocationDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContactDetailsDto)
  contact?: ContactDetailsDto;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
```

**Global Validation Pipe:**
```typescript
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip unknown properties
    forbidNonWhitelisted: true, // Throw error on unknown properties
    transform: true, // Auto-transform types
    transformOptions: {
      enableImplicitConversion: true,
    },
  }),
);
```

### 7.2 Authorization Guards

**Alert Ownership Guard:**
```typescript
// alert/guards/alert-owner.guard.ts
@Injectable()
export class AlertOwnerGuard implements CanActivate {
  constructor(private alertService: AlertService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // From BearerTokenGuard
    const alertId = parseInt(request.params.id);

    const alert = await this.alertService.findById(alertId);
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.creator_id !== user.id) {
      throw new ForbiddenException('You do not own this alert');
    }

    request.alert = alert; // Attach to request for use in controller
    return true;
  }
}
```

**Usage in Controller:**
```typescript
@Patch(':id')
@UseGuards(BearerTokenGuard, AlertOwnerGuard)
async updateAlert(
  @Param('id') id: number,
  @Body() dto: UpdateAlertDto,
  @Req() request,
) {
  return this.alertService.update(request.alert, dto);
}
```

### 7.3 Rate Limiting

**Alert Creation Rate Limit:**
```typescript
// alert/alert.controller.ts
import { Throttle } from '@nestjs/throttler';

@Controller('alerts')
export class AlertController {
  @Post()
  @UseGuards(BearerTokenGuard)
  @Throttle({ default: { limit: 5, ttl: 3600 } }) // 5 per hour
  async createAlert(@CurrentUser() user, @Body() dto: CreateAlertDto) {
    // Check additional limits in service
    await this.alertService.checkRateLimits(user.id);
    return this.alertService.create(user.id, dto);
  }
}
```

**Redis-Based Rate Limit Checker:**
```typescript
// alert/alert.service.ts
async checkRateLimits(userId: number): Promise<void> {
  const now = Date.now();
  const hourKey = `rate:alert:1h:${userId}`;
  const dayKey = `rate:alert:24h:${userId}`;
  const weekKey = `rate:alert:7d:${userId}`;

  const [hourCount, dayCount, weekCount] = await Promise.all([
    this.redis.zcount(hourKey, now - 3600000, now),
    this.redis.zcount(dayKey, now - 86400000, now),
    this.redis.zcount(weekKey, now - 604800000, now),
  ]);

  if (hourCount >= 5) {
    throw new HttpException('Rate limit: Max 5 alerts per hour', 429);
  }
  if (dayCount >= 20) {
    throw new HttpException('Rate limit: Max 20 alerts per 24 hours', 429);
  }
  if (weekCount >= 50) {
    throw new HttpException('Rate limit: Max 50 alerts per 7 days', 429);
  }

  // Record this request
  await Promise.all([
    this.redis.zadd(hourKey, now, `${now}-${uuid()}`),
    this.redis.expire(hourKey, 3600),
    this.redis.zadd(dayKey, now, `${now}-${uuid()}`),
    this.redis.expire(dayKey, 86400),
    this.redis.zadd(weekKey, now, `${now}-${uuid()}`),
    this.redis.expire(weekKey, 604800),
  ]);
}
```

### 7.4 Error Handling & Logging

**Global Exception Filter:**
```typescript
// common/filters/http-exception.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = 500;
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message = typeof exceptionResponse === 'string' 
        ? exceptionResponse 
        : (exceptionResponse as any).message;
      errorCode = (exceptionResponse as any).error || exception.name;
    } else if (exception instanceof PrismaClientKnownRequestError) {
      // Map Prisma errors to HTTP status codes
      if (exception.code === 'P2002') {
        status = 409;
        message = 'Unique constraint violation';
        errorCode = 'CONFLICT';
      } else if (exception.code === 'P2025') {
        status = 404;
        message = 'Record not found';
        errorCode = 'NOT_FOUND';
      }
    }

    const requestId = request.headers['x-request-id'] || uuid();

    this.logger.error({
      message: 'Exception occurred',
      requestId,
      method: request.method,
      url: request.url,
      userId: request.user?.id,
      status,
      errorCode,
      error: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(status).json({
      error: {
        code: errorCode,
        message,
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

**Example: AlertService Test**
```typescript
// alert/__tests__/alert.service.spec.ts
describe('AlertService', () => {
  let service: AlertService;
  let prisma: PrismaService;
  let locationService: LocationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AlertService,
        {
          provide: PrismaService,
          useValue: {
            alert: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            $queryRaw: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: LocationService,
          useValue: {
            findDevicesForAlert: jest.fn(),
          },
        },
        {
          provide: 'BullQueue_notification-queue',
          useValue: {
            add: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
    prisma = module.get<PrismaService>(PrismaService);
    locationService = module.get<LocationService>(LocationService);
  });

  describe('create', () => {
    it('should create an alert and queue notifications', async () => {
      const dto: CreateAlertDto = {
        pet: { name: 'Max', species: PetSpecies.DOG, description: 'Golden retriever' },
        location: { lat: 40.7128, lon: -74.0060, lastSeenTime: new Date().toISOString(), radiusKm: 5 },
      };

      const mockAlert = { id: 1, ...dto, status: 'ACTIVE' };
      jest.spyOn(prisma.alert, 'create').mockResolvedValue(mockAlert as any);

      const result = await service.create(1, dto);

      expect(result).toEqual(mockAlert);
      expect(prisma.alert.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          pet_name: 'Max',
          creator_id: 1,
        }),
      }));
    });

    it('should enforce rate limits', async () => {
      jest.spyOn(service as any, 'checkRateLimits').mockRejectedValue(
        new HttpException('Rate limit exceeded', 429)
      );

      await expect(service.create(1, {} as any)).rejects.toThrow('Rate limit exceeded');
    });
  });
});
```

### 8.2 Integration Tests

**Example: Alert API Test**
```typescript
// test/alert.e2e-spec.ts
describe('Alert API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    
    // Create test user and get token
    const user = await prisma.user.create({
      data: { email: 'test@example.com', name: 'Test User' },
    });
    accessToken = generateTestToken(user.id);
  });

  afterAll(async () => {
    await prisma.alert.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  describe('POST /alerts', () => {
    it('should create an alert with valid data', () => {
      return request(app.getHttpServer())
        .post('/alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          pet: {
            name: 'Max',
            species: 'DOG',
            description: 'Golden retriever, very friendly',
          },
          location: {
            lat: 40.7128,
            lon: -74.0060,
            lastSeenTime: new Date().toISOString(),
            radiusKm: 5,
          },
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.status).toBe('ACTIVE');
          expect(res.body.pet.name).toBe('Max');
        });
    });

    it('should reject invalid coordinates', () => {
      return request(app.getHttpServer())
        .post('/alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          pet: { name: 'Max', species: 'DOG', description: 'Test' },
          location: { lat: 999, lon: -74.0060, lastSeenTime: new Date().toISOString() },
        })
        .expect(422);
    });

    it('should enforce rate limits', async () => {
      // Create 5 alerts (max per hour)
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/alerts')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ /* valid data */ })
          .expect(201);
      }

      // 6th should fail
      return request(app.getHttpServer())
        .post('/alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ /* valid data */ })
        .expect(429);
    });
  });

  describe('GET /alerts (geospatial search)', () => {
    beforeAll(async () => {
      // Create test alerts at known coordinates
      await prisma.$executeRaw`
        INSERT INTO alert (creator_id, pet_name, pet_species, last_seen_lat, last_seen_lon, location_point, alert_radius_km, status, expires_at, created_at, updated_at)
        VALUES 
          (1, 'Spot', 'DOG', 40.7128, -74.0060, ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326), 5, 'ACTIVE', NOW() + INTERVAL '7 days', NOW(), NOW()),
          (1, 'Whiskers', 'CAT', 40.7580, -73.9855, ST_SetSRID(ST_MakePoint(-73.9855, 40.7580), 4326), 5, 'ACTIVE', NOW() + INTERVAL '7 days', NOW(), NOW())
      `;
    });

    it('should return alerts near a location', () => {
      return request(app.getHttpServer())
        .get('/alerts')
        .query({ lat: 40.7128, lon: -74.0060, radiusKm: 10 })
        .expect(200)
        .expect((res) => {
          expect(res.body.results).toBeInstanceOf(Array);
          expect(res.body.results.length).toBeGreaterThan(0);
          expect(res.body.results[0]).toHaveProperty('distanceKm');
        });
    });
  });
});
```

### 8.3 Spatial Query Tests

**Test PostGIS Functions:**
```typescript
describe('Geospatial Queries', () => {
  it('should find devices within alert radius', async () => {
    const alert = await createTestAlert({ lat: 40.7128, lon: -74.0060, radiusKm: 5 });
    const device = await createTestDevice({ gpsLat: 40.7200, gpsLon: -74.0100 }); // ~0.9km away

    const matches = await locationService.findDevicesForAlert(alert);

    expect(matches).toContainEqual(
      expect.objectContaining({
        device: expect.objectContaining({ id: device.id }),
        distanceKm: expect.closeTo(0.9, 0.5),
      })
    );
  });

  it('should not match devices outside radius', async () => {
    const alert = await createTestAlert({ lat: 40.7128, lon: -74.0060, radiusKm: 5 });
    const device = await createTestDevice({ gpsLat: 41.0000, gpsLon: -75.0000 }); // ~50km away

    const matches = await locationService.findDevicesForAlert(alert);

    expect(matches).not.toContainEqual(
      expect.objectContaining({ device: expect.objectContaining({ id: device.id }) })
    );
  });

  it('should prioritize saved zone matches', async () => {
    const alert = await createTestAlert({ lat: 40.7128, lon: -74.0060 });
    const device = await createTestDevice({ userId: 1 });
    await createSavedZone({ deviceId: device.id, lat: 40.7150, lon: -74.0070, radiusKm: 5 });

    const matches = await locationService.findDevicesForAlert(alert);
    const match = matches.find(m => m.device.id === device.id);

    expect(match.confidence).toBe(NotificationConfidence.HIGH);
    expect(match.matchReason).toContain('SAVED_ZONE');
  });
});
```

---

## 9. Environment Variables

**Complete .env file additions:**
```env
# Existing vars...
DATABASE_URL="postgresql://user:password@localhost:5432/fifi"
JWT_SECRET=...
JWT_REFRESH_SECRET=...

# Redis (for BullMQ and rate limiting)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Push Notifications - FCM
FCM_PROJECT_ID=fifi-alert-xxxxx
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@fifi-alert-xxxxx.iam.gserviceaccount.com

# Push Notifications - APNs
APNS_KEY_PATH=./config/AuthKey_ABCD1234.p8
APNS_KEY_ID=ABCD1234
APNS_TEAM_ID=XYZ98765
APNS_BUNDLE_ID=com.fifialert.app

# Upload Storage
UPLOAD_STORAGE=local # 'local' or 's3'
UPLOAD_MAX_SIZE_MB=10
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,image/webp
API_BASE_URL=http://localhost:3000

# S3 Configuration (if UPLOAD_STORAGE=s3)
AWS_S3_BUCKET=fifi-alert-uploads
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Optional: Geocoding API (for address lookups)
GEOCODING_API_KEY=
GEOCODING_PROVIDER=google # 'google', 'mapbox', or 'nominatim'
```

---

## 10. Deployment Considerations

### 10.1 Database Migrations

**Enable PostGIS in production:**
```sql
-- Run once on production database
CREATE EXTENSION IF NOT EXISTS postgis;
SELECT PostGIS_Version();
```

**Migration Strategy:**
1. Run migrations via Prisma CLI: `bunx prisma migrate deploy`
2. Verify indexes created: Check for GIST indexes on geometry columns
3. Test spatial queries: Run sample queries to confirm PostGIS working

### 10.2 Redis Setup

**Production Redis:**
- Use managed Redis (AWS ElastiCache, Redis Cloud)
- Enable persistence (RDB snapshots)
- Configure max memory policy: `maxmemory-policy allkeys-lru`
- Monitor queue depth and job failure rates

### 10.3 FCM/APNs Credentials

**Security:**
- Store FCM private key and APNs .p8 file securely (secrets manager)
- Rotate keys periodically
- Use separate credentials for production vs. staging

### 10.4 Monitoring & Alerts

**Key Metrics to Track:**
- Alert creation rate (per hour)
- Notification delivery rate (sent vs. failed)
- Average notification latency (alert created → push sent)
- Queue depth (BullMQ jobs pending)
- PostGIS query performance (p95 latency)
- Device location freshness distribution

**Recommended Tools:**
- Application logs: Winston → CloudWatch/Datadog
- Metrics: Prometheus + Grafana
- Error tracking: Sentry
- Uptime monitoring: Pingdom/UptimeRobot

---

## 11. Success Criteria

**Phase 1 is complete when:**

1. ✅ Alert CRUD endpoints functional with validation
2. ✅ Geospatial queries return correct results (tested with known coordinates)
3. ✅ Device registration and location updates working
4. ✅ Saved zones can be created and used for targeting
5. ✅ Push notifications successfully delivered via FCM/APNs
6. ✅ Sighting reports can be submitted and viewed
7. ✅ Rate limits enforced and tested
8. ✅ Unit test coverage > 80%
9. ✅ Integration tests pass for all critical paths
10. ✅ PostGIS spatial indexes created and performing well

**Performance Targets:**
- Alert creation: < 500ms (p95)
- Geospatial query: < 300ms for 10km radius (p95)
- Notification targeting: < 5 seconds for 10,000 devices
- Push delivery: < 10 seconds from alert creation

---

## 12. Next Steps (Post-Phase 1)

After MVP Phase 1 is complete:

**Phase 2: Location Intelligence**
- Background location tracking (opt-in)
- Confidence-based notification styling
- Location freshness warnings

**Phase 3: Advanced Features**
- Sighting clustering and heatmaps
- Social sharing integration
- Analytics dashboard for alert creators

**Phase 4: Community Features**
- User reputation/karma system
- Neighborhood groups
- Success stories feed
