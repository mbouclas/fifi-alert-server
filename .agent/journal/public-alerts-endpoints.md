---
task: public-alerts-endpoints
started: 2026-10-04
status: shipping
branch: main
---

## Goal
Implement BACKEND_WORK_ORDER_PUBLIC_ALERTS.md: GET /alerts and GET /alerts/:id accept X-Client-Key without bearer
(anonymous forced to ACTIVE, redacted payload), AlertResponseDto gains tagId, new GET /alerts/by-tag/:tagId (60/min),
throttler keys on client key, OpenAPI decorators updated and spec copied to the web repo. Plan file:
C:\Users\mbouc\.claude\plans\read-and-plan-for-fuzzy-barto.md

## Decisions
- 2026-10-04: anonymous non-ACTIVE status is silently forced to ACTIVE (work order allowed ignore or 400; ignore is friendlier for the BFF)
- 2026-10-04: redaction = private applyViewerRedaction(dto, requesterId) in AlertService, keyed on requesterId === undefined
- 2026-10-04: ClientKeyGuard passes bearer-authenticated requests without a key (work order: key required only when no bearer); affects adoption reads too, intentionally
- 2026-10-04: tag format constants live in src/pet/tag-id.ts; pet.service generator reuses them

## Tried and rejected
- Leaving ClientKeyGuard as-is: it rejected bearer-only callers (mobile app) on GET /alerts with 401 'Missing client key'; guard now skips when request.user is set (covered by client-key.guard.spec)

## Open questions
- [ ] 60/min on by-tag is one shared bucket for the whole BFF; raise if traffic warrants

## Next step
Review `git diff`, then commit (run gitnexus_detect_changes again first). Web repo docs/openapi.json already refreshed (uncommitted there). Pre-existing failing specs in alert.service.spec.ts (update/resolve/renew camelCase expectations) are out of scope.
