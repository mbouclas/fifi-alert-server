---
name: location
description: "Skill for the Location area of fifi-alert-server. 10 symbols across 2 files."
---

# Location

10 symbols | 2 files | Cohesion: 95%

## When to Use

- Working with code in `src/`
- Understanding how findDevicesForAlert, findSavedZoneMatches, findAlertZoneMatches work
- Modifying location-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/location/location.service.ts` | findDevicesForAlert, findSavedZoneMatches, findAlertZoneMatches, findFreshGpsMatches, findStaleGpsMatches (+3) |
| `src/location/geospatial.service.ts` | calculateDistance, isWithinDistance |

## Entry Points

Start here when exploring this area:

- **`findDevicesForAlert`** (Method) — `src/location/location.service.ts:73`
- **`findSavedZoneMatches`** (Method) — `src/location/location.service.ts:168`
- **`findAlertZoneMatches`** (Method) — `src/location/location.service.ts:234`
- **`findFreshGpsMatches`** (Method) — `src/location/location.service.ts:298`
- **`findStaleGpsMatches`** (Method) — `src/location/location.service.ts:353`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `findDevicesForAlert` | Method | `src/location/location.service.ts` | 73 |
| `findSavedZoneMatches` | Method | `src/location/location.service.ts` | 168 |
| `findAlertZoneMatches` | Method | `src/location/location.service.ts` | 234 |
| `findFreshGpsMatches` | Method | `src/location/location.service.ts` | 298 |
| `findStaleGpsMatches` | Method | `src/location/location.service.ts` | 353 |
| `findPostalCodeMatches` | Method | `src/location/location.service.ts` | 412 |
| `findIpGeoMatches` | Method | `src/location/location.service.ts` | 457 |
| `deduplicateMatches` | Method | `src/location/location.service.ts` | 510 |
| `calculateDistance` | Method | `src/location/geospatial.service.ts` | 32 |
| `isWithinDistance` | Method | `src/location/geospatial.service.ts` | 61 |

## How to Explore

1. `gitnexus_context({name: "findDevicesForAlert"})` — see callers and callees
2. `gitnexus_query({query: "location"})` — find related execution flows
3. Read key files listed above for implementation details
