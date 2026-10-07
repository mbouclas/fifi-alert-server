# Social login (Google, Facebook)

Sign-in with Google or Facebook is handled by better-auth's `signInSocial`
ID-token path behind a single endpoint, `POST /auth/social`. The server never
runs the OAuth redirect flow: clients obtain the provider token themselves
(web JS SDKs, native mobile SDKs) and send it to us for verification. Only the
web app origin (`WEB_APP_URL`) is registered in the Google Cloud and Meta
consoles; this API has no callback URL there.

On success the endpoint returns the same JWT pair as `POST /auth/login`.

## Endpoint

`POST /auth/social`

```json
{
  "provider": "google" | "facebook",
  "token": "<provider token>",
  "accessToken": "<optional, see below>",
  "nonce": "<optional, the nonce given to the provider SDK>"
}
```

| Client | `provider` | `token` | `accessToken` |
|---|---|---|---|
| Web (Google Identity Services), iOS, Android | `google` | Google ID token (JWT) | omit |
| iOS Facebook SDK, Limited Login | `facebook` | OIDC ID token (JWT) | omit |
| Web Facebook JS SDK, Android Facebook SDK | `facebook` | Graph access token | same value as `token` |

Facebook needs the access token twice because better-auth fetches the profile
from Graph `/me` with `accessToken` while `token` is what gets verified.

Response (`AuthResponseDto`):

```json
{
  "message": "Login successful",
  "user": { "id": "42", "email": "ada@example.com", "name": "Ada Lovelace" },
  "accessToken": "...", "refreshToken": "...",
  "expiresAt": "...", "refreshExpiresAt": "..."
}
```

| Status | Meaning |
|---|---|
| 200 | Signed in. New users are created with the default `user` role, `meta.firstTime = true` and a welcome email. |
| 400 | Validation error, or the provider did not share an email (Facebook users can decline the email permission). |
| 401 | Token invalid, expired, wrong issuer, or issued for a client/app that is not ours. Message never echoes the token. |
| 409 | An account with that email exists but could not be linked automatically. |
| 503 | Provider not configured on this server. |

Rate limit: 10 requests / minute per tracker on the Nest side, plus
better-auth's own `/sign-in/social` rule.

## Account linking

`account.accountLinking` is enabled with `trustedProviders: ['google',
'facebook']`. A social sign-in whose email matches an existing user (for
example someone who registered with a password) attaches a new `account` row
to that user instead of creating a second user. Google reports
`email_verified`; Facebook does not, which is why it is listed as trusted.
Facebook only returns an email after the user confirmed it with Facebook, so
Facebook-created users are stored with `emailVerified = true`. Names are
filled from the provider on first sign-in only (`overrideUserInfoOnSignIn:
false`), so edits made in the app are kept.

The `account` table has a unique index on `(providerId, accountId)` so a
provider identity can never map to two local users.

## Token verification

Both providers use a custom `verifyIdToken` in
`src/auth/social/social-providers.ts` because better-auth 1.4.5:

- only accepts one Google audience, while web, iOS and Android each sign in
  under their own client ID. We verify the signature against Google's JWKS and
  accept any audience in `GOOGLE_ALLOWED_CLIENT_IDS` (plus `GOOGLE_CLIENT_ID`).
- accepts a Facebook Graph access token without verifying it. We call Graph
  `debug_token` with the app token and require `is_valid` and `app_id` equal
  to `FACEBOOK_APP_ID`, so a token minted for another Facebook app is
  rejected. JWTs (Limited Login) are verified against Facebook's JWKS.

Nonces are checked when the client sends one.

## Configuration

```
GOOGLE_CLIENT_ID=            # Web client ID
GOOGLE_CLIENT_SECRET=
GOOGLE_ALLOWED_CLIENT_IDS=   # comma list of iOS / Android client IDs (same Cloud project)
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
```

A provider is enabled only when both of its values are present; the startup
log prints `Social providers enabled: ...`. Console setup:

- Google Cloud: one OAuth client per platform in the same project. Put the
  web client's "Authorized JavaScript origins" to `WEB_APP_URL`. iOS/Android
  clients need the bundle id / package name + SHA-1, no redirect URI.
- Meta: add the web app domain under App Domains / Valid OAuth Redirect URIs
  for the JavaScript SDK, and the iOS/Android platforms with their ids. Enable
  the `email` permission.

## Verification

```
bunx jest src/auth/social
API_URL=http://localhost:3113 bun run scripts/smoke-social-login.ts
```

The smoke script checks validation and rejection paths without credentials.
Set `GOOGLE_TEST_ID_TOKEN` / `FACEBOOK_TEST_ACCESS_TOKEN` (and optionally
`SOCIAL_TEST_EMAIL`) to run the full round trip including linking to an
existing credentials user.

## Not included

- Linking a second provider to a logged-in user (`linkSocial`) and unlinking.
- The browser redirect flow (`/api/auth/sign-in/social` + `/callback/:id`).
  It exists in better-auth but this server is not registered as a redirect
  target.
