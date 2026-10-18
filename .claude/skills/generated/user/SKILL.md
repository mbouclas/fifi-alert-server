---
name: user
description: "Skill for the User area of fifi-alert-server. 83 symbols across 18 files."
---

# User

83 symbols | 18 files | Cohesion: 83%

## When to Use

- Working with code in `src/`
- Understanding how formatExpiresIn, getWebAppUrl, buildWebAppUrl work
- Modifying user-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/user/user.service.ts` | formatExpiresIn, handleAccountVerificationEmailRequested, handlePasswordResetEmailRequested, handleEmailChangeConfirmationRequested, handleAccountDeletionVerificationRequested (+29) |
| `src/user/user.controller.ts` | findAll, findOne, findByEmail, getUserPet, getAlertZone (+5) |
| `src/user/alert-zone.service.ts` | create, findByUser, findOne, update, delete (+1) |
| `src/auth/auth-links.ts` | extractCallbackURL, buildWebVerificationUrl, buildWebResetPasswordUrl, buildWebDeleteAccountUrl |
| `src/notification/alert-email.service.ts` | isOptedIn, sendAlertEmail, sendPetIsHomeEmail |
| `src/config/web-app.config.ts` | stripTrailingSlash, getWebAppUrl, buildWebAppUrl |
| `src/alert/alert.service.ts` | sendAlertCreatedEmail, sendAlertResolvedEmail, sendAlertNearYouEmails |
| `src/shared/email/email.service.ts` | EmailService, sendHtml, loadTemplate |
| `src/auth/auth/auth.controller.ts` | login, logFailedLoginAttempt, me |
| `src/user/alert-zone-cache.service.ts` | getActiveAlertZones, fetchActiveZonesFromDB, warmCache |

## Entry Points

Start here when exploring this area:

- **`formatExpiresIn`** (Function) — `src/user/user.service.ts:115`
- **`getWebAppUrl`** (Function) — `src/config/web-app.config.ts:20`
- **`buildWebAppUrl`** (Function) — `src/config/web-app.config.ts:41`
- **`extractCallbackURL`** (Function) — `src/auth/auth-links.ts:16`
- **`buildWebVerificationUrl`** (Function) — `src/auth/auth-links.ts:32`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `EmailService` | Class | `src/shared/email/email.service.ts` | 102 |
| `PrismaService` | Class | `src/services/prisma.service.ts` | 12 |
| `formatExpiresIn` | Function | `src/user/user.service.ts` | 115 |
| `getWebAppUrl` | Function | `src/config/web-app.config.ts` | 20 |
| `buildWebAppUrl` | Function | `src/config/web-app.config.ts` | 41 |
| `extractCallbackURL` | Function | `src/auth/auth-links.ts` | 16 |
| `buildWebVerificationUrl` | Function | `src/auth/auth-links.ts` | 32 |
| `buildWebResetPasswordUrl` | Function | `src/auth/auth-links.ts` | 49 |
| `buildWebDeleteAccountUrl` | Function | `src/auth/auth-links.ts` | 76 |
| `buildIncludeObject` | Function | `src/shared/helpers/prisma-include.helper.ts` | 73 |
| `buildQueryOptions` | Function | `src/shared/helpers/prisma-include.helper.ts` | 113 |
| `handleAccountVerificationEmailRequested` | Method | `src/user/user.service.ts` | 1016 |
| `handlePasswordResetEmailRequested` | Method | `src/user/user.service.ts` | 1040 |
| `handleEmailChangeConfirmationRequested` | Method | `src/user/user.service.ts` | 1129 |
| `handleAccountDeletionVerificationRequested` | Method | `src/user/user.service.ts` | 1161 |
| `sendAccountVerificationEmail` | Method | `src/user/user.service.ts` | 1223 |
| `sendWelcomeEmail` | Method | `src/user/user.service.ts` | 1277 |
| `sendForgotPasswordEmail` | Method | `src/user/user.service.ts` | 1331 |
| `sendPasswordChangedEmail` | Method | `src/user/user.service.ts` | 1375 |
| `sendEmailChangeConfirmationEmail` | Method | `src/user/user.service.ts` | 1424 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleEmailChangeConfirmationRequested → Trim` | cross_community | 6 |
| `HandleEmailChangeConfirmationRequested → StripTrailingSlash` | intra_community | 6 |
| `HandleAccountDeletionVerificationRequested → Trim` | cross_community | 6 |
| `HandleAccountDeletionVerificationRequested → StripTrailingSlash` | intra_community | 6 |
| `Resolve → Trim` | cross_community | 6 |
| `Resolve → StripTrailingSlash` | cross_community | 6 |
| `HandlePasswordResetEmailRequested → Trim` | cross_community | 6 |
| `HandlePasswordResetEmailRequested → StripTrailingSlash` | intra_community | 6 |
| `HandleAccountVerificationEmailRequested → Trim` | cross_community | 6 |
| `HandleAccountVerificationEmailRequested → StripTrailingSlash` | intra_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Auth | 7 calls |
| Questions | 6 calls |
| Invitation | 1 calls |
| Scripts | 1 calls |

## How to Explore

1. `gitnexus_context({name: "formatExpiresIn"})` — see callers and callees
2. `gitnexus_query({query: "user"})` — find related execution flows
3. Read key files listed above for implementation details
