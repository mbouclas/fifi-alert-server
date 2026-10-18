---
name: notification
description: "Skill for the Notification area of fifi-alert-server. 27 symbols across 6 files."
---

# Notification

27 symbols | 6 files | Cohesion: 84%

## When to Use

- Working with code in `src/`
- Understanding how excludeAll, WebPushService, FCMService work
- Modifying notification-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/notification/notification-queue.processor.ts` | process, processPushNotification, buildPushPayload, processAlertNotifications, excludeAll (+4) |
| `src/notification/webpush.service.ts` | WebPushService, onModuleInit, initialize, parseSubscription, sendNotification |
| `src/notification/notification.service.ts` | buildTitle, buildBody, getSpeciesIcon, formatDistance, trackExclusion |
| `src/notification/fcm.service.ts` | FCMService, onModuleInit, initialize, sendNotification |
| `src/notification/apns.service.ts` | APNsService, onModuleInit, initialize |
| `scripts/send-test-push.ts` | main |

## Entry Points

Start here when exploring this area:

- **`excludeAll`** (Function) — `src/notification/notification-queue.processor.ts:220`
- **`WebPushService`** (Class) — `src/notification/webpush.service.ts:38`
- **`FCMService`** (Class) — `src/notification/fcm.service.ts:19`
- **`APNsService`** (Class) — `src/notification/apns.service.ts:21`
- **`onModuleInit`** (Method) — `src/notification/webpush.service.ts:44`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `WebPushService` | Class | `src/notification/webpush.service.ts` | 38 |
| `FCMService` | Class | `src/notification/fcm.service.ts` | 19 |
| `APNsService` | Class | `src/notification/apns.service.ts` | 21 |
| `excludeAll` | Function | `src/notification/notification-queue.processor.ts` | 220 |
| `onModuleInit` | Method | `src/notification/webpush.service.ts` | 44 |
| `initialize` | Method | `src/notification/webpush.service.ts` | 52 |
| `parseSubscription` | Method | `src/notification/webpush.service.ts` | 87 |
| `sendNotification` | Method | `src/notification/webpush.service.ts` | 108 |
| `onModuleInit` | Method | `src/notification/fcm.service.ts` | 26 |
| `initialize` | Method | `src/notification/fcm.service.ts` | 34 |
| `sendNotification` | Method | `src/notification/fcm.service.ts` | 83 |
| `onModuleInit` | Method | `src/notification/apns.service.ts` | 29 |
| `initialize` | Method | `src/notification/apns.service.ts` | 37 |
| `buildTitle` | Method | `src/notification/notification.service.ts` | 116 |
| `buildBody` | Method | `src/notification/notification.service.ts` | 146 |
| `getSpeciesIcon` | Method | `src/notification/notification.service.ts` | 290 |
| `formatDistance` | Method | `src/notification/notification.service.ts` | 304 |
| `process` | Method | `src/notification/notification-queue.processor.ts` | 63 |
| `processPushNotification` | Method | `src/notification/notification-queue.processor.ts` | 489 |
| `buildPushPayload` | Method | `src/notification/notification-queue.processor.ts` | 809 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Process → GetSpeciesIcon` | intra_community | 5 |
| `Process → FormatDistance` | intra_community | 5 |
| `Process → Send` | cross_community | 5 |
| `Process → TrackExclusion` | cross_community | 4 |
| `Process → Count` | cross_community | 4 |
| `Process → Trim` | cross_community | 4 |
| `Process → BuildBody` | intra_community | 4 |
| `Process → EmailService` | cross_community | 4 |
| `SendNotification → Trim` | cross_community | 4 |
| `SendNotification → StripTrailingSlash` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| User | 3 calls |
| Mailgun | 1 calls |
| Questions | 1 calls |
| Location | 1 calls |
| Auth | 1 calls |
| Scripts | 1 calls |

## How to Explore

1. `gitnexus_context({name: "excludeAll"})` — see callers and callees
2. `gitnexus_query({query: "notification"})` — find related execution flows
3. Read key files listed above for implementation details
