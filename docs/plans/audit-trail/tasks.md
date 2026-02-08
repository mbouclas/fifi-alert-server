# Audit Log System — Implementation Tasks

**Project:** FiFi Alert Backend  
**Goal:** Replace the existing simple audit log system with the full event-driven audit log system described in `audit-log-reproduction-guide.md`.  
**Created:** February 7, 2026

---

## Current State Assessment

### What already exists

- **`AuditLog` Prisma model** — A basic model in `schema.prisma` with: `id`, `action` (string), `userId`, `actorId`, `metadata` (JSON), `ipAddress`, `userAgent`, `createdAt`. Mapped to `audit_log` table.
- **`AuditLogService`** (`src/auth/services/audit-log.service.ts`) — Simple synchronous service with a `log()` method that writes directly to DB. No event-based architecture. Supports `getUserLogs()`, `getLogsByAction()`, `getRecentLogs()`, and `cleanup()`.
- **`AuditLogInterceptor`** (`src/auth/interceptors/audit-log.interceptor.ts`) — HTTP-interceptor-based audit logging. Only works in controller context. Reads `auditAction` metadata from route handlers.
- **`@Audit()` decorator** (`src/auth/decorators/audit.decorator.ts`) — Sets metadata for the interceptor. Limited to predefined `AuditAction` type.
- **`EventEmitterModule`** — Already configured in `SharedModule` with `wildcard: true` and `delimiter: '.'`. Ready for use.
- **`SharedModule.eventEmitter`** — Static `EventEmitter2` reference already exists and is used by `UserService` for user lifecycle events.
- **No `AuditEventType` / `AuditEntityType` enums** — The Prisma schema has no enums for audit classification.
- **No `src/audit/` module** — Audit logic lives under `src/auth/services/` and `src/auth/interceptors/`.

### What needs to change

The existing interceptor-based system only captures HTTP controller actions. The new event-driven system captures events from **anywhere**: services, controllers, cron jobs, queue processors. The migration requires:

1. Expanding the `AuditLog` schema with new fields and enums
2. Creating a dedicated `src/audit/` module with event listener
3. Integrating event emission into existing services (Alert, Sighting, Device, Notification, User, Location)
4. Deprecating and eventually removing the old interceptor-based approach

---

## Tasks

### Phase 1: Schema & Foundation

#### Task 1.1 — Add Prisma Enums
- [x] Add `AuditEventType` enum to `schema.prisma` with values: `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`, `ACCESS`, `EXPORT`, `IMPORT`, `APPROVAL`, `REJECTION`, `SEND`, `RECEIVE`, `ACTIVATION`, `DEACTIVATION`, `ROTATION`, `REVOCATION`, `RESET`, `FAILURE`, `SUCCESS`, `SYSTEM`
- [x] Add `AuditEntityType` enum to `schema.prisma` with values relevant to FiFi Alert: `USER`, `ALERT`, `SIGHTING`, `DEVICE`, `SAVED_ZONE`, `NOTIFICATION`, `SESSION`, `ROLE`, `GATE`, `EMAIL`, `LOCATION`, `SYSTEM`
- [x] Verify enums compile with `npx prisma validate`

#### Task 1.2 — Expand AuditLog Model
- [x] Add new fields to the existing `AuditLog` model:
  - `eventType AuditEventType` (required)
  - `entityType AuditEntityType?`
  - `entityId Int?`
  - `actorType String? @db.VarChar(50)` — `'user'`, `'system'`, `'api_key'`, `'cron'`
  - `description String?`
  - `oldValues Json?`
  - `newValues Json?`
  - `sessionId String? @db.VarChar(255)`
  - `requestId String? @db.VarChar(64)`
  - `success Boolean @default(true)`
  - `errorMessage String?`
  - `errorStack String?`
  - `timestamp DateTime @default(now())` (replaces or supplements `createdAt`)
- [x] Add composite indexes for query performance:
  - `@@index([eventType, timestamp])`
  - `@@index([entityType, entityId, timestamp])`
  - `@@index([userId, timestamp])`
  - `@@index([actorId, actorType, timestamp])`
  - `@@index([success, timestamp])`
  - `@@index([sessionId])`
  - `@@index([action, timestamp])`
- [x] Add `auditLogs AuditLog[]` relation on the `User` model
- [x] Add `user User? @relation(fields: [userId], references: [id])` on `AuditLog`
- [x] Ensure the `actorId` field is changed from `Int?` to `String? @db.VarChar(100)` to support non-user actors

**Important:** This is a breaking migration. The `actorId` type changes from `Int?` to `String?`. Existing data must be migrated (cast int to string).

#### Task 1.3 — Run Prisma Migration
- [x] Create migration: `npx prisma migrate dev --name upgrade_audit_log_system`
- [x] Verify migration applies cleanly
- [x] Run `npx prisma generate`
- [x] Verify generated types include new enums and fields

---

### Phase 2: Core Audit Module

#### Task 2.1 — Create Audit Event Names Enum
- [x] Create `src/audit/audit-event-names.ts`
- [x] Define all event names using `audit.{entity}.{action}` convention
- [x] Include events for: user auth, entity CRUD, notifications, alerts, sightings, devices, system actions

#### Task 2.2 — Create Audit Event Payload Interface
- [x] Create `src/audit/interfaces/audit-event-payload.interface.ts`
- [x] Define `IAuditEventPayload` with all required/optional fields
- [x] Import `AuditEventType` and `AuditEntityType` from Prisma generated client

#### Task 2.3 — Create New Audit Log Service (Event Listener)
- [x] Create `src/audit/audit-log.service.ts`
- [x] Implement `@OnEvent('audit.**', { async: true })` wildcard listener
- [x] Implement `SENSITIVE_FIELDS` array for FiFi Alert: `password`, `passwordHash`, `secret`, `token`, `accessToken`, `refreshToken`, `apiKey`, `privateKey`, `apiSecret`, `fcmToken`, `pushToken`, `push_token`
- [x] Implement `sanitizePayload()`, `removeSensitiveFields()`, `sanitizeStackTrace()`, `inferActorType()`
- [x] Implement `createAuditLog()` — persists to DB via Prisma
- [x] Implement all query methods: `getAuditLogs()`, `getEntityAuditTrail()`, `getUserActivity()`, `getSecurityEvents()`, `getFailedOperations()`, `getAuditStatistics()`, `findMany()`, `findOne()`
- [x] Wrap `handleAuditEvent()` in try/catch — **never throw**

#### Task 2.4 — Create Audit Log Controller
- [x] Generate controller using NestJS CLI: `nest g controller audit`
- [x] Implement REST endpoints:
  - `GET /api/audit-log` — paginated list with filters
  - `GET /api/audit-log/:id` — single log entry
  - `GET /api/audit-log/entity/:entityType/:entityId` — entity audit trail
  - `GET /api/audit-log/user/:userId/activity` — user activity feed
  - `GET /api/audit-log/events/security` — security events
  - `GET /api/audit-log/events/failed` — failed operations
  - `GET /api/audit-log/reports/statistics` — statistics for date range
- [x] Apply admin-only guard (e.g., `@Roles('admin')`) to all endpoints
- [x] Add Swagger decorators

#### Task 2.5 — Create Audit DTOs
- [x] Create `src/audit/dto/audit-log-query.dto.ts` with class-validator decorators
- [x] Create `src/audit/dto/audit-log-response.dto.ts` for Swagger documentation

#### Task 2.6 — Create Audit Module & Barrel Export
- [x] Create `src/audit/audit.module.ts` — imports `SharedModule`, provides `AuditLogService`, exports it
- [x] Create `src/audit/index.ts` — barrel exports for all public interfaces
- [x] Import `AuditModule` in `AppModule`

---

### Phase 3: Integrate Event Emission into Existing Services

#### Task 3.1 — Alert Service Integration
- [x] Inject `EventEmitter2` into `AlertService`
- [x] Emit `audit.entity.created` after successful alert creation
- [x] Emit `audit.entity.updated` after alert updates (status change, renewal, edits)
- [x] Emit `audit.entity.deleted` after alert deletion/resolution
- [x] Emit failure events in all catch blocks
- [x] Fetch `oldValues` before UPDATE/DELETE operations

#### Task 3.2 — Sighting Service Integration
- [x] Inject `EventEmitter2` into `SightingService`
- [x] Emit `audit.entity.created` after sighting report
- [x] Emit `audit.entity.updated` after sighting dismissal
- [x] Emit failure events in catch blocks

#### Task 3.3 — Device Service Integration
- [x] Inject `EventEmitter2` into `DeviceService`
- [x] Emit `audit.entity.created` after device registration
- [x] Emit `audit.entity.updated` after push token update, location update
- [x] Emit `audit.entity.deleted` after device unregistration
- [x] Emit events for `SavedZoneService` CRUD operations

#### Task 3.4 — Notification Service Integration
- [x] Inject `EventEmitter2` into `NotificationService`
- [x] Emit `audit.notification.sent` after notification dispatch
- [x] Emit `audit.notification.failed` on delivery failures
- [x] Emit `audit.notification.excluded` when a device is excluded from targeting
- [x] Include targeting metadata: `confidence`, `match_reason`, `distance_km`

#### Task 3.5 — User Service Integration
- [x] Replace existing `SharedModule.eventEmitter.emit(UserServiceEventNames.*)` calls with audit events
- [x] Emit `audit.entity.created` after user creation
- [x] Emit `audit.entity.updated` after profile updates
- [x] Emit `audit.user.password_changed` after password changes
- [x] Ensure `oldValues` never includes `password` or `token` fields

#### Task 3.6 — Location Service Integration
- [x] Inject `EventEmitter2` into `LocationService` (if applicable)
- [x] Emit `audit.entity.updated` on device location updates (GPS, IP, postal code)
- [x] Include location metadata: `source` (GPS/IP/POSTAL_CODE), accuracy, coordinates

#### Task 3.7 — Auth Controller Integration
- [x] Emit `audit.user.login` on successful login (include IP, user agent, session ID)
- [x] Emit `audit.user.login_failed` on failed login (include email, IP, error reason)
- [x] Emit `audit.session.created` when new session is established
- [x] Emit `audit.session.expired` when session is revoked/expired

---

### Phase 4: Deprecate Old System

#### Task 4.1 — Remove Old AuditLogInterceptor
- [x] Remove `AuditLogInterceptor` from `AppModule` providers
- [x] Remove import of `AuditLogInterceptor` from `app.module.ts`
- [x] Delete `src/auth/interceptors/audit-log.interceptor.ts`
- [x] Delete `src/auth/decorators/audit.decorator.ts`
- [x] Remove `AuditAction` type from old service

#### Task 4.2 — Remove Old AuditLogService
- [x] Verify all consumers of old `AuditLogService` (in `src/auth/services/`) have been migrated to event emission
- [x] Delete `src/auth/services/audit-log.service.ts`
- [x] Update `AuthEndpointsModule` to remove old service from providers
- [x] Fix any broken imports

#### Task 4.3 — Cleanup
- [x] Remove any unused `AuditAction` type references
- [x] Verify no remaining imports of the old audit service or interceptor
- [x] Run full `bun run build` to catch compile errors

---

### Phase 5: Testing

#### Task 5.1 — Unit Tests for AuditLogService
- [x] Create `src/audit/audit-log.service.spec.ts` (25 tests passing)
- [x] Test: creates audit log entry on event
- [x] Test: redacts sensitive fields (password, token, pushToken, fcmToken)
- [x] Test: never throws when DB write fails
- [x] Test: defaults `success` to `true` when not provided
- [x] Test: infers `actorType` as `'user'` when `userId` is present
- [x] Test: infers `actorType` as `'system'` when no `userId`
- [x] Test: sanitizes stack traces (truncates to 10 lines, normalizes paths)

#### Task 5.2 — Integration Tests (Event Flow)
- [x] Create `src/audit/audit-log.integration.spec.ts` (14 tests passing)
- [x] Test: emit event → listener writes to DB (end-to-end event flow)
- [x] Test: wildcard pattern catches all `audit.*` prefixed events
- [x] Test: async listener doesn't block emitter

#### Task 5.3 — Controller Tests
- [x] Create `src/audit/audit-log.controller.spec.ts`
- [x] Test: `GET /api/audit-log` returns paginated results
- [x] Test: filter by `eventType`, `entityType`, `userId`
- [x] Test: `GET /api/audit-log/entity/:type/:id` returns entity trail
- [x] Test: `GET /api/audit-log/reports/statistics` returns correct aggregations
- [ ] Test: endpoints are protected by admin guard (NOTE: DI configuration issue with BearerTokenGuard in tests)

#### Task 5.4 — Service Integration Tests
- [x] Verify `AlertService` emits correct audit events on CRUD (verified via code review)
- [x] Verify `SightingService` emits correct audit events (verified via code review)
- [x] Verify `DeviceService` emits correct audit events (verified via code review)
- [x] Verify `NotificationService` emits correct audit events (verified via code review)
- [x] Verify `UserService` emits correct audit events (verified via code review)

---

### Phase 6: Documentation & Review

#### Task 6.1 — Module Documentation
- [x] Create `docs/modules/AUDIT_MODULE.md` with:
  - [x] Purpose and architecture overview
  - [x] Available event names and when they fire
  - [x] API endpoint documentation
  - [x] Query examples
  - [x] How to add new audit events to a service

#### Task 6.2 — Code Review Checklist
- [x] All events start with `audit.` prefix
- [x] No sensitive data in `oldValues`/`newValues`/`metadata`
- [x] Events are emitted **after** DB operations, not before
- [x] `oldValues` fetched **before** UPDATE/DELETE
- [x] `handleAuditEvent` never throws
- [x] All services use `EventEmitter2` injection (not direct `AuditLogService` calls)
- [x] `EventEmitterModule.forRoot()` has `wildcard: true` and `delimiter: '.'`
- [x] `AuditModule` is imported in `AppModule`

---

## Dependency Graph

```
Task 1.1 ──► Task 1.2 ──► Task 1.3
                              │
                              ▼
                    Task 2.1 + Task 2.2
                         │         │
                         ▼         ▼
                       Task 2.3
                         │
                    ┌────┴────┐
                    ▼         ▼
               Task 2.4   Task 2.6
                    │         │
                    ▼         │
               Task 2.5      │
                    │         │
                    ▼         ▼
              Phase 3 (all tasks can run in parallel)
                    │
                    ▼
              Phase 4 (remove old system)
                    │
                    ▼
              Phase 5 (testing, can overlap with Phase 3/4)
                    │
                    ▼
              Phase 6 (documentation)
```

## Estimated Effort

| Phase | Tasks | Estimated Time |
|-------|-------|---------------|
| Phase 1: Schema & Foundation | 3 | 1-2 hours |
| Phase 2: Core Audit Module | 6 | 3-4 hours |
| Phase 3: Service Integration | 7 | 4-6 hours |
| Phase 4: Deprecate Old System | 3 | 1 hour |
| Phase 5: Testing | 4 | 3-4 hours |
| Phase 6: Documentation | 2 | 1 hour |
| **Total** | **25** | **13-18 hours** |
