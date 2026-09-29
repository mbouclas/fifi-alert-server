# Email links → web app: frontend integration guide

**Audience:** web app (frontend) team. **Applies from:** API build that introduces `WEB_APP_URL` (September 2026).

## What changed on the API

Every link inside an email the API sends now points at the **web app**, not at the API. The API reads the web app origin from the `WEB_APP_URL` environment variable.

| Environment | `WEB_APP_URL` |
|-------------|---------------|
| Local dev   | `http://localhost:5173` |
| Staging     | staging web origin (ask DevOps) |
| Production  | `https://fifi-alert.com` |

Trailing slashes are stripped. The API never appends anything other than the paths listed below.

## Routes the web app must serve

| Route | Query params | Sent by | What the page must do |
|-------|--------------|---------|-----------------------|
| `/verify-email` | `token` (required), `callbackURL` (optional) | Signup, login of an unverified user, resend-verification | Verify the token with the API (see below). |
| `/reset-password` | `token` | Password reset emails | Show a new-password form, then `POST /auth/reset-password` with `{ token, newPassword }`. |
| `/verify-email` (again) | `token`, `callbackURL` | Email-change confirmation (sent to the OLD address) and email-change verification (sent to the NEW address) | Same as the verification flow: forward the token to `GET /api/auth/verify-email`. No extra handling needed. |
| `/confirm-delete-account` | `token` | Account deletion emails | Ask the signed-in user to confirm, then `POST /auth/delete-account/confirm` with `{ token }` and the bearer token. |
| `/accept-invite` | `token` | Invite emails | Show the accept-invite flow. |
| `/alerts/:id` | – | Alert / sighting emails | Alert detail page. |
| `/alerts/active` | – | Sighting dismissed email | Active alerts list. |
| `/app` | – | Welcome, alert resolved | App landing page (logged in). |
| `/signup`, `/help`, `/support`, `/privacy`, `/unsubscribe` | – | Footer and marketing links in every template | Static or existing pages. |

Everything in the table except `/verify-email` is a plain page. Nothing else is required of them by the API.

## Email verification flow (`/verify-email`)

### 1. The link in the email

```
http://localhost:5173/verify-email?token=<jwt>&callbackURL=fifi-alert%3A%2F%2Fverify-email
```

- `token` is a signed JWT issued by the API. It expires 24 hours after it was issued.
- `callbackURL` is optional. By default it is the mobile deep link `fifi-alert://verify-email`. It is only present so the web page can offer a hand-off into the mobile app after verification. The API does not require it.

### 2. Verify the token

Call the API's verification endpoint **without** a `callbackURL` so you receive JSON instead of a redirect:

```
GET {API_BASE_URL}/api/auth/verify-email?token=<token>
```

Responses:

| Status | Body | Meaning |
|--------|------|---------|
| `200` | `{ "status": true, "user": { … } }` | Verified. `user.emailVerified` is now `true`. |
| `401` | `{ "message": "token_expired" }` | Link older than 24 hours. Offer "resend verification email". |
| `401` | `{ "message": "invalid_token" }` | Token was tampered with or is malformed. |
| `401` | `{ "message": "user_not_found" }` | The account was deleted. |

Example:

```ts
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const callbackURL = params.get('callbackURL');

const res = await fetch(
  `${API_BASE_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
  { credentials: 'include' },
);

if (res.ok) {
  // Success. Optionally: if callbackURL starts with "fifi-alert://", show an "Open in app" button.
} else {
  const { message } = await res.json(); // token_expired | invalid_token | user_not_found
}
```

**Do not** forward `callbackURL` to the API. If you do, the API responds with a `302` redirect to that URL (with `?error=<code>` on failure) and the callback origin must be on the API's trusted-origins list.

### 3. After success

- The API sets a session cookie on success. If you use bearer tokens rather than cookies, ask the user to log in normally.
- If `callbackURL` was present and starts with `fifi-alert://`, you may render an "Open the FiFi Alert app" button pointing at it. This is optional.

### 4. Resending the link

The verification email is sent automatically on signup and again whenever an unverified user calls `POST /auth/login`. There is no separate resend endpoint; direct the user to log in again to receive a fresh link.

## Password reset (`/reset-password`)

`POST /auth/request-password-reset` accepts `{ email, redirectTo }`. Pass your web app's reset page as `redirectTo`, for example `http://localhost:5173/reset-password`. The API appends `?token=<token>` to that URL; when `redirectTo` is omitted the link is `{WEB_APP_URL}/reset-password?token=<token>`.

The response is always the same message whether or not the email exists. The token expires after `AUTH_PASSWORD_RESET_TOKEN_EXPIRES_IN` seconds (default 1 hour). Clients may request at most 3 resets per hour.

After `POST /auth/reset-password` succeeds the user receives a "password changed" email and every existing session and token is revoked; send them to the login page.

## Email change (`/verify-email`)

`POST /auth/change-email` (bearer token required) accepts `{ newEmail, callbackURL? }`.

1. A confirmation email goes to the **current** address with a `{WEB_APP_URL}/verify-email?token=…` link.
2. The `/verify-email` page forwards it to `GET /api/auth/verify-email` exactly as for signup. better-auth then emails the **new** address.
3. That second link is again `{WEB_APP_URL}/verify-email?token=…`; once verified, the account email changes and stays verified.

Nothing new is required of the web app beyond the existing `/verify-email` page.

## Account deletion (`/confirm-delete-account`)

`POST /auth/delete-account` (bearer token required) sends a `{WEB_APP_URL}/confirm-delete-account?token=…` link. The page must:

1. Require the user to be signed in (the deletion token is bound to their account).
2. Show a final warning, then `POST /auth/delete-account/confirm` with `{ token }` and the bearer token.
3. On success, clear local tokens; every session is already revoked server-side.

The token expires after `AUTH_DELETE_ACCOUNT_TOKEN_EXPIRES_IN` seconds (default 24 hours).

## Local development checklist

1. Run the API on port `3113` with `WEB_APP_URL=http://localhost:5173` in `.env` (already the default in `.env.example`).
2. Make sure your web origin is included in the API's `ALLOWED_ORIGIN` / `ALLOWED_ORIGINS` so browser calls from `localhost:5173` pass CORS.
3. Sign up through `POST /auth/signup`. The email (or the `ACCOUNT_VERIFICATION_EMAIL_REQUESTED` event log in dev) now contains the `localhost:5173/verify-email` link.
4. Open the link, confirm the page calls the API and shows the success state.

## Swagger

The API's Swagger UI at `{API_BASE_URL}/api` documents `POST /auth/signup`, `POST /auth/request-password-reset` and `POST /auth/reset-password`. The `GET /api/auth/verify-email` endpoint is served by better-auth and is described in the signup operation's description rather than as a separate Swagger entry.
