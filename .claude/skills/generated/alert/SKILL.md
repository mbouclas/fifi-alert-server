---
name: alert
description: "Skill for the Alert area of fifi-alert-server. 26 symbols across 5 files."
---

# Alert

26 symbols | 5 files | Cohesion: 92%

## When to Use

- Working with code in `src/`
- Understanding how isFoundOutcome, getReunionTtlDays, readLimit work
- Modifying alert-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/alert/alert.service.ts` | create, findById, update, resolve, cancel (+8) |
| `src/alert/rate-limit.service.ts` | checkAlertCreationLimit, recordAlertCreation, countInWindow, getRetryAfter, getUserStats (+2) |
| `src/alert/reunion-snapshot.service.ts` | countNeighboursNotified, upsertForResolvedAlert, findPublicByTagId, toDto |
| `src/alert/dto/resolve-alert.dto.ts` | isFoundOutcome |
| `src/config/reunion.config.ts` | getReunionTtlDays |

## Entry Points

Start here when exploring this area:

- **`isFoundOutcome`** (Function) — `src/alert/dto/resolve-alert.dto.ts:34`
- **`getReunionTtlDays`** (Function) — `src/config/reunion.config.ts:12`
- **`readLimit`** (Function) — `src/alert/rate-limit.service.ts:25`
- **`create`** (Method) — `src/alert/alert.service.ts:88`
- **`findById`** (Method) — `src/alert/alert.service.ts:240`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isFoundOutcome` | Function | `src/alert/dto/resolve-alert.dto.ts` | 34 |
| `getReunionTtlDays` | Function | `src/config/reunion.config.ts` | 12 |
| `readLimit` | Function | `src/alert/rate-limit.service.ts` | 25 |
| `create` | Method | `src/alert/alert.service.ts` | 88 |
| `findById` | Method | `src/alert/alert.service.ts` | 240 |
| `update` | Method | `src/alert/alert.service.ts` | 377 |
| `resolve` | Method | `src/alert/alert.service.ts` | 484 |
| `cancel` | Method | `src/alert/alert.service.ts` | 635 |
| `renew` | Method | `src/alert/alert.service.ts` | 747 |
| `addPhotos` | Method | `src/alert/alert.service.ts` | 907 |
| `findActiveByTagId` | Method | `src/alert/alert.service.ts` | 264 |
| `findNearby` | Method | `src/alert/alert.service.ts` | 288 |
| `mapToResponseDto` | Method | `src/alert/alert.service.ts` | 823 |
| `mapRawToResponseDto` | Method | `src/alert/alert.service.ts` | 840 |
| `applyViewerRedaction` | Method | `src/alert/alert.service.ts` | 884 |
| `checkAlertCreationLimit` | Method | `src/alert/rate-limit.service.ts` | 74 |
| `recordAlertCreation` | Method | `src/alert/rate-limit.service.ts` | 168 |
| `countInWindow` | Method | `src/alert/rate-limit.service.ts` | 195 |
| `getRetryAfter` | Method | `src/alert/rate-limit.service.ts` | 207 |
| `getUserStats` | Method | `src/alert/rate-limit.service.ts` | 231 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Resolve → Trim` | cross_community | 6 |
| `Resolve → StripTrailingSlash` | cross_community | 6 |
| `Create → Trim` | cross_community | 6 |
| `Create → StripTrailingSlash` | cross_community | 6 |
| `Resolve → RoundCoordinate` | cross_community | 5 |
| `Resolve → MapRawToResponseDto` | cross_community | 5 |
| `Create → RoundCoordinate` | cross_community | 5 |
| `Create → MapRawToResponseDto` | cross_community | 5 |
| `Cancel → RoundCoordinate` | cross_community | 5 |
| `Cancel → MapRawToResponseDto` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| User | 2 calls |

## How to Explore

1. `gitnexus_context({name: "isFoundOutcome"})` — see callers and callees
2. `gitnexus_query({query: "alert"})` — find related execution flows
3. Read key files listed above for implementation details
