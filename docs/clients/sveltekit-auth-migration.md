# SvelteKit client: auth hardening migration

**Applies to:** the FiFi Alert SvelteKit web app  
**Server release:** auth hardening (refresh token rotation, logout revocation, hashed tokens)  
**Last updated:** 2026-09-19

## What changed on the server

| Endpoint | Before | After |
|---|---|---|
| `POST /auth/refresh-token` body `{ refreshToken }` | returned `{ accessToken, expiresAt }` | returns `{ accessToken, expiresAt, refreshToken, refreshExpiresAt }`. **The refresh token you sent is revoked immediately.** |
| `POST /auth/logout` | no body; JWTs stayed valid | send `Authorization: Bearer <access>` **and** body `{ "refreshToken": "..." }`. Both are revoked. Always 200. |
| `POST /auth/logout-all` | did not exist | bearer-guarded; revokes every session of the user. Returns `{ message, revokedCount }`. |
| `POST /auth/login` | included `session.token` | `session` is always absent. Use `accessToken` / `refreshToken` / `expiresAt` / `refreshExpiresAt`. |
| `POST /auth/update-password` | `{ message }` | `{ message, revokedSessions }`. All **other** devices are signed out. |
| `POST /auth/reset-password` | other sessions stayed valid | every session of the user is revoked |
| Reusing an already-rotated refresh token | worked | `401`. If the reuse is more than 30 s after rotation, **all** sessions of the user are revoked and the user must log in again. |

## Target architecture

The SvelteKit **server** is the only holder of tokens. The browser never sees an access or refresh token.

```
browser  --cookies (httpOnly)-->  SvelteKit server  --Authorization: Bearer-->  API
```

## Step-by-step

### 1. Store tokens in httpOnly cookies set by SvelteKit

Remove every `localStorage` / `sessionStorage` / client-store usage of tokens.

In the login form action (`src/routes/login/+page.server.ts`):

```ts
import { API_BASE_URL } from '$env/static/private';

export const actions = {
  default: async ({ request, cookies }) => {
    const form = await request.formData();
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });
    if (!res.ok) return fail(res.status, { message: 'Invalid credentials' });

    const data = await res.json();
    setAuthCookies(cookies, data);
    throw redirect(303, '/');
  },
};
```

Shared helper (`src/lib/server/auth-cookies.ts`):

```ts
import type { Cookies } from '@sveltejs/kit';

const base = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };

export function setAuthCookies(
  cookies: Cookies,
  t: { accessToken: string; expiresAt: string; refreshToken: string; refreshExpiresAt: string },
) {
  const accessMaxAge = Math.max(0, Math.floor((Date.parse(t.expiresAt) - Date.now()) / 1000));
  const refreshMaxAge = Math.max(0, Math.floor((Date.parse(t.refreshExpiresAt) - Date.now()) / 1000));
  cookies.set('access_token', t.accessToken, { ...base, maxAge: accessMaxAge });
  cookies.set('access_expires_at', t.expiresAt, { ...base, maxAge: refreshMaxAge });
  cookies.set('refresh_token', t.refreshToken, { ...base, maxAge: refreshMaxAge });
}

export function clearAuthCookies(cookies: Cookies) {
  for (const n of ['access_token', 'access_expires_at', 'refresh_token']) cookies.delete(n, { path: '/' });
}
```

### 2. Refresh in exactly one place: `hooks.server.ts`

Rotation means the refresh token is single-use. Two parallel refreshes with the same token will cause the second to get `401` (and, if late, a full sign-out). Serialize refreshes per refresh token inside the server process.

```ts
// src/hooks.server.ts
import type { Handle, HandleFetch } from '@sveltejs/kit';
import { API_BASE_URL } from '$env/static/private';
import { setAuthCookies, clearAuthCookies } from '$lib/server/auth-cookies';

const inflight = new Map<string, Promise<any>>();

async function refresh(refreshToken: string) {
  let p = inflight.get(refreshToken);
  if (!p) {
    p = fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .finally(() => inflight.delete(refreshToken));
    inflight.set(refreshToken, p);
  }
  return p;
}

export const handle: Handle = async ({ event, resolve }) => {
  const access = event.cookies.get('access_token');
  const expiresAt = event.cookies.get('access_expires_at');
  const refreshToken = event.cookies.get('refresh_token');

  const expiringSoon = !access || !expiresAt || Date.parse(expiresAt) - Date.now() < 60_000;

  if (expiringSoon && refreshToken) {
    const data = await refresh(refreshToken);
    if (data) {
      setAuthCookies(event.cookies, data);
      event.locals.accessToken = data.accessToken;
    } else {
      clearAuthCookies(event.cookies);
      event.locals.accessToken = undefined;
    }
  } else {
    event.locals.accessToken = access;
  }

  return resolve(event);
};

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  if (request.url.startsWith(API_BASE_URL) && event.locals.accessToken) {
    request.headers.set('Authorization', `Bearer ${event.locals.accessToken}`);
  }
  return fetch(request);
};
```

Add `accessToken?: string` to `App.Locals` in `src/app.d.ts`.

### 3. Logout and logout-all form actions

```ts
// src/routes/logout/+page.server.ts
export const actions = {
  default: async ({ cookies, fetch }) => {
    const access = cookies.get('access_token');
    const refreshToken = cookies.get('refresh_token');
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}) },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
    clearAuthCookies(cookies);
    throw redirect(303, '/login');
  },
  everywhere: async ({ cookies, fetch }) => {
    await fetch(`${API_BASE_URL}/auth/logout-all`, { method: 'POST' }); // bearer added by handleFetch
    clearAuthCookies(cookies);
    throw redirect(303, '/login');
  },
};
```

### 4. Move direct browser calls behind the server

Any component that does `fetch('https://api…')` from the browser must now go through a `+server.ts` endpoint or a form action, because the browser no longer holds a token. Search for `Authorization` and `accessToken` in `src/` client code and remove them.

### 5. Stop reading `session.token`

Delete any use of `data.session` from login/signup handling. The field is always absent now.

### 6. Handle forced sign-out

A `401` from the API on a normal request after a refresh attempt means the account was signed out server-side (password change, admin revoke, refresh token reuse). Clear cookies and redirect to `/login?reason=signed-out`. Do not loop on refresh.

### 7. Environment

`API_BASE_URL` must be a **private** env var (no `PUBLIC_` prefix) so it is only available server-side.

## Checklist

- [ ] No token in `localStorage`, `sessionStorage`, or a client-side store
- [ ] Login/signup actions call `setAuthCookies` with all four fields
- [ ] `hooks.server.ts` refreshes with an in-flight map and overwrites **both** cookies
- [ ] Logout sends bearer header **and** `{ refreshToken }`, then clears cookies
- [ ] "Sign out everywhere" hits `/auth/logout-all`
- [ ] `session.token` no longer referenced
- [ ] 401 after refresh → clear cookies, redirect, no retry loop
