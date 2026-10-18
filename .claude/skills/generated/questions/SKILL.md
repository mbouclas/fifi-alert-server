---
name: questions
description: "Skill for the Questions area of fifi-alert-server. 48 symbols across 19 files."
---

# Questions

48 symbols | 19 files | Cohesion: 81%

## When to Use

- Working with code in `src/`
- Understanding how normalizeTagId, getSocialAuthConfig, isSocialProviderConfigured work
- Modifying questions-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/commands/admin/questions/admin-create-user.questions.ts` | parseFirstName, validateFirstName, parseLastName, validateLastName, parseEmail (+4) |
| `src/commands/admin/questions/admin-create.questions.ts` | parseName, validateName, parseEmail, validateEmail |
| `src/commands/admin/questions/admin-create-role.questions.ts` | parseName, validateName, validateLevel, parseDescription |
| `src/i18n/language.service.ts` | resolve, normalizeCode, parseAcceptLanguage |
| `src/config/social-auth.config.ts` | splitList, getSocialAuthConfig, isSocialProviderConfigured |
| `src/auth/social/social-providers.ts` | splitName, mapGoogleProfile, mapFacebookProfile |
| `src/commands/admin/subcommands/create-admin.command.ts` | run, displaySuccess, displayError |
| `src/config/passkey.config.ts` | splitList, getPasskeyConfig |
| `src/config/invitation.config.ts` | positiveInt, getInvitationConfig |
| `src/invitation/dto/create-invitation.dto.ts` | trim, trimOrUndefined |

## Entry Points

Start here when exploring this area:

- **`normalizeTagId`** (Function) — `src/pet/tag-id.ts:13`
- **`getSocialAuthConfig`** (Function) — `src/config/social-auth.config.ts:46`
- **`isSocialProviderConfigured`** (Function) — `src/config/social-auth.config.ts:74`
- **`getPasskeyConfig`** (Function) — `src/config/passkey.config.ts:33`
- **`getInvitationConfig`** (Function) — `src/config/invitation.config.ts:49`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `normalizeTagId` | Function | `src/pet/tag-id.ts` | 13 |
| `getSocialAuthConfig` | Function | `src/config/social-auth.config.ts` | 46 |
| `isSocialProviderConfigured` | Function | `src/config/social-auth.config.ts` | 74 |
| `getPasskeyConfig` | Function | `src/config/passkey.config.ts` | 33 |
| `getInvitationConfig` | Function | `src/config/invitation.config.ts` | 49 |
| `sanitizeThankYouMessage` | Function | `src/alert/thank-you-message.ts` | 17 |
| `mapGoogleProfile` | Function | `src/auth/social/social-providers.ts` | 184 |
| `mapFacebookProfile` | Function | `src/auth/social/social-providers.ts` | 192 |
| `resolve` | Method | `src/i18n/language.service.ts` | 94 |
| `normalizeCode` | Method | `src/i18n/language.service.ts` | 136 |
| `parseAcceptLanguage` | Method | `src/i18n/language.service.ts` | 148 |
| `transform` | Method | `src/pet/pipes/tag-id.pipe.ts` | 9 |
| `parseEmail` | Method | `src/commands/admin/questions/admin-update-password.questions.ts` | 26 |
| `validateEmail` | Method | `src/commands/admin/questions/admin-update-password.questions.ts` | 34 |
| `parseName` | Method | `src/commands/admin/questions/admin-create.questions.ts` | 27 |
| `validateName` | Method | `src/commands/admin/questions/admin-create.questions.ts` | 35 |
| `parseEmail` | Method | `src/commands/admin/questions/admin-create.questions.ts` | 55 |
| `validateEmail` | Method | `src/commands/admin/questions/admin-create.questions.ts` | 63 |
| `parseFirstName` | Method | `src/commands/admin/questions/admin-create-user.questions.ts` | 28 |
| `validateFirstName` | Method | `src/commands/admin/questions/admin-create-user.questions.ts` | 36 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleEmailChangeConfirmationRequested → Trim` | cross_community | 6 |
| `HandleAccountDeletionVerificationRequested → Trim` | cross_community | 6 |
| `Resolve → Trim` | cross_community | 6 |
| `HandlePasswordResetEmailRequested → Trim` | cross_community | 6 |
| `HandleAccountVerificationEmailRequested → Trim` | cross_community | 6 |
| `HandlePasswordUpdated → Trim` | cross_community | 6 |
| `Create → Trim` | cross_community | 6 |
| `Create → Trim` | cross_community | 6 |
| `ProcessSuccessStory → Trim` | cross_community | 6 |
| `SendFallbackEmail → Trim` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Pet-types | 1 calls |

## How to Explore

1. `gitnexus_context({name: "normalizeTagId"})` — see callers and callees
2. `gitnexus_query({query: "questions"})` — find related execution flows
3. Read key files listed above for implementation details
