# Alert Zones Migration Guide

> **Document Purpose:** Help users understand the difference between SavedZones and AlertZones, and guide them on when to use each feature.

---

## Table of Contents

1. [What Changed?](#what-changed)
2. [Feature Comparison](#feature-comparison)
3. [When to Use Which?](#when-to-use-which)
4. [Migration Strategy](#migration-strategy)
5. [API Changes](#api-changes)
6. [Breaking Changes](#breaking-changes)
7. [FAQ](#faq)

---

## What Changed?

### New Feature: Alert Zones

**Alert Zones** are a **new user-scoped notification feature** introduced in February 2026. They complement (not replace) the existing SavedZones feature.

**Key Differences:**
- **SavedZones:** Device-specific zones (e.g., "My iPhone's home zone")
- **AlertZones:** User-wide zones (e.g., "My neighborhood - applies to all my devices")

### No Breaking Changes

- ✅ Existing SavedZones continue to work exactly as before
- ✅ No migration required for existing data
- ✅ Both features coexist and can be used together
- ✅ Backward compatible with all existing clients

---

## Feature Comparison

### SavedZones (Existing Feature)

**Purpose:** Device-specific location preferences

| Property | Value |
|----------|-------|
| **Scope** | Device-specific (1 device) |
| **Setup** | Create per device |
| **API Path** | `/devices/:deviceId/saved-zones` |
| **Radius Unit** | Kilometers (Float) |
| **Radius Range** | 0.1 - 50 km |
| **Max Limit** | 5 per device |
| **Notification Target** | Only that specific device |
| **Use Case** | Different preferences per device |

**Example:**
```typescript
// Create a SavedZone (device-specific)
POST /devices/abc-123/saved-zones
{
  "name": "Work",
  "lat": 37.7749,
  "lon": -122.4194,
  "radius_km": 2.0
}

// Result: Only device "abc-123" receives alerts within 2km of this location
```

---

### AlertZones (New Feature)

**Purpose:** User-wide notification coverage

| Property | Value |
|----------|-------|
| **Scope** | User-wide (all devices) |
| **Setup** | Create once, applies to all devices |
| **API Path** | `/users/me/alert-zones` |
| **Radius Unit** | Meters (Integer) |
| **Radius Range** | 50 - 5000 meters |
| **Max Limit** | 10 per user |
| **Notification Target** | All user's devices |
| **Use Case** | Consistent coverage everywhere |

**Example:**
```typescript
// Create an AlertZone (user-wide)
POST /users/me/alert-zones
{
  "name": "My Neighborhood",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "radius_meters": 500
}

// Result: ALL user's devices (iPhone, iPad, Android) receive alerts within 500m
```

---

## When to Use Which?

### Use SavedZones When:

✅ **Different devices need different zones**
- Work phone only gets alerts near office
- Personal tablet only gets alerts near home
- Traveling device gets alerts near hotel

✅ **Device-specific preferences**
- "My work iPhone should monitor downtown"
- "My home iPad should monitor my neighborhood"

✅ **Kilometer-level precision is fine**
- Monitoring large areas (1-10km)
- City-wide or regional coverage

---

### Use AlertZones When:

✅ **All devices should get the same alerts**
- "I want alerts in my neighborhood on all my devices"
- "Notify me anywhere near my mom's house"

✅ **Meter-level precision needed**
- Block-level monitoring (100-500m)
- Specific street or park (50-200m)
- Precise neighborhood boundaries

✅ **Simpler setup**
- Configure once, applies everywhere
- New devices automatically included
- Easier to manage (fewer zones total)

---

## Migration Strategy

### For Existing Users

**No action required.** Your existing SavedZones continue working unchanged.

**Optional: Add AlertZones**

If you want user-wide coverage, you can create AlertZones in addition to your SavedZones:

1. **Identify common zones** across your devices
   - Do all devices have a "Home" SavedZone at the same location?
   - Are there zones you want on every device?

2. **Create AlertZones for common locations**
   ```typescript
   POST /users/me/alert-zones
   {
     "name": "Home",
     "latitude": 37.7749,
     "longitude": -122.4194,
     "radius_meters": 500
   }
   ```

3. **Optionally remove duplicate SavedZones**
   - If you created an AlertZone "Home", you can delete individual device SavedZones named "Home"
   - This reduces clutter and simplifies management

---

### For New Users

**Recommended Setup:**

1. **Start with AlertZones** (simpler)
   - Create 2-3 user-wide zones: Home, Work, Neighborhood
   - These apply to all current and future devices

2. **Add SavedZones only if needed** (advanced)
   - If a specific device needs different coverage, add a SavedZone to that device

**Example Flow:**
```typescript
// Step 1: Create user-wide zones (all devices)
POST /users/me/alert-zones
{ "name": "Home", "latitude": 37.7749, "longitude": -122.4194, "radius_meters": 500 }

POST /users/me/alert-zones
{ "name": "Work", "latitude": 37.7849, "longitude": -122.4094, "radius_meters": 300 }

// Step 2 (optional): Add device-specific zone if needed
POST /devices/work-phone-123/saved-zones
{ "name": "Office Building", "lat": 37.7849, "lon": -122.4094, "radius_km": 0.1 }
```

---

## API Changes

### New Endpoints

#### POST /users/me/alert-zones
Create a new alert zone

**Request:**
```json
{
  "name": "My Neighborhood",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "radius_meters": 500,
  "priority": 1,
  "is_active": true
}
```

**Response (201):**
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

---

#### GET /users/me/alert-zones
List all alert zones for the authenticated user

**Response (200):**
```json
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
  }
]
```

---

#### GET /users/me/alert-zones/:id
Get a specific alert zone

**Response (200):** Same as single zone object above

**Errors:**
- `403 Forbidden` - Not the zone owner
- `404 Not Found` - Zone doesn't exist

---

#### PATCH /users/me/alert-zones/:id
Update an alert zone (all fields optional)

**Request:**
```json
{
  "radius_meters": 1000,
  "name": "Extended Neighborhood"
}
```

**Response (200):** Updated zone object

---

#### DELETE /users/me/alert-zones/:id
Delete an alert zone

**Response (204):** No content

**Errors:**
- `403 Forbidden` - Not the zone owner
- `404 Not Found` - Zone doesn't exist

---

### Unchanged Endpoints

All SavedZone endpoints remain unchanged:
- `POST /devices/:id/saved-zones`
- `GET /devices/:id/saved-zones`
- `PATCH /devices/saved-zones/:zoneId`
- `DELETE /devices/saved-zones/:zoneId`

---

## Breaking Changes

**None.** This is a purely additive feature.

### Compatibility

- ✅ Old clients continue to work without changes
- ✅ SavedZones continue to function identically
- ✅ No database migration required for existing data
- ✅ No changes to authentication or authorization

---

## FAQ

### Q: Do I need to migrate my SavedZones to AlertZones?

**A:** No. SavedZones continue to work exactly as before. AlertZones are an additional feature you can use alongside SavedZones.

---

### Q: Can I use both SavedZones and AlertZones together?

**A:** Yes! They coexist and both contribute to notification matching. If an alert matches both a SavedZone and an AlertZone, you'll receive one notification per device (deduplicated).

---

### Q: Why are AlertZones in meters but SavedZones in kilometers?

**A:** AlertZones are designed for **precision** (neighborhood, block-level), so meters feel more intuitive (e.g., "500 meters" vs "0.5 kilometers"). SavedZones were designed for **broader coverage**, so kilometers made sense.

---

### Q: What happens if an alert matches both a SavedZone and an AlertZone?

**A:** You receive **one notification per device** (the system deduplicates by device_id). Both match reasons are logged in analytics.

---

### Q: Can I have more AlertZones than SavedZones?

**A:** Yes! You can have up to:
- **10 AlertZones** per user
- **5 SavedZones** per device (unchanged)

So if you have 3 devices, you could theoretically have:
- 10 AlertZones (user-wide)
- 15 SavedZones (5 per device × 3 devices)

---

### Q: Do AlertZones work for devices registered in the future?

**A:** Yes! AlertZones apply to **all current and future devices**. When you add a new device, it automatically inherits your AlertZones.

---

### Q: Can I move a SavedZone to an AlertZone?

**A:** Not directly, but you can:
1. Create a new AlertZone with the same location
2. Delete the old SavedZone

There's no automated migration tool (not needed since SavedZones still work).

---

### Q: Why is the radius limited to 5km for AlertZones?

**A:** AlertZones are designed for **precision** (neighborhood-level). For broader coverage, use SavedZones (up to 50km) or rely on GPS/postal code matching.

---

### Q: Do AlertZones use the same notification confidence as SavedZones?

**A:** Yes! Both use **HIGH confidence** with priority `1`. Notifications are styled identically.

---

### Q: Can I temporarily disable an AlertZone?

**A:** Yes! Set `is_active: false` when updating:
```typescript
PATCH /users/me/alert-zones/:id
{ "is_active": false }
```

This is useful when traveling or if you want to pause notifications without deleting the zone.

---

### Q: Can I share AlertZones with family members?

**A:** Not yet. Each user has their own AlertZones. Zone sharing is on the roadmap for a future release.

---

### Q: How do I know which zones matched an alert?

**A:** Check the notification's `matchedVia` field:
- `"Alert zone: Home"` → Matched via AlertZone
- `"Saved zone: Home"` → Matched via SavedZone
- `"GPS location"` → Matched via device GPS
- `"Postal code: 94102"` → Matched via postal code

---

## Examples

### Example 1: User with Multiple Devices

**Scenario:** Sarah has an iPhone, iPad, and Android phone. She wants alerts in her neighborhood on all devices.

**Without AlertZones (old way):**
```typescript
// Create SavedZone for iPhone
POST /devices/iphone-123/saved-zones
{ "name": "Home", "lat": 37.7749, "lon": -122.4194, "radius_km": 0.5 }

// Create SavedZone for iPad
POST /devices/ipad-456/saved-zones
{ "name": "Home", "lat": 37.7749, "lon": -122.4194, "radius_km": 0.5 }

// Create SavedZone for Android
POST /devices/android-789/saved-zones
{ "name": "Home", "lat": 37.7749, "lon": -122.4194, "radius_km": 0.5 }

// Result: 3 API calls, 3 zones to manage
```

**With AlertZones (new way):**
```typescript
// Create one AlertZone
POST /users/me/alert-zones
{ "name": "Home", "latitude": 37.7749, "longitude": -122.4194, "radius_meters": 500 }

// Result: 1 API call, 1 zone to manage, applies to all 3 devices
```

---

### Example 2: Precision vs Coverage

**Scenario:** Mike wants alerts on his specific street (100m) and also wants broader neighborhood coverage (2km).

**Solution: Use Both Features**
```typescript
// AlertZone for precision (my street)
POST /users/me/alert-zones
{ "name": "My Street", "latitude": 37.7749, "longitude": -122.4194, "radius_meters": 100 }

// SavedZone for broader coverage (neighborhood)
POST /devices/my-phone-123/saved-zones
{ "name": "Neighborhood", "lat": 37.7749, "lon": -122.4194, "radius_km": 2.0 }

// Result: HIGH confidence for street-level, MEDIUM for neighborhood-level
```

---

### Example 3: Device-Specific Overrides

**Scenario:** Lisa wants alerts near home on all devices, but her work phone should ONLY get alerts near the office.

**Solution: AlertZone + SavedZone**
```typescript
// AlertZone for home (all devices)
POST /users/me/alert-zones
{ "name": "Home", "latitude": 37.7749, "longitude": -122.4194, "radius_meters": 500 }

// SavedZone only on work phone (device-specific)
POST /devices/work-phone-123/saved-zones
{ "name": "Office", "lat": 37.7849, "lon": -122.4094, "radius_km": 0.5 }

// Result: 
// - Personal devices: Alerts near home
// - Work phone: Alerts near home AND office
```

---

## Summary

### Key Takeaways

1. ✅ **AlertZones are additive** - SavedZones continue working
2. ✅ **No migration required** - Use as-is or adopt AlertZones gradually
3. ✅ **Both features coexist** - Use together for maximum flexibility
4. ✅ **AlertZones = user-wide** - Simpler setup, applies to all devices
5. ✅ **SavedZones = device-specific** - Advanced use cases

### Quick Decision Tree

```
Do you want the same alerts on all your devices?
  └─ YES → Use AlertZones
  └─ NO → Use SavedZones

Do you need meter-level precision?
  └─ YES → Use AlertZones
  └─ NO → Use SavedZones (kilometers)

Do you have multiple devices?
  └─ YES → AlertZones are easier to manage
  └─ NO → Doesn't matter, use either
```

---

## Next Steps

1. **Read the feature overview:** [FEATURE_OVERVIEW.md](./FEATURE_OVERVIEW.md)
2. **Check the API docs:** [ALERT_ZONE_MODULE.md](../../modules/ALERT_ZONE_MODULE.md)
3. **Try it out:** Create your first AlertZone via `/users/me/alert-zones`
4. **Provide feedback:** Let us know what you think!

---

## Support

For questions or issues:
- Consult the [ALERT_ZONE_MODULE.md](../../modules/ALERT_ZONE_MODULE.md) documentation
- Check the [Postman Collection](../../FiFi_Alert_API.postman_collection.json) for examples
- Review the [FEATURE_OVERVIEW.md](./FEATURE_OVERVIEW.md) for design decisions
