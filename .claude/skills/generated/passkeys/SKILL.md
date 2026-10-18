---
name: passkeys
description: "Skill for the Passkeys area of fifi-alert-server. 12 symbols across 1 files."
---

# Passkeys

12 symbols | 1 files | Cohesion: 84%

## When to Use

- Working with code in `src/`
- Understanding how normalisePasskeyName, toPasskeyDto, PasskeyEmailNotVerifiedException work
- Modifying passkeys-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/auth/passkeys/passkey.service.ts` | finishRegistration, rename, remove, findOwned, normalisePasskeyName (+7) |

## Entry Points

Start here when exploring this area:

- **`normalisePasskeyName`** (Function) — `src/auth/passkeys/passkey.service.ts:403`
- **`toPasskeyDto`** (Function) — `src/auth/passkeys/passkey.service.ts:411`
- **`PasskeyEmailNotVerifiedException`** (Class) — `src/auth/passkeys/passkey.service.ts:43`
- **`finishRegistration`** (Method) — `src/auth/passkeys/passkey.service.ts:161`
- **`rename`** (Method) — `src/auth/passkeys/passkey.service.ts:370`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `PasskeyEmailNotVerifiedException` | Class | `src/auth/passkeys/passkey.service.ts` | 43 |
| `normalisePasskeyName` | Function | `src/auth/passkeys/passkey.service.ts` | 403 |
| `toPasskeyDto` | Function | `src/auth/passkeys/passkey.service.ts` | 411 |
| `finishRegistration` | Method | `src/auth/passkeys/passkey.service.ts` | 161 |
| `rename` | Method | `src/auth/passkeys/passkey.service.ts` | 370 |
| `remove` | Method | `src/auth/passkeys/passkey.service.ts` | 385 |
| `findOwned` | Method | `src/auth/passkeys/passkey.service.ts` | 392 |
| `assertEnabled` | Method | `src/auth/passkeys/passkey.service.ts` | 100 |
| `startRegistration` | Method | `src/auth/passkeys/passkey.service.ts` | 108 |
| `startLogin` | Method | `src/auth/passkeys/passkey.service.ts` | 242 |
| `finishLogin` | Method | `src/auth/passkeys/passkey.service.ts` | 276 |
| `isUniqueViolation` | Function | `src/auth/passkeys/passkey.service.ts` | 424 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `FinishRegistration → Trim` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Questions | 2 calls |

## How to Explore

1. `gitnexus_context({name: "normalisePasskeyName"})` — see callers and callees
2. `gitnexus_query({query: "passkeys"})` — find related execution flows
3. Read key files listed above for implementation details
