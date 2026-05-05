---
name: audit
description: "Skill for the Audit area of fifi-alert-server. 12 symbols across 1 files."
---

# Audit

12 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how handleAuditEvent, createAuditLog, sanitizePayload work
- Modifying audit-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/audit/audit-log.service.ts` | handleAuditEvent, createAuditLog, sanitizePayload, removeSensitiveFields, sanitizeStackTrace (+7) |

## Entry Points

Start here when exploring this area:

- **`handleAuditEvent`** (Method) — `src/audit/audit-log.service.ts:53`
- **`createAuditLog`** (Method) — `src/audit/audit-log.service.ts:73`
- **`sanitizePayload`** (Method) — `src/audit/audit-log.service.ts:137`
- **`removeSensitiveFields`** (Method) — `src/audit/audit-log.service.ts:158`
- **`sanitizeStackTrace`** (Method) — `src/audit/audit-log.service.ts:188`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `handleAuditEvent` | Method | `src/audit/audit-log.service.ts` | 53 |
| `createAuditLog` | Method | `src/audit/audit-log.service.ts` | 73 |
| `sanitizePayload` | Method | `src/audit/audit-log.service.ts` | 137 |
| `removeSensitiveFields` | Method | `src/audit/audit-log.service.ts` | 158 |
| `sanitizeStackTrace` | Method | `src/audit/audit-log.service.ts` | 188 |
| `inferActorType` | Method | `src/audit/audit-log.service.ts` | 209 |
| `getAuditLogs` | Method | `src/audit/audit-log.service.ts` | 224 |
| `getEntityAuditTrail` | Method | `src/audit/audit-log.service.ts` | 297 |
| `getUserActivity` | Method | `src/audit/audit-log.service.ts` | 331 |
| `getSecurityEvents` | Method | `src/audit/audit-log.service.ts` | 359 |
| `getFailedOperations` | Method | `src/audit/audit-log.service.ts` | 403 |
| `findMany` | Method | `src/audit/audit-log.service.ts` | 527 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleAuditEvent → RemoveSensitiveFields` | intra_community | 3 |
| `HandleAuditEvent → SanitizeStackTrace` | intra_community | 3 |
| `HandleAuditEvent → InferActorType` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "handleAuditEvent"})` — see callers and callees
2. `gitnexus_query({query: "audit"})` — find related execution flows
3. Read key files listed above for implementation details
