# Location Module Documentation

## Overview

The Location module provides geospatial services for matching devices to alerts based on proximity, location freshness, and saved zones. It calculates match confidence levels and determines which devices should receive notifications.

**Module Path:** `src/location/`  
**Database Tables:** `Device`, `SavedZone`, `Alert`  
**Dependencies:** PrismaService, PostGIS

---

## Table of Contents

1. [Architecture](#architecture)
2. [Core Functions](#core-functions)
3. [Match Types & Confidence](#match-types--confidence)
4. [Geospatial Queries](#geospatial-queries)
5. [Performance Optimization](#performance-optimization)
6. [Testing](#testing)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Geospatial Device Matching                 │
└─────────────────────────────────────────────────────────┘

Alert Created (lat, lon, radiusKm)
         │
         ▼
LocationService.findDevicesForAlert(alertId)
         │
         ├──→ Tier 1: Saved Zone Match (HIGH confidence)
         │    Query: ST_DWithin(saved_zone, alert_point, zone_radius)
         │
         ├──→ Tier 2: Fresh GPS Match (HIGH confidence)
         │    Query: ST_DWithin(gps_point, alert_point, alert_radius)
         │    Filter: location_updated_at > NOW() - 2 hours
         │
         ├──→ Tier 3: Stale GPS Match (MEDIUM confidence)
         │    Query: ST_DWithin(gps_point, alert_point, alert_radius)
         │    Filter: location_updated_at BETWEEN 2-24 hours
         │
         ├──→ Tier 4: Postal Code Match (MEDIUM confidence)
         │    Query: ip_postal_code IN (alert.affected_postal_codes)
         │
         └──→ Tier 5: IP Geolocation Match (LOW confidence)
              Query: ST_DWithin(ip_point, alert_point, alert_radius)
         │
         ▼
Returns: [
  { deviceId, confidence: 'HIGH', matchType: 'SAVED_ZONE', distance: 1.2 },
  { deviceId, confidence: 'HIGH', matchType: 'GPS_FRESH', distance: 3.5 },
  { deviceId, confidence: 'MEDIUM', matchType: 'POSTAL_CODE', distance: null },
  ...
]
```

### Module Structure

```
src/location/
├── location.service.ts        # Main geospatial matching logic
├── location.module.ts          # Module definition
├── geospatial.service.ts       # PostGIS query helpers
└── dto/
    └── device-match.dto.ts     # Device match result format
```

---

## Core Functions

### 1. findDevicesForAlert()

**Purpose:** Find all devices that should be notified about an alert.

**Signature:**
```typescript
async findDevicesForAlert(alertId: string): Promise<DeviceMatch[]>
```

**Returns:**
```typescript
interface DeviceMatch {
  deviceId: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  matchType: 'SAVED_ZONE' | 'GPS_FRESH' | 'GPS_STALE' | 'POSTAL_CODE' | 'IP_GEO';
  distanceKm?: number;  // Null for postal code matches
}
```

**Logic:**
1. Get alert details (location, radius)
2. Query each matching tier in priority order
3. Deduplicate devices (use highest confidence match)
4. Return sorted by confidence (HIGH → MEDIUM → LOW)

---

### 2. calculateDistanceKm()

**Purpose:** Calculate distance between two points using PostGIS.

**Signature:**
```typescript
async calculateDistanceKm(
  point1: { lat: number; lon: number },
  point2: { lat: number; lon: number }
): Promise<number>
```

**Returns:** Distance in kilometers (accurate to ~1 meter)

**PostGIS Query:**
```sql
SELECT ST_Distance(
  ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
  ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
) / 1000 AS distance_km;
```

---

### 3. extractPostalCodesInRadius()

**Purpose:** Get all postal codes within alert's radius (for pre-computing affected_postal_codes).

**Signature:**
```typescript
async extractPostalCodesInRadius(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<string[]>
```

**Implementation:**
- Query external geocoding service (e.g., Google Geocoding API)
- Or query local postal code database with PostGIS

**Note:** This is called when alert is created to populate `affected_postal_codes` array.

---

## Match Types & Confidence

### Tier 1: Saved Zone Match (HIGH)

**Criteria:**
- Alert location overlaps with device's saved zone
- User explicitly marked this zone as important (Home, Work, etc.)

**Confidence:** HIGH  
**Reason:** User has indicated interest in this specific area

**Query:**
```sql
SELECT 
  d.id AS device_id,
  'SAVED_ZONE' AS match_type,
  'HIGH' AS confidence,
  ST_Distance(sz.location_point::geography, $1::geography) / 1000 AS distance_km
FROM "Device" d
JOIN "SavedZone" sz ON sz.device_id = d.id
WHERE ST_DWithin(
  sz.location_point::geography,
  ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
  sz.radius_km * 1000  -- Convert to meters
)
  AND d.push_token IS NOT NULL;
```

**Parameters:**
- `$1`: Alert location point (PostGIS geometry)
- `$2`: Alert longitude
- `$3`: Alert latitude

---

### Tier 2: Fresh GPS Match (HIGH)

**Criteria:**
- Device has GPS location updated within last 2 hours
- GPS location is within alert radius

**Confidence:** HIGH  
**Reason:** Recent, accurate location data

**Query:**
```sql
SELECT 
  id AS device_id,
  'GPS_FRESH' AS match_type,
  'HIGH' AS confidence,
  ST_Distance(gps_point::geography, $1::geography) / 1000 AS distance_km
FROM "Device"
WHERE location_type = 'GPS'
  AND location_updated_at > NOW() - INTERVAL '2 hours'
  AND gps_point IS NOT NULL
  AND push_token IS NOT NULL
  AND ST_DWithin(
    gps_point::geography,
    ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
    $4 * 1000  -- alert.radius_km in meters
  );
```

**Parameters:**
- `$1`: Alert location point
- `$2`: Alert longitude
- `$3`: Alert latitude
- `$4`: Alert radius in km

---

### Tier 3: Stale GPS Match (MEDIUM)

**Criteria:**
- Device has GPS location updated between 2-24 hours ago
- GPS location is within alert radius

**Confidence:** MEDIUM  
**Reason:** Somewhat recent location, but may not be current

**Query:**
```sql
SELECT 
  id AS device_id,
  'GPS_STALE' AS match_type,
  'MEDIUM' AS confidence,
  ST_Distance(gps_point::geography, $1::geography) / 1000 AS distance_km
FROM "Device"
WHERE location_type = 'GPS'
  AND location_updated_at > NOW() - INTERVAL '24 hours'
  AND location_updated_at <= NOW() - INTERVAL '2 hours'
  AND gps_point IS NOT NULL
  AND push_token IS NOT NULL
  AND ST_DWithin(
    gps_point::geography,
    ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
    $4 * 1000
  );
```

---

### Tier 4: Postal Code Match (MEDIUM)

**Criteria:**
- Device's IP postal code matches alert's affected postal codes

**Confidence:** MEDIUM  
**Reason:** General area match, less precise than GPS

**Query:**
```sql
SELECT 
  id AS device_id,
  'POSTAL_CODE' AS match_type,
  'MEDIUM' AS confidence,
  NULL AS distance_km  -- Distance not meaningful
FROM "Device"
WHERE ip_postal_code = ANY($1::text[])  -- Array of affected postal codes
  AND push_token IS NOT NULL;
```

**Parameters:**
- `$1`: Array of postal codes affected by alert (e.g., `['10001', '10002', '10003']`)

---

### Tier 5: IP Geolocation Match (LOW)

**Criteria:**
- Device's IP geolocation is within alert radius
- Only used if no better match available

**Confidence:** LOW  
**Reason:** IP geolocation is inaccurate (1-50km range)

**Query:**
```sql
SELECT 
  id AS device_id,
  'IP_GEO' AS match_type,
  'LOW' AS confidence,
  ST_Distance(ip_point::geography, $1::geography) / 1000 AS distance_km
FROM "Device"
WHERE ip_point IS NOT NULL
  AND push_token IS NOT NULL
  AND ST_DWithin(
    ip_point::geography,
    ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
    $4 * 1000
  );
```

---

## Geospatial Queries

### PostGIS Functions Used

| Function | Purpose | Example |
|----------|---------|---------|
| `ST_MakePoint(lon, lat)` | Create point from coordinates | `ST_MakePoint(-74.0060, 40.7128)` |
| `ST_SetSRID(geom, 4326)` | Set coordinate system (WGS84) | `ST_SetSRID(ST_MakePoint(...), 4326)` |
| `::geography` | Cast to geography type (meters) | `point::geography` |
| `ST_DWithin(geom1, geom2, dist)` | Check if within distance | `ST_DWithin(p1, p2, 10000)` (10km) |
| `ST_Distance(geom1, geom2)` | Calculate distance in meters | `ST_Distance(p1, p2) / 1000` (km) |

---

### Example: Complete Device Matching Query

```typescript
// LocationService.findDevicesForAlert()
async findDevicesForAlert(alertId: string): Promise<DeviceMatch[]> {
  // 1. Get alert details
  const alert = await this.prisma.alert.findUnique({
    where: { id: alertId },
    select: {
      location_point: true,
      radius_km: true,
      affected_postal_codes: true,
    },
  });

  const matches: DeviceMatch[] = [];

  // 2. Tier 1: Saved Zone Match
  const savedZoneMatches = await this.prisma.$queryRaw<DeviceMatch[]>`
    SELECT 
      d.id AS "deviceId",
      'SAVED_ZONE' AS "matchType",
      'HIGH' AS confidence,
      ST_Distance(sz.location_point::geography, ${alert.location_point}::geography) / 1000 AS "distanceKm"
    FROM "Device" d
    JOIN "SavedZone" sz ON sz.device_id = d.id
    WHERE ST_DWithin(
      sz.location_point::geography,
      ${alert.location_point}::geography,
      sz.radius_km * 1000
    )
      AND d.push_token IS NOT NULL
  `;
  matches.push(...savedZoneMatches);

  // 3. Tier 2: Fresh GPS
  const freshGpsMatches = await this.prisma.$queryRaw<DeviceMatch[]>`
    SELECT 
      id AS "deviceId",
      'GPS_FRESH' AS "matchType",
      'HIGH' AS confidence,
      ST_Distance(gps_point::geography, ${alert.location_point}::geography) / 1000 AS "distanceKm"
    FROM "Device"
    WHERE location_type = 'GPS'
      AND location_updated_at > NOW() - INTERVAL '2 hours'
      AND gps_point IS NOT NULL
      AND push_token IS NOT NULL
      AND ST_DWithin(
        gps_point::geography,
        ${alert.location_point}::geography,
        ${alert.radius_km * 1000}
      )
  `;
  matches.push(...freshGpsMatches);

  // 4. Tier 3: Stale GPS
  const staleGpsMatches = await this.prisma.$queryRaw<DeviceMatch[]>`
    SELECT 
      id AS "deviceId",
      'GPS_STALE' AS "matchType",
      'MEDIUM' AS confidence,
      ST_Distance(gps_point::geography, ${alert.location_point}::geography) / 1000 AS "distanceKm"
    FROM "Device"
    WHERE location_type = 'GPS'
      AND location_updated_at > NOW() - INTERVAL '24 hours'
      AND location_updated_at <= NOW() - INTERVAL '2 hours'
      AND gps_point IS NOT NULL
      AND push_token IS NOT NULL
      AND ST_DWithin(
        gps_point::geography,
        ${alert.location_point}::geography,
        ${alert.radius_km * 1000}
      )
  `;
  matches.push(...staleGpsMatches);

  // 5. Tier 4: Postal Code Match
  if (alert.affected_postal_codes.length > 0) {
    const postalCodeMatches = await this.prisma.$queryRaw<DeviceMatch[]>`
      SELECT 
        id AS "deviceId",
        'POSTAL_CODE' AS "matchType",
        'MEDIUM' AS confidence,
        NULL AS "distanceKm"
      FROM "Device"
      WHERE ip_postal_code = ANY(${alert.affected_postal_codes}::text[])
        AND push_token IS NOT NULL
    `;
    matches.push(...postalCodeMatches);
  }

  // 6. Tier 5: IP Geolocation Match
  const ipGeoMatches = await this.prisma.$queryRaw<DeviceMatch[]>`
    SELECT 
      id AS "deviceId",
      'IP_GEO' AS "matchType",
      'LOW' AS confidence,
      ST_Distance(ip_point::geography, ${alert.location_point}::geography) / 1000 AS "distanceKm"
    FROM "Device"
    WHERE ip_point IS NOT NULL
      AND push_token IS NOT NULL
      AND ST_DWithin(
        ip_point::geography,
        ${alert.location_point}::geography,
        ${alert.radius_km * 1000}
      )
  `;
  matches.push(...ipGeoMatches);

  // 7. Deduplicate (prefer higher confidence)
  const uniqueMatches = this.deduplicateMatches(matches);

  // 8. Sort by confidence (HIGH → MEDIUM → LOW)
  return uniqueMatches.sort((a, b) => {
    const confidenceOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
  });
}
```

---

### Deduplication Logic

If a device matches multiple tiers, use the highest confidence match:

```typescript
private deduplicateMatches(matches: DeviceMatch[]): DeviceMatch[] {
  const deviceMap = new Map<string, DeviceMatch>();

  for (const match of matches) {
    const existing = deviceMap.get(match.deviceId);

    if (!existing) {
      deviceMap.set(match.deviceId, match);
      continue;
    }

    // Priority: HIGH > MEDIUM > LOW
    const confidencePriority = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    
    if (confidencePriority[match.confidence] > confidencePriority[existing.confidence]) {
      deviceMap.set(match.deviceId, match);
    }
  }

  return Array.from(deviceMap.values());
}
```

---

## Performance Optimization

### GIST Indexes

**Required indexes for optimal performance:**

```sql
-- Device GPS location
CREATE INDEX "Device_gps_point_idx"
ON "Device" USING GIST (gps_point);

-- Device IP location
CREATE INDEX "Device_ip_point_idx"
ON "Device" USING GIST (ip_point);

-- SavedZone location
CREATE INDEX "SavedZone_location_point_idx"
ON "SavedZone" USING GIST (location_point);

-- Alert location
CREATE INDEX "Alert_location_point_idx"
ON "Alert" USING GIST (location_point);
```

---

### Query Performance Targets

| Query Type | Target p95 | Target p99 |
|------------|------------|------------|
| Saved Zone Match | < 50ms | < 100ms |
| GPS Match (Fresh/Stale) | < 100ms | < 200ms |
| Postal Code Match | < 20ms | < 50ms |
| IP Geo Match | < 100ms | < 200ms |
| **Total Device Matching** | < 500ms | < 1000ms |

---

### EXPLAIN ANALYZE Example

**Check if query uses GIST index:**

```sql
EXPLAIN ANALYZE
SELECT id
FROM "Device"
WHERE ST_DWithin(
  gps_point::geography,
  ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography,
  10000  -- 10km
);
```

**Expected output:**
```
Index Scan using Device_gps_point_idx on "Device"  (cost=0.28..12.30 rows=1 width=16) (actual time=0.045..0.089 rows=23 loops=1)
  Index Cond: (gps_point && '...'::geography)
  Filter: (st_dwithin(gps_point::geography, '...'::geography, '10000'::double precision))
Planning Time: 0.123 ms
Execution Time: 0.134 ms
```

**Warning signs:**
- ❌ `Seq Scan` instead of `Index Scan` → Missing or unused GIST index
- ❌ Execution time > 100ms → Query needs optimization

---

### Optimization Tips

1. **Always cast to geography:**
   ```sql
   -- Good: Uses meters, accurate for long distances
   ST_DWithin(point1::geography, point2::geography, 10000)
   
   -- Bad: Uses degrees, inaccurate
   ST_DWithin(point1, point2, 0.09)
   ```

2. **Use ST_DWithin in WHERE clause:**
   ```sql
   -- Good: Index-optimized
   WHERE ST_DWithin(point, target, radius)
   
   -- Bad: Forces full table scan
   WHERE ST_Distance(point, target) < radius
   ```

3. **Specify SRID 4326 (WGS84):**
   ```sql
   ST_SetSRID(ST_MakePoint(lon, lat), 4326)
   ```

4. **Filter by freshness first:**
   ```sql
   -- Reduces rows before geospatial calc
   WHERE location_updated_at > NOW() - INTERVAL '2 hours'
     AND ST_DWithin(...)
   ```

---

## Testing

### Unit Tests

**Location:** `src/location/location.service.spec.ts`

**Coverage:**
- ✅ Find devices for alert (all 5 tiers)
- ✅ Deduplication (prefer higher confidence)
- ✅ Calculate distance (accurate to 1m)
- ✅ Extract postal codes in radius
- ✅ Handle empty results (no matches)
- ✅ Performance: < 500ms for 10,000 devices

**Run:**
```bash
bun test location.service.spec.ts
```

---

### Integration Tests

**Location:** `test/location.e2e-spec.ts`

**Scenarios:**
- Create alert → devices matched by saved zone
- Create alert → devices matched by fresh GPS
- Create alert → devices matched by postal code
- Create alert → no devices matched (empty result)
- Update device location → matches new alerts

**Test Data:**
```typescript
// NYC coordinates for testing
const NYC_COORDS = { lat: 40.7128, lon: -74.0060 };
const BROOKLYN_COORDS = { lat: 40.6782, lon: -73.9442 };

// Create devices at known locations
await createDevice({ lat: NYC_COORDS.lat, lon: NYC_COORDS.lon });  // 0 km from alert
await createDevice({ lat: BROOKLYN_COORDS.lat, lon: BROOKLYN_COORDS.lon });  // 8.8 km from alert

// Create alert in NYC with 10km radius
const alert = await createAlert({ ...NYC_COORDS, radiusKm: 10 });

// Verify: NYC device matched, Brooklyn device matched, SF device not matched
```

**Run:**
```bash
bun test:e2e test/location.e2e-spec.ts
```

---

## Related Documentation

- [Alert Module](./alert-module.md) - Alert creation triggers device matching
- [Device Module](./device-module.md) - Device location tracking and saved zones
- [Notification Module](./notification-module.md) - Confidence-based notification styling
- [PostGIS Setup](../POSTGIS_SETUP.md) - PostGIS installation and verification
- [System Behavior Spec](../SYSTEM_BEHAVIOR_SPEC.md) - Location freshness rules

---

## Support

For issues with Location module:
- Check logs: `logs/application-*.log`
- Verify GIST indexes: `SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%GIST%';`
- Test query performance: `EXPLAIN ANALYZE SELECT ...`
- Verify PostGIS version: `SELECT PostGIS_Version();`
- Consult [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)
