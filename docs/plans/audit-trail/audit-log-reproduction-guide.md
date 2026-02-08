# Audit Log System — Reproduction Guide for AI Coding Agents

**Purpose:** Step-by-step guide to reproduce our event-driven audit log system in any NestJS + Prisma application.  
**Target Audience:** AI coding agents implementing this pattern in a new NestJS codebase.  
**Last Updated:** February 7, 2026

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & Dependencies](#2-prerequisites--dependencies)
3. [Database Schema (Prisma)](#3-database-schema-prisma)
4. [NestJS Module Wiring](#4-nestjs-module-wiring)
5. [Core Components](#5-core-components)
   - 5.1 [Audit Event Names Enum](#51-audit-event-names-enum)
   - 5.2 [Audit Event Payload Interface](#52-audit-event-payload-interface)
   - 5.3 [Audit Log Service (Event Listener)](#53-audit-log-service-event-listener)
   - 5.4 [Audit Log Controller (REST API)](#54-audit-log-controller-rest-api)
   - 5.5 [Audit Module](#55-audit-module)
   - 5.6 [DTOs](#56-dtos)
6. [Integration Patterns](#6-integration-patterns)
   - 6.1 [Prisma Service CRUD (Create/Update/Delete)](#61-prisma-service-crud-createupdatedelete)
   - 6.2 [Email Service Logging](#62-email-service-logging)
   - 6.3 [Controller-Level Auth Events](#63-controller-level-auth-events)
7. [Critical Rules & Gotchas](#7-critical-rules--gotchas)
8. [Testing](#8-testing)
9. [File Structure Summary](#9-file-structure-summary)

---

## 1. Architecture Overview

The audit system is **event-driven**, built on the NestJS Event Emitter (`@nestjs/event-emitter`). It uses the wildcard listener pattern so a single service catches all audit events.

```
┌────────────────────────────────┐
│  Any Service / Controller      │
│  (UserService, EmailService,   │
│   AuthController, etc.)        │
└──────────────┬─────────────────┘
               │
               │  this.eventEmitter.emit(
               │    AuditEventNames.ENTITY_CREATED,
               │    { ...payload } as IAuditEventPayload
               │  )
               │
               ▼
┌──────────────────────────────────────────┐
│  AuditLogService                         │
│  @OnEvent('audit.**', { async: true })   │
│                                          │
│  1. Sanitizes sensitive fields           │
│  2. Infers actor type                    │
│  3. Writes to DB via Prisma              │
│  4. NEVER throws (try/catch + log)       │
└──────────────────────────────────────────┘
               │
               ▼
┌──────────────────────┐
│  audit_logs table     │
│  (PostgreSQL/Prisma)  │
└──────────────────────┘
```

### Why Events Over Decorators/Interceptors?

| Aspect              | Event-Based (what we use)                          | Decorator-Based                                  |
|---------------------|-----------------------------------------------------|---------------------------------------------------|
| **Works everywhere** | ✅ Services, controllers, cron jobs, workers         | ❌ Only in HTTP controller context                 |
| **Decoupled**        | ✅ Emitter doesn't know about audit service          | ❌ Tight coupling                                  |
| **Transaction safe** | ✅ Emit after DB commit                              | ❌ May log before rollback                         |
| **Async by default** | ✅ `{ async: true }` — non-blocking                  | ⚠️ Depends on implementation                      |
| **Fail-safe**        | ✅ Listener catches errors; app flow unaffected      | ❌ Harder to guarantee                             |

---

## 2. Prerequisites & Dependencies

### NPM Packages

```bash
# The event emitter is the core mechanism
npm install @nestjs/event-emitter

# Prisma for database access (if not already installed)
npm install prisma @prisma/client

# For controller DTOs
npm install class-validator class-transformer @nestjs/swagger
```

**Exact version we use:** `"@nestjs/event-emitter": "^3.0.1"`

### NestJS Modules You Must Have

- `PrismaService` — a standard NestJS-injectable wrapper around `PrismaClient`
- A `SharedModule` (or equivalent) that registers `EventEmitterModule.forRoot()`

---

## 3. Database Schema (Prisma)

Add these to your `schema.prisma` file. The enums and model are **exactly** what our system uses.

### 3.1 Enums

```prisma
enum AuditEventType {
  CREATE
  UPDATE
  DELETE
  LOGIN
  LOGOUT
  ACCESS
  EXPORT
  IMPORT
  APPROVAL
  REJECTION
  SEND
  RECEIVE
  ACTIVATION
  DEACTIVATION
  ROTATION
  REVOCATION
  RESET
  FAILURE
  SUCCESS
  SYSTEM
}

enum AuditEntityType {
  USER
  CARD_HOLDER
  BRAND
  DISCOUNT
  STORE_LOCATION
  SESSION
  API_KEY
  ROLE
  GRANT
  CARD_USAGE
  EMAIL
  NOTIFICATION
  CODEPENDENT_REQUEST
  USER_BRAND_ACCESS
  SEASON
  SYSTEM
}
```

> **Customization:** Adjust `AuditEntityType` values to match the models in your application. `AuditEventType` is generic enough to reuse as-is.

### 3.2 AuditLog Model

```prisma
model AuditLog {
  id           Int              @id @default(autoincrement())
  
  // Event classification
  eventType    AuditEventType
  entityType   AuditEntityType?
  entityId     Int?
  
  // Actor information (who performed the action)
  userId       Int?
  actorType    String?          @db.VarChar(50)   // 'user', 'system', 'api_key', 'cron'
  actorId      String?          @db.VarChar(100)
  
  // Request context (for HTTP-based actions)
  ipAddress    String?          @db.VarChar(45)   // IPv6 compatible
  userAgent    String?
  sessionId    String?          @db.VarChar(255)
  requestId    String?          @db.VarChar(64)   // Correlation ID
  
  // Action details
  action       String           @db.VarChar(100)  // 'login', 'create_user', 'send_email'
  description  String?                             // Human-readable
  
  // Data changes (JSON — flexible schema for any entity)
  oldValues    Json?                               // State before update/delete
  newValues    Json?                               // State after create/update
  
  // Additional metadata (event-specific)
  metadata     Json?                               // Email recipient, error codes, etc.
  
  // Result
  success      Boolean          @default(true)
  errorMessage String?
  errorStack   String?
  
  // Timing
  timestamp    DateTime         @default(now())
  
  // Relation to User (optional — allows JOINs for queries)
  user         User?            @relation(fields: [userId], references: [id])

  // Indexes — critical for query performance
  @@index([eventType, timestamp])
  @@index([entityType, entityId, timestamp])
  @@index([userId, timestamp])
  @@index([actorId, actorType, timestamp])
  @@index([success, timestamp])
  @@index([sessionId])
  @@index([action, timestamp])
  @@map("audit_logs")
}
```

> **Important:** The `user` relation requires a corresponding `auditLogs AuditLog[]` field on your `User` model. Add it:
> ```prisma
> model User {
>   // ... existing fields ...
>   auditLogs AuditLog[]
> }
> ```

### 3.3 Run the Migration

```bash
npx prisma migrate dev --name add_audit_log_system
npx prisma generate
```

---

## 4. NestJS Module Wiring

The wiring follows this chain:

```
AppModule
  ├── imports: [SharedModule, ..., AuditModule]
  │
  SharedModule
  │   ├── imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.', ... })]
  │   ├── providers: [PrismaService, ...]
  │   └── exports: [PrismaService, ...]
  │
  AuditModule
      ├── imports: [SharedModule]        ← gets PrismaService
      ├── providers: [AuditLogService]   ← the event listener
      ├── controllers: [AuditLogController]
      └── exports: [AuditLogService]     ← optional, for direct injection
```

### 4.1 EventEmitterModule Configuration (in SharedModule)

This is the **critical** configuration. It MUST be registered with `wildcard: true` for the `audit.**` pattern to work.

```typescript
// src/shared/shared.module.ts
import { Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,       // REQUIRED — enables 'audit.**' pattern matching
      delimiter: '.',       // REQUIRED — events use dot notation: 'audit.user.login'
      verboseMemoryLeak: true,
      maxListeners: 50,
    }),
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class SharedModule {
  // Optional: static reference for non-DI contexts (e.g., MailgunService)
  public static eventEmitter: EventEmitter2;

  constructor(private eventEmitter: EventEmitter2) {
    SharedModule.eventEmitter = this.eventEmitter;
  }
}
```

> **Key detail:** The `wildcard: true` and `delimiter: '.'` settings are what allow the AuditLogService to listen with `@OnEvent('audit.**')` and catch every event whose name starts with `audit.`.

### 4.2 AppModule

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { SharedModule } from './shared/shared.module';
import { AuditModule } from './audit/audit.module';
// ... other imports

@Module({
  imports: [
    SharedModule,   // Must come first — provides EventEmitterModule and PrismaService
    AuditModule,    // Registers the listener
    // ... other modules
  ],
})
export class AppModule {}
```

---

## 5. Core Components

### 5.1 Audit Event Names Enum

This enum defines all event name strings. Every service emits events using these constants — never raw strings.

```typescript
// src/audit/audit-event-names.ts

/**
 * Event names for the NestJS Event Emitter.
 * Naming convention: audit.{entity}.{action}
 *
 * The AuditLogService listens for 'audit.**' and catches all of these.
 */
export enum AuditEventNames {
  // Authentication & Authorization
  USER_LOGIN = 'audit.user.login',
  USER_LOGIN_FAILED = 'audit.user.login_failed',
  USER_LOGOUT = 'audit.user.logout',
  PASSWORD_CHANGED = 'audit.user.password_changed',
  PASSWORD_RESET_REQUESTED = 'audit.user.password_reset_requested',
  ACCOUNT_ACTIVATED = 'audit.user.account_activated',

  // Entity CRUD (generic — entityType in the payload distinguishes them)
  ENTITY_CREATED = 'audit.entity.created',
  ENTITY_UPDATED = 'audit.entity.updated',
  ENTITY_DELETED = 'audit.entity.deleted',

  // Email & Notifications
  EMAIL_SENT = 'audit.email.sent',
  EMAIL_FAILED = 'audit.email.failed',
  NOTIFICATION_SENT = 'audit.notification.sent',

  // System Actions
  API_KEY_CREATED = 'audit.apikey.created',
  API_KEY_REVOKED = 'audit.apikey.revoked',
  SESSION_CREATED = 'audit.session.created',
  SESSION_EXPIRED = 'audit.session.expired',
  SYSTEM_ACTION = 'audit.system.action',
}
```

### 5.2 Audit Event Payload Interface

This is the **contract** between emitters and the listener. Every `eventEmitter.emit()` call should cast its second argument as `IAuditEventPayload`.

```typescript
// src/audit/interfaces/audit-event-payload.interface.ts
import { AuditEventType, AuditEntityType } from '@prisma/client'; // or '@prisma-lib/client'

export interface IAuditEventPayload {
  // === Required ===
  eventType: AuditEventType;     // CREATE, UPDATE, DELETE, LOGIN, SEND, FAILURE, etc.
  action: string;                // 'create_user', 'send_email', 'user_login', etc.

  // === Entity (optional) ===
  entityType?: AuditEntityType;  // USER, BRAND, EMAIL, etc.
  entityId?: number;             // DB ID of the affected entity

  // === Actor (optional) ===
  userId?: number;               // null for system actions
  actorType?: string;            // 'user', 'system', 'api_key', 'cron'
  actorId?: string;              // User ID as string, or 'system', or API key ID

  // === Data Changes (optional) ===
  oldValues?: any;               // State before update/delete (EXCLUDE passwords/tokens)
  newValues?: any;               // State after create/update (EXCLUDE passwords/tokens)
  metadata?: any;                // Event-specific: email recipient, error code, etc.

  // === Result (optional) ===
  success?: boolean;             // Defaults to true in the service
  errorMessage?: string;
  errorStack?: string;

  // === Request Context (optional — for HTTP actions) ===
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;

  // === Description (optional) ===
  description?: string;          // Human-readable: "User john@example.com logged in"
}
```

### 5.3 Audit Log Service (Event Listener)

This is the **heart** of the system. It has one wildcard event listener that catches every `audit.*` event asynchronously.

```typescript
// src/audit/audit-log.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../services/prisma.service'; // adjust path
import { AuditEventType, AuditEntityType, Prisma } from '@prisma/client';
import type { IAuditEventPayload } from './interfaces/audit-event-payload.interface';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  /** Fields whose values must never appear in audit logs */
  private readonly SENSITIVE_FIELDS = [
    'password',
    'passwordHash',
    'secret',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'privateKey',
    'apiSecret',
    'fcmToken',
  ];

  constructor(private readonly prisma: PrismaService) {}

  // ================================================================
  // THE WILDCARD LISTENER — This is the single entry point
  // ================================================================

  /**
   * Catches ALL events matching 'audit.**' (wildcard).
   * Runs asynchronously — never blocks the emitter.
   * NEVER throws — errors are logged but never propagated.
   */
  @OnEvent('audit.**', { async: true })
  async handleAuditEvent(payload: IAuditEventPayload): Promise<void> {
    try {
      await this.createAuditLog(payload);
    } catch (error) {
      // CRITICAL: Never rethrow — audit failures must NOT break application flow
      this.logger.error(
        `Failed to create audit log for action "${payload.action}": ${error.message}`,
        error.stack,
      );
    }
  }

  // ================================================================
  // PRIVATE: Persist to database
  // ================================================================

  private async createAuditLog(payload: IAuditEventPayload): Promise<void> {
    const sanitized = this.sanitizePayload(payload);
    const sanitizedStack = sanitized.errorStack
      ? this.sanitizeStackTrace(sanitized.errorStack)
      : null;
    const actorType = sanitized.actorType || this.inferActorType(sanitized);

    await this.prisma.auditLog.create({
      data: {
        eventType: sanitized.eventType,
        entityType: sanitized.entityType || null,
        entityId: sanitized.entityId || null,
        userId: sanitized.userId || null,
        actorType: actorType,
        actorId: sanitized.actorId || null,
        ipAddress: sanitized.ipAddress || null,
        userAgent: sanitized.userAgent || null,
        sessionId: sanitized.sessionId || null,
        requestId: sanitized.requestId || null,
        action: sanitized.action,
        description: sanitized.description || null,
        oldValues: sanitized.oldValues || null,
        newValues: sanitized.newValues || null,
        metadata: sanitized.metadata || null,
        success: sanitized.success !== false, // Default to true
        errorMessage: sanitized.errorMessage || null,
        errorStack: sanitizedStack,
      },
    });

    this.logger.debug(
      `Audit log created: ${sanitized.action} (${sanitized.eventType})`,
    );
  }

  // ================================================================
  // PRIVATE: Sanitization
  // ================================================================

  private sanitizePayload(payload: IAuditEventPayload): IAuditEventPayload {
    const sanitized = { ...payload };

    if (sanitized.oldValues) {
      sanitized.oldValues = this.removeSensitiveFields(sanitized.oldValues);
    }
    if (sanitized.newValues) {
      sanitized.newValues = this.removeSensitiveFields(sanitized.newValues);
    }
    if (sanitized.metadata) {
      sanitized.metadata = this.removeSensitiveFields(sanitized.metadata);
    }

    return sanitized;
  }

  private removeSensitiveFields(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeSensitiveFields(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const isSensitive = this.SENSITIVE_FIELDS.some((field) =>
        key.toLowerCase().includes(field.toLowerCase()),
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.removeSensitiveFields(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private sanitizeStackTrace(stack: string): string {
    if (!stack) return '';
    return stack
      .split('\n')
      .slice(0, 10)
      .map((line) => line.replace(/\/[^\s]*\/src\//g, 'src/'))
      .join('\n');
  }

  private inferActorType(payload: IAuditEventPayload): string {
    if (payload.userId) return 'user';
    if (payload.actorId === 'system') return 'system';
    if (payload.action.includes('cron') || payload.action.includes('scheduled')) return 'cron';
    return 'system';
  }

  // ================================================================
  // PUBLIC: Query Methods (used by Controller)
  // ================================================================

  async getAuditLogs(filters?: {
    eventType?: AuditEventType;
    entityType?: AuditEntityType;
    entityId?: number;
    userId?: number;
    actorType?: string;
    success?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const where: any = {};

    if (filters?.eventType) where.eventType = filters.eventType;
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId !== undefined) where.entityId = filters.entityId;
    if (filters?.userId !== undefined) where.userId = filters.userId;
    if (filters?.actorType) where.actorType = filters.actorType;
    if (filters?.success !== undefined) where.success = filters.success;

    if (filters?.startDate || filters?.endDate) {
      where.timestamp = {};
      if (filters.startDate) where.timestamp.gte = filters.startDate;
      if (filters.endDate) where.timestamp.lte = filters.endDate;
    }

    return this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, first_name: true, last_name: true },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: filters?.limit || 100,
      skip: filters?.offset || 0,
    });
  }

  async getEntityAuditTrail(entityType: AuditEntityType, entityId: number): Promise<any[]> {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: {
        user: {
          select: { id: true, email: true, first_name: true, last_name: true },
        },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  async getUserActivity(userId: number, days: number = 30): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.prisma.auditLog.findMany({
      where: { userId, timestamp: { gte: startDate } },
      orderBy: { timestamp: 'desc' },
    });
  }

  async getSecurityEvents(filters?: {
    userId?: number;
    startDate?: Date;
    endDate?: Date;
    onlyFailed?: boolean;
  }): Promise<any[]> {
    const where: any = {
      eventType: {
        in: [
          AuditEventType.LOGIN,
          AuditEventType.LOGOUT,
          AuditEventType.ACCESS,
          AuditEventType.ACTIVATION,
          AuditEventType.DEACTIVATION,
          AuditEventType.RESET,
        ],
      },
    };
    if (filters?.userId !== undefined) where.userId = filters.userId;
    if (filters?.onlyFailed) where.success = false;
    if (filters?.startDate || filters?.endDate) {
      where.timestamp = {};
      if (filters?.startDate) where.timestamp.gte = filters.startDate;
      if (filters?.endDate) where.timestamp.lte = filters.endDate;
    }

    return this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, first_name: true, last_name: true },
        },
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  async getFailedOperations(
    entityType?: AuditEntityType,
    startDate?: Date,
  ): Promise<any[]> {
    const where: any = { success: false };
    if (entityType) where.entityType = entityType;
    if (startDate) where.timestamp = { gte: startDate };

    return this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, first_name: true, last_name: true },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
  }

  async getAuditStatistics(startDate: Date, endDate: Date) {
    const where = { timestamp: { gte: startDate, lte: endDate } };

    const [totalLogs, successfulOps, failedOps, uniqueUsers, eventBreakdown] =
      await Promise.all([
        this.prisma.auditLog.count({ where }),
        this.prisma.auditLog.count({ where: { ...where, success: true } }),
        this.prisma.auditLog.count({ where: { ...where, success: false } }),
        this.prisma.auditLog.findMany({
          where: { ...where, userId: { not: null } },
          select: { userId: true },
          distinct: ['userId'],
        }),
        this.prisma.auditLog.groupBy({
          by: ['eventType'],
          where,
          _count: true,
        }),
      ]);

    const successRate = totalLogs > 0 ? (successfulOps / totalLogs) * 100 : 0;

    return {
      totalLogs,
      successfulOps,
      failedOps,
      successRate: Math.round(successRate * 100) / 100,
      uniqueUsers: uniqueUsers.length,
      eventTypeBreakdown: eventBreakdown.map((item: any) => ({
        eventType: item.eventType,
        count: item._count,
      })),
    };
  }

  // ================================================================
  // findMany / findOne (used by controller for paginated access)
  // ================================================================

  async findMany(
    where: any = {},
    limit: number = 10,
    offset: number = 0,
    include: string[] = [],
    orderBy: string = 'timestamp',
    orderDir: 'asc' | 'desc' = 'desc',
  ) {
    const query: any = {
      take: limit,
      skip: offset,
      where,
      orderBy: { [orderBy]: orderDir },
    };

    if (include.includes('user')) {
      query.include = {
        user: {
          select: { id: true, email: true, first_name: true, last_name: true },
        },
      };
    }

    const [count, results] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany(query),
    ]);

    return {
      data: results,
      meta: {
        count,
        limit,
        offset,
        pages: Math.ceil(count / limit),
        page: Math.floor(offset / limit) + 1,
      },
    };
  }

  async findOne(where: any, include: string[] = []) {
    const query: any = { where };
    if (include.includes('user')) {
      query.include = {
        user: {
          select: { id: true, email: true, first_name: true, last_name: true },
        },
      };
    }
    return this.prisma.auditLog.findUnique(query);
  }
}
```

### 5.4 Audit Log Controller (REST API)

Exposes read-only endpoints. In production, protect with admin-only guards.

```typescript
// src/audit/audit-log.controller.ts
import {
  Controller, Get, Param, Query,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { AuditEventType, AuditEntityType } from '@prisma/client';

@ApiTags('Audit Logs')
@Controller('api/audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('')
  @ApiOperation({ summary: 'Get paginated audit logs with filters' })
  async findMany(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('page') page?: number,
    @Query('include') include: string[] = [],
    @Query('orderBy', new DefaultValuePipe('timestamp')) orderBy: string = 'timestamp',
    @Query('orderDir', new DefaultValuePipe('desc')) orderDir: 'asc' | 'desc' = 'desc',
    @Query('eventType') eventType?: AuditEventType,
    @Query('entityType') entityType?: AuditEntityType,
    @Query('entityId') entityId?: number,
    @Query('userId') userId?: number,
    @Query('actorType') actorType?: string,
    @Query('success') success?: boolean,
    @Query('action') action?: string,
  ) {
    if (page) offset = (page - 1) * limit;

    const where: any = {};
    if (eventType) where.eventType = eventType;
    if (entityType) where.entityType = entityType;
    if (entityId !== undefined) where.entityId = Number(entityId);
    if (userId !== undefined) where.userId = Number(userId);
    if (actorType) where.actorType = actorType;
    if (success !== undefined) where.success = success === true || (success as any) === 'true';
    if (action) where.action = action;

    return this.auditLogService.findMany(
      where, limit, offset,
      Array.isArray(include) ? include : [include].filter(Boolean),
      orderBy, orderDir,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('include') include: string[] = [],
  ) {
    return this.auditLogService.findOne(
      { id },
      Array.isArray(include) ? include : [include].filter(Boolean),
    );
  }

  @Get('entity/:entityType/:entityId')
  async getEntityAuditTrail(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseIntPipe) entityId: number,
  ) {
    return this.auditLogService.getEntityAuditTrail(
      entityType as AuditEntityType,
      entityId,
    );
  }

  @Get('user/:userId/activity')
  async getUserActivity(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number = 30,
  ) {
    return this.auditLogService.getUserActivity(userId, days);
  }

  @Get('events/security')
  async getSecurityEvents(
    @Query('userId') userId?: number,
    @Query('onlyFailed') onlyFailed?: boolean,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = {};
    if (userId !== undefined) filters.userId = Number(userId);
    if (onlyFailed !== undefined) filters.onlyFailed = onlyFailed === true || (onlyFailed as any) === 'true';
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    return this.auditLogService.getSecurityEvents(filters);
  }

  @Get('events/failed')
  async getFailedOperations(
    @Query('entityType') entityType?: string,
    @Query('startDate') startDate?: string,
  ) {
    return this.auditLogService.getFailedOperations(
      entityType as AuditEntityType,
      startDate ? new Date(startDate) : undefined,
    );
  }

  @Get('reports/statistics')
  async getStatistics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.auditLogService.getAuditStatistics(
      new Date(startDate),
      new Date(endDate),
    );
  }
}
```

### 5.5 Audit Module

```typescript
// src/audit/audit.module.ts
import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';
import { SharedModule } from '../shared/shared.module'; // provides PrismaService

@Module({
  imports: [SharedModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
```

### 5.6 DTOs

```typescript
// src/audit/dto/audit-log-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsNumber, IsBoolean, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditEventType, AuditEntityType } from '@prisma/client';

export class AuditLogQueryDto {
  @ApiPropertyOptional({ enum: AuditEventType })
  @IsOptional()
  @IsEnum(AuditEventType)
  eventType?: AuditEventType;

  @ApiPropertyOptional({ enum: AuditEntityType })
  @IsOptional()
  @IsEnum(AuditEntityType)
  entityType?: AuditEntityType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  entityId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  userId?: number;

  @ApiPropertyOptional({ enum: ['user', 'system', 'api_key', 'cron'] })
  @IsOptional()
  actorType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  success?: boolean;

  @ApiPropertyOptional({ description: 'ISO 8601 date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  offset?: number;
}
```

### Barrel Export

```typescript
// src/audit/index.ts
export { AuditModule } from './audit.module';
export { AuditLogService } from './audit-log.service';
export { AuditLogController } from './audit-log.controller';
export { AuditEventNames } from './audit-event-names';
export { AuditLogQueryDto } from './dto/audit-log-query.dto';
export type { IAuditEventPayload } from './interfaces/audit-event-payload.interface';
```

---

## 6. Integration Patterns

Any service that needs to emit audit events should:
1. Inject `EventEmitter2` via constructor
2. Import `AuditEventNames` and `IAuditEventPayload`
3. Import the Prisma enums `AuditEventType` and `AuditEntityType`
4. Call `this.eventEmitter.emit(...)` **after** the DB operation succeeds (or in catch blocks for failure logging)

### 6.1 Prisma Service CRUD (Create/Update/Delete)

This is the most common pattern. Here's a complete example for a `UserService`:

#### CREATE Example

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, User, AuditEventType, AuditEntityType } from '@prisma/client';
import { PrismaService } from '../services/prisma.service';
import { AuditEventNames } from '../audit/audit-event-names';
import type { IAuditEventPayload } from '../audit/interfaces/audit-event-payload.interface';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2, // <-- inject EventEmitter2
  ) {}

  async store(data: Prisma.UserCreateInput, roleNames: string[] = []): Promise<User> {
    let user: User;

    try {
      user = await this.prisma.user.create({ data: { ...data, password: hashedPassword } });
    } catch (e: any) {
      // Log FAILED creation
      this.eventEmitter.emit(
        AuditEventNames.ENTITY_CREATED,
        {
          eventType: AuditEventType.CREATE,
          entityType: AuditEntityType.USER,
          action: 'create_user',
          description: 'Failed to create user',
          newValues: {
            email: data.email,
            first_name: data.first_name,
            last_name: data.last_name,
          },
          success: false,
          errorMessage: e.message,
          errorStack: e.stack,
          metadata: { roles: roleNames },
        } as IAuditEventPayload,
      );
      throw e;
    }

    // Log SUCCESSFUL creation
    this.eventEmitter.emit(
      AuditEventNames.ENTITY_CREATED,
      {
        eventType: AuditEventType.CREATE,
        entityType: AuditEntityType.USER,
        entityId: user.id,
        userId: user.id,
        action: 'create_user',
        description: `User created (ID: ${user.id}, Email: ${user.email})`,
        newValues: {
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          active: user.active,
          // DO NOT include: password, tokens, secrets
        },
        success: true,
        metadata: {
          roles: roleNames,
          hasPassword: !!data.password,
        },
      } as IAuditEventPayload,
    );

    return user;
  }
}
```

**Key points:**
- Emit **after** `prisma.user.create()` succeeds — ensures we don't log rollback-ed operations
- In the `catch` block, emit with `success: false` before re-throwing
- `newValues` should **never** contain `password`, `token`, `apiKey`, etc.

#### UPDATE Example

```typescript
async update(
  where: Prisma.UserWhereUniqueInput,
  data: Prisma.UserUpdateInput,
): Promise<User> {
  // Step 1: Fetch the CURRENT state (for oldValues in the audit log)
  let oldUser: User | null = null;
  try {
    oldUser = await this.prisma.user.findUnique({ where });
  } catch (e) {
    this.logger.error(`Failed to fetch old user data for audit: ${e.message}`);
  }

  try {
    // Step 2: Perform the update
    const updatedUser = await this.prisma.user.update({ where, data });

    // Step 3: Emit success audit event
    this.eventEmitter.emit(
      AuditEventNames.ENTITY_UPDATED,
      {
        eventType: AuditEventType.UPDATE,
        entityType: AuditEntityType.USER,
        entityId: updatedUser.id,
        userId: updatedUser.id,
        action: 'update_user',
        description: `User profile updated (ID: ${updatedUser.id})`,
        oldValues: oldUser ? {
          email: oldUser.email,
          first_name: oldUser.first_name,
          last_name: oldUser.last_name,
          active: oldUser.active,
          meta: oldUser.meta,
          settings: oldUser.settings,
        } : null,
        newValues: data,
        success: true,
        metadata: {
          updatedFields: Object.keys(data as object),
        },
      } as IAuditEventPayload,
    );

    return updatedUser;
  } catch (e: any) {
    // Step 4: Emit failure audit event
    this.eventEmitter.emit(
      AuditEventNames.ENTITY_UPDATED,
      {
        eventType: AuditEventType.UPDATE,
        entityType: AuditEntityType.USER,
        entityId: oldUser?.id,
        action: 'update_user',
        description: 'Failed to update user profile',
        newValues: data,
        success: false,
        errorMessage: e.message,
        errorStack: e.stack,
        metadata: { attemptedFields: Object.keys(data as object) },
      } as IAuditEventPayload,
    );
    throw e;
  }
}
```

**Key pattern for UPDATE:** Always fetch `oldValues` BEFORE the update. This gives you a complete diff in the audit log.

#### DELETE Example

```typescript
async remove(where: Prisma.UserWhereUniqueInput): Promise<User> {
  // Step 1: Fetch entity BEFORE deletion (for audit trail)
  let userToDelete: User | null = null;
  try {
    userToDelete = await this.prisma.user.findUnique({ where });
  } catch (e) {
    this.logger.error(`Failed to fetch user data before deletion for audit: ${e.message}`);
  }

  try {
    const result = await this.prisma.user.delete({ where });

    // Emit success
    this.eventEmitter.emit(
      AuditEventNames.ENTITY_DELETED,
      {
        eventType: AuditEventType.DELETE,
        entityType: AuditEntityType.USER,
        entityId: userToDelete?.id,
        userId: userToDelete?.id,
        action: 'delete_user',
        description: `User deleted (ID: ${userToDelete?.id}, Email: ${userToDelete?.email})`,
        oldValues: userToDelete ? {
          email: userToDelete.email,
          first_name: userToDelete.first_name,
          last_name: userToDelete.last_name,
          active: userToDelete.active,
          cardNumber: userToDelete.cardNumber,
        } : null,
        success: true,
      } as IAuditEventPayload,
    );

    return result;
  } catch (e: any) {
    // Emit failure
    this.eventEmitter.emit(
      AuditEventNames.ENTITY_DELETED,
      {
        eventType: AuditEventType.DELETE,
        entityType: AuditEntityType.USER,
        entityId: userToDelete?.id,
        action: 'delete_user',
        description: 'Failed to delete user',
        success: false,
        errorMessage: e.message,
        errorStack: e.stack,
      } as IAuditEventPayload,
    );
    throw e;
  }
}
```

**Key pattern for DELETE:** Always fetch the full entity BEFORE deleting, so `oldValues` preserves the data for the audit trail.

---

### 6.2 Email Service Logging

Email logging uses a **two-step event chain**:

1. `EmailService.send()` calls the mail provider, then emits a **domain event** (`EmailEventNames.EMAIL_SENT`)
2. `EmailService` itself listens for that domain event via `@OnEvent(EmailEventNames.EMAIL_SENT)` and re-emits it as an **audit event** (`AuditEventNames.EMAIL_SENT` or `AuditEventNames.EMAIL_FAILED`)

This two-step pattern decouples the sending logic from audit concerns.

```typescript
// src/shared/email/email.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AuditEventNames } from '../../audit/audit-event-names';
import { AuditEventType, AuditEntityType } from '@prisma/client';
import type { IAuditEventPayload } from '../../audit/interfaces/audit-event-payload.interface';
import { SharedModule } from '../shared.module';

export enum EmailEventNames {
  EMAIL_SENT = 'EMAIL_SENT',
}

export interface IEmailSentEventPayload {
  to: string | string[];
  result: { id: string; message: string; status?: number };
  payload?: Record<string, any>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly mailProvider: MailProviderService, // your Mailgun, SendGrid, etc.
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ================================================================
  // STEP 2: Listen for domain event, re-emit as audit event
  // ================================================================
  @OnEvent(EmailEventNames.EMAIL_SENT)
  handleEmailSentEvent(payload: IEmailSentEventPayload): void {
    const recipients = Array.isArray(payload.to) ? payload.to.join(', ') : payload.to;
    const isSuccess = payload.result.status === 200 || payload.result.status === undefined;

    this.eventEmitter.emit(
      isSuccess ? AuditEventNames.EMAIL_SENT : AuditEventNames.EMAIL_FAILED,
      {
        eventType: isSuccess ? AuditEventType.SEND : AuditEventType.FAILURE,
        entityType: AuditEntityType.EMAIL,
        action: 'send_email',
        success: isSuccess,
        description: isSuccess
          ? `Email sent successfully to ${recipients}`
          : `Email failed to send to ${recipients}`,
        metadata: {
          messageId: payload.result.id,
          recipient: payload.to,
          subject: payload.payload?.subject,
          template: payload.payload?.templateData ? 'template-based' : 'direct',
          status: payload.result.status,
        },
      } as IAuditEventPayload,
    );
  }

  // ================================================================
  // STEP 1: Send email, emit domain event on completion
  // ================================================================
  async send(data: IEmailMessageData): Promise<IEmailSendResult> {
    try {
      const result = await this.mailProvider.send(data);

      const emailResult = {
        id: result.id || '',
        message: result.message || '',
        status: result.status,
      };

      // Emit domain event (NOT audit event directly)
      SharedModule.eventEmitter.emit(EmailEventNames.EMAIL_SENT, {
        to: data.to,
        result: emailResult,
        payload: { ...data, html: undefined }, // strip large HTML body
      } as IEmailSentEventPayload);

      return emailResult;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      throw error;
    }
  }
}
```

**Why the two-step pattern?**
- The `send()` method stays focused on delivery
- Audit logging is handled by the event listener
- Other listeners can also react to `EMAIL_SENT` (analytics, retries, etc.)
- `SharedModule.eventEmitter` is used because `send()` might be called from contexts where DI isn't fully available (e.g., static factory methods)

**Alternative (simpler, single-step):** If you don't need the domain event, you can emit audit events directly:

```typescript
async send(data: IEmailMessageData): Promise<IEmailSendResult> {
  try {
    const result = await this.mailProvider.send(data);

    this.eventEmitter.emit(AuditEventNames.EMAIL_SENT, {
      eventType: AuditEventType.SEND,
      entityType: AuditEntityType.EMAIL,
      actorType: 'system',
      actorId: 'email_service',
      action: 'send_email',
      description: `Email sent to ${data.to}`,
      metadata: { to: data.to, subject: data.subject, messageId: result.id },
      success: true,
    } as IAuditEventPayload);

    return result;
  } catch (error) {
    this.eventEmitter.emit(AuditEventNames.EMAIL_FAILED, {
      eventType: AuditEventType.FAILURE,
      entityType: AuditEntityType.EMAIL,
      actorType: 'system',
      actorId: 'email_service',
      action: 'send_email_failed',
      description: `Failed to send email to ${data.to}`,
      metadata: { to: data.to, subject: data.subject },
      success: false,
      errorMessage: error.message,
    } as IAuditEventPayload);

    throw error;
  }
}
```

---

### 6.3 Controller-Level Auth Events

Auth events (login, logout, password changes) are typically emitted from controllers because they have access to the HTTP request context (IP, user agent, session).

```typescript
// src/auth/auth.controller.ts
import { Controller, Post, Body, Req } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditEventNames } from '../audit/audit-event-names';
import { AuditEventType, AuditEntityType } from '@prisma/client';
import type { IAuditEventPayload } from '../audit/interfaces/audit-event-payload.interface';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post('login')
  async login(@Body() data: LoginDto, @Req() request: Request) {
    try {
      const { user, session } = await this.authService.login(data.email, data.password);

      // Emit login success
      this.eventEmitter.emit(AuditEventNames.USER_LOGIN, {
        eventType: AuditEventType.LOGIN,
        entityType: AuditEntityType.USER,
        entityId: user.id,
        userId: user.id,
        action: 'user_login',
        description: `User ${data.email} logged in`,
        metadata: { email: data.email },
        ipAddress: request.ip || request.headers['x-forwarded-for'],
        userAgent: request.headers['user-agent'],
        sessionId: session.token,
        success: true,
      } as IAuditEventPayload);

      return session;
    } catch (error) {
      // Emit login failure (no userId — we don't know who they are)
      this.eventEmitter.emit(AuditEventNames.USER_LOGIN_FAILED, {
        eventType: AuditEventType.LOGIN,
        entityType: AuditEntityType.USER,
        action: 'user_login_failed',
        description: `Failed login attempt for ${data.email}`,
        metadata: { email: data.email, reason: error.message },
        ipAddress: request.ip || request.headers['x-forwarded-for'],
        userAgent: request.headers['user-agent'],
        success: false,
        errorMessage: error.message,
      } as IAuditEventPayload);

      throw error;
    }
  }
}
```

---

## 7. Critical Rules & Gotchas

### MUST DO

1. **`EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })`** — Without this, `@OnEvent('audit.**')` won't match anything.

2. **`{ async: true }` on the `@OnEvent` decorator** — This makes the listener non-blocking. Without it, slow DB writes could block the emitting service.

3. **NEVER throw from `handleAuditEvent`** — Wrap the entire body in try/catch. If audit logging fails, the application must continue normally.

4. **Emit AFTER the DB operation** — Don't emit before `prisma.create()` completes. If the DB operation fails, you'd have a false positive in the audit log.

5. **Fetch `oldValues` BEFORE update/delete** — For UPDATE and DELETE, you must read the current state before mutating it.

6. **NEVER log sensitive data** — The `SENSITIVE_FIELDS` array in `AuditLogService` auto-strips `password`, `token`, `secret`, `apiKey`, etc. But emitters should also avoid including them in `newValues`/`oldValues` as a first line of defense.

7. **All events must start with `audit.`** — The wildcard listener uses `'audit.**'`. If your event name doesn't start with `audit.`, it won't be captured.

### COMMON MISTAKES

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Forgetting `wildcard: true` in `EventEmitterModule.forRoot()` | No events are caught by `@OnEvent('audit.**')` | Add `wildcard: true, delimiter: '.'` |
| Emitting before DB commit | Audit log records operations that were rolled back | Move `emit()` after successful `prisma.create/update/delete` |
| Throwing from `handleAuditEvent` | Application crash if DB is down | Wrap in try/catch, only log errors |
| Logging passwords in `newValues` | Security violation | Exclude sensitive fields; use sanitization as backup |
| Not importing `AuditModule` in `AppModule` | `AuditLogService` never instantiated, events are lost | Add `AuditModule` to `AppModule.imports` |
| Using `@OnEvent('audit.*')` (single wildcard) | Only matches one level (e.g., `audit.login` but NOT `audit.user.login`) | Use `audit.**` (double wildcard) for multi-level matching |

---

## 8. Testing

### Unit Test for AuditLogService

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../services/prisma.service';
import { AuditEventType, AuditEntityType } from '@prisma/client';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: PrismaService,
          useValue: {
            auditLog: {
              create: jest.fn().mockResolvedValue({ id: 1 }),
              findMany: jest.fn().mockResolvedValue([]),
              count: jest.fn().mockResolvedValue(0),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should create audit log entry', async () => {
    await service.handleAuditEvent({
      eventType: AuditEventType.CREATE,
      action: 'create_user',
      entityType: AuditEntityType.USER,
      entityId: 1,
      success: true,
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: AuditEventType.CREATE,
          action: 'create_user',
        }),
      }),
    );
  });

  it('should redact sensitive fields', async () => {
    await service.handleAuditEvent({
      eventType: AuditEventType.CREATE,
      action: 'create_user',
      newValues: { email: 'test@example.com', password: 'secret123' },
    });

    const createCall = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.newValues.password).toBe('[REDACTED]');
    expect(createCall.data.newValues.email).toBe('test@example.com');
  });

  it('should NOT throw when database write fails', async () => {
    (prisma.auditLog.create as jest.Mock).mockRejectedValue(new Error('DB down'));

    // This should NOT throw
    await expect(
      service.handleAuditEvent({
        eventType: AuditEventType.LOGIN,
        action: 'login',
      }),
    ).resolves.not.toThrow();
  });

  it('should default success to true when not provided', async () => {
    await service.handleAuditEvent({
      eventType: AuditEventType.CREATE,
      action: 'create_brand',
    });

    const createCall = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.success).toBe(true);
  });

  it('should infer actorType as "user" when userId is present', async () => {
    await service.handleAuditEvent({
      eventType: AuditEventType.UPDATE,
      action: 'update_user',
      userId: 42,
    });

    const createCall = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.actorType).toBe('user');
  });

  it('should infer actorType as "system" when no userId', async () => {
    await service.handleAuditEvent({
      eventType: AuditEventType.SEND,
      action: 'send_email',
    });

    const createCall = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.actorType).toBe('system');
  });
});
```

### Integration Test (Verifying End-to-End Event Flow)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../services/prisma.service';
import { AuditEventNames } from './audit-event-names';
import { AuditEventType, AuditEntityType } from '@prisma/client';

describe('Audit Log Integration', () => {
  let eventEmitter: EventEmitter2;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
      ],
      providers: [
        AuditLogService,
        {
          provide: PrismaService,
          useValue: {
            auditLog: {
              create: jest.fn().mockResolvedValue({ id: 1 }),
            },
          },
        },
      ],
    }).compile();

    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should persist audit log when event is emitted', async () => {
    eventEmitter.emit(AuditEventNames.ENTITY_CREATED, {
      eventType: AuditEventType.CREATE,
      entityType: AuditEntityType.USER,
      entityId: 99,
      action: 'create_user',
      success: true,
    });

    // Wait for async event processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: 99,
          action: 'create_user',
        }),
      }),
    );
  });
});
```

---

## 9. File Structure Summary

```
src/
  audit/
    index.ts                                    # Barrel exports
    audit.module.ts                             # NestJS module definition
    audit-event-names.ts                        # Enum of all event name strings
    audit-log.service.ts                        # Event listener + query methods
    audit-log.controller.ts                     # REST API for querying logs
    interfaces/
      audit-event-payload.interface.ts          # IAuditEventPayload interface
    dto/
      audit-log-query.dto.ts                    # Query filter DTO
      audit-log-response.dto.ts                 # Response DTO for Swagger

  shared/
    shared.module.ts                            # Registers EventEmitterModule.forRoot()
    prisma.service.ts                           # PrismaClient wrapper

prisma/
  schema.prisma                                 # Contains AuditLog model + enums
```

---

## Checklist for Reproduction

- [ ] Install `@nestjs/event-emitter`
- [ ] Add `AuditEventType` and `AuditEntityType` enums to `schema.prisma`
- [ ] Add `AuditLog` model to `schema.prisma`
- [ ] Add `auditLogs AuditLog[]` relation to your `User` model
- [ ] Run `prisma migrate dev` and `prisma generate`
- [ ] Register `EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })` in `SharedModule`
- [ ] Create `src/audit/audit-event-names.ts`
- [ ] Create `src/audit/interfaces/audit-event-payload.interface.ts`
- [ ] Create `src/audit/audit-log.service.ts` with `@OnEvent('audit.**', { async: true })`
- [ ] Create `src/audit/audit-log.controller.ts`
- [ ] Create `src/audit/audit.module.ts`
- [ ] Import `AuditModule` in `AppModule`
- [ ] Inject `EventEmitter2` in services that need audit logging
- [ ] Emit events after successful Prisma operations
- [ ] Emit events with `success: false` in catch blocks
- [ ] Write unit tests for `AuditLogService`
- [ ] Verify events flow end-to-end with integration test
