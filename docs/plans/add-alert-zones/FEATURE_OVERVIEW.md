# Alert Zones - Feature Overview

> **Status:** Planned  
> **Priority:** Medium  
> **Type:** Enhancement  
> **Affects:** User Experience, Notification Targeting

---

## What Are Alert Zones?

**Alert Zones** are user-defined geographic areas where a user wants to receive notifications about missing pets. Unlike SavedZones (which are device-specific), Alert Zones are **user-scoped** and apply to **all of a user's devices**.

### Example Use Case

**Sarah** lives in San Francisco and wants alerts about missing pets in her neighborhood:

1. She creates an Alert Zone: **"My Neighborhood"**
   - Center: Her home address (37.7749°N, 122.4194°W)
   - Radius: **500 meters**
   
2. She has multiple devices:
   - iPhone (at home)
   - iPad (at work)
   - Android tablet (traveling)

3. When a pet goes missing within 500m of her home:
   - **All three devices** receive a HIGH confidence notification
   - She only had to configure the zone **once**

---

## Key Differences: Alert Zones vs Saved Zones

| Aspect | SavedZone (Current) | AlertZone (New) |
|--------|---------------------|-----------------|
| **Ownership** | Belongs to a Device | Belongs to a User |
| **Radius Unit** | Kilometers (Float) | **Meters (Integer)** |
| **Setup** | Create per device | **Create once, applies to all devices** |
| **Max Limit** | 5 per device | **10 per user** |
| **API Path** | `/devices/:id/saved-zones` | **`/users/me/alert-zones`** |
| **Use Case** | Device-specific preferences | **User-wide alert coverage** |

---

## Why Both Exist?

Both SavedZones and AlertZones serve **different purposes** and coexist:

### SavedZones (Device-Specific)
- "My **work phone** should only get alerts near the office"
- "My **personal tablet** should only get alerts near home"
- Use when each device has different location needs

### AlertZones (User-Wide)
- "I want alerts in **my neighborhood** on all my devices"
- "I want alerts near **my mom's house** wherever I am"
- Use when you want consistent coverage across all devices

---

## Technical Architecture

### Database Schema

```prisma
model AlertZone {
  id             Int      @id @default(autoincrement())
  user_id        Int      
  user           User     @relation("UserAlertZones")
  
  name           String   // "Home", "Neighborhood", etc.
  lat            Float
  lon            Float
  location_point Unsupported("geometry(Point, 4326)") // PostGIS
  radius_meters  Int      // 50-5000
  
  is_active      Boolean  @default(true)
  priority       Int      @default(0)
  
  created_at     DateTime @default(now())
  updated_at     DateTime @updatedAt
  
  @@index([user_id])
  @@index([location_point], type: Gist)
}
```

### Notification Matching Flow

```
1. Alert Created at Location X
          ↓
2. Query: Find Alert Zones within range
          ↓
3. Get all Devices for matched Users
          ↓
4. Send notifications to all Devices
```

**SQL Example:**

```sql
SELECT d.id, d.push_token, az.name
FROM alert_zones az
INNER JOIN users u ON az.user_id = u.id
INNER JOIN devices d ON d.user_id = u.id  -- All user devices
WHERE az.is_active = true
  AND d.push_token IS NOT NULL
  AND ST_DWithin(
    az.location_point::geography,
    ST_MakePoint($alertLon, $alertLat)::geography,
    (az.radius_meters + ($alertRadiusKm * 1000))
  )
```

**Key Difference:** The `INNER JOIN devices d ON d.user_id = u.id` means **all of the user's devices** receive notifications, not just one.

---

## API Endpoints

### Create Alert Zone
```http
POST /users/me/alert-zones
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Neighborhood",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "radius_meters": 500,
  "priority": 1,
  "is_active": true
}
```

**Response:**
```json
{
  "id": 123,
  "name": "My Neighborhood",
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

### List Alert Zones
```http
GET /users/me/alert-zones
```

Returns all alert zones for the authenticated user, ordered by priority.

### Update Alert Zone
```http
PATCH /users/me/alert-zones/:id

{
  "radius_meters": 1000,
  "name": "Extended Neighborhood"
}
```

### Delete Alert Zone
```http
DELETE /users/me/alert-zones/:id
```

---

## User Experience

### Onboarding Flow

1. **User downloads app**
2. **System prompts:** "Set up alert zones to receive notifications about missing pets"
3. **User opens map picker:**
   - Drops pin on map (e.g., home location)
   - Names zone: "Home"
   - Adjusts radius with slider: 500m
   - Visual circle shows coverage area
4. **Saves zone** → Applies to all current and future devices

### Creating Additional Zones

Users can create up to **10 zones** total:
- **Home** (500m) - Primary residence
- **Work** (300m) - Office building
- **Neighborhood** (1km) - Broader area
- **Mom's House** (500m) - Visit frequently
- **Dog Park** (200m) - Regular walking route

### UI Recommendations

**Map View:**
- Show all zones as colored circles
- Different colors for active/inactive
- Tap to edit or delete

**List View:**
- Name + radius + active toggle
- Sort by priority or creation date
- Quick enable/disable switch

---

## Performance Considerations

### PostGIS Indexing

Alert zones use **GIST spatial indexes** for fast geospatial queries:

```sql
CREATE INDEX alert_zone_gist_idx ON alert_zones 
USING GIST(location_point);
```

**Expected Performance:**
- Query time: <50ms for 1000+ zones
- Index automatically used by `ST_DWithin()`

### Deduplication

If a user matches via **both** an AlertZone and a SavedZone:
- System deduplicates by `device_id`
- User receives **only one notification per device**
- Prefers higher confidence match if applicable

---

## Security & Validation

### Input Validation

```typescript
- name: 1-50 characters, required
- latitude: -90 to 90, required
- longitude: -180 to 180, required  
- radius_meters: 50 to 5000, required
- priority: 0-10, optional (default 1)
- is_active: boolean, optional (default true)
```

### Authorization

- Users can **only** create/read/update/delete **their own** alert zones
- No cross-user access
- Admin endpoints TBD (future enhancement)

### Rate Limiting

- Max **10 zone creations per hour** per user
- Prevents spam/abuse

---

## Analytics

Track the following events:

| Event | Properties |
|-------|-----------|
| `alert_zone_created` | user_id, zone_name, radius_meters |
| `alert_zone_updated` | user_id, zone_id, changed_fields |
| `alert_zone_deleted` | user_id, zone_id |
| `notification_sent_via_alert_zone` | zone_id, alert_id, device_id, confidence |

**Metrics to Monitor:**
- Average number of zones per user
- Distribution of zone radii (50m, 100m, 500m, 1km, etc.)
- Match rate: AlertZone vs SavedZone vs GPS vs Postal Code
- Notification success rate per match type

---

## Migration & Rollout

### No Breaking Changes

- Existing SavedZones continue to work unchanged
- AlertZones are additive (new feature)
- No database migration for existing data
- Backward compatible

### Rollout Strategy

1. **Phase 1:** Deploy backend with AlertZones API (feature flag OFF)
2. **Phase 2:** Test with internal users (5-10 people)
3. **Phase 3:** Enable for beta users (100-500 people)
4. **Phase 4:** Full public release

### Feature Flag

```typescript
// In environment config or feature flag service
ALERT_ZONES_ENABLED=false  // Default OFF
```

Guard endpoints:
```typescript
if (!config.ALERT_ZONES_ENABLED) {
  throw new NotFoundException('Feature not available');
}
```

---

## Future Enhancements

### V2 Features (Post-MVP)

- **Zone Templates:** Pre-defined zones ("500m Home", "1km Neighborhood")
- **Auto-Detection:** Suggest zones based on device GPS patterns
- **Zone Categories:** Tag zones as "home", "work", "frequent", etc.
- **Zone Sharing:** Share zones with family members
- **Smart Radius:** Auto-adjust based on alert density
- **Zone Analytics:** Show how many alerts matched per zone
- **Admin Dashboard:** View all zones for moderation/debugging

---

## Testing Strategy

### Unit Tests
- AlertZoneService CRUD operations
- LocationService matching logic
- Input validation edge cases

### Integration Tests
- PostGIS spatial queries
- User → Device → Notification flow
- Deduplication logic

### E2E Tests
- Full API flow: Create → Match → Notify
- Multi-device scenarios
- Cross-zone matching

**Target Coverage:** >80% for all new code

---

## Documentation Deliverables

1. ✅ This overview document
2. ✅ Detailed task list (`tasks.md`)
3. 📝 API documentation (Swagger/Postman)
4. 📝 Module documentation (`ALERT_ZONE_MODULE.md`)
5. 📝 Client integration guide
6. 📝 Migration guide (SavedZone vs AlertZone)

---

## Success Metrics

### Technical
- [ ] All tests passing
- [ ] Query performance <50ms (P95)
- [ ] No production errors
- [ ] Code coverage >80%

### Product
- [ ] 50%+ of active users create at least 1 zone
- [ ] Average 2-3 zones per user
- [ ] 30%+ of notifications sent via AlertZone matches
- [ ] <5% zone deletion rate (indicates satisfaction)

### User Feedback
- [ ] Survey: "Alert Zones are easy to use" >80% agree
- [ ] Survey: "I receive relevant alerts" >75% agree
- [ ] Support tickets about zones <2% of total tickets

---

## Contact & Questions

- **Owner:** TBD
- **Tech Lead:** TBD
- **PM:** TBD
- **Design:** TBD

For questions about this feature, see `tasks.md` or contact the team.
