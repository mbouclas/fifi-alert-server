---
task: better-auth-hooks
started: 2026-09-26
status: shipping
branch: main
---

## Goal
Configure every unconfigured better-auth hook in src/auth.ts and expose change-email / delete-account endpoints. Plan: C:\Users\mbouc\.claude\plans\better-auth-has-no-sendresetpassword-snoopy-diffie.md

## Decisions
- 2026-09-26: all hooks emit domain events (src/auth/auth-events.ts) handled by UserService @OnEvent listeners; no email sending inside auth.ts
- 2026-09-26: reuse forgotPassword.njk, delete duplicate passwordReset.njk; move passwordChanged into UserService; delete dead AuthEmailService + 3 unused auth templates
- 2026-09-26: afterEmailVerification only audits (welcome email already sent at signup)
- 2026-09-26: hooks.before/after left empty — every client goes through AuthController which already audits login/logout; hooks.after would double-count
- 2026-09-26: bearer clients get a temporary better-auth session written via Prisma (better-auth-session.helper.ts); internalAdapter throws "No auth context" outside an endpoint
- 2026-09-26: AuthController.resetPassword deletes the `reset-password:<token>` row itself — better-auth's deleteVerificationValue does not remove it (uuid-keyed table + generateId 'serial'), token stayed reusable
- 2026-09-26: URL builders extracted to src/auth/auth-links.ts so they are unit-testable without booting better-auth

## Tried and rejected
- ctx.internalAdapter.createSession for the temp session: needs runWithEndpointContext
- revoking JWTs BEFORE auth.api.deleteUser in confirm: a failed confirm attempt logged the user out

## Open questions
- [ ] better-auth rateLimit uses memory storage; multi-instance deploys need `storage: 'database'` + a rateLimit Prisma model
- [ ] no controller unit spec for the 3 new routes (covered by scripts/smoke-auth-emails.ts only)

## Next step
Verified: 29/29 live smoke checks (scripts/smoke-auth-emails.ts on :3113), 91 unit tests, tsc clean on touched files. Ship: review `git diff src/auth.ts src/auth/auth/auth.controller.ts src/user/user.service.ts`, commit, then retire this journal (lesson candidates: reset-token deletion quirk is guarded by the smoke check "the reset token cannot be reused").
