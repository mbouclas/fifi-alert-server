---
name: smtp
description: "Skill for the Smtp area of fifi-alert-server. 10 symbols across 4 files."
---

# Smtp

10 symbols | 4 files | Cohesion: 96%

## When to Use

- Working with code in `src/`
- Understanding how createEmailProvider, SmtpService, MailgunService work
- Modifying smtp-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/shared/smtp/smtp.service.ts` | SmtpService, constructor, getProviderPreset, verifyConnection, send (+2) |
| `src/shared/mailgun/mailgun.service.ts` | MailgunService |
| `src/shared/email/interfaces/email-provider.interface.ts` | IEmailProvider |
| `src/shared/email/factories/email-provider.factory.ts` | createEmailProvider |

## Entry Points

Start here when exploring this area:

- **`createEmailProvider`** (Function) — `src/shared/email/factories/email-provider.factory.ts:21`
- **`SmtpService`** (Class) — `src/shared/smtp/smtp.service.ts:32`
- **`MailgunService`** (Class) — `src/shared/mailgun/mailgun.service.ts:49`
- **`constructor`** (Method) — `src/shared/smtp/smtp.service.ts:37`
- **`getProviderPreset`** (Method) — `src/shared/smtp/smtp.service.ts:105`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `SmtpService` | Class | `src/shared/smtp/smtp.service.ts` | 32 |
| `MailgunService` | Class | `src/shared/mailgun/mailgun.service.ts` | 49 |
| `createEmailProvider` | Function | `src/shared/email/factories/email-provider.factory.ts` | 21 |
| `IEmailProvider` | Interface | `src/shared/email/interfaces/email-provider.interface.ts` | 58 |
| `constructor` | Method | `src/shared/smtp/smtp.service.ts` | 37 |
| `getProviderPreset` | Method | `src/shared/smtp/smtp.service.ts` | 105 |
| `verifyConnection` | Method | `src/shared/smtp/smtp.service.ts` | 147 |
| `send` | Method | `src/shared/smtp/smtp.service.ts` | 181 |
| `mapToNodemailerFormat` | Method | `src/shared/smtp/smtp.service.ts` | 265 |
| `mapAttachments` | Method | `src/shared/smtp/smtp.service.ts` | 297 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Questions | 1 calls |

## How to Explore

1. `gitnexus_context({name: "createEmailProvider"})` — see callers and callees
2. `gitnexus_query({query: "smtp"})` — find related execution flows
3. Read key files listed above for implementation details
