---
id: 2026-04-26-client-403-min-user-level
tags: [auth, min-user-level, client-routes, forbidden]
files: [src/auth/guards/min-user-level.guard.ts, src/user/user.service.ts, src/pet-types/pet-types.controller.ts, src/user/user.controller.ts]
related_commits: []
supersedes: []
expires_on_change_to: [src/auth/guards/min-user-level.guard.ts::MinUserLevelGuard, src/user/user.service.ts::userHasMinLevel, src/pet-types/pet-types.controller.ts::PetTypesController, src/user/user.controller.ts::update]
last_verified: 2026-04-26
---

# Diagnose client 403s before changing guards

## Context
Load this when a mobile or regular authenticated client gets `403 Forbidden`, especially near routes guarded by `MinUserLevelGuard`, `RolesGuard`, or user ownership checks. This applies to client-facing endpoints such as profile updates and reference-data reads, not only admin dashboards.

## Lesson
Do not assume every 403 means the token is bad. First identify the exact route and guard metadata. `BearerTokenGuard` attaches flattened JWT roles shaped like `{ slug, level }`, while Prisma-loaded users often have nested role rows shaped like `{ role: { level } }`; helpers used by guards must handle both. `MinUserLevel` uses lower numbers as higher privilege, so a role satisfies `@MinUserLevel(50)` when `role.level <= 50`. Also check whether the endpoint is actually client-facing: reads such as `GET /pet-types` should be available to normal authenticated users, while create/update/delete can remain restricted. For user profile updates, allow self-update by comparing `session.userId` to the path id, but keep privileged fields such as `emailVerified` admin/manager-only.

## Why not a test / lint / example
Regression tests now cover flattened and nested role shapes, self-update behavior, and pet-type read metadata, but this lesson captures the diagnostic order across multiple auth mechanisms. A lint rule would not know route intent, and a single example would miss the repeated failure mode across different controllers.

## Canary
Re-check this lesson whenever `MinUserLevelGuard`, `UserService.userHasMinLevel`, `PetTypesController`, or `UserController.update` changes, or when token role payloads change in `src/auth/services/token.service.ts`.