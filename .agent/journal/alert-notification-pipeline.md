---
task: alert-notification-pipeline
started: 2026-09-17
status: in-progress
branch: main
---

## Goal
Creating an alert queues device targeting and push delivery end to end: alert create -> BullMQ `send-alert-notifications` -> `LocationService.findDevicesForAlert` (PostGIS) -> per-device `notification` rows + push jobs -> FCM/APNs. Verified against a real PostGIS database via `test/location.e2e-spec.ts` and `test/notification.e2e-spec.ts`.

## Decisions
- 2026-09-17: postal-code and IP-geo strategies stay dormant (SQL fixed, no data feeds) — user choice, keeps scope on GPS/zone matching
- 2026-09-17: notifications queue only on alert creation, not on renew — avoids re-notifying the same users
- 2026-09-17: `findAlertZoneMatches` is a single `ST_DWithin` query joined to `"user"`/`device`; dropped `AlertZoneCacheService` and `GeospatialService` injections from `LocationService` (now unused there)
- 2026-09-17: queue call in `AlertService.create` is wrapped in try/catch so Redis outages never fail alert creation
- 2026-09-27: zone matchers (saved + alert zones) no longer filter `push_token IS NOT NULL`; the processor runs two passes (push devices, then email)
- 2026-09-27 (superseding "email as fallback"): push and email are both sent on the HIGH wave; `hasBeenNotified` is channel-aware (EMAIL rows carry `meta.channel`), FAILED rows never count
- 2026-09-27: terminal push errors (`*_NOT_INITIALIZED`, invalidToken) resolve the job instead of retrying; they no longer trigger an email because the HIGH wave already did
- 2026-09-27: fallback emails are recorded as `notification` rows with `meta.channel = 'EMAIL'` on the user's matched device, so later waves dedupe them
- 2026-09-27: the alert creator is filtered out of every wave in the processor (their own zones always match); email links use `buildWebAppUrl` with `/alerts/:id` and `/alerts/:id/sighting`

## Tried and rejected
- Keeping the cached-zone loop and only fixing table names: still one DB round trip per active zone via `calculateDistance`

## Open questions
- [ ] `SightingService.notifyCreatorOfSighting` calls `queueAlertNotifications(alertId)` on every sighting, re-fanning out all three waves. Contradicts the no-re-notify decision; not touched.
- [ ] `AlertService.sendAlertNearYouEmails` is dead code (only its spec calls it). Delete or wire up.
- [ ] Dev `.env` has no VAPID keys, so every WEB push fails with `WEB_PUSH_NOT_INITIALIZED` and falls back to email.
- [ ] `DeviceService`, `SavedZoneService`, `SightingService` INSERT/UPDATE raw SQL still target `devices` / `saved_zones` / `sightings` and use columns that do not exist (`gps_latitude`, `gps_longitude`, `gps_accuracy`, `reported_by`), cast integer ids `::text`, and write `postal_codes` as `::jsonb` (column is `text[]`). Device registration with GPS is therefore broken independently of this task. Separate fix needed.
- [ ] 70 unit tests failed before this work (DI mismatches in `notification.service.spec`, `notification-flow.spec`, `alert.controller.spec`; stale assertions in `alert.service.spec`). Not addressed here.

## Next step
Verified 2026-09-27 (third replay of alert 16 HIGH): push re-attempted for 2170 (fails: no VAPID on dev), no duplicate email, creator 2213 untouched. Restart the dev server so it reads `WEB_APP_URL`. Then decide the sighting re-fan-out open question and run the notification/location e2e with Docker up. `notification-flow.spec.ts` "should process alert and queue individual notifications" fails pre-existing (`parseInt('device-1')` is NaN).
