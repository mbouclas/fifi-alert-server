# Pet photos: primary photo and per-pet limit

Backend change notes for the web and mobile teams. Effective on the next deploy after 2026-09-26.

## Summary

- A pet can have several photos (unchanged). One of them is now the **primary photo**.
- New field `primaryPhoto` on pet create, update, and every pet response.
- New server limit `MAX_PET_PHOTOS` (default 5) applies to the `photos` array and to files per upload request.
- Nothing is removed. Existing clients keep working; `primaryPhoto` simply appears in responses.

## Response shape

Every endpoint that returns a pet (`GET /pets`, `GET /pets/{id}`, `GET /pets/tag/{tagId}`, `POST /pets`, `PUT /pets/{id}`, `PATCH /pets/{id}/missing`, `PATCH /pets/{id}/found`) now includes:

```json
{
  "photos": ["https://.../a.jpg", "https://.../b.jpg"],
  "primaryPhoto": "https://.../b.jpg"
}
```

Rules for `primaryPhoto` in responses:

- Always one of the URLs in `photos`.
- If the owner never chose one, it is the **first** entry of `photos`.
- Absent (`undefined`) only when `photos` is empty.

Use `primaryPhoto` for list thumbnails, alert cards, and share previews. Do not rely on `photos[0]` any more.

## Creating and updating

`POST /pets` and `PUT /pets/{id}` accept an optional `primaryPhoto` string next to `photos`:

```json
{
  "petTypeId": 1,
  "name": "Buddy",
  "photos": ["https://.../a.jpg", "https://.../b.jpg"],
  "primaryPhoto": "https://.../b.jpg"
}
```

Validation (HTTP 422 with a message):

| Case | Result |
|---|---|
| `photos` has more than `MAX_PET_PHOTOS` entries | 422 `A pet can have at most N photos` |
| `primaryPhoto` is not one of `photos` | 422 `Primary photo must be one of the pet photos` |
| `primaryPhoto` is not a URL | 422 validation error |

Update semantics on `PUT /pets/{id}`:

- Send only `primaryPhoto` to change the primary without touching the list. It is checked against the **stored** `photos`.
- Send only `photos` to change the list. If the stored primary is no longer in the new list, the server clears it and the response falls back to the new first photo.
- Send both to replace the list and choose the primary in one call.

Recommended UI flow for "set as primary": `PUT /pets/{id}` with `{ "primaryPhoto": url }`. No need to reorder the array.

## Uploading files

`POST /pets/{id}/photos` (multipart, field name `photos`) now rejects more than `MAX_PET_PHOTOS` files per request with HTTP 400. The upload endpoint only stores files and returns URLs; it does not attach them to the pet. The client still has to send the URLs in `photos` on create or update, and that array is capped at the same limit.

Practical guidance:

- Read the current limit from the OpenAPI document (`/api/openapi.json`): `components.schemas.CreatePetDto.properties.photos.maxItems`. Avoid hardcoding 5.
- Disable the "add photo" control once the pet already has `maxItems` photos.
- When removing a photo, remove it from `photos` and, if it was the primary, either pick a new `primaryPhoto` explicitly or let the server fall back to the first remaining one.

## Swagger

Live docs at `/api` show `primaryPhoto` on `CreatePetDto`, `UpdatePetDto`, and `PetResponseDto`, and `maxItems` on `photos`.

## Alert snapshots stay in sync

Alerts store a snapshot of the pet (`petName`, `petPhotos`, ...) taken when the alert is created. Since 2026-09-26 the backend refreshes that snapshot on every **open** alert (status `ACTIVE` or `DRAFT`) linked to the pet via `petId` whenever `PUT /pets/{id}` changes `photos`, `primaryPhoto`, or `name`.

- `petPhotos` on the alert becomes the pet photos with the primary photo **first**. Use `petPhotos[0]` as the alert hero image.
- `petName` follows the pet name.
- Resolved, expired, and cancelled alerts are left untouched as history.
- Uploading files alone (`POST /pets/{id}/photos`) changes nothing until the URLs are saved on the pet with `PUT /pets/{id}`. That call is what triggers the refresh.
- Alerts created without `petId` have no linked pet and are never refreshed.
