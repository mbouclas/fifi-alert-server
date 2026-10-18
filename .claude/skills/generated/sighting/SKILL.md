---
name: sighting
description: "Skill for the Sighting area of fifi-alert-server. 10 symbols across 3 files."
---

# Sighting

10 symbols | 3 files | Cohesion: 95%

## When to Use

- Working with code in `src/`
- Understanding how getMaxSightingPhotos, getSightingPhotoUploadWindowHours, create work
- Modifying sighting-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/sighting/sighting.service.ts` | create, findOne, findByAlert, dismiss, mapToResponseDto (+2) |
| `src/config/sighting.config.ts` | getMaxSightingPhotos, getSightingPhotoUploadWindowHours |
| `src/sighting/sighting.controller.ts` | uploadPhotos |

## Entry Points

Start here when exploring this area:

- **`getMaxSightingPhotos`** (Function) — `src/config/sighting.config.ts:16`
- **`getSightingPhotoUploadWindowHours`** (Function) — `src/config/sighting.config.ts:28`
- **`create`** (Method) — `src/sighting/sighting.service.ts:72`
- **`findOne`** (Method) — `src/sighting/sighting.service.ts:208`
- **`findByAlert`** (Method) — `src/sighting/sighting.service.ts:220`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getMaxSightingPhotos` | Function | `src/config/sighting.config.ts` | 16 |
| `getSightingPhotoUploadWindowHours` | Function | `src/config/sighting.config.ts` | 28 |
| `create` | Method | `src/sighting/sighting.service.ts` | 72 |
| `findOne` | Method | `src/sighting/sighting.service.ts` | 208 |
| `findByAlert` | Method | `src/sighting/sighting.service.ts` | 220 |
| `dismiss` | Method | `src/sighting/sighting.service.ts` | 258 |
| `mapToResponseDto` | Method | `src/sighting/sighting.service.ts` | 338 |
| `notifyCreatorOfSighting` | Method | `src/sighting/sighting.service.ts` | 364 |
| `authorizePhotoUpload` | Method | `src/sighting/sighting.service.ts` | 435 |
| `uploadPhotos` | Method | `src/sighting/sighting.controller.ts` | 213 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Create → Trim` | cross_community | 6 |
| `Create → StripTrailingSlash` | cross_community | 6 |
| `Create → Send` | cross_community | 4 |
| `Create → EmailService` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| User | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getMaxSightingPhotos"})` — see callers and callees
2. `gitnexus_query({query: "sighting"})` — find related execution flows
3. Read key files listed above for implementation details
