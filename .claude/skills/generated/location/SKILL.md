---
name: location
description: "Skill for the Location area of fifi-alert-server. 9 symbols across 2 files."
---

# Location

9 symbols | 2 files | Cohesion: 94%

## When to Use

- Working with code in `src/`
- Understanding how findDevicesForAlert, findSavedZoneMatches, findAlertZoneMatches work
- Modifying location-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/location/location.service.ts` | findDevicesForAlert, findSavedZoneMatches, findAlertZoneMatches, findFreshGpsMatches, findStaleGpsMatches (+2) |
| `src/location/geospatial.service.ts` | calculateDistance, isWithinDistance |

## Entry Points

Start here when exploring this area:

- **`findDevicesForAlert`** (Method) — `src/location/location.service.ts:79`
- **`findSavedZoneMatches`** (Method) — `src/location/location.service.ts:171`
- **`findAlertZoneMatches`** (Method) — `src/location/location.service.ts:238`
- **`findFreshGpsMatches`** (Method) — `src/location/location.service.ts:332`
- **`findStaleGpsMatches`** (Method) — `src/location/location.service.ts:387`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `findDevicesForAlert` | Method | `src/location/location.service.ts` | 79 |
| `findSavedZoneMatches` | Method | `src/location/location.service.ts` | 171 |
| `findAlertZoneMatches` | Method | `src/location/location.service.ts` | 238 |
| `findFreshGpsMatches` | Method | `src/location/location.service.ts` | 332 |
| `findStaleGpsMatches` | Method | `src/location/location.service.ts` | 387 |
| `findPostalCodeMatches` | Method | `src/location/location.service.ts` | 446 |
| `findIpGeoMatches` | Method | `src/location/location.service.ts` | 491 |
| `calculateDistance` | Method | `src/location/geospatial.service.ts` | 32 |
| `isWithinDistance` | Method | `src/location/geospatial.service.ts` | 61 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Sighting | 1 calls |

## How to Explore

1. `gitnexus_context({name: "findDevicesForAlert"})` — see callers and callees
2. `gitnexus_query({query: "location"})` — find related execution flows
3. Read key files listed above for implementation details
