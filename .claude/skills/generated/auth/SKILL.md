---
name: auth
description: "Skill for the Auth area of fifi-alert-server. 6 symbols across 3 files."
---

# Auth

6 symbols | 3 files | Cohesion: 83%

## When to Use

- Working with code in `src/`
- Understanding how getEmailVerificationCallbackURL, handleUserCreatedEvent, login work
- Modifying auth-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/auth/auth/auth.controller.ts` | login, requestVerificationEmail, logFailedLoginAttempt, signup |
| `src/auth.ts` | getEmailVerificationCallbackURL |
| `src/user/user.service.ts` | handleUserCreatedEvent |

## Entry Points

Start here when exploring this area:

- **`getEmailVerificationCallbackURL`** (Function) — `src/auth.ts:15`
- **`handleUserCreatedEvent`** (Method) — `src/user/user.service.ts:923`
- **`login`** (Method) — `src/auth/auth/auth.controller.ts:91`
- **`requestVerificationEmail`** (Method) — `src/auth/auth/auth.controller.ts:286`
- **`logFailedLoginAttempt`** (Method) — `src/auth/auth/auth.controller.ts:304`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getEmailVerificationCallbackURL` | Function | `src/auth.ts` | 15 |
| `handleUserCreatedEvent` | Method | `src/user/user.service.ts` | 923 |
| `login` | Method | `src/auth/auth/auth.controller.ts` | 91 |
| `requestVerificationEmail` | Method | `src/auth/auth/auth.controller.ts` | 286 |
| `logFailedLoginAttempt` | Method | `src/auth/auth/auth.controller.ts` | 304 |
| `signup` | Method | `src/auth/auth/auth.controller.ts` | 519 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Login → Sleep` | cross_community | 4 |
| `Login → GetEmailVerificationCallbackURL` | intra_community | 3 |
| `Signup → GetEmailVerificationCallbackURL` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Sighting | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getEmailVerificationCallbackURL"})` — see callers and callees
2. `gitnexus_query({query: "auth"})` — find related execution flows
3. Read key files listed above for implementation details
