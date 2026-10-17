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

- 2026-10-17: production is docker-only by decision (user); API containerised: Dockerfile (oven/bun:1.4.2-debian, runs src/main.ts), docker/entrypoint.sh (prisma migrate deploy with retry), `api` service in docker-compose.prod.yml on 127.0.0.1:3113, pm2 entry retired by deploy.sh on first run
- 2026-10-17: .env is bind-mounted into the container and parsed by dotenv, NOT passed via compose env_file — compose 1.26 keeps inline `# comments` and quotes (host .env has both); dotenv strips them, as it did under pm2
- 2026-10-17: prisma CLI pinned as devDependency 7.3.0 — it was never declared, `bunx prisma` on the host had pulled 7.4.2 and rewrote src/generated/prisma, which dirtied the tree and made deploy.sh abort before `bun install`
- 2026-10-17: deploy.sh always runs the install/build; "did the lockfile change in this pull" was wrong because the host had pulled by hand first

## Tried and rejected
- compose `env_file: .env` for the API: parser differences vs dotenv corrupt values (MAIL_SYSTEM="smtp  # Options..." observed locally)
- `--remove-orphans` on compose up: fifi-alert-web shares the name prefix but belongs to project fifi-alert-sveltekit
- better-auth passkey plugin: produces better-auth sessions, not the JWT quartet clients consume; no bearer plugin exists

## Open questions
- [x] @simplewebauthn/server on Bun runtime — works (smoke run on :3199)
- [x] real cryptographic ceremony — covered by scripts/smoke-passkeys.ts software authenticator (88/88 on :3199)
- [ ] GitNexus index is stale (socialLogin unknown); run `npx gitnexus analyze` after commit

## Next step
Commit + push the containerisation (Dockerfile, docker/entrypoint.sh, .dockerignore, docker-compose.prod.yml api service, deploy.sh, nginx/README.md, prisma devDep), then on the host run `./deploy.sh` once: it deletes the pm2 entry, builds the image, starts fifi-alert-api on 3113. Verify `docker logs fifi-alert-api | grep Passkeys` and https://app.fifi-alert.com/auth/passkeys/login/options. Previously: Verified (2026-10-17): 160 Jest tests in auth/config (3 new suites, 40 passkey/config cases), 88/88 smoke-passkeys checks incl. real ceremony, 32/32 smoke-auth-hardening, 5/5 smoke-social-login on :3199; eslint clean on touched files. Ship: review `git diff src/auth/auth/auth.controller.ts` (login/socialLogin/me now use LoginIssuerService), commit, run `npx gitnexus analyze`, then do the manual Chrome virtual-authenticator pass from the web repo (`bun run dev`, RP_ID=localhost, RP_ORIGINS=http://localhost:4173) and retire this journal.
