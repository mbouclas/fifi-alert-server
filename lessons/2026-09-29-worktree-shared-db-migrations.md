---
id: 2026-09-29-worktree-shared-db-migrations
tags: [prisma, migrations, worktree, shared-dev-db, boot-failure]
files: [prisma/migrations, src/generated/prisma, src/device/device.service.ts, src/sighting/sighting.service.ts]
related_commits: [9037d6b, 32afdb2]
supersedes: []
expires_on_change_to: [src/device/device.service.ts, src/sighting/sighting.service.ts, prisma/schema.prisma::generator]
last_verified: 2026-09-29
---

# Worktrees share one dev database: never let `prisma migrate dev` reset it

## Context
Load this when working in an Orca worktree of this repo and either `bunx prisma migrate dev` offers to reset the database, or `bun run src/main.ts` fails with `Cannot find module '.prisma/client/default'`.

## Lesson
All worktrees point `DATABASE_URL` at the same local PostgreSQL. Other branches apply their migrations there, so `migrate dev` in your worktree sees "migrations applied but missing locally" and proposes a destructive reset that would wipe every other session's data. Instead, write the migration SQL by hand under `prisma/migrations/<timestamp>_<name>/` (copy the geometry column and GIST index style from `20260207231613_add_alert_zones`) and apply it with `bunx prisma migrate deploy`, which only applies pending local migrations and never resets. After merging `main` the missing migrations appear locally and `migrate status` reports up to date. Separately, eight files still import from `@prisma/client` instead of `@prisma-lib/client`; a fresh worktree has no `node_modules/.prisma/client`, so the app will not boot until you copy that directory from the primary checkout (`I:/Work/fifi-alert/fifi-alert-server/node_modules/.prisma`). The real fix is to switch those imports.

## Why not a test / lint / example
It is environment state outside the repo (shared DB, per-worktree node_modules). A lint rule banning `@prisma/client` imports would remove the second half; add it when those eight files are migrated.

## Canary
`grep -rl "from '@prisma/client'" src` returning zero files, or the `generator` block in `prisma/schema.prisma` changing its `output`.
