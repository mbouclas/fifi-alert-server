# Adoption Board — Client Integration Guide

This guide explains how a client app (mobile or web) integrates with the adoption board: the pets that owners put up for adoption under `/adoptions`.

It assumes you already integrate with the FiFi Alert API for login and pets. If not, read `docs/CLIENT_INTEGRATION_GUIDE.md` first.

Live reference: Swagger UI at `{API_URL}/api`, raw spec at `{API_URL}/api/openapi.json`, tag **Adoptions**.

---

## Table of Contents

1. [Concepts](#concepts)
2. [Secrets and headers](#secrets-and-headers)
3. [Which credential each endpoint needs](#which-credential-each-endpoint-needs)
4. [Browsing the board (no login)](#browsing-the-board-no-login)
5. [Managing your own listings (login required)](#managing-your-own-listings-login-required)
6. [Photos](#photos)
7. [Listing lifecycle](#listing-lifecycle)
8. [Localisation](#localisation)
9. [Response shape](#response-shape)
10. [Errors](#errors)
11. [Sample client code](#sample-client-code)
12. [Checklist](#checklist)

---

## Concepts

- An **adoption listing** is a pet plus a location, a description and a status. Each listing has exactly one pet, and each pet is in at most one listing.
- Creating a listing creates a **new pet** with the same fields you already use for personal pets (`petTypeId`, `name`, `gender`, `size`, `birthday`, `photos`).
- Adoption pets are **not** returned by `GET /pets`. The owner sees them with `GET /adoptions/mine`.
- Only listings with status `AVAILABLE` are visible to the public.
- Anyone with a **client key** can browse. Only a **logged-in owner** can create, change, or delete a listing.

---

## Secrets and headers

### The client key

Browsing the board does not need a logged-in user, but it is not open to the internet. Every browse request must carry a **client key**:

```
X-Client-Key: <your key>
```

- The key is issued by the backend team. Each app (Android, iOS, web) gets its own key so keys can be rotated or revoked per app.
- The server holds the accepted keys in its `CLIENT_API_KEYS` environment variable (comma separated). Ask the backend team to add your key there for each environment (dev, staging, production).
- A missing or wrong key returns `401`. If the server has no keys configured at all, every browse request returns `401` until it is fixed.

Where to keep it:

| Client | Recommendation |
|---|---|
| Android / iOS | Build-time config (`BuildConfig`, `Info.plist` via xcconfig), not in source control. |
| Web (SvelteKit or similar) | Prefer calling the API from the server side (`+page.server.ts`, hooks) with the key in a private env var. If you must call from the browser, accept that the key is visible in the bundle. |

The key identifies the app, not the user. It does not grant access to any user data and it never replaces the bearer token.

### The bearer token

Everything that changes data needs the normal user access token:

```
Authorization: Bearer <accessToken>
```

Obtain it from `POST /auth/login` (or signup) and refresh it exactly as described in `docs/CLIENT_INTEGRATION_GUIDE.md`. Nothing about token handling changes for this feature.

### Sending both

`GET /adoptions/{id}` accepts both headers at once. Send the bearer token when the user is logged in so they can open their own withdrawn or adopted listings. The client key is still required on that request.

---

## Which credential each endpoint needs

| Method | Path | Client key | Bearer | Who |
|---|---|---|---|---|
| GET | `/adoptions` | required | ignored | anyone |
| GET | `/adoptions/{id}` | required | optional | anyone; owner sees non-available too |
| GET | `/adoptions/mine` | no | required | owner |
| POST | `/adoptions` | no | required | owner |
| PATCH | `/adoptions/{id}` | no | required | owner |
| PATCH | `/adoptions/{id}/adopted` | no | required | owner |
| PATCH | `/adoptions/{id}/withdraw` | no | required | owner |
| PATCH | `/adoptions/{id}/relist` | no | required | owner |
| DELETE | `/adoptions/{id}` | no | required | owner |
| POST | `/adoptions/{id}/photos` | no | required | owner |

You also need `GET /pet-types` (bearer) to show type names and let the user pick a `petTypeId`, and `GET /languages` (public) if you let users choose a language.

---

## Browsing the board (no login)

### List available pets

```
GET /adoptions?lat=35.1856&lon=33.3823&radiusKm=10&petTypeId=1&gender=MALE&size=SMALL&minAgeMonths=6&maxAgeMonths=36&limit=20&offset=0
X-Client-Key: <key>
Accept-Language: el
```

All query parameters are optional.

| Parameter | Type | Rules |
|---|---|---|
| `lat`, `lon` | number | Must be sent **together**. Enables radius search, adds `distanceKm` to every result and sorts nearest first. Sending only one returns `400`. |
| `radiusKm` | number | 1 to 100, default 10. Ignored without `lat`/`lon`. |
| `petTypeId` | integer | From `GET /pet-types`. |
| `gender` | `MALE` or `FEMALE` | |
| `size` | `SMALL`, `MEDIUM`, `LARGE` | |
| `minAgeMonths`, `maxAgeMonths` | integer, 0 or more | Computed from the pet's `birthday`. Pets **without a birthday are excluded** whenever either is set. `min` must not exceed `max`. |
| `limit` | integer | 1 to 100, default 20. |
| `offset` | integer | 0 or more, default 0. |
| `lang` | string | Language code for `pet.petType.name`. See [Localisation](#localisation). |

Without `lat`/`lon` the list is sorted newest first and `distanceKm` is absent.

Response:

```json
{
  "data": [ { "...": "AdoptionListingResponseDto, see Response shape" } ],
  "total": 57,
  "limit": 20,
  "offset": 0
}
```

Paginate by increasing `offset` until `offset + data.length >= total`.

### Get one listing

```
GET /adoptions/42
X-Client-Key: <key>
Authorization: Bearer <token>   (optional)
```

- `200` with the listing when it is `AVAILABLE`, or when the caller is its owner.
- `404` when it does not exist, or when it is `ADOPTED`/`WITHDRAWN` and the caller is not the owner. The API does not reveal which.

---

## Managing your own listings (login required)

### Create a listing

```
POST /adoptions
Authorization: Bearer <token>
Content-Type: application/json

{
  "petTypeId": 1,
  "name": "Buddy",
  "gender": "MALE",
  "size": "MEDIUM",
  "birthday": "2024-05-15T00:00:00.000Z",
  "photos": [],
  "lat": 35.1856,
  "lon": 33.3823,
  "locationAddress": "Nicosia, Cyprus",
  "description": "Friendly 2-year-old, vaccinated and neutered. Good with kids."
}
```

Field rules:

| Field | Required | Rules |
|---|---|---|
| `petTypeId` | yes | integer ≥ 1, must exist (`422` otherwise) |
| `name` | yes | 1 to 100 characters |
| `lat` | yes | -90 to 90 |
| `lon` | yes | -180 to 180 |
| `gender` | no | `MALE` or `FEMALE` |
| `size` | no | `SMALL`, `MEDIUM`, `LARGE` |
| `birthday` | no | ISO date. Needed for age filters to match this pet. |
| `photos` | no | array of URLs. Usually empty on create; upload afterwards. |
| `locationAddress` | no | up to 255 characters, shown to adopters |
| `description` | no | up to 2000 characters |

Unknown fields are silently dropped. `isMissing` is not accepted here.

Returns `201` with the full listing (status `AVAILABLE`). Keep `id` (listing) and `petId` (pet); you need the listing `id` for every other call.

Recommended flow in the UI: create the listing first, then upload photos with the returned `id` (see [Photos](#photos)).

### Your listings, all statuses

```
GET /adoptions/mine
Authorization: Bearer <token>
```

Returns an array, newest first, including `ADOPTED` and `WITHDRAWN` listings.

### Update a listing

```
PATCH /adoptions/42
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "Buddy Jr.", "description": "Now house-trained", "lat": 34.7, "lon": 33.0 }
```

Every field from create is optional here. Pet fields update the pet, listing fields update the listing. `lat` and `lon` must still be sent **together** (`400` otherwise). Status cannot be changed here; use the transition endpoints below.

### Mark as adopted, withdraw, relist

```
PATCH /adoptions/42/adopted
PATCH /adoptions/42/withdraw
PATCH /adoptions/42/relist
Authorization: Bearer <token>
```

No body. Each returns `200` with the updated listing or `409` if the transition is not allowed (see [Listing lifecycle](#listing-lifecycle)).

### Delete

```
DELETE /adoptions/42
Authorization: Bearer <token>
```

Returns `204`. This permanently deletes the listing **and the pet**, in any status. Confirm with the user before calling.

---

## Photos

```
POST /adoptions/42/photos
Authorization: Bearer <token>
Content-Type: multipart/form-data

photos: <file>   (repeat the field up to 5 times)
```

- Field name is `photos`. Up to 5 files per request, 10 photos per listing in total (`400` when exceeded).
- Accepted types: JPEG, PNG, WebP, HEIC. Max 10 MB each.
- Unlike `POST /pets/{id}/photos`, the uploaded URLs are **saved to the pet immediately**. The response is the updated listing; read `pet.photos` from it. You do not need a follow-up PATCH.
- To remove or reorder photos, send the desired `photos` array in `PATCH /adoptions/{id}`.

---

## Listing lifecycle

```
            create
              │
              ▼
         ┌───────────┐  withdraw   ┌───────────┐
         │ AVAILABLE │ ──────────► │ WITHDRAWN │
         │ (public)  │ ◄────────── │ (hidden)  │
         └───────────┘   relist    └───────────┘
              │
              │ adopted
              ▼
         ┌───────────┐
         │  ADOPTED  │   (final; hidden; cannot be relisted)
         └───────────┘
```

| Call | Allowed from | Result |
|---|---|---|
| `/adopted` | `AVAILABLE` | `ADOPTED`, sets `adoptedAt` |
| `/withdraw` | `AVAILABLE` | `WITHDRAWN` |
| `/relist` | `WITHDRAWN` | `AVAILABLE` |
| `DELETE` | any | listing and pet removed |

Anything else returns `409` with a message naming the current status. An adopted pet that becomes available again needs a **new listing**.

Suggested UI: show "Mark adopted" and "Withdraw" on available listings, "Relist" on withdrawn ones, and only "Delete" on adopted ones.

---

## Localisation

`pet.petType.name` is returned in one language, resolved in this order:

1. `?lang=el` query parameter
2. `Accept-Language` header
3. the server default language

Unknown or inactive codes fall back to the default. `GET /languages` (no auth) lists valid codes. This works the same on every `/adoptions` endpoint.

---

## Response shape

`AdoptionListingResponseDto`:

```json
{
  "id": 42,
  "petId": 105,
  "status": "AVAILABLE",
  "lat": 35.1856,
  "lon": 33.3823,
  "locationAddress": "Nicosia, Cyprus",
  "description": "Friendly 2-year-old, vaccinated and neutered.",
  "adoptedAt": null,
  "distanceKm": 3.2,
  "pet": {
    "id": 105,
    "tagId": "PET7K9X2A",
    "userId": 7,
    "petTypeId": 1,
    "petType": { "id": 1, "slug": "dog", "name": "Σκύλος" },
    "name": "Buddy",
    "gender": "MALE",
    "size": "MEDIUM",
    "birthday": "2024-05-15T00:00:00.000Z",
    "photos": ["https://res.cloudinary.com/.../pets/105/a.jpg"],
    "isMissing": false,
    "created_at": "2026-09-29T20:00:00.000Z",
    "updated_at": "2026-09-29T20:00:00.000Z"
  },
  "owner": { "id": 7, "name": "Maria" },
  "created_at": "2026-09-29T20:00:00.000Z",
  "updated_at": "2026-09-29T20:00:00.000Z"
}
```

Notes:

- Optional fields (`locationAddress`, `description`, `adoptedAt`, `distanceKm`, `gender`, `size`, `birthday`) are omitted when not set.
- `distanceKm` is present only on radius searches.
- `owner` intentionally contains only `id` and `name`. No email or phone is exposed because the board can be read without login. If you need a contact flow, that is a separate feature.
- Compute displayed age from `pet.birthday` on the client.

---

## Errors

| Status | When |
|---|---|
| `400` | Validation failed: `lat` without `lon`, out-of-range values, `min` > `max` age, too many photos, bad file type. Body contains `message` (string or array of strings). |
| `401` | Missing or invalid `X-Client-Key` on browse endpoints; missing or expired bearer token elsewhere. On a browse endpoint do **not** trigger a token refresh; check the key. |
| `403` | Bearer is valid but the listing belongs to another user. |
| `404` | Listing does not exist, or is not `AVAILABLE` and you are not the owner. |
| `409` | Status transition not allowed. |
| `422` | `petTypeId` does not exist. |
| `429` | Rate limited (by user when logged in, by IP otherwise). Back off and retry. |

Error body format is the standard NestJS shape:

```json
{ "statusCode": 400, "message": ["lat must not be greater than 90"], "error": "Bad Request" }
```

---

## Sample client code

TypeScript with `fetch`. Adapt the token source to your app.

```typescript
const API = 'https://api.example.com';
const CLIENT_KEY = process.env.FIFI_CLIENT_KEY!; // never hard-code

type Query = Record<string, string | number | undefined>;

function qs(q: Query): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ---- Browse (no login) ----
export async function browseAdoptions(q: Query, lang?: string) {
  const res = await fetch(`${API}/adoptions${qs({ ...q, lang })}`, {
    headers: { 'X-Client-Key': CLIENT_KEY },
  });
  if (!res.ok) throw new Error(`browse failed: ${res.status}`);
  return res.json() as Promise<{ data: AdoptionListing[]; total: number; limit: number; offset: number }>;
}

export async function getAdoption(id: number, accessToken?: string) {
  const res = await fetch(`${API}/adoptions/${id}`, {
    headers: {
      'X-Client-Key': CLIENT_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get failed: ${res.status}`);
  return res.json() as Promise<AdoptionListing>;
}

// ---- Owner actions (login) ----
async function authed(path: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(body?.message ?? res.statusText), { status: res.status, body });
  return body;
}

export const createAdoption = (token: string, dto: CreateAdoptionListing) =>
  authed('/adoptions', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  }) as Promise<AdoptionListing>;

export const myAdoptions = (token: string) =>
  authed('/adoptions/mine', token) as Promise<AdoptionListing[]>;

export const updateAdoption = (token: string, id: number, dto: Partial<CreateAdoptionListing>) =>
  authed(`/adoptions/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  }) as Promise<AdoptionListing>;

export const markAdopted = (token: string, id: number) =>
  authed(`/adoptions/${id}/adopted`, token, { method: 'PATCH' }) as Promise<AdoptionListing>;
export const withdrawAdoption = (token: string, id: number) =>
  authed(`/adoptions/${id}/withdraw`, token, { method: 'PATCH' }) as Promise<AdoptionListing>;
export const relistAdoption = (token: string, id: number) =>
  authed(`/adoptions/${id}/relist`, token, { method: 'PATCH' }) as Promise<AdoptionListing>;
export const deleteAdoption = (token: string, id: number) =>
  authed(`/adoptions/${id}`, token, { method: 'DELETE' });

export async function uploadAdoptionPhotos(token: string, id: number, files: File[]) {
  const form = new FormData();
  files.slice(0, 5).forEach((f) => form.append('photos', f));
  return authed(`/adoptions/${id}/photos`, token, { method: 'POST', body: form }) as Promise<AdoptionListing>;
}

// ---- Types (mirror of the Swagger schemas) ----
export type AdoptionStatus = 'AVAILABLE' | 'ADOPTED' | 'WITHDRAWN';
export interface CreateAdoptionListing {
  petTypeId: number; name: string; lat: number; lon: number;
  gender?: 'MALE' | 'FEMALE'; size?: 'SMALL' | 'MEDIUM' | 'LARGE';
  birthday?: string; photos?: string[]; locationAddress?: string; description?: string;
}
export interface AdoptionListing {
  id: number; petId: number; status: AdoptionStatus; lat: number; lon: number;
  locationAddress?: string; description?: string; adoptedAt?: string; distanceKm?: number;
  pet: { id: number; tagId: string; userId: number; petTypeId: number; name: string;
         petType: { id: number; slug: string; name: string };
         gender?: 'MALE' | 'FEMALE'; size?: 'SMALL' | 'MEDIUM' | 'LARGE';
         birthday?: string; photos?: string[]; isMissing: boolean };
  owner: { id: number; name?: string };
  created_at: string; updated_at: string;
}
```

Typical screen flow:

1. **Board screen**: ask for location permission, call `browseAdoptions({ lat, lon, radiusKm })`. Fall back to no coordinates if denied. Page with `offset`.
2. **Detail screen**: `getAdoption(id, tokenIfLoggedIn)`. If `null`, show "no longer available".
3. **Create screen**: load `GET /pet-types` for the picker, `createAdoption`, then `uploadAdoptionPhotos` with the returned `id`.
4. **My listings**: `myAdoptions()`, with action buttons per status as in [Listing lifecycle](#listing-lifecycle).

---

## Checklist

- [ ] Received a client key per app and per environment from the backend team.
- [ ] Key stored in build config or server-side env, not in source control.
- [ ] `X-Client-Key` sent on `GET /adoptions` and `GET /adoptions/{id}` only.
- [ ] Bearer token sent on all owner endpoints; token refresh logic unchanged.
- [ ] `lat` and `lon` always sent as a pair.
- [ ] `GET /pets` no longer expected to show adoption pets; use `GET /adoptions/mine`.
- [ ] Photo upload uses field `photos`, max 5 per request, 10 total.
- [ ] `409` handled by refreshing the listing and updating available actions.
- [ ] Delete confirmed with the user (it removes the pet too).
- [ ] Tested against Swagger at `/api` with your key and a test user.
