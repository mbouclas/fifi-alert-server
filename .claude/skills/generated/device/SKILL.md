---
name: device
description: "Skill for the Device area of fifi-alert-server. 10 symbols across 2 files."
---

# Device

10 symbols | 2 files | Cohesion: 94%

## When to Use

- Working with code in `src/`
- Understanding how register, updateLocation, updatePushToken work
- Modifying device-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/device/device.service.ts` | register, updateLocation, updatePushToken, findByUserId, getLocationStatus (+1) |
| `src/device/saved-zone.service.ts` | create, findByDevice, enrichWithCoordinates, mapToResponseDto |

## Entry Points

Start here when exploring this area:

- **`register`** (Method) — `src/device/device.service.ts:24`
- **`updateLocation`** (Method) — `src/device/device.service.ts:196`
- **`updatePushToken`** (Method) — `src/device/device.service.ts:286`
- **`findByUserId`** (Method) — `src/device/device.service.ts:349`
- **`getLocationStatus`** (Method) — `src/device/device.service.ts:364`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `register` | Method | `src/device/device.service.ts` | 24 |
| `updateLocation` | Method | `src/device/device.service.ts` | 196 |
| `updatePushToken` | Method | `src/device/device.service.ts` | 286 |
| `findByUserId` | Method | `src/device/device.service.ts` | 349 |
| `getLocationStatus` | Method | `src/device/device.service.ts` | 364 |
| `mapToResponseDto` | Method | `src/device/device.service.ts` | 415 |
| `create` | Method | `src/device/saved-zone.service.ts` | 30 |
| `findByDevice` | Method | `src/device/saved-zone.service.ts` | 116 |
| `enrichWithCoordinates` | Method | `src/device/saved-zone.service.ts` | 288 |
| `mapToResponseDto` | Method | `src/device/saved-zone.service.ts` | 324 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `FindByDevice → Sleep` | cross_community | 5 |
| `Register → GetLocationStatus` | intra_community | 3 |
| `UpdateLocation → GetLocationStatus` | intra_community | 3 |
| `UpdatePushToken → GetLocationStatus` | intra_community | 3 |
| `FindByDevice → MapToResponseDto` | intra_community | 3 |
| `FindByUserId → GetLocationStatus` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Sighting | 1 calls |

## How to Explore

1. `gitnexus_context({name: "register"})` — see callers and callees
2. `gitnexus_query({query: "device"})` — find related execution flows
3. Read key files listed above for implementation details
