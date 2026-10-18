---
name: device
description: "Skill for the Device area of fifi-alert-server. 10 symbols across 2 files."
---

# Device

10 symbols | 2 files | Cohesion: 100%

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
- **`updateLocation`** (Method) — `src/device/device.service.ts:186`
- **`updatePushToken`** (Method) — `src/device/device.service.ts:276`
- **`findByUserId`** (Method) — `src/device/device.service.ts:339`
- **`getLocationStatus`** (Method) — `src/device/device.service.ts:354`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `register` | Method | `src/device/device.service.ts` | 24 |
| `updateLocation` | Method | `src/device/device.service.ts` | 186 |
| `updatePushToken` | Method | `src/device/device.service.ts` | 276 |
| `findByUserId` | Method | `src/device/device.service.ts` | 339 |
| `getLocationStatus` | Method | `src/device/device.service.ts` | 354 |
| `mapToResponseDto` | Method | `src/device/device.service.ts` | 405 |
| `create` | Method | `src/device/saved-zone.service.ts` | 30 |
| `findByDevice` | Method | `src/device/saved-zone.service.ts` | 116 |
| `enrichWithCoordinates` | Method | `src/device/saved-zone.service.ts` | 288 |
| `mapToResponseDto` | Method | `src/device/saved-zone.service.ts` | 324 |

## How to Explore

1. `gitnexus_context({name: "register"})` — see callers and callees
2. `gitnexus_query({query: "device"})` — find related execution flows
3. Read key files listed above for implementation details
