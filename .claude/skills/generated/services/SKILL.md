---
name: services
description: "Skill for the Services area of fifi-alert-server. 11 symbols across 5 files."
---

# Services

11 symbols | 5 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how PrismaSingleton, generateAccessToken, generateRefreshToken work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/auth/services/token.service.ts` | generateAccessToken, generateRefreshToken, storeTokenInSession, calculateExpiration |
| `src/auth/services/token-cleanup.service.ts` | cleanupExpiredTokens, cleanupExpiredBans, manualCleanup |
| `src/services/prisma-singleton.service.ts` | PrismaSingleton, getInstance |
| `test/pet.e2e-spec.ts` | setupTestData |
| `src/services/base-prisma.service.ts` | constructor |

## Entry Points

Start here when exploring this area:

- **`PrismaSingleton`** (Class) — `src/services/prisma-singleton.service.ts:2`
- **`generateAccessToken`** (Method) — `src/auth/services/token.service.ts:49`
- **`generateRefreshToken`** (Method) — `src/auth/services/token.service.ts:97`
- **`storeTokenInSession`** (Method) — `src/auth/services/token.service.ts:277`
- **`calculateExpiration`** (Method) — `src/auth/services/token.service.ts:382`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `PrismaSingleton` | Class | `src/services/prisma-singleton.service.ts` | 2 |
| `generateAccessToken` | Method | `src/auth/services/token.service.ts` | 49 |
| `generateRefreshToken` | Method | `src/auth/services/token.service.ts` | 97 |
| `storeTokenInSession` | Method | `src/auth/services/token.service.ts` | 277 |
| `calculateExpiration` | Method | `src/auth/services/token.service.ts` | 382 |
| `getInstance` | Method | `src/services/prisma-singleton.service.ts` | 10 |
| `constructor` | Method | `src/services/base-prisma.service.ts` | 16 |
| `cleanupExpiredTokens` | Method | `src/auth/services/token-cleanup.service.ts` | 22 |
| `cleanupExpiredBans` | Method | `src/auth/services/token-cleanup.service.ts` | 71 |
| `manualCleanup` | Method | `src/auth/services/token-cleanup.service.ts` | 110 |
| `setupTestData` | Function | `test/pet.e2e-spec.ts` | 54 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Constructor → PrismaSingleton` | intra_community | 3 |
| `SetupTestData → CalculateExpiration` | intra_community | 3 |
| `SetupTestData → StoreTokenInSession` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "PrismaSingleton"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
