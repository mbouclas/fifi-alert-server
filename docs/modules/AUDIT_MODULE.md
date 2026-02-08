# Audit Module Documentation

## Overview

The Audit Module provides comprehensive event-driven audit logging for all significant operations in the FiFi Alert system. It automatically tracks user actions, system events, security events, and entity lifecycle changes, storing them in a searchable, tamper-evident audit trail.

**Module Path:** `src/audit/`  
**Database Tables:** `AuditLog`  
**Dependencies:** PrismaService, EventEmitter2  
**Architecture Pattern:** Event-driven with wildcard listener

---

## Table of Contents

1. [Architecture](#architecture)
2. [Event Names Catalog](#event-names-catalog)
3. [API Endpoints](#api-endpoints)
4. [How to Emit Audit Events](#how-to-emit-audit-events)
5. [Query Methods](#query-methods)
6. [Data Security](#data-security)
7. [Testing](#testing)
8. [Best Practices](#best-practices)

---

## Architecture

### Event-Driven Design

The audit system uses an event-driven architecture where services emit events and the `AuditLogService` listens with a wildcard pattern (`audit.**`) to automatically capture and persist all audit events.

```
┌──────────────────┐
│  Any Service     │  (AlertService, UserService, etc.)
└────────┬─────────┘
         │
         │ emit('audit.alert.created', payload)
         ▼
┌──────────────────┐
│  EventEmitter2   │  (Global event bus)
└────────┬─────────┘
         │
         │ wildcard: 'audit.**'
         ▼
┌──────────────────┐
│ AuditLogService  │  @OnEvent('audit.**', {async: true})
└────────┬─────────┘
         │
         │ sanitize & persist
         ▼
┌──────────────────┐
│  AuditLog Table  │  (PostgreSQL via Prisma)
└──────────────────┘
```

### Module Structure

```
src/audit/
├── audit.module.ts               # Module definition
├── audit-log.service.ts          # Core service with wildcard listener
├── audit-log.controller.ts       # Admin-only REST API endpoints
├── audit-event-names.ts          # Standardized event name constants
├── dto/
│   ├── audit-log-query.dto.ts    # Query parameters for filtering
│   └── audit-log-response.dto.ts # Response schemas
└── interfaces/
    └── audit-event-payload.interface.ts  # Event payload structure
```

### Key Features

- **Event-Driven**: No direct service dependencies—services emit events, audit service listens
- **Wildcard Listener**: Single `@OnEvent('audit.**')` captures all audit events
- **Async Non-Blocking**: Audit logging never blocks business logic
- **Never Throws**: Audit failures are logged but never propagate errors
- **Sensitive Data Redaction**: Automatically removes passwords, tokens, keys from logs
- **Stack Trace Sanitization**: Normalizes and truncates error stacks
- **Admin-Only Queries**: All query endpoints protected by `@Roles('admin')` guard

---

## Event Names Catalog

All audit events follow the pattern: `audit.{entity}.{action}`

### Event Name Structure

```typescript
import { AUDIT_EVENT_NAMES } from '../audit/audit-event-names';

// Example: audit.user.created
AUDIT_EVENT_NAMES.USER.CREATED
```

### Available Event Categories

#### User Events
```typescript
AUDIT_EVENT_NAMES.USER = {
    CREATED: 'audit.user.created',
    UPDATED: 'audit.user.updated',
    DELETED: 'audit.user.deleted',
    LOGIN: 'audit.user.login',
    LOGIN_FAILED: 'audit.user.login_failed',
    LOGOUT: 'audit.user.logout',
    PASSWORD_CHANGED: 'audit.user.password_changed',
    PASSWORD_RESET_REQUESTED: 'audit.user.password_reset_requested',
    PASSWORD_RESET_COMPLETED: 'audit.user.password_reset_completed',
    EMAIL_VERIFIED: 'audit.user.email_verified',
    PROFILE_UPDATED: 'audit.user.profile_updated',
    BANNED: 'audit.user.banned',
    UNBANNED: 'audit.user.unbanned',
}
```

#### Session Events
```typescript
AUDIT_EVENT_NAMES.SESSION = {
    CREATED: 'audit.session.created',
    REFRESHED: 'audit.session.refreshed',
    EXPIRED: 'audit.session.expired',
    REVOKED: 'audit.session.revoked',
    IMPERSONATION_STARTED: 'audit.session.impersonation_started',
    IMPERSONATION_ENDED: 'audit.session.impersonation_ended',
}
```

#### Alert Events
```typescript
AUDIT_EVENT_NAMES.ALERT = {
    CREATED: 'audit.alert.created',
    UPDATED: 'audit.alert.updated',
    DELETED: 'audit.alert.deleted',
    PUBLISHED: 'audit.alert.published',
    RESOLVED: 'audit.alert.resolved',
    EXPIRED: 'audit.alert.expired',
    RENEWED: 'audit.alert.renewed',
    STATUS_CHANGED: 'audit.alert.status_changed',
}
```

#### Sighting Events
```typescript
AUDIT_EVENT_NAMES.SIGHTING = {
    CREATED: 'audit.sighting.created',
    UPDATED: 'audit.sighting.updated',
    DELETED: 'audit.sighting.deleted',
    DISMISSED: 'audit.sighting.dismissed',
    REPORTED: 'audit.sighting.reported',
}
```

#### Device Events
```typescript
AUDIT_EVENT_NAMES.DEVICE = {
    REGISTERED: 'audit.device.registered',
    UPDATED: 'audit.device.updated',
    UNREGISTERED: 'audit.device.unregistered',
    PUSH_TOKEN_UPDATED: 'audit.device.push_token_updated',
    LOCATION_UPDATED: 'audit.device.location_updated',
    SETTINGS_UPDATED: 'audit.device.settings_updated',
}
```

#### Saved Zone Events
```typescript
AUDIT_EVENT_NAMES.SAVED_ZONE = {
    CREATED: 'audit.saved_zone.created',
    UPDATED: 'audit.saved_zone.updated',
    DELETED: 'audit.saved_zone.deleted',
    ACTIVATED: 'audit.saved_zone.activated',
    DEACTIVATED: 'audit.saved_zone.deactivated',
}
```

#### Notification Events
```typescript
AUDIT_EVENT_NAMES.NOTIFICATION = {
    QUEUED: 'audit.notification.queued',
    SENT: 'audit.notification.sent',
    DELIVERED: 'audit.notification.delivered',
    OPENED: 'audit.notification.opened',
    FAILED: 'audit.notification.failed',
    EXCLUDED: 'audit.notification.excluded',
    RETRY_ATTEMPTED: 'audit.notification.retry_attempted',
}
```

#### Location Events
```typescript
AUDIT_EVENT_NAMES.LOCATION = {
    UPDATED: 'audit.location.updated',
    GPS_UPDATED: 'audit.location.gps_updated',
    IP_UPDATED: 'audit.location.ip_updated',
    POSTAL_CODE_UPDATED: 'audit.location.postal_code_updated',
}
```

#### Role Events
```typescript
AUDIT_EVENT_NAMES.ROLE = {
    CREATED: 'audit.role.created',
    UPDATED: 'audit.role.updated',
    DELETED: 'audit.role.deleted',
    ASSIGNED: 'audit.role.assigned',
    REVOKED: 'audit.role.revoked',
}
```

#### Gate Events
```typescript
AUDIT_EVENT_NAMES.GATE = {
    CREATED: 'audit.gate.created',
    UPDATED: 'audit.gate.updated',
    DELETED: 'audit.gate.deleted',
    ASSIGNED: 'audit.gate.assigned',
    REVOKED: 'audit.gate.revoked',
    ACTIVATED: 'audit.gate.activated',
    DEACTIVATED: 'audit.gate.deactivated',
}
```

#### Email Events
```typescript
AUDIT_EVENT_NAMES.EMAIL = {
    SENT: 'audit.email.sent',
    FAILED: 'audit.email.failed',
    BOUNCED: 'audit.email.bounced',
    OPENED: 'audit.email.opened',
    CLICKED: 'audit.email.clicked',
}
```

#### System Events
```typescript
AUDIT_EVENT_NAMES.SYSTEM = {
    STARTUP: 'audit.system.startup',
    SHUTDOWN: 'audit.system.shutdown',
    ERROR: 'audit.system.error',
    MAINTENANCE_MODE_ENABLED: 'audit.system.maintenance_mode_enabled',
    MAINTENANCE_MODE_DISABLED: 'audit.system.maintenance_mode_disabled',
    BACKUP_CREATED: 'audit.system.backup_created',
    BACKUP_RESTORED: 'audit.system.backup_restored',
    MIGRATION_EXECUTED: 'audit.system.migration_executed',
}
```

#### Generic Entity Events
```typescript
AUDIT_EVENT_NAMES.ENTITY = {
    CREATED: 'audit.entity.created',
    UPDATED: 'audit.entity.updated',
    DELETED: 'audit.entity.deleted',
    ACCESSED: 'audit.entity.accessed',
    EXPORTED: 'audit.entity.exported',
    IMPORTED: 'audit.entity.imported',
}
```

---

## API Endpoints

All endpoints are protected by `BearerTokenGuard` and require `@Roles('admin')`.

### GET /api/audit-log

**Get Audit Logs (Paginated)**

Retrieve audit logs with optional filters.

**Query Parameters:**
```typescript
{
  page?: number;           // Default: 1
  limit?: number;          // Default: 50 (max: 100)
  eventType?: AuditEventType;  // CREATE, UPDATE, DELETE, ACCESS, AUTH, SYSTEM
  entityType?: AuditEntityType; // USER, ALERT, SIGHTING, DEVICE, etc.
  userId?: number;         // Filter by user
  actorId?: string;        // Filter by actor
  success?: boolean;       // Filter success/failure
  action?: string;         // Filter by action name
  startDate?: string;      // ISO 8601 date
  endDate?: string;        // ISO 8601 date
}
```

**Response:**
```json
{
  "data": [
    {
      "id": 123,
      "eventType": "CREATE",
      "action": "alert_created",
      "entityType": "ALERT",
      "entityId": 456,
      "description": "Created alert for missing DOG: Max",
      "userId": 789,
      "actorId": "789",
      "actorType": "user",
      "success": true,
      "timestamp": "2026-02-07T10:30:00Z",
      "createdAt": "2026-02-07T10:30:00Z",
      "newValues": {
        "petName": "Max",
        "petSpecies": "DOG",
        "status": "ACTIVE"
      }
    }
  ],
  "total": 1234,
  "page": 1,
  "limit": 50,
  "totalPages": 25
}
```

---

### GET /api/audit-log/:id

**Get Single Audit Log**

Retrieve a specific audit log entry by ID.

**Response:**
```json
{
  "id": 123,
  "eventType": "UPDATE",
  "action": "alert_resolved",
  "entityType": "ALERT",
  "entityId": 456,
  "description": "Resolved alert - pet found safe",
  "userId": 789,
  "actorId": "789",
  "actorType": "user",
  "oldValues": { "status": "ACTIVE" },
  "newValues": { "status": "RESOLVED" },
  "success": true,
  "timestamp": "2026-02-07T14:00:00Z"
}
```

---

### GET /api/audit-log/entity/:entityType/:entityId

**Get Entity Audit Trail**

Retrieve complete audit history for a specific entity.

**Parameters:**
- `entityType`: USER | ALERT | SIGHTING | DEVICE | SAVED_ZONE | NOTIFICATION | SESSION | ROLE | GATE | EMAIL | LOCATION | SYSTEM
- `entityId`: Entity ID (number)

**Query Parameters:**
- `limit`: Maximum records (default: 100)

**Example:**
```
GET /api/audit-log/entity/ALERT/456?limit=50
```

**Response:**
```json
[
  {
    "id": 125,
    "eventType": "UPDATE",
    "action": "alert_resolved",
    "entityId": 456,
    "description": "Resolved alert",
    "timestamp": "2026-02-07T14:00:00Z"
  },
  {
    "id": 124,
    "eventType": "UPDATE",
    "action": "alert_renewed",
    "entityId": 456,
    "description": "Renewed alert",
    "timestamp": "2026-02-06T10:00:00Z"
  },
  {
    "id": 123,
    "eventType": "CREATE",
    "action": "alert_created",
    "entityId": 456,
    "description": "Created alert",
    "timestamp": "2026-02-05T09:00:00Z"
  }
]
```

---

### GET /api/audit-log/user/:userId/activity

**Get User Activity**

Retrieve all actions performed by a specific user.

**Parameters:**
- `userId`: User ID (number)

**Query Parameters:**
- `limit`: Maximum records (default: 100)
- `startDate`: ISO 8601 date
- `endDate`: ISO 8601 date

**Example:**
```
GET /api/audit-log/user/789/activity?limit=50&startDate=2026-02-01T00:00:00Z
```

---

### GET /api/audit-log/events/security

**Get Security Events**

Retrieve security-related events (logins, logouts, authentication failures).

**Query Parameters:**
- `limit`: Maximum records (default: 100)
- `startDate`: ISO 8601 date
- `endDate`: ISO 8601 date

**Example:**
```
GET /api/audit-log/events/security?startDate=2026-02-01T00:00:00Z
```

**Response:**
```json
[
  {
    "id": 201,
    "eventType": "AUTH",
    "action": "login_failed",
    "userId": 789,
    "description": "Failed login attempt",
    "success": false,
    "ipAddress": "192.168.1.100",
    "timestamp": "2026-02-07T08:15:00Z"
  },
  {
    "id": 200,
    "eventType": "AUTH",
    "action": "login",
    "userId": 789,
    "description": "User logged in",
    "success": true,
    "ipAddress": "192.168.1.100",
    "timestamp": "2026-02-07T08:20:00Z"
  }
]
```

---

### GET /api/audit-log/events/failed

**Get Failed Operations**

Retrieve all operations that failed (for debugging).

**Query Parameters:**
- `limit`: Maximum records (default: 100)
- `startDate`: ISO 8601 date
- `endDate`: ISO 8601 date

---

### GET /api/audit-log/reports/statistics

**Get Audit Statistics**

Retrieve aggregated statistics for a date range.

**Query Parameters (Required):**
- `startDate`: ISO 8601 date
- `endDate`: ISO 8601 date

**Example:**
```
GET /api/audit-log/reports/statistics?startDate=2026-02-01T00:00:00Z&endDate=2026-02-07T23:59:59Z
```

**Response:**
```json
{
  "totalEvents": 5432,
  "successfulEvents": 5123,
  "failedEvents": 309,
  "eventsByType": {
    "CREATE": 1234,
    "UPDATE": 2345,
    "DELETE": 456,
    "ACCESS": 789,
    "AUTH": 608
  },
  "eventsByEntity": {
    "ALERT": 1890,
    "SIGHTING": 1234,
    "USER": 890,
    "DEVICE": 678,
    "NOTIFICATION": 740
  },
  "topUsers": [
    { "userId": 123, "eventCount": 234 },
    { "userId": 456, "eventCount": 189 }
  ],
  "topActions": [
    { "action": "alert_created", "count": 567 },
    { "action": "sighting_reported", "count": 432 }
  ]
}
```

---

## How to Emit Audit Events

### Step 1: Inject EventEmitter2

In your service, inject `EventEmitter2`:

```typescript
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT_NAMES } from '../audit/audit-event-names';
import type { IAuditEventPayload } from '../audit/interfaces/audit-event-payload.interface';

@Injectable()
export class YourService {
    constructor(
        private readonly eventEmitter: EventEmitter2,
        // ... other dependencies
    ) {}
}
```

### Step 2: Emit Events After DB Operations

**CRITICAL**: Always emit events **AFTER** the database operation succeeds, not before.

**For CREATE operations:**

```typescript
async createEntity(dto: CreateEntityDto, userId: number): Promise<Entity> {
    // 1. Perform database operation
    const entity = await this.prisma.entity.create({
        data: {
            ...dto,
            userId: userId,
        },
    });

    // 2. Emit audit event AFTER success
    try {
        const auditPayload: IAuditEventPayload = {
            eventType: 'CREATE',
            entityType: 'ENTITY',
            entityId: entity.id,
            userId: userId,
            action: 'entity_created',
            description: `Created entity: ${entity.name}`,
            newValues: {
                name: entity.name,
                status: entity.status,
            },
            success: true,
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, auditPayload);
    } catch (error) {
        this.logger.error('Failed to emit audit event:', error);
    }

    return entity;
}
```

**For UPDATE operations:**

```typescript
async updateEntity(
    entityId: number,
    dto: UpdateEntityDto,
    userId: number
): Promise<Entity> {
    // 1. Fetch old values BEFORE update
    const oldEntity = await this.prisma.entity.findUnique({
        where: { id: entityId },
    });

    // 2. Perform update
    const updatedEntity = await this.prisma.entity.update({
        where: { id: entityId },
        data: dto,
    });

    // 3. Emit audit event with old and new values
    try {
        const auditPayload: IAuditEventPayload = {
            eventType: 'UPDATE',
            entityType: 'ENTITY',
            entityId: entityId,
            userId: userId,
            action: 'entity_updated',
            description: `Updated entity: ${updatedEntity.name}`,
            oldValues: {
                name: oldEntity.name,
                status: oldEntity.status,
            },
            newValues: {
                name: updatedEntity.name,
                status: updatedEntity.status,
            },
            success: true,
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
    } catch (error) {
        this.logger.error('Failed to emit audit event:', error);
    }

    return updatedEntity;
}
```

**For DELETE operations:**

```typescript
async deleteEntity(entityId: number, userId: number): Promise<void> {
    // 1. Fetch entity BEFORE deletion
    const entity = await this.prisma.entity.findUnique({
        where: { id: entityId },
    });

    // 2. Perform deletion
    await this.prisma.entity.delete({
        where: { id: entityId },
    });

    // 3. Emit audit event
    try {
        const auditPayload: IAuditEventPayload = {
            eventType: 'DELETE',
            entityType: 'ENTITY',
            entityId: entityId,
            userId: userId,
            action: 'entity_deleted',
            description: `Deleted entity: ${entity.name}`,
            oldValues: {
                name: entity.name,
                status: entity.status,
            },
            success: true,
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.DELETED, auditPayload);
    } catch (error) {
        this.logger.error('Failed to emit audit event:', error);
    }
}
```

**For authentication events:**

```typescript
async login(email: string, password: string): Promise<AuthResponse> {
    try {
        const user = await this.validateCredentials(email, password);
        
        // Success case
        const auditPayload: IAuditEventPayload = {
            eventType: 'AUTH',
            entityType: 'USER',
            entityId: user.id,
            userId: user.id,
            action: 'login',
            description: `User logged in: ${user.email}`,
            success: true,
            ipAddress: this.getIpAddress(),
            userAgent: this.getUserAgent(),
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.USER.LOGIN, auditPayload);
        
        return this.generateTokens(user);
    } catch (error) {
        // Failure case
        const auditPayload: IAuditEventPayload = {
            eventType: 'AUTH',
            entityType: 'USER',
            action: 'login_failed',
            description: `Failed login attempt for: ${email}`,
            success: false,
            errorMessage: error.message,
            ipAddress: this.getIpAddress(),
            userAgent: this.getUserAgent(),
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.USER.LOGIN_FAILED, auditPayload);
        
        throw error;
    }
}
```

### Step 3: Payload Structure

**IAuditEventPayload Interface:**

```typescript
interface IAuditEventPayload {
    // Event classification
    eventType: AuditEventType;  // CREATE, UPDATE, DELETE, ACCESS, AUTH, SYSTEM
    action: string;             // Specific action name (e.g., 'alert_created')
    
    // Entity information
    entityType: AuditEntityType;  // USER, ALERT, SIGHTING, etc.
    entityId?: number;            // Specific entity ID
    
    // Actor information
    userId?: number;              // User who performed the action
    actorId?: string;             // Optional alternate actor identifier
    actorType?: string;           // 'user' | 'system' | 'service' (auto-inferred)
    
    // Descriptive
    description: string;          // Human-readable description
    
    // Values tracking
    oldValues?: Record<string, any>;  // Values before change
    newValues?: Record<string, any>;  // Values after change
    
    // Request context
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    requestId?: string;
    
    // Result
    success?: boolean;            // Default: true
    errorMessage?: string;
    errorStack?: string;
    
    // Additional context
    metadata?: Record<string, any>;
    timestamp?: Date;             // Default: new Date()
}
```

**Important Guidelines:**

1. **Always emit AFTER DB operation succeeds**
2. **Fetch oldValues BEFORE update/delete**
3. **Never include sensitive data** (passwords, tokens, keys)
4. **Use standardized event names** from `AUDIT_EVENT_NAMES`
5. **Wrap emit calls in try-catch** to prevent audit failures from breaking business logic
6. **Provide descriptive `description` field** for human readers
7. **Set `success: false` for failure events** and include `errorMessage`

---

## Query Methods

The `AuditLogService` provides several query methods for retrieving audit logs programmatically (in addition to REST endpoints).

### getAuditLogs()

```typescript
async getAuditLogs(options: {
    page?: number;
    limit?: number;
    eventType?: AuditEventType;
    entityType?: AuditEntityType;
    userId?: number;
    actorId?: string;
    success?: boolean;
    action?: string;
    startDate?: Date;
    endDate?: Date;
}): Promise<{
    data: AuditLog[];
    total: number;
    page: number;
    limit: number;
}>
```

### getEntityAuditTrail()

```typescript
async getEntityAuditTrail(
    entityType: AuditEntityType,
    entityId: number,
    options?: { limit?: number }
): Promise<AuditLog[]>
```

### getUserActivity()

```typescript
async getUserActivity(
    userId: number,
    options?: {
        limit?: number;
        startDate?: Date;
        endDate?: Date;
    }
): Promise<AuditLog[]>
```

### getSecurityEvents()

```typescript
async getSecurityEvents(options?: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
}): Promise<AuditLog[]>
```

### getFailedOperations()

```typescript
async getFailedOperations(options?: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
}): Promise<AuditLog[]>
```

### getAuditStatistics()

```typescript
async getAuditStatistics(
    startDate: Date,
    endDate: Date
): Promise<AuditStatisticsResponseDto>
```

---

## Data Security

### Sensitive Field Redaction

The audit service automatically redacts sensitive fields from `oldValues`, `newValues`, and `metadata`:

**Redacted fields:**
- `password`, `passwordHash`, `password_hash`
- `token`, `accessToken`, `refreshToken`, `idToken`, `access_token`, `refresh_token`
- `apiKey`, `privateKey`, `apiSecret`, `api_key`, `private_key`, `api_secret`
- `fcmToken`, `pushToken`, `push_token`, `fcm_token`
- `secret`

**Example:**

```typescript
// Input payload
{
    oldValues: {
        email: 'user@example.com',
        password: 'secret123'
    }
}

// Stored in database
{
    oldValues: {
        email: 'user@example.com',
        password: '[REDACTED]'
    }
}
```

### Stack Trace Sanitization

Error stack traces are automatically:
- **Truncated** to 10 lines maximum
- **Normalized** with consistent path separators
- **Made relative** to workspace directory

### Actor Type Inference

If `actorType` is not provided, the service automatically infers:
- `'user'` if `userId` is present
- `'system'` if no `userId` is present

---

## Testing

### Test Coverage

The audit module has comprehensive test coverage:

- **25 unit tests** in `audit-log.service.spec.ts`
  - Event handling and DB persistence
  - Sensitive field redaction
  - Stack trace sanitization
  - Actor type inference
  - Error handling (never throws)
  - All query methods

- **14 integration tests** in `audit-log.integration.spec.ts`
  - End-to-end emit → persist flow
  - Wildcard pattern matching
  - Async non-blocking behavior
  - Multiple rapid events
  - Full sanitization flow

- **22 controller tests** in `audit-log.controller.spec.ts`
  - All REST endpoint behaviors
  - Filtering and pagination
  - Entity trail retrieval
  - Statistics aggregation

### Running Tests

```bash
# Run all audit tests
bun test src/audit/

# Run specific test file
bun test src/audit/audit-log.service.spec.ts

# Run with coverage
bun test --coverage src/audit/
```

### Example Test Pattern

```typescript
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT_NAMES } from './audit-event-names';

describe('Audit Event Emission', () => {
    let eventEmitter: EventEmitter2;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                {
                    provide: EventEmitter2,
                    useValue: {
                        emit: jest.fn(),
                    },
                },
            ],
        }).compile();

        eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    });

    it('should emit audit event after entity creation', async () => {
        // Your service logic here
        
        expect(eventEmitter.emit).toHaveBeenCalledWith(
            AUDIT_EVENT_NAMES.ENTITY.CREATED,
            expect.objectContaining({
                eventType: 'CREATE',
                entityType: 'ENTITY',
                success: true,
            })
        );
    });
});
```

---

## Best Practices

### ✅ DO

1. **Emit events AFTER database operations succeed**
   ```typescript
   const entity = await this.prisma.entity.create({ data });
   this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, payload);
   ```

2. **Fetch old values BEFORE updates/deletes**
   ```typescript
   const oldEntity = await this.prisma.entity.findUnique({ where: { id } });
   const updated = await this.prisma.entity.update({ where: { id }, data });
   ```

3. **Use standardized event names from AUDIT_EVENT_NAMES**
   ```typescript
   this.eventEmitter.emit(AUDIT_EVENT_NAMES.ALERT.CREATED, payload);
   ```

4. **Wrap emit calls in try-catch**
   ```typescript
   try {
       this.eventEmitter.emit(eventName, payload);
   } catch (error) {
       this.logger.error('Failed to emit audit event:', error);
   }
   ```

5. **Provide descriptive `description` field**
   ```typescript
   description: `Created alert for missing ${species}: ${name}`
   ```

6. **Set `success: false` for failure events**
   ```typescript
   success: false,
   errorMessage: error.message
   ```

7. **Include relevant context (IP, user agent, session ID)**
   ```typescript
   ipAddress: req.ip,
   userAgent: req.headers['user-agent'],
   sessionId: req.session?.id
   ```

### ❌ DON'T

1. **Don't emit events BEFORE database operations**
   ```typescript
   // ❌ WRONG
   this.eventEmitter.emit(eventName, payload);
   const entity = await this.prisma.entity.create({ data });
   ```

2. **Don't include sensitive data in payload**
   ```typescript
   // ❌ WRONG
   newValues: {
       email: 'user@example.com',
       password: 'plain-text-password'  // Will be redacted anyway
   }
   ```

3. **Don't call AuditLogService directly**
   ```typescript
   // ❌ WRONG
   await this.auditLogService.createAuditLog(payload);
   
   // ✅ CORRECT
   this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, payload);
   ```

4. **Don't use hardcoded event names**
   ```typescript
   // ❌ WRONG
   this.eventEmitter.emit('audit.alert.created', payload);
   
   // ✅ CORRECT
   this.eventEmitter.emit(AUDIT_EVENT_NAMES.ALERT.CREATED, payload);
   ```

5. **Don't let audit failures break business logic**
   ```typescript
   // ✅ CORRECT - wrapped in try-catch
   try {
       this.eventEmitter.emit(eventName, payload);
   } catch (error) {
       this.logger.error('Audit emit failed:', error);
   }
   ```

6. **Don't fetch entity after update just for audit logging**
   ```typescript
   // ❌ WRONG - unnecessary extra query
   const updated = await this.prisma.entity.update({ where: { id }, data });
   const fullEntity = await this.prisma.entity.findUnique({ where: { id } });
   
   // ✅ CORRECT - use the update result
   const updated = await this.prisma.entity.update({ where: { id }, data });
   newValues: { name: updated.name }
   ```

---

## Configuration

### Required Setup

The audit module requires proper EventEmitter2 configuration in AppModule:

```typescript
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuditModule } from './audit/audit.module';

@Module({
    imports: [
        // CRITICAL: wildcard must be enabled for audit.**
        EventEmitterModule.forRoot({
            wildcard: true,      // ← Required for audit.** pattern
            delimiter: '.',      // ← Required for dot notation
            maxListeners: 10,
            verboseMemoryLeak: true,
        }),
        
        AuditModule,  // ← Import AuditModule
        
        // ... other modules
    ],
})
export class AppModule {}
```

### Database Schema

The audit module uses the `AuditLog` model in Prisma:

```prisma
model AuditLog {
  id           Int               @id @default(autoincrement())
  eventType    AuditEventType
  action       String
  entityType   AuditEntityType?
  entityId     Int?
  description  String
  userId       Int?
  actorId      String?
  actorType    String?           @default("user")
  oldValues    Json?
  newValues    Json?
  ipAddress    String?
  userAgent    String?
  sessionId    String?
  requestId    String?
  success      Boolean           @default(true)
  errorMessage String?
  errorStack   String?
  metadata     Json?
  timestamp    DateTime          @default(now())
  createdAt    DateTime          @default(now())
  
  user         User?             @relation(fields: [userId], references: [id], onDelete: SetNull)
  
  @@index([eventType])
  @@index([entityType, entityId])
  @@index([userId])
  @@index([timestamp])
  @@index([success])
  @@map("audit_logs")
}
```

**Recommended Indexes:**
- `eventType` - for filtering by event type
- `entityType, entityId` - for entity audit trails
- `userId` - for user activity queries
- `timestamp` - for time-range queries
- `success` - for failure analysis

---

## Troubleshooting

### Issue: Audit events not being persisted

**Solution:**
1. Verify `EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })` in AppModule
2. Verify `AuditModule` is imported in AppModule
3. Check that event names start with `'audit.'` prefix
4. Check application logs for audit service errors

### Issue: Sensitive data appearing in audit logs

**Solution:**
1. Verify field names match `SENSITIVE_FIELDS` constant
2. Add custom field names to the redaction list if needed
3. Check that you're not logging raw password hashes

### Issue: Audit events not captured

**Solution:**
1. Ensure you're using `AUDIT_EVENT_NAMES` constants (not hardcoded strings)
2. Verify event names match the `'audit.**'` wildcard pattern
3. Check that EventEmitter2 is properly injected in your service

### Issue: Duplicate audit entries

**Solution:**
1. Verify you're not emitting the same event multiple times
2. Check for duplicate event listeners in your module
3. Review service methods for redundant emit calls

---

## Related Documentation

- [SYSTEM_BEHAVIOR_SPEC.md](../SYSTEM_BEHAVIOR_SPEC.md) - System behavior specifications
- [API_CONTRACT.md](../API_CONTRACT.md) - API endpoint contracts
- [SECURITY_AUDIT_REPORT.md](../SECURITY_AUDIT_REPORT.md) - Security audit findings
- [LOGGING.md](../LOGGING.md) - Application logging guidelines

---

## Support

For questions or issues related to the Audit Module:
1. Check this documentation first
2. Review test files for usage examples
3. Check application logs for error details
4. Contact the backend team

---

**Last Updated:** February 7, 2026  
**Version:** 1.0.0  
**Maintainers:** FiFi Alert Backend Team
