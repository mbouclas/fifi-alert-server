---
name: notification
description: "Skill for the Notification area of fifi-alert-server. 10 symbols across 4 files."
---

# Notification

10 symbols | 4 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how buildTitle, getSpeciesIcon, formatDistance work
- Modifying notification-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/notification/notification.service.ts` | buildTitle, getSpeciesIcon, formatDistance |
| `src/notification/notification-queue.processor.ts` | process, processAlertNotifications, processPushNotification |
| `src/notification/fcm.service.ts` | onModuleInit, initialize |
| `src/notification/apns.service.ts` | onModuleInit, initialize |

## Entry Points

Start here when exploring this area:

- **`buildTitle`** (Method) — `src/notification/notification.service.ts:72`
- **`getSpeciesIcon`** (Method) — `src/notification/notification.service.ts:189`
- **`formatDistance`** (Method) — `src/notification/notification.service.ts:203`
- **`process`** (Method) — `src/notification/notification-queue.processor.ts:39`
- **`processAlertNotifications`** (Method) — `src/notification/notification-queue.processor.ts:57`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `buildTitle` | Method | `src/notification/notification.service.ts` | 72 |
| `getSpeciesIcon` | Method | `src/notification/notification.service.ts` | 189 |
| `formatDistance` | Method | `src/notification/notification.service.ts` | 203 |
| `process` | Method | `src/notification/notification-queue.processor.ts` | 39 |
| `processAlertNotifications` | Method | `src/notification/notification-queue.processor.ts` | 57 |
| `processPushNotification` | Method | `src/notification/notification-queue.processor.ts` | 159 |
| `onModuleInit` | Method | `src/notification/fcm.service.ts` | 26 |
| `initialize` | Method | `src/notification/fcm.service.ts` | 34 |
| `onModuleInit` | Method | `src/notification/apns.service.ts` | 29 |
| `initialize` | Method | `src/notification/apns.service.ts` | 37 |

## How to Explore

1. `gitnexus_context({name: "buildTitle"})` — see callers and callees
2. `gitnexus_query({query: "notification"})` — find related execution flows
3. Read key files listed above for implementation details
