---
task: passkeys
started: 2026-10-16
status: shipping
branch: main
---

## Goal
Implement the PWA work order `I:/Work/orca-workspaces/fifi-alert-sveltekit/passkeys/docs/BACKEND_WORK_ORDER_PASSKEYS.md`: 7 `/auth/passkeys/*` endpoints, Prisma `Passkey` model, Redis challenge store, `passkeyCount` on `/auth/me`, Swagger docs, tests + smoke script. Plan: C:\Users\mbouc\.claude\plans\the-pwa-team-has-purrfect-reddy.md

## Decisions
- 2026-10-16: extract shared `LoginIssuerService` used by login/social/passkey — avoid a third inline copy of token issuance
- 2026-10-16: passkey login enforces emailVerified 403 like /auth/login (not like /auth/social)
- 2026-10-16: challenge store = Redis (ioredis, SET EX 300 + GETDEL) — multi-process safe, atomic single use
- 2026-10-16: no docs/openapi.json exists; Swagger decorators are the spec (served at /api/openapi.json)
- 2026-10-16: installed @simplewebauthn/server 14.0.3 (not 13); same call signatures, verified against the shipped .d.ts
- 2026-10-16: requireUserVerification:false on BOTH verify calls (library default true would reject UV-less platform authenticators with userVerification 'preferred'); guarded by passkey.service.spec
- 2026-10-16: login/verify returns full AuthResponseDto (includes `user`), a superset of the order's 5 fields
- 2026-10-16: passkeys disabled (503) when RP_ID/RP_ORIGINS missing instead of minting unverifiable challenges

- 2026-10-17 (frontend review): email-verified gate moved INTO PasskeyService.finishLogin, after signature check and before the counter/lastUsedAt write; surfaced as PasskeyEmailNotVerifiedException so the controller only owns the resend
- 2026-10-17: smoke script got a software ES256 authenticator (WebCrypto + hand-rolled CBOR/COSE/DER) — real register + sign-in now run live; wrong origin, wrong RP ID, counter regression, expired challenge (Redis DEL), replay and cross-type are all proven against the server
- 2026-10-17: dev instance (.env, port 3113) now has RP_ID=localhost, RP_ORIGINS=http://localhost:4173,https://localhost:4173; bun --watch restarted and serves /auth/passkeys/*

## Tried and rejected
- better-auth passkey plugin: produces better-auth sessions, not the JWT quartet clients consume; no bearer plugin exists

## Open questions
- [x] @simplewebauthn/server on Bun runtime — works (smoke run on :3199)
- [x] real cryptographic ceremony — covered by scripts/smoke-passkeys.ts software authenticator (88/88 on :3199)
- [ ] GitNexus index is stale (socialLogin unknown); run `npx gitnexus analyze` after commit

## Next step
Verified (2026-10-17): 160 Jest tests in auth/config (3 new suites, 40 passkey/config cases), 88/88 smoke-passkeys checks incl. real ceremony, 32/32 smoke-auth-hardening, 5/5 smoke-social-login on :3199; eslint clean on touched files. Ship: review `git diff src/auth/auth/auth.controller.ts` (login/socialLogin/me now use LoginIssuerService), commit, run `npx gitnexus analyze`, then do the manual Chrome virtual-authenticator pass from the web repo (`bun run dev`, RP_ID=localhost, RP_ORIGINS=http://localhost:4173) and retire this journal.
