---
name: smtp
description: "Skill for the Smtp area of fifi-alert-server. 6 symbols across 1 files."
---

# Smtp

6 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how constructor, getProviderPreset, verifyConnection work
- Modifying smtp-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/shared/smtp/smtp.service.ts` | constructor, getProviderPreset, verifyConnection, send, mapToNodemailerFormat (+1) |

## Entry Points

Start here when exploring this area:

- **`constructor`** (Method) — `src/shared/smtp/smtp.service.ts:37`
- **`getProviderPreset`** (Method) — `src/shared/smtp/smtp.service.ts:103`
- **`verifyConnection`** (Method) — `src/shared/smtp/smtp.service.ts:137`
- **`send`** (Method) — `src/shared/smtp/smtp.service.ts:171`
- **`mapToNodemailerFormat`** (Method) — `src/shared/smtp/smtp.service.ts:255`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `constructor` | Method | `src/shared/smtp/smtp.service.ts` | 37 |
| `getProviderPreset` | Method | `src/shared/smtp/smtp.service.ts` | 103 |
| `verifyConnection` | Method | `src/shared/smtp/smtp.service.ts` | 137 |
| `send` | Method | `src/shared/smtp/smtp.service.ts` | 171 |
| `mapToNodemailerFormat` | Method | `src/shared/smtp/smtp.service.ts` | 255 |
| `mapAttachments` | Method | `src/shared/smtp/smtp.service.ts` | 287 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Send → MapAttachments` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "constructor"})` — see callers and callees
2. `gitnexus_query({query: "smtp"})` — find related execution flows
3. Read key files listed above for implementation details
