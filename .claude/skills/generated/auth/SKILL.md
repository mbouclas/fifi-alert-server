---
name: auth
description: "Skill for the Auth area of fifi-alert-server. 24 symbols across 7 files."
---

# Auth

24 symbols | 7 files | Cohesion: 68%

## When to Use

- Working with code in `src/`
- Understanding how isValidPrismaRelationObject, sanitizeUpdateData, getEmailVerificationCallbackURL work
- Modifying auth-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/auth/auth/auth.controller.ts` | bearerFromRequest, resolveCallerUserId, callBetterAuthAs, logoutAll, resetPassword (+9) |
| `src/user/user.service.ts` | update, updateUserPassword, handleUserCreatedEvent |
| `src/shared/helpers/prisma-model-fields.helper.ts` | isValidPrismaRelationObject, sanitizeUpdateData |
| `src/auth/passkeys/passkey.controller.ts` | loginVerify, requestVerificationEmail |
| `src/auth/services/token.service.ts` | revokeAllUserTokens |
| `src/auth.ts` | emit |
| `src/auth/auth-links.ts` | getEmailVerificationCallbackURL |

## Entry Points

Start here when exploring this area:

- **`isValidPrismaRelationObject`** (Function) — `src/shared/helpers/prisma-model-fields.helper.ts:105`
- **`sanitizeUpdateData`** (Function) — `src/shared/helpers/prisma-model-fields.helper.ts:132`
- **`getEmailVerificationCallbackURL`** (Function) — `src/auth/auth-links.ts:8`
- **`revokeAllUserTokens`** (Method) — `src/auth/services/token.service.ts:766`
- **`bearerFromRequest`** (Method) — `src/auth/auth/auth.controller.ts:103`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isValidPrismaRelationObject` | Function | `src/shared/helpers/prisma-model-fields.helper.ts` | 105 |
| `sanitizeUpdateData` | Function | `src/shared/helpers/prisma-model-fields.helper.ts` | 132 |
| `getEmailVerificationCallbackURL` | Function | `src/auth/auth-links.ts` | 8 |
| `revokeAllUserTokens` | Method | `src/auth/services/token.service.ts` | 766 |
| `bearerFromRequest` | Method | `src/auth/auth/auth.controller.ts` | 103 |
| `resolveCallerUserId` | Method | `src/auth/auth/auth.controller.ts` | 117 |
| `callBetterAuthAs` | Method | `src/auth/auth/auth.controller.ts` | 148 |
| `logoutAll` | Method | `src/auth/auth/auth.controller.ts` | 776 |
| `resetPassword` | Method | `src/auth/auth/auth.controller.ts` | 1016 |
| `updatePassword` | Method | `src/auth/auth/auth.controller.ts` | 1099 |
| `changeEmail` | Method | `src/auth/auth/auth.controller.ts` | 1201 |
| `requestAccountDeletion` | Method | `src/auth/auth/auth.controller.ts` | 1256 |
| `confirmAccountDeletion` | Method | `src/auth/auth/auth.controller.ts` | 1310 |
| `update` | Method | `src/user/user.service.ts` | 300 |
| `updateUserPassword` | Method | `src/user/user.service.ts` | 389 |
| `socialLogin` | Method | `src/auth/auth/auth.controller.ts` | 344 |
| `mapSocialSignInError` | Method | `src/auth/auth/auth.controller.ts` | 463 |
| `signup` | Method | `src/auth/auth/auth.controller.ts` | 842 |
| `emitUserRegistered` | Method | `src/auth/auth/auth.controller.ts` | 1425 |
| `handleUserCreatedEvent` | Method | `src/user/user.service.ts` | 993 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `SocialLogin → Trim` | cross_community | 5 |
| `ChangeEmail → PrismaSingleton` | cross_community | 5 |
| `ConfirmAccountDeletion → PrismaSingleton` | cross_community | 5 |
| `RequestAccountDeletion → PrismaSingleton` | cross_community | 5 |
| `Main → Emit` | cross_community | 5 |
| `Main → GetUserScalarFields` | cross_community | 5 |
| `Main → GetUserRelationFields` | cross_community | 5 |
| `Main → GetUserImmutableFields` | cross_community | 5 |
| `Main → IsValidPrismaRelationObject` | cross_community | 5 |
| `Signup → Emit` | intra_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| User | 5 calls |
| Services | 3 calls |
| Questions | 2 calls |
| GetUser | 1 calls |

## How to Explore

1. `gitnexus_context({name: "isValidPrismaRelationObject"})` — see callers and callees
2. `gitnexus_query({query: "auth"})` — find related execution flows
3. Read key files listed above for implementation details
