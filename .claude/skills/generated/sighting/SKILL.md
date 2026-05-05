---
name: sighting
description: "Skill for the Sighting area of fifi-alert-server. 11 symbols across 4 files."
---

# Sighting

11 symbols | 4 files | Cohesion: 68%

## When to Use

- Working with code in `src/`
- Understanding how create, findByAlert, dismiss work
- Modifying sighting-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/sighting/sighting.service.ts` | create, findByAlert, dismiss, mapToResponseDto, notifyCreatorOfSighting (+2) |
| `src/simulation/utils/api-client.ts` | constructor, get |
| `src/shared/shared.module.ts` | getService |
| `src/location/location.service.ts` | deduplicateMatches |

## Entry Points

Start here when exploring this area:

- **`create`** (Method) — `src/sighting/sighting.service.ts:55`
- **`findByAlert`** (Method) — `src/sighting/sighting.service.ts:176`
- **`dismiss`** (Method) — `src/sighting/sighting.service.ts:213`
- **`mapToResponseDto`** (Method) — `src/sighting/sighting.service.ts:292`
- **`notifyCreatorOfSighting`** (Method) — `src/sighting/sighting.service.ts:355`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `create` | Method | `src/sighting/sighting.service.ts` | 55 |
| `findByAlert` | Method | `src/sighting/sighting.service.ts` | 176 |
| `dismiss` | Method | `src/sighting/sighting.service.ts` | 213 |
| `mapToResponseDto` | Method | `src/sighting/sighting.service.ts` | 292 |
| `notifyCreatorOfSighting` | Method | `src/sighting/sighting.service.ts` | 355 |
| `sendSightingReportedEmail` | Method | `src/sighting/sighting.service.ts` | 469 |
| `enrichWithCoordinates` | Method | `src/sighting/sighting.service.ts` | 318 |
| `getService` | Method | `src/shared/shared.module.ts` | 90 |
| `deduplicateMatches` | Method | `src/location/location.service.ts` | 540 |
| `constructor` | Method | `src/simulation/utils/api-client.ts` | 21 |
| `get` | Method | `src/simulation/utils/api-client.ts` | 40 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `NotifyCreatorOfSighting → Sleep` | cross_community | 6 |
| `NotifyCreatorOfSighting → LoadTemplate` | cross_community | 5 |
| `NotifyCreatorOfSighting → Send` | cross_community | 5 |
| `FindByDevice → Sleep` | cross_community | 5 |
| `Main → Sleep` | cross_community | 4 |
| `Login → Sleep` | cross_community | 4 |
| `Constructor → Sleep` | cross_community | 4 |
| `NotifyCreatorOfSighting → EmailService` | cross_community | 4 |
| `DeduplicateMatches → Sleep` | cross_community | 4 |
| `GetService → Sleep` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| User | 1 calls |
| Email | 1 calls |
| Cluster_113 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "create"})` — see callers and callees
2. `gitnexus_query({query: "sighting"})` — find related execution flows
3. Read key files listed above for implementation details
