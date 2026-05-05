---
name: alert
description: "Skill for the Alert area of fifi-alert-server. 16 symbols across 2 files."
---

# Alert

16 symbols | 2 files | Cohesion: 91%

## When to Use

- Working with code in `src/`
- Understanding how create, findById, update work
- Modifying alert-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/alert/alert.service.ts` | create, findById, update, resolve, renew (+6) |
| `src/alert/rate-limit.service.ts` | checkAlertCreationLimit, recordAlertCreation, countInWindow, getRetryAfter, getUserStats |

## Entry Points

Start here when exploring this area:

- **`create`** (Method) — `src/alert/alert.service.ts:64`
- **`findById`** (Method) — `src/alert/alert.service.ts:196`
- **`update`** (Method) — `src/alert/alert.service.ts:303`
- **`resolve`** (Method) — `src/alert/alert.service.ts:402`
- **`renew`** (Method) — `src/alert/alert.service.ts:499`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `create` | Method | `src/alert/alert.service.ts` | 64 |
| `findById` | Method | `src/alert/alert.service.ts` | 196 |
| `update` | Method | `src/alert/alert.service.ts` | 303 |
| `resolve` | Method | `src/alert/alert.service.ts` | 402 |
| `renew` | Method | `src/alert/alert.service.ts` | 499 |
| `mapToResponseDto` | Method | `src/alert/alert.service.ts` | 571 |
| `addPhotos` | Method | `src/alert/alert.service.ts` | 654 |
| `sendAlertCreatedEmail` | Method | `src/alert/alert.service.ts` | 784 |
| `sendAlertResolvedEmail` | Method | `src/alert/alert.service.ts` | 847 |
| `checkAlertCreationLimit` | Method | `src/alert/rate-limit.service.ts` | 57 |
| `recordAlertCreation` | Method | `src/alert/rate-limit.service.ts` | 151 |
| `countInWindow` | Method | `src/alert/rate-limit.service.ts` | 178 |
| `getRetryAfter` | Method | `src/alert/rate-limit.service.ts` | 190 |
| `getUserStats` | Method | `src/alert/rate-limit.service.ts` | 214 |
| `findNearby` | Method | `src/alert/alert.service.ts` | 221 |
| `mapRawToResponseDto` | Method | `src/alert/alert.service.ts` | 614 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Resolve → MapToResponseDto` | intra_community | 4 |
| `Resolve → LoadTemplate` | cross_community | 4 |
| `Resolve → Send` | cross_community | 4 |
| `Create → MapToResponseDto` | intra_community | 4 |
| `Create → LoadTemplate` | cross_community | 4 |
| `Create → Send` | cross_community | 4 |
| `Renew → MapToResponseDto` | intra_community | 4 |
| `Resolve → EmailService` | cross_community | 3 |
| `Create → EmailService` | cross_community | 3 |
| `AddPhotos → MapToResponseDto` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| User | 2 calls |
| Email | 2 calls |

## How to Explore

1. `gitnexus_context({name: "create"})` — see callers and callees
2. `gitnexus_query({query: "alert"})` — find related execution flows
3. Read key files listed above for implementation details
