---
name: mailgun
description: "Skill for the Mailgun area of fifi-alert-server. 9 symbols across 5 files."
---

# Mailgun

9 symbols | 5 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how createEmailProvider, MailgunService, SmtpService work
- Modifying mailgun-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/shared/mailgun/mailgun.service.ts` | send, mapToMailgunFormat, mapAttachments, MailgunService |
| `src/notification/apns.service.ts` | sendNotification, batchSend |
| `src/shared/smtp/smtp.service.ts` | SmtpService |
| `src/shared/email/interfaces/email-provider.interface.ts` | IEmailProvider |
| `src/shared/email/factories/email-provider.factory.ts` | createEmailProvider |

## Entry Points

Start here when exploring this area:

- **`createEmailProvider`** (Function) — `src/shared/email/factories/email-provider.factory.ts:21`
- **`MailgunService`** (Class) — `src/shared/mailgun/mailgun.service.ts:49`
- **`SmtpService`** (Class) — `src/shared/smtp/smtp.service.ts:32`
- **`sendNotification`** (Method) — `src/notification/apns.service.ts:97`
- **`batchSend`** (Method) — `src/notification/apns.service.ts:212`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `MailgunService` | Class | `src/shared/mailgun/mailgun.service.ts` | 49 |
| `SmtpService` | Class | `src/shared/smtp/smtp.service.ts` | 32 |
| `createEmailProvider` | Function | `src/shared/email/factories/email-provider.factory.ts` | 21 |
| `IEmailProvider` | Interface | `src/shared/email/interfaces/email-provider.interface.ts` | 58 |
| `sendNotification` | Method | `src/notification/apns.service.ts` | 97 |
| `batchSend` | Method | `src/notification/apns.service.ts` | 212 |
| `send` | Method | `src/shared/mailgun/mailgun.service.ts` | 100 |
| `mapToMailgunFormat` | Method | `src/shared/mailgun/mailgun.service.ts` | 185 |
| `mapAttachments` | Method | `src/shared/mailgun/mailgun.service.ts` | 219 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `BatchSend → MapAttachments` | intra_community | 5 |

## How to Explore

1. `gitnexus_context({name: "createEmailProvider"})` — see callers and callees
2. `gitnexus_query({query: "mailgun"})` — find related execution flows
3. Read key files listed above for implementation details
