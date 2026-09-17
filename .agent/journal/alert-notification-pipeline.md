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

## Tried and rejected
- Keeping the cached-zone loop and only fixing table names: still one DB round trip per active zone via `calculateDistance`

## Open questions
- [ ] `DeviceService`, `SavedZoneService`, `SightingService` INSERT/UPDATE raw SQL still target `devices` / `saved_zones` / `sightings` and use columns that do not exist (`gps_latitude`, `gps_longitude`, `gps_accuracy`, `reported_by`), cast integer ids `::text`, and write `postal_codes` as `::jsonb` (column is `text[]`). Device registration with GPS is therefore broken independently of this task. Separate fix needed.
- [ ] 70 unit tests failed before this work (DI mismatches in `notification.service.spec`, `notification-flow.spec`, `alert.controller.spec`; stale assertions in `alert.service.spec`). Not addressed here.

## Next step
Start Docker (daemon was down on 2026-09-17), then `docker compose up -d postgres redis` and run:
`bun run test:e2e -- test/location.e2e-spec.ts test/notification.e2e-spec.ts test/alert.e2e-spec.ts`.
Expect the "Device Matching Integration" block to pass on GPS matches. If device creation in the test setup fails, that is the `DeviceService` column/table drift listed above, not the location queries.
