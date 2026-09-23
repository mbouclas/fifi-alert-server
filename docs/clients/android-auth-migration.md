# Android client: auth hardening migration

**Applies to:** the FiFi Alert Android app (Kotlin, OkHttp/Retrofit)  
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

- Tokens live only in encrypted storage.
- One `Interceptor` attaches the bearer token.
- One `Authenticator` performs refresh, serialized with a lock, and persists the **new pair** before retrying.
- The refresh endpoint is never retried automatically.

## Step-by-step

### 1. Update the response models

```kotlin
@Serializable
data class AuthResponse(
    val message: String,
    val user: UserSummary? = null,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val expiresAt: String? = null,          // access token expiry, ISO 8601
    val refreshExpiresAt: String? = null,   // refresh token expiry, ISO 8601
    // `session` removed: the server no longer returns it
)

@Serializable
data class RefreshResponse(
    val accessToken: String,
    val expiresAt: String,
    val refreshToken: String,        // NEW: must be persisted, old one is dead
    val refreshExpiresAt: String,
)

@Serializable
data class LogoutRequest(val refreshToken: String?)
```

### 2. Encrypted token storage

Replace any plain `SharedPreferences` / in-memory-only storage with `EncryptedSharedPreferences` (Jetpack Security) or DataStore encrypted with a Keystore-backed key.

```kotlin
class TokenStore(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context, "auth_tokens",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    data class Tokens(val access: String, val accessExpiresAt: Long, val refresh: String, val refreshExpiresAt: Long)

    @Synchronized fun get(): Tokens? { /* read four keys; null if missing */ }
    @Synchronized fun save(r: RefreshResponse) { /* write all four keys atomically via edit().commit() */ }
    @Synchronized fun saveFromLogin(a: AuthResponse) { /* same */ }
    @Synchronized fun clear() { prefs.edit().clear().commit() }
}
```

Never log token values.

### 3. Bearer interceptor

```kotlin
class AuthInterceptor(private val store: TokenStore) : Interceptor {
    private val anonymous = setOf("/auth/login", "/auth/signup", "/auth/refresh-token",
                                  "/auth/request-password-reset", "/auth/reset-password")

    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        if (anonymous.any { req.url.encodedPath.endsWith(it) }) return chain.proceed(req)
        val access = store.get()?.access ?: return chain.proceed(req)
        return chain.proceed(req.newBuilder().header("Authorization", "Bearer $access").build())
    }
}
```

### 4. Refresh via `Authenticator`, serialized

```kotlin
class TokenAuthenticator(
    private val store: TokenStore,
    private val authApi: AuthApi,           // Retrofit interface WITHOUT this authenticator
    private val onForcedSignOut: () -> Unit,
) : Authenticator {
    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        // Give up after one retry to avoid loops.
        if (responseCount(response) >= 2) return null
        // Never try to refresh the refresh call itself.
        if (response.request.url.encodedPath.endsWith("/auth/refresh-token")) return null

        val failedAccess = response.request.header("Authorization")?.removePrefix("Bearer ")

        synchronized(lock) {
            val current = store.get() ?: return null

            // Another thread already refreshed while we waited for the lock.
            if (current.access != failedAccess) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer ${current.access}").build()
            }

            val refreshed = try {
                authApi.refresh(RefreshRequest(current.refresh)).execute()
            } catch (e: IOException) {
                return null   // network error: let the original 401 surface, do NOT wipe
            }

            if (!refreshed.isSuccessful || refreshed.body() == null) {
                // 401 from refresh = token dead (rotated, revoked, or reuse detected).
                store.clear()
                onForcedSignOut()
                return null
            }

            store.save(refreshed.body()!!)   // persist BOTH new tokens before retrying
            return response.request.newBuilder()
                .header("Authorization", "Bearer ${refreshed.body()!!.accessToken}").build()
        }
    }

    private fun responseCount(r: Response): Int {
        var n = 1; var prior = r.priorResponse
        while (prior != null) { n++; prior = prior.priorResponse }
        return n
    }
}
```

Key rules the code above enforces:

- **Persist before retry.** If the app is killed between receiving the new pair and saving it, the old refresh token is already dead. Saving first minimizes that window.
- **One refresh at a time.** The lock plus the "did someone else already refresh" check means concurrent 401s share one rotation.
- **No automatic retry of `/auth/refresh-token`.** If you have a generic retry interceptor, exclude that path. The 30 s server grace window covers one accidental duplicate, not a retry storm.
- **Network failure ≠ invalid token.** Only a `401` from refresh clears storage.

### 5. Optional proactive refresh

Before a request, if `accessExpiresAt - now < 60 s`, call the same locked refresh path. Reuse the lock in `TokenAuthenticator` (extract it to a `TokenRefresher` shared by both) so proactive and reactive refresh never run in parallel.

### 6. Logout

```kotlin
suspend fun logout() {
    val t = store.get()
    try {
        authApi.logout(LogoutRequest(t?.refresh))   // bearer added by interceptor
    } catch (_: Exception) { /* best effort */ }
    store.clear()
    navigateToLogin()
}

suspend fun logoutEverywhere() {
    try { authApi.logoutAll() } catch (_: Exception) {}
    store.clear()
    navigateToLogin()
}
```

Wipe storage even if the request fails.

### 7. Forced sign-out UX

`onForcedSignOut` fires when refresh returns `401`. Causes: password changed on another device, admin revoke, refresh token reuse detected, or 30 days of inactivity. Navigate to login with a message like "You were signed out. Please log in again." Do not auto-retry.

### 8. Push token hygiene

On forced sign-out, also unregister the device push token (`DELETE /devices/...` or your existing flow) so notifications for the previous account stop.

## Checklist

- [ ] `RefreshResponse` has `refreshToken` and `refreshExpiresAt`; `session` removed from `AuthResponse`
- [ ] Tokens only in `EncryptedSharedPreferences` / encrypted DataStore
- [ ] Single `Authenticator` with lock; persists new pair before retry
- [ ] Refresh endpoint excluded from all retry logic
- [ ] Logout sends `{ refreshToken }` plus bearer header, then wipes storage
- [ ] "Sign out of all devices" mapped to `/auth/logout-all`
- [ ] 401 from refresh → wipe + login screen, no loop
