---
task: sighting-photos
started: 2026-09-26
status: shipping
branch: main
---

## Goal
Implement the frontend team's "Sighting photos — backend requirements" doc: `POST /sightings/{id}/photos` (multipart `photos[]`, max MAX_SIGHTING_PHOTOS=3), URLs persisted on the sighting (`photos: string[]` + legacy `photo`), reporter-only + 24h/ACTIVE window (403), count/type/size 400s, EXIF stripped + HEIC→JPEG + 1600px resize, swagger updated.

## Decisions
- 2026-09-26: image processing (EXIF strip, HEIC→JPEG, 1600px limit, auto-orient) done by Cloudinary incoming transformation (`format: jpg`, `c_limit,w_1600,h_1600,q_auto:good`) — no sharp/libvips native dep on Bun+Windows
- 2026-09-26: only sighting uploads get the web-optimise transformation; pet/alert uploads unchanged (spec scope)
- 2026-09-26: new `photos TEXT[]` column on sighting; `photo_url` kept in sync as first entry for Android
- 2026-09-26: singular `POST /sightings/{id}/photo` kept for Android but routed through the same auth/window/cap logic; `SightingService.updatePhoto` replaced by `appendPhotos`
- 2026-09-26: notification stays option 2 (send immediately, no image) — photos arrive after the push
- 2026-09-26: no localized error messages: project i18n only covers pet-type names; 400 bodies are English like every other validation error

## Tried and rejected

## Open questions
- [ ] Should pet/alert uploads also strip EXIF? (out of scope, flagged to user)

- 2026-09-26: verified live on PORT=3199: both routes mapped, 401 without bearer, /api/openapi.json shows plural endpoint with 201/400/401/403/404/413, `photos` maxItems=3, singular route deprecated

## Next step
Commit the sighting-photos change set (files under src/sighting, src/upload, src/config/{sighting,upload}.config.ts, prisma migration 20260926130000, docs/SIGHTING_PHOTOS_FRONTEND.md, .env.example). Then retire this journal: no lasting decision beyond "Cloudinary incoming transformation instead of sharp", which is already a code comment in cloudinary.service.ts.
