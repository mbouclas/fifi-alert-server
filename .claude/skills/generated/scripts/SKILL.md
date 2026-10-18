---
name: scripts
description: "Skill for the Scripts area of fifi-alert-server. 84 symbols across 14 files."
---

# Scripts

84 symbols | 14 files | Cohesion: 87%

## When to Use

- Working with code in `scripts/`
- Understanding how count work
- Modifying scripts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `scripts/smoke-passkeys.ts` | check, insertPasskey, cborBstr, coseEc2Key, SoftAuthenticator (+17) |
| `scripts/smoke-invitations.ts` | check, decodeQp, decodeMime, startSmtpSink, waitForMail (+10) |
| `scripts/test-alert-zone-performance.ts` | testAlertZoneQuery, getQueryPlan, checkGistIndexUsed, createTestData, cleanupTestData (+4) |
| `scripts/performance-test.ts` | calculatePercentile, calculateMetrics, printMetrics, testAlertCreationPerformance, testGeospatialQueryPerformance (+2) |
| `scripts/smoke-auth-emails.ts` | check, post, get, findVerificationToken, betterAuthSessionCount (+2) |
| `scripts/smoke-social-login.ts` | check, post, get, providerConfigured, fullRoundTrip (+1) |
| `scripts/smoke-auth-hardening.ts` | check, post, get, main |
| `scripts/smoke-refresh-grace.ts` | post, check, main |
| `scripts/smoke-refresh-race.ts` | post, check, main |
| `scripts/smoke-thank-you.ts` | call, user |

## Entry Points

Start here when exploring this area:

- **`count`** (Function) — `src/invitation/invitation.service.ts:328`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `count` | Function | `src/invitation/invitation.service.ts` | 328 |
| `SoftAuthenticator` | Class | `scripts/smoke-passkeys.ts` | 220 |
| `check` | Function | `scripts/smoke-invitations.ts` | 33 |
| `decodeQp` | Function | `scripts/smoke-invitations.ts` | 50 |
| `decodeMime` | Function | `scripts/smoke-invitations.ts` | 58 |
| `startSmtpSink` | Function | `scripts/smoke-invitations.ts` | 81 |
| `waitForMail` | Function | `scripts/smoke-invitations.ts` | 134 |
| `inviteTokenOf` | Function | `scripts/smoke-invitations.ts` | 150 |
| `call` | Function | `scripts/smoke-invitations.ts` | 157 |
| `signup` | Function | `scripts/smoke-invitations.ts` | 184 |
| `verifiedUser` | Function | `scripts/smoke-invitations.ts` | 203 |
| `isDto` | Function | `scripts/smoke-invitations.ts` | 244 |
| `greekBody` | Function | `scripts/smoke-invitations.ts` | 249 |
| `invite` | Function | `scripts/smoke-invitations.ts` | 251 |
| `rcpt` | Function | `scripts/smoke-invitations.ts` | 265 |
| `main` | Function | `scripts/smoke-invitations.ts` | 272 |
| `auth` | Function | `scripts/smoke-invitations.ts` | 338 |
| `post` | Function | `scripts/smoke-refresh-grace.ts` | 24 |
| `check` | Function | `scripts/smoke-refresh-grace.ts` | 34 |
| `main` | Function | `scripts/smoke-refresh-grace.ts` | 42 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Main → Count` | cross_community | 5 |
| `Main → Trim` | cross_community | 4 |
| `Main → DecodeQp` | intra_community | 4 |
| `Main → CalculatePercentile` | intra_community | 4 |
| `Process → Count` | cross_community | 4 |
| `Main → Call` | cross_community | 3 |
| `Main → FreshVisitor` | cross_community | 3 |
| `Main → Post` | intra_community | 3 |
| `Main → Check` | intra_community | 3 |
| `Main → Get` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Questions | 1 calls |

## How to Explore

1. `gitnexus_context({name: "count"})` — see callers and callees
2. `gitnexus_query({query: "scripts"})` — find related execution flows
3. Read key files listed above for implementation details
