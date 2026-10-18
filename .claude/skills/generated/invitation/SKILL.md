---
name: invitation
description: "Skill for the Invitation area of fifi-alert-server. 36 symbols across 7 files."
---

# Invitation

36 symbols | 7 files | Cohesion: 72%

## When to Use

- Working with code in `src/`
- Understanding how toInvitationDto, mintInviteToken, containsTag work
- Modifying invitation-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/invitation/invitation.service.ts` | conflict, tooMany, isUniqueViolation, enforceSendLimits, create (+14) |
| `src/invitation/invitation-text.ts` | containsTag, containsControlChars, countPlaceholders, plainTextErrors, escapeHtml (+3) |
| `src/invitation/invitation.mapper.ts` | toInvitationDto, senderDisplayName, toInvitationPreviewDto |
| `src/invitation/invitation-token.ts` | mintInviteToken, hashInviteToken, isPlausibleInviteToken |
| `src/invitation/invitation.locale.ts` | getInvitationChrome |
| `src/config/invitation.config.ts` | buildInviteAcceptUrl |
| `src/shared/email/email.service.ts` | send |

## Entry Points

Start here when exploring this area:

- **`toInvitationDto`** (Function) — `src/invitation/invitation.mapper.ts:12`
- **`mintInviteToken`** (Function) — `src/invitation/invitation-token.ts:7`
- **`containsTag`** (Function) — `src/invitation/invitation-text.ts:34`
- **`containsControlChars`** (Function) — `src/invitation/invitation-text.ts:38`
- **`countPlaceholders`** (Function) — `src/invitation/invitation-text.ts:42`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `toInvitationDto` | Function | `src/invitation/invitation.mapper.ts` | 12 |
| `mintInviteToken` | Function | `src/invitation/invitation-token.ts` | 7 |
| `containsTag` | Function | `src/invitation/invitation-text.ts` | 34 |
| `containsControlChars` | Function | `src/invitation/invitation-text.ts` | 38 |
| `countPlaceholders` | Function | `src/invitation/invitation-text.ts` | 42 |
| `plainTextErrors` | Function | `src/invitation/invitation-text.ts` | 50 |
| `senderDisplayName` | Function | `src/invitation/invitation.mapper.ts` | 36 |
| `toInvitationPreviewDto` | Function | `src/invitation/invitation.mapper.ts` | 44 |
| `hashInviteToken` | Function | `src/invitation/invitation-token.ts` | 12 |
| `isPlausibleInviteToken` | Function | `src/invitation/invitation-token.ts` | 20 |
| `getInvitationChrome` | Function | `src/invitation/invitation.locale.ts` | 41 |
| `escapeHtml` | Function | `src/invitation/invitation-text.ts` | 20 |
| `normalizeText` | Function | `src/invitation/invitation-text.ts` | 30 |
| `renderInvitationHtmlBody` | Function | `src/invitation/invitation-text.ts` | 83 |
| `renderInvitationTextBody` | Function | `src/invitation/invitation-text.ts` | 101 |
| `buildInviteAcceptUrl` | Function | `src/config/invitation.config.ts` | 76 |
| `conflict` | Method | `src/invitation/invitation.service.ts` | 120 |
| `tooMany` | Method | `src/invitation/invitation.service.ts` | 132 |
| `isUniqueViolation` | Method | `src/invitation/invitation.service.ts` | 143 |
| `enforceSendLimits` | Method | `src/invitation/invitation.service.ts` | 167 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Process → Send` | cross_community | 5 |
| `HandleEmailChangeConfirmationRequested → Send` | cross_community | 4 |
| `HandleAccountDeletionVerificationRequested → Send` | cross_community | 4 |
| `Resolve → Send` | cross_community | 4 |
| `HandlePasswordResetEmailRequested → Send` | cross_community | 4 |
| `HandleUserRegistered → HashToken` | cross_community | 4 |
| `Preview → Trim` | cross_community | 4 |
| `HandleAccountVerificationEmailRequested → Send` | cross_community | 4 |
| `HandlePasswordUpdated → Send` | cross_community | 4 |
| `Create → Send` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Questions | 5 calls |
| Scripts | 2 calls |
| User | 2 calls |
| Services | 1 calls |
| Pet-types | 1 calls |

## How to Explore

1. `gitnexus_context({name: "toInvitationDto"})` — see callers and callees
2. `gitnexus_query({query: "invitation"})` — find related execution flows
3. Read key files listed above for implementation details
