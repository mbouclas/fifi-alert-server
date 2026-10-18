---
name: guards
description: "Skill for the Guards area of fifi-alert-server. 13 symbols across 4 files."
---

# Guards

13 symbols | 4 files | Cohesion: 94%

## When to Use

- Working with code in `src/`
- Understanding how firstForwardedIp, getConfiguredClientKeys, isValidClientKey work
- Modifying guards-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/auth/guards/client-key.guard.ts` | getConfiguredClientKeys, isValidClientKey, safeEquals, constructor, canActivate (+1) |
| `src/auth/guards/user-throttler.guard.ts` | getTracker, firstHeader, firstForwardedIp |
| `src/auth/guards/user-throttler.guard.spec.ts` | track, getTracker |
| `src/auth/guards/bearer-token.guard.ts` | canActivate, extractTokenFromHeader |

## Entry Points

Start here when exploring this area:

- **`firstForwardedIp`** (Function) — `src/auth/guards/user-throttler.guard.ts:59`
- **`getConfiguredClientKeys`** (Function) — `src/auth/guards/client-key.guard.ts:37`
- **`isValidClientKey`** (Function) — `src/auth/guards/client-key.guard.ts:46`
- **`getTracker`** (Method) — `src/auth/guards/user-throttler.guard.ts:31`
- **`constructor`** (Method) — `src/auth/guards/client-key.guard.ts:63`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `firstForwardedIp` | Function | `src/auth/guards/user-throttler.guard.ts` | 59 |
| `getConfiguredClientKeys` | Function | `src/auth/guards/client-key.guard.ts` | 37 |
| `isValidClientKey` | Function | `src/auth/guards/client-key.guard.ts` | 46 |
| `getTracker` | Method | `src/auth/guards/user-throttler.guard.ts` | 31 |
| `constructor` | Method | `src/auth/guards/client-key.guard.ts` | 63 |
| `canActivate` | Method | `src/auth/guards/client-key.guard.ts` | 71 |
| `extractHeader` | Method | `src/auth/guards/client-key.guard.ts` | 105 |
| `canActivate` | Method | `src/auth/guards/bearer-token.guard.ts` | 22 |
| `extractTokenFromHeader` | Method | `src/auth/guards/bearer-token.guard.ts` | 80 |
| `firstHeader` | Function | `src/auth/guards/user-throttler.guard.ts` | 53 |
| `safeEquals` | Function | `src/auth/guards/client-key.guard.ts` | 50 |
| `track` | Function | `src/auth/guards/user-throttler.guard.spec.ts` | 16 |
| `getTracker` | Method | `src/auth/guards/user-throttler.guard.spec.ts` | 18 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GetTracker → Trim` | cross_community | 4 |
| `CanActivate → Trim` | cross_community | 4 |
| `Constructor → Trim` | cross_community | 3 |
| `GetTracker → SafeEquals` | intra_community | 3 |
| `GetTracker → FirstHeader` | intra_community | 3 |
| `CanActivate → SafeEquals` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Questions | 2 calls |

## How to Explore

1. `gitnexus_context({name: "firstForwardedIp"})` — see callers and callees
2. `gitnexus_query({query: "guards"})` — find related execution flows
3. Read key files listed above for implementation details
