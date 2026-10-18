---
name: services
description: "Skill for the Services area of fifi-alert-server. 29 symbols across 7 files."
---

# Services

29 symbols | 7 files | Cohesion: 74%

## When to Use

- Working with code in `src/`
- Understanding how withTemporaryBetterAuthSession, buildSessionCookie, hashToken work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/auth/services/token.service.ts` | generateAccessToken, generateRefreshToken, storeTokenInSession, durationToSeconds, sleep (+12) |
| `src/auth/services/token-cleanup.service.ts` | cleanupExpiredTokens, cleanupExpiredBans, manualCleanup |
| `test/pet.e2e-spec.ts` | setupTestData, ensurePetType |
| `src/services/prisma-singleton.service.ts` | PrismaSingleton, getInstance |
| `src/auth/services/better-auth-session.helper.ts` | withTemporaryBetterAuthSession, buildSessionCookie |
| `src/auth/auth/auth.controller.ts` | logout, refreshToken |
| `src/services/base-prisma.service.ts` | constructor |

## Entry Points

Start here when exploring this area:

- **`withTemporaryBetterAuthSession`** (Function) — `src/auth/services/better-auth-session.helper.ts:24`
- **`buildSessionCookie`** (Function) — `src/auth/services/better-auth-session.helper.ts:59`
- **`hashToken`** (Function) — `src/auth/services/token.service.ts:49`
- **`PrismaSingleton`** (Class) — `src/services/prisma-singleton.service.ts:2`
- **`RefreshTokenReuseError`** (Class) — `src/auth/services/token.service.ts:63`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `PrismaSingleton` | Class | `src/services/prisma-singleton.service.ts` | 2 |
| `RefreshTokenReuseError` | Class | `src/auth/services/token.service.ts` | 63 |
| `withTemporaryBetterAuthSession` | Function | `src/auth/services/better-auth-session.helper.ts` | 24 |
| `buildSessionCookie` | Function | `src/auth/services/better-auth-session.helper.ts` | 59 |
| `hashToken` | Function | `src/auth/services/token.service.ts` | 49 |
| `generateAccessToken` | Method | `src/auth/services/token.service.ts` | 130 |
| `generateRefreshToken` | Method | `src/auth/services/token.service.ts` | 189 |
| `storeTokenInSession` | Method | `src/auth/services/token.service.ts` | 695 |
| `durationToSeconds` | Method | `src/auth/services/token.service.ts` | 821 |
| `awaitReplacement` | Method | `src/auth/services/token.service.ts` | 535 |
| `replayReplacement` | Method | `src/auth/services/token.service.ts` | 565 |
| `replacementKey` | Method | `src/auth/services/token.service.ts` | 595 |
| `encryptReplacement` | Method | `src/auth/services/token.service.ts` | 605 |
| `decryptReplacement` | Method | `src/auth/services/token.service.ts` | 628 |
| `getInstance` | Method | `src/services/prisma-singleton.service.ts` | 10 |
| `constructor` | Method | `src/services/base-prisma.service.ts` | 16 |
| `validateAccessToken` | Method | `src/auth/services/token.service.ts` | 236 |
| `validateRefreshToken` | Method | `src/auth/services/token.service.ts` | 343 |
| `revokeToken` | Method | `src/auth/services/token.service.ts` | 748 |
| `logout` | Method | `src/auth/auth/auth.controller.ts` | 677 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RefreshToken → ReplacementKey` | cross_community | 6 |
| `ChangeEmail → PrismaSingleton` | cross_community | 5 |
| `ConfirmAccountDeletion → PrismaSingleton` | cross_community | 5 |
| `RequestAccountDeletion → PrismaSingleton` | cross_community | 5 |
| `RefreshToken → HashToken` | cross_community | 5 |
| `UpdatePassword → HashToken` | cross_community | 4 |
| `ChangeEmail → HashToken` | cross_community | 4 |
| `ChangeEmail → BuildSessionCookie` | cross_community | 4 |
| `ConfirmAccountDeletion → HashToken` | cross_community | 4 |
| `ConfirmAccountDeletion → BuildSessionCookie` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Auth | 4 calls |

## How to Explore

1. `gitnexus_context({name: "withTemporaryBetterAuthSession"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
