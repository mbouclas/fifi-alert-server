# Sighting photos: `POST /sightings/{id}/photos`

Backend change notes for the web and mobile teams. Implements the "Sighting photos — backend requirements" proposal dated 2026-09-26. Effective on the next deploy.

## Summary

- New endpoint `POST /sightings/{id}/photos` accepts `multipart/form-data` with a repeated `photos` field, same shape as `POST /pets/{id}/photos`.
- Returns `201 { "photoUrls": string[] }` in the order received. URLs are **persisted on the sighting by the server**; no follow-up PUT.
- Every sighting response now carries `photos: string[]` (empty when none). `photo: string | null` is kept and always equals `photos[0]`.
- Server limit `MAX_SIGHTING_PHOTOS` (default **3**) is the source of truth; mirror it in the client env. It is also published as `maxItems` on the `UploadSightingPhotosDto.photos` and `SightingResponseDto.photos` schemas in Swagger.
- The old singular `POST /sightings/{id}/photo` (field `photo`, returns `{ photoUrl }`) still works for Android, with the same rules below, and is marked deprecated in Swagger.

## Request

```
POST /sightings/{id}/photos
Authorization: Bearer <reporter token>
Content-Type: multipart/form-data

photos: <file>   (1 to MAX_SIGHTING_PHOTOS times)
```

| Rule | Value |
|---|---|
| Field name | `photos`, repeated once per file |
| Count | 1 to `MAX_SIGHTING_PHOTOS` per request, and per sighting in total |
| Types | JPEG, PNG, WebP, HEIC, HEIF. Bytes are sniffed; an empty or wrong `Content-Type` on the part is fine. |
| Size | `MAX_FILE_SIZE` per file (default 10 MB). Oversize parts are rejected by multer with **413** before buffering. |
| Filename | Ignored for storage. Files are stored as `sightings/{sightingId}/{uuid}.jpg`. |

## Response

```json
HTTP/1.1 201 Created
{
  "photoUrls": [
    "https://res.cloudinary.com/<cloud>/image/upload/v.../fifi-alert/sightings/123/5f1c2c8e-....jpg"
  ]
}
```

Only the URLs from this request are returned. `GET /sightings/alert/{alertId}` returns the full list:

```json
{
  "id": 123,
  "photo": "https://.../sightings/123/a.jpg",
  "photos": ["https://.../sightings/123/a.jpg", "https://.../sightings/123/b.jpg"],
  "...": "unchanged fields"
}
```

## Errors

| Status | When |
|---|---|
| 400 | Zero files, unsupported type, file over `MAX_FILE_SIZE` (when it slipped past multer), or `existing + new > MAX_SIGHTING_PHOTOS`. The message says how many more can be added. |
| 401 | Missing or invalid bearer token. |
| 403 | Caller is not `reported_by`, the alert is no longer `ACTIVE`, or more than `SIGHTING_PHOTO_UPLOAD_WINDOW_HOURS` (default 24) have passed since `created_at`. |
| 404 | Sighting does not exist. |
| 413 | A part exceeded `MAX_FILE_SIZE`. Treat like 400. |
| 429 | More than 10 upload requests per minute from one user. |

Error bodies are `{ "statusCode", "message", "error" }` like the rest of the API. Messages are English; the API does not localise validation errors today.

## Processing

Sighting photos go through a Cloudinary incoming transformation on upload:

- auto-oriented from the EXIF orientation flag;
- resized to at most 1600 px on the longest edge, `quality: auto:good`;
- re-encoded to JPEG (HEIC/HEIF from iPhones included);
- all metadata, including GPS, stripped from the stored file.

Pet and alert photos are **not** changed by this release.

## Notifications

The "new sighting" push and email are still sent when `POST /sightings` is processed, before photos arrive, so they carry no image. The alert detail page shows the photos when the owner opens it. Delaying the notification by a grace period is not implemented.

## Environment

```
MAX_SIGHTING_PHOTOS=3
SIGHTING_PHOTO_UPLOAD_WINDOW_HOURS=24
MAX_FILE_SIZE=10485760
```

## Database

Migration `20260926130000_add_sighting_photos` adds `sighting.photos TEXT[] NOT NULL DEFAULT '{}'` and backfills it from `photo_url`.
