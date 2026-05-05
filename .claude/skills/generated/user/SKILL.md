---
name: user
description: "Skill for the User area of fifi-alert-server. 53 symbols across 12 files."
---

# User

53 symbols | 12 files | Cohesion: 86%

## When to Use

- Working with code in `src/`
- Understanding how buildIncludeObject, buildQueryOptions, isValidPrismaRelationObject work
- Modifying user-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/user/user.service.ts` | findOne, findMany, resolveRoles, delete, assignGate (+18) |
| `src/user/user.controller.ts` | findAll, findOne, findByEmail, getUserPet, getAlertZone (+5) |
| `src/user/alert-zone.service.ts` | create, findByUser, findOne, update, delete (+1) |
| `src/user/alert-zone-cache.service.ts` | getActiveAlertZones, fetchActiveZonesFromDB, warmCache |
| `src/shared/helpers/prisma-include.helper.ts` | buildIncludeObject, buildQueryOptions |
| `src/auth/services/auth-email.service.ts` | sendEmailVerificationEmail, sendLoginNotificationEmail |
| `src/shared/helpers/prisma-model-fields.helper.ts` | isValidPrismaRelationObject, sanitizeUpdateData |
| `src/alert/alert.service.ts` | sendAlertNearYouEmails |
| `src/shared/email/email.service.ts` | EmailService |
| `src/services/prisma.service.ts` | PrismaService |

## Entry Points

Start here when exploring this area:

- **`buildIncludeObject`** (Function) — `src/shared/helpers/prisma-include.helper.ts:73`
- **`buildQueryOptions`** (Function) — `src/shared/helpers/prisma-include.helper.ts:113`
- **`isValidPrismaRelationObject`** (Function) — `src/shared/helpers/prisma-model-fields.helper.ts:105`
- **`sanitizeUpdateData`** (Function) — `src/shared/helpers/prisma-model-fields.helper.ts:132`
- **`EmailService`** (Class) — `src/shared/email/email.service.ts:109`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `EmailService` | Class | `src/shared/email/email.service.ts` | 109 |
| `PrismaService` | Class | `src/services/prisma.service.ts` | 12 |
| `buildIncludeObject` | Function | `src/shared/helpers/prisma-include.helper.ts` | 73 |
| `buildQueryOptions` | Function | `src/shared/helpers/prisma-include.helper.ts` | 113 |
| `isValidPrismaRelationObject` | Function | `src/shared/helpers/prisma-model-fields.helper.ts` | 105 |
| `sanitizeUpdateData` | Function | `src/shared/helpers/prisma-model-fields.helper.ts` | 132 |
| `findOne` | Method | `src/user/user.service.ts` | 427 |
| `findMany` | Method | `src/user/user.service.ts` | 467 |
| `resolveRoles` | Method | `src/user/user.service.ts` | 577 |
| `delete` | Method | `src/user/user.service.ts` | 652 |
| `assignGate` | Method | `src/user/user.service.ts` | 762 |
| `removeGate` | Method | `src/user/user.service.ts` | 809 |
| `getUserGates` | Method | `src/user/user.service.ts` | 854 |
| `handleAccountVerificationEmailRequested` | Method | `src/user/user.service.ts` | 946 |
| `sendAccountVerificationEmail` | Method | `src/user/user.service.ts` | 963 |
| `sendForgotPasswordEmail` | Method | `src/user/user.service.ts` | 1067 |
| `sendInviteEmail` | Method | `src/user/user.service.ts` | 1188 |
| `sendAlertNearYouEmails` | Method | `src/alert/alert.service.ts` | 911 |
| `sendEmailVerificationEmail` | Method | `src/auth/services/auth-email.service.ts` | 54 |
| `sendLoginNotificationEmail` | Method | `src/auth/services/auth-email.service.ts` | 156 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Main → BuildIncludeObject` | cross_community | 5 |
| `Main → GetUserScalarFields` | cross_community | 5 |
| `Main → GetUserRelationFields` | cross_community | 5 |
| `Main → GetUserImmutableFields` | cross_community | 5 |
| `Main → IsValidPrismaRelationObject` | cross_community | 5 |
| `Main → UpdateUserPassword` | cross_community | 4 |
| `HandleAccountVerificationEmailRequested → LoadTemplate` | cross_community | 4 |
| `HandleAccountVerificationEmailRequested → Send` | cross_community | 4 |
| `UpdateUserPassword → GetUserScalarFields` | cross_community | 4 |
| `UpdateUserPassword → GetUserRelationFields` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Email | 7 calls |
| GetUser | 1 calls |

## How to Explore

1. `gitnexus_context({name: "buildIncludeObject"})` — see callers and callees
2. `gitnexus_query({query: "user"})` — find related execution flows
3. Read key files listed above for implementation details
