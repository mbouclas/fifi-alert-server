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

## Tried and rejected
- better-auth passkey plugin: produces better-auth sessions, not the JWT quartet clients consume; no bearer plugin exists

## Open questions
- [x] @simplewebauthn/server on Bun runtime — works (smoke run on :3199)
- [ ] real cryptographic ceremony not covered by any server-side test; run the web repo's Chrome virtual-authenticator e2e against this server before shipping
- [ ] GitNexus index is stale (socialLogin unknown); run `npx gitnexus analyze` after commit

## Next step
Verified: 157 Jest tests (3 new suites), 54/54 smoke-passkeys checks, 32/32 smoke-auth-hardening, 5/5 smoke-social-login on :3199; eslint clean on touched files. Ship: review `git diff src/auth/auth/auth.controller.ts` (login/socialLogin/me now use LoginIssuerService), commit, run `npx gitnexus analyze`, then do the manual Chrome virtual-authenticator pass from the web repo (`bun run dev`, RP_ID=localhost, RP_ORIGINS=http://localhost:4173) and retire this journal.
