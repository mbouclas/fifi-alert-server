---
name: email
description: "Skill for the Email area of fifi-alert-server. 7 symbols across 4 files."
---

# Email

7 symbols | 4 files | Cohesion: 46%

## When to Use

- Working with code in `src/`
- Understanding how sendPasswordResetEmail, sendSightingDismissedEmail, send work
- Modifying email-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/shared/email/email.service.ts` | send, sendHtml, loadTemplate |
| `src/auth/services/auth-email.service.ts` | sendAccountActivationEmail, sendPasswordChangedEmail |
| `src/user/user.service.ts` | sendPasswordResetEmail |
| `src/sighting/sighting.service.ts` | sendSightingDismissedEmail |

## Entry Points

Start here when exploring this area:

- **`sendPasswordResetEmail`** (Method) — `src/user/user.service.ts:1127`
- **`sendSightingDismissedEmail`** (Method) — `src/sighting/sighting.service.ts:562`
- **`send`** (Method) — `src/shared/email/email.service.ts:135`
- **`sendHtml`** (Method) — `src/shared/email/email.service.ts:222`
- **`loadTemplate`** (Method) — `src/shared/email/email.service.ts:299`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `sendPasswordResetEmail` | Method | `src/user/user.service.ts` | 1127 |
| `sendSightingDismissedEmail` | Method | `src/sighting/sighting.service.ts` | 562 |
| `send` | Method | `src/shared/email/email.service.ts` | 135 |
| `sendHtml` | Method | `src/shared/email/email.service.ts` | 222 |
| `loadTemplate` | Method | `src/shared/email/email.service.ts` | 299 |
| `sendAccountActivationEmail` | Method | `src/auth/services/auth-email.service.ts` | 105 |
| `sendPasswordChangedEmail` | Method | `src/auth/services/auth-email.service.ts` | 219 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `NotifyCreatorOfSighting → LoadTemplate` | cross_community | 5 |
| `NotifyCreatorOfSighting → Send` | cross_community | 5 |
| `Resolve → LoadTemplate` | cross_community | 4 |
| `Resolve → Send` | cross_community | 4 |
| `HandleAccountVerificationEmailRequested → LoadTemplate` | cross_community | 4 |
| `HandleAccountVerificationEmailRequested → Send` | cross_community | 4 |
| `Create → LoadTemplate` | cross_community | 4 |
| `Create → Send` | cross_community | 4 |
| `SendForgotPasswordEmail → LoadTemplate` | cross_community | 3 |
| `SendForgotPasswordEmail → Send` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| User | 4 calls |

## How to Explore

1. `gitnexus_context({name: "sendPasswordResetEmail"})` — see callers and callees
2. `gitnexus_query({query: "email"})` — find related execution flows
3. Read key files listed above for implementation details
