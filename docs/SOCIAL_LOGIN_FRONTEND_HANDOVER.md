# Social login handover (web / SvelteKit)

Google and Facebook sign-in are live on the API behind one endpoint. The
browser talks to Google / Facebook itself, gets a token, and posts that token
to us. We verify it and return the same JWT pair you already get from
`POST /auth/login`. Nothing else in your auth handling changes.

The API is **not** an OAuth redirect target. Do not configure a server
callback URL anywhere; the only thing registered in the Google and Meta
consoles is the web app origin (`WEB_APP_URL`).

## 1. The endpoint

`POST {API}/auth/social` — anonymous, JSON body, no cookies needed.

```json
{
  "provider": "google" | "facebook",
  "token": "<see table>",
  "accessToken": "<facebook only, same value as token>",
  "nonce": "<optional>"
}
```

| Provider | `token` | `accessToken` |
|---|---|---|
| `google` | Google **ID token** (the `credential` JWT from Google Identity Services) | omit |
| `facebook` | Facebook **access token** from `FB.login()` | the **same** access token |

Facebook needs the value twice: `token` is verified against our app, and
`accessToken` is what the server uses to read the profile from Graph.

Success (`200`), identical to `/auth/login`:

```json
{
  "message": "Login successful",
  "user": { "id": "42", "email": "ada@example.com", "name": "Ada Lovelace" },
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "expiresAt": "2026-10-07T21:00:00.000Z",
  "refreshExpiresAt": "2026-11-06T21:00:00.000Z"
}
```

Store and refresh these exactly as you do after a password login. `/auth/me`,
`/auth/refresh-token`, `/auth/logout` all work the same.

Errors:

| Status | When | Suggested UI |
|---|---|---|
| 400 | bad body, or the provider did not share an email (Facebook users can untick it) | "We need your email to create an account. Please allow the email permission and try again." |
| 401 | token invalid / expired / for another app | "Sign-in failed, please try again." Retry the provider flow. |
| 409 | email exists but could not be auto-linked | "An account with this email already exists. Sign in with your password." |
| 429 | more than 10 attempts per minute | back off |
| 503 | provider not configured on that environment | hide or disable the button |

Error bodies are the standard Nest shape: `{ statusCode, message, error }`.

## 2. What happens on our side

- First sign-in creates the user with the provider's name, marks the email as
  verified, assigns the default role, sets `meta.firstTime = true` and sends
  the welcome email. There is **no** "verify your email" step for social
  users.
- If a user with that email already exists (for example they registered with
  a password), the provider is attached to that user and they are logged into
  the existing account. Their name in the app is not overwritten.
- The same Google / Facebook identity always maps to the same user.
- A social-only user has no password. `/auth/update-password` tells them so;
  they can use "forgot password" to set one if they want.

## 3. Google on the web (Google Identity Services)

Use the GIS library, not the old `gapi.auth2`. It gives you an ID token
directly, which is exactly what the API wants.

Console setup (we need from you / for you): a **Web** OAuth client in the
shared Google Cloud project with "Authorized JavaScript origins" set to the
web app origin(s) (`https://app.example.com`, plus `http://localhost:5173`
for dev). No redirect URI is needed for the popup / One Tap flow. Send us the
Web client ID; it goes into `GOOGLE_CLIENT_ID` on the API.

Expose the same client ID to the app as `PUBLIC_GOOGLE_CLIENT_ID`.

```svelte
<!-- src/lib/components/GoogleSignIn.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { PUBLIC_GOOGLE_CLIENT_ID } from '$env/static/public';
  import { socialLogin } from '$lib/auth/social';

  let buttonEl: HTMLDivElement;

  onMount(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      google.accounts.id.initialize({
        client_id: PUBLIC_GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          // `credential` is the ID token (JWT)
          await socialLogin({ provider: 'google', token: credential });
        },
        // ux_mode: 'popup' is the default and needs no redirect URI
      });
      google.accounts.id.renderButton(buttonEl, {
        theme: 'outline',
        size: 'large',
        width: 320,
      });
      // optional: google.accounts.id.prompt(); // One Tap
    };
    document.head.appendChild(script);
    return () => script.remove();
  });
</script>

<div bind:this={buttonEl}></div>
```

Types: `npm i -D @types/google.accounts`.

If you later use `nonce` with GIS (`initialize({ nonce })`), pass the same
value in the request body and the API will check it.

## 4. Facebook on the web (JS SDK)

Console setup: in the Meta app, add the **Website** platform with the site
URL, add the web app domain under *App Domains*, and under *Facebook Login →
Settings* add the web app origin to *Valid OAuth Redirect URIs* (the JS SDK
needs it even for the popup flow). Make sure the `email` permission is
requested and approved. The App ID is public; expose it as
`PUBLIC_FACEBOOK_APP_ID`. The App Secret stays on the API.

```svelte
<!-- src/lib/components/FacebookSignIn.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { PUBLIC_FACEBOOK_APP_ID } from '$env/static/public';
  import { socialLogin } from '$lib/auth/social';

  let ready = false;

  onMount(() => {
    (window as any).fbAsyncInit = () => {
      FB.init({ appId: PUBLIC_FACEBOOK_APP_ID, version: 'v21.0', cookie: false, xfbml: false });
      ready = true;
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    document.head.appendChild(script);
    return () => script.remove();
  });

  function login() {
    FB.login(
      async (response) => {
        const accessToken = response.authResponse?.accessToken;
        if (!accessToken) return; // user cancelled
        await socialLogin({ provider: 'facebook', token: accessToken, accessToken });
      },
      { scope: 'public_profile,email' },
    );
  }
</script>

<button on:click={login} disabled={!ready}>Continue with Facebook</button>
```

Types: `npm i -D @types/facebook-js-sdk`.

The Facebook SDK requires `https` origins except for `localhost`.

## 5. Shared client helper

```ts
// src/lib/auth/social.ts
import { PUBLIC_API_URL } from '$env/static/public';
import { setSession } from '$lib/auth/session'; // whatever you use after /auth/login

export type SocialLoginInput = {
  provider: 'google' | 'facebook';
  token: string;
  accessToken?: string;
  nonce?: string;
};

export class SocialLoginError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function socialLogin(input: SocialLoginInput) {
  const res = await fetch(`${PUBLIC_API_URL}/auth/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SocialLoginError(res.status, body?.message ?? 'Sign-in failed');
  }
  // body = { user, accessToken, refreshToken, expiresAt, refreshExpiresAt }
  await setSession(body);
  return body;
}
```

If your app proxies auth through a SvelteKit server route (BFF) to keep
tokens in httpOnly cookies, do the same there: the browser posts the provider
token to your `+server.ts`, which forwards it to `/auth/social` and sets the
cookies from the response. The provider token is short-lived and single use
from our side, so passing it through your server is fine.

## 6. Checklist before go-live

- [ ] Google Web client ID created, origins added, ID sent to backend (`GOOGLE_CLIENT_ID`).
- [ ] Meta app: Website platform + domain + redirect URI + `email` permission; App ID / Secret sent to backend.
- [ ] `PUBLIC_GOOGLE_CLIENT_ID`, `PUBLIC_FACEBOOK_APP_ID`, `PUBLIC_API_URL` in the SvelteKit env.
- [ ] CSP (if you set one): allow `https://accounts.google.com` and `https://connect.facebook.net` for scripts/frames, `https://www.facebook.com` for frames.
- [ ] Handle 400 (no email), 409 (sign in with password), 401 (retry).
- [ ] The staging API responds 503 for a provider until its env is set; the button can key off that.

## 7. Testing against the API

Swagger: `{API}/api/openapi.json` lists `POST /auth/social` with the
`SocialLoginDto` schema.

Quick manual check without the SDK: in the Google OAuth Playground or your
GIS button, copy the `credential` JWT and run

```bash
curl -X POST {API}/auth/social \
  -H 'Content-Type: application/json' \
  -d '{"provider":"google","token":"<id token>"}'
```

For Facebook, get a user access token for the app from the Graph API
Explorer and send it as both `token` and `accessToken`.

Backend details and verification notes live in `docs/SOCIAL_LOGIN.md`.
Mobile (native SDK) clients use the same endpoint; their token contract is
in that document.
