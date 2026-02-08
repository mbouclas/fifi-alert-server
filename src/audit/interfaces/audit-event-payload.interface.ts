/**
 * Audit Event Payload Interface
 *
 * Defines the structure of event payloads for the audit log system.
 * All audit events should conform to this interface.
 *
 * @module IAuditEventPayload
 */

import { AuditEventType, AuditEntityType } from '../../generated/prisma';

/**
 * Payload structure for audit events
 */
export interface IAuditEventPayload {
  // Event Classification (required)
  /** Type of audit event (CREATE, UPDATE, DELETE, LOGIN, etc.) */
  eventType: AuditEventType;

  /** Human-readable action description (e.g., "user_login", "alert_created") */
  action: string;

  // Entity Information (optional)
  /** Type of entity affected (USER, ALERT, DEVICE, etc.) */
  entityType?: AuditEntityType;

  /** ID of the entity affected */
  entityId?: number;

  /** Human-readable description of what happened */
  description?: string;

  // Actor Information (optional)
  /** ID of the user who performed the action */
  userId?: number;

  /** ID of the actor (can be non-user: system, cron, api_key) */
  actorId?: string;

  /** Type of actor performing the action */
  actorType?: 'user' | 'system' | 'api_key' | 'cron' | 'webhook';

  // State Changes (optional)
  /** Previous state before the action (for UPDATE/DELETE) */
  oldValues?: Record<string, any>;

  /** New state after the action (for CREATE/UPDATE) */
  newValues?: Record<string, any>;

  // Request Context (optional)
  /** IP address of the request */
  ipAddress?: string;

  /** User agent string from the request */
  userAgent?: string;

  /** Session ID associated with the action */
  sessionId?: string;

  /** Unique request ID for tracing */
  requestId?: string;

  // Result Information
  /** Whether the operation succeeded */
  success?: boolean;

  /** Error message if the operation failed */
  errorMessage?: string;

  /** Stack trace if an error occurred */
  errorStack?: string;

  // Additional Metadata (optional)
  /**
   * Additional context specific to the action
   * Examples:
   * - For notifications: { confidence: 'HIGH', distance_km: 2.5 }
   * - For location updates: { source: 'GPS', accuracy: 10 }
   * - For login: { method: 'email', 2fa_enabled: true }
   */
  metadata?: Record<string, any>;

  /** Timestamp of the event (defaults to now if not provided) */
  timestamp?: Date;
}

/**
 * Helper type for partial audit payloads (used for convenience functions)
 */
export type PartialAuditPayload = Partial<IAuditEventPayload> & {
  eventType: AuditEventType;
  action: string;
};
