---
name: interceptors
description: "Skill for the Interceptors area of fifi-alert-server. 6 symbols across 2 files."
---

# Interceptors

6 symbols | 2 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how intercept, sanitize, isUserObject work
- Modifying interceptors-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/shared/interceptors/sanitize-user.interceptor.ts` | intercept, sanitize, isUserObject, sanitizeUser |
| `src/shared/interceptors/logging.interceptor.ts` | intercept, shouldLogBody |

## Entry Points

Start here when exploring this area:

- **`intercept`** (Method) — `src/shared/interceptors/sanitize-user.interceptor.ts:37`
- **`sanitize`** (Method) — `src/shared/interceptors/sanitize-user.interceptor.ts:44`
- **`isUserObject`** (Method) — `src/shared/interceptors/sanitize-user.interceptor.ts:91`
- **`sanitizeUser`** (Method) — `src/shared/interceptors/sanitize-user.interceptor.ts:104`
- **`intercept`** (Method) — `src/shared/interceptors/logging.interceptor.ts:29`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `intercept` | Method | `src/shared/interceptors/sanitize-user.interceptor.ts` | 37 |
| `sanitize` | Method | `src/shared/interceptors/sanitize-user.interceptor.ts` | 44 |
| `isUserObject` | Method | `src/shared/interceptors/sanitize-user.interceptor.ts` | 91 |
| `sanitizeUser` | Method | `src/shared/interceptors/sanitize-user.interceptor.ts` | 104 |
| `intercept` | Method | `src/shared/interceptors/logging.interceptor.ts` | 29 |
| `shouldLogBody` | Method | `src/shared/interceptors/logging.interceptor.ts` | 92 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Intercept → IsUserObject` | intra_community | 3 |
| `Intercept → SanitizeUser` | intra_community | 3 |
| `SanitizeUser → IsUserObject` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "intercept"})` — see callers and callees
2. `gitnexus_query({query: "interceptors"})` — find related execution flows
3. Read key files listed above for implementation details
