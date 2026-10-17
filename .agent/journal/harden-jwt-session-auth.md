---
task: harden-jwt-session-auth
started: 2026-09-19
status: in-progress
branch: main
---

## Goal
Harden the existing JWT + Session auth instead of migrating to better-auth: hash access/refresh tokens at rest, rotate refresh tokens with reuse detection, make logout revoke JWTs, add logout-all, revoke sessions on password change/reset, drop better-auth session.token from login/signup responses, update tests and docs, write SvelteKit and Android migration guides. Plan: C:\Users\mbouc\.claude\plans\pasted-content-id-c721-we-glimmering-phoenix.md

## Decisions
- 2026-09-19: keep better-auth for credential checks, keep JWT layer; do not migrate API surface — access tokens already stateful via Session lookup
- 2026-09-19: hash only tokenType access/refresh; better-auth 'session' rows must stay raw
- 2026-09-19: reuse grace window 30s (REFRESH_TOKEN_REUSE_GRACE_SECONDS) before family revoke

## Tried and rejected
- Full better-auth migration: NestJS is community-supported, roles/gates guards would need rewrite, Android has no SDK

## Open questions
- [x] resetPassword user lookup — RESOLVED: verification row `reset-password:<token>`, value = user id (confirmed in better-auth source api-CkmycQ2x.mjs:1846). Read before auth.api.resetPassword deletes it.
- [ ] reset-password revocation is NOT covered by any automated test: the dev env has no email sending, so no verification row is ever created. Verify manually on staging.
- [ ] Rollout: per the plan, ship hashing (Task 1) + Tasks 3/4/5 first; hold Task 2 (rotation) until SvelteKit and Android ship the new refresh handling.

## Status: all 7 plan tasks implemented and verified
Server: hashing, rotation + reuse detection, logout revocation, logout-all, password-change/reset revocation, session.token removed from login/signup.
Verified: 51/51 auth unit tests pass; 32/32 live smoke checks pass (scripts/smoke-auth-hardening.ts against port 3113); migration applied (15 refresh rows hashed, 19 better-auth rows untouched); tsc 0 errors in src; lint errors down on every touched file; gitnexus detect_changes blast radius confined to expected symbols.

Extra work beyond the plan, both forced by real defects found during verification:
1. `jti` claim added to IJwtPayload — without it two tokens minted in the same second were identical, so rotation reissued the token it had just revoked.
2. `update-password` rewritten to verify/set the credential password via Prisma + better-auth/crypto. better-auth has NO bearer plugin, so `auth.api.changePassword` could never authenticate a JWT client; the endpoint returned 400 for every bearer caller. Task 4's revocation was unreachable until this was fixed.

## Next step
Nothing blocking. When picking this up: (a) manually verify reset-password revocation on an env with email configured — call POST /auth/reset-password with a real token and confirm `revokeAllUserTokens` runs (see the userId lookup in auth.controller.ts updatePassword's sibling, resetPassword); (b) hand docs/clients/sveltekit-auth-migration.md and docs/clients/android-auth-migration.md to the client teams BEFORE deploying Task 2 (rotation), since old clients drop the new refresh token and get signed out after 15 minutes.

## Session log 2026-09-19 (cont.)
- Found + fixed real bug: tokens minted in the same second for the same user were byte-identical (no jti). Fast rotation reissued the token it had just revoked and collided on Session.token unique index. Added `jti: randomUUID()` to IJwtPayload. Regression test: "token uniqueness (jti)".
- resetPassword user lookup resolved: better-auth stores reset tokens as verification rows with identifier `reset-password:<token>`, value = user id. Looked up BEFORE auth.api.resetPassword consumes it.
- 27/27 unit tests pass in token-expiration.spec.ts.

## Session 2026-10-17: in-grace replay (web work order BACKEND_WORK_ORDER_REFRESH_GRACE.md)
- 2026-10-17: in-grace reuse now RETURNS the same pair instead of 401. Web BFF lost the rotate response during a deploy and got signed out on the next request.
- 2026-10-17: chose idempotent replay over re-rotate — a client that already stored the child pair (Android interceptor, racing tab) would be signed out by its own duplicate under re-rotate.
- 2026-10-17: pair stored AES-256-GCM on the consumed parent row (session.replacement_ciphertext), key = sha256(JWT_SECRET). Replay gated on the child refresh row being unrevoked + unexpired, so logout/logout-all/reset still close it. revokeAllUserTokens nulls the blobs; cleanup cron nulls blobs older than 1 h.
- 2026-10-17: grace default raised 30 → 60 s per the work order.
- Rejected: non-rotating refresh tokens (frontend option 2) — drops reuse detection.
- 2026-10-18: race smoke showed a duplicate that reads the row as revoked BEFORE the winner stores the pair got an instant 401. Added awaitReplacement(): both the in-grace path (when revokedAt < 5 s old) and the lost-claim path re-read up to 6×250 ms for the blob. 5 concurrent racers now all get 200 + identical body (scripts/smoke-refresh-race.ts).
- Gotcha: /auth/refresh-token is throttled 10/min/IP; running smoke-refresh-race then smoke-auth-hardening inside one minute yields 429s that look like replay failures. Wait 60 s between runs.

## Next step (2026-10-18)
Uncommitted and verified (36/36 unit, 35/35 smoke-auth-hardening, race smoke ALL PASS on PORT=3199). To ship: commit (migration 20261017204920_session_replacement_ciphertext + src/generated/prisma), deploy with ./deploy.sh (runs migrate deploy), then tell the web team the route is /auth/refresh-token and the default grace is now 60 s. Zero-downtime web deploy stays the frontend's task.
