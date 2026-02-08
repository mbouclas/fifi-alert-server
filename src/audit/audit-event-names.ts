/**
 * Audit Event Names
 *
 * Standardized event names for the audit log system.
 * All events follow the pattern: audit.{entity}.{action}
 *
 * @module AuditEventNames
 */

export const AUDIT_EVENT_NAMES = {
  // User Events
  USER: {
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
  },

  // Session Events
  SESSION: {
    CREATED: 'audit.session.created',
    REFRESHED: 'audit.session.refreshed',
    EXPIRED: 'audit.session.expired',
    REVOKED: 'audit.session.revoked',
    IMPERSONATION_STARTED: 'audit.session.impersonation_started',
    IMPERSONATION_ENDED: 'audit.session.impersonation_ended',
  },

  // Alert Events
  ALERT: {
    CREATED: 'audit.alert.created',
    UPDATED: 'audit.alert.updated',
    DELETED: 'audit.alert.deleted',
    PUBLISHED: 'audit.alert.published',
    RESOLVED: 'audit.alert.resolved',
    EXPIRED: 'audit.alert.expired',
    RENEWED: 'audit.alert.renewed',
    STATUS_CHANGED: 'audit.alert.status_changed',
  },

  // Sighting Events
  SIGHTING: {
    CREATED: 'audit.sighting.created',
    UPDATED: 'audit.sighting.updated',
    DELETED: 'audit.sighting.deleted',
    DISMISSED: 'audit.sighting.dismissed',
    REPORTED: 'audit.sighting.reported',
  },

  // Device Events
  DEVICE: {
    REGISTERED: 'audit.device.registered',
    UPDATED: 'audit.device.updated',
    UNREGISTERED: 'audit.device.unregistered',
    PUSH_TOKEN_UPDATED: 'audit.device.push_token_updated',
    LOCATION_UPDATED: 'audit.device.location_updated',
    SETTINGS_UPDATED: 'audit.device.settings_updated',
  },

  // Saved Zone Events
  SAVED_ZONE: {
    CREATED: 'audit.saved_zone.created',
    UPDATED: 'audit.saved_zone.updated',
    DELETED: 'audit.saved_zone.deleted',
    ACTIVATED: 'audit.saved_zone.activated',
    DEACTIVATED: 'audit.saved_zone.deactivated',
  },

  // Notification Events
  NOTIFICATION: {
    QUEUED: 'audit.notification.queued',
    SENT: 'audit.notification.sent',
    DELIVERED: 'audit.notification.delivered',
    OPENED: 'audit.notification.opened',
    FAILED: 'audit.notification.failed',
    EXCLUDED: 'audit.notification.excluded',
    RETRY_ATTEMPTED: 'audit.notification.retry_attempted',
  },

  // Location Events
  LOCATION: {
    UPDATED: 'audit.location.updated',
    GPS_UPDATED: 'audit.location.gps_updated',
    IP_UPDATED: 'audit.location.ip_updated',
    POSTAL_CODE_UPDATED: 'audit.location.postal_code_updated',
  },

  // Role Events
  ROLE: {
    CREATED: 'audit.role.created',
    UPDATED: 'audit.role.updated',
    DELETED: 'audit.role.deleted',
    ASSIGNED: 'audit.role.assigned',
    REVOKED: 'audit.role.revoked',
  },

  // Gate Events
  GATE: {
    CREATED: 'audit.gate.created',
    UPDATED: 'audit.gate.updated',
    DELETED: 'audit.gate.deleted',
    ASSIGNED: 'audit.gate.assigned',
    REVOKED: 'audit.gate.revoked',
    ACTIVATED: 'audit.gate.activated',
    DEACTIVATED: 'audit.gate.deactivated',
  },

  // Email Events
  EMAIL: {
    SENT: 'audit.email.sent',
    FAILED: 'audit.email.failed',
    BOUNCED: 'audit.email.bounced',
    OPENED: 'audit.email.opened',
    CLICKED: 'audit.email.clicked',
  },

  // System Events
  SYSTEM: {
    STARTUP: 'audit.system.startup',
    SHUTDOWN: 'audit.system.shutdown',
    ERROR: 'audit.system.error',
    MAINTENANCE_MODE_ENABLED: 'audit.system.maintenance_mode_enabled',
    MAINTENANCE_MODE_DISABLED: 'audit.system.maintenance_mode_disabled',
    BACKUP_CREATED: 'audit.system.backup_created',
    BACKUP_RESTORED: 'audit.system.backup_restored',
    MIGRATION_EXECUTED: 'audit.system.migration_executed',
  },

  // Generic Entity Events (for use with custom entities)
  ENTITY: {
    CREATED: 'audit.entity.created',
    UPDATED: 'audit.entity.updated',
    DELETED: 'audit.entity.deleted',
    ACCESSED: 'audit.entity.accessed',
    EXPORTED: 'audit.entity.exported',
    IMPORTED: 'audit.entity.imported',
  },
} as const;

/**
 * Type representing all possible audit event names
 */
export type AuditEventName =
  | (typeof AUDIT_EVENT_NAMES.USER)[keyof typeof AUDIT_EVENT_NAMES.USER]
  | (typeof AUDIT_EVENT_NAMES.SESSION)[keyof typeof AUDIT_EVENT_NAMES.SESSION]
  | (typeof AUDIT_EVENT_NAMES.ALERT)[keyof typeof AUDIT_EVENT_NAMES.ALERT]
  | (typeof AUDIT_EVENT_NAMES.SIGHTING)[keyof typeof AUDIT_EVENT_NAMES.SIGHTING]
  | (typeof AUDIT_EVENT_NAMES.DEVICE)[keyof typeof AUDIT_EVENT_NAMES.DEVICE]
  | (typeof AUDIT_EVENT_NAMES.SAVED_ZONE)[keyof typeof AUDIT_EVENT_NAMES.SAVED_ZONE]
  | (typeof AUDIT_EVENT_NAMES.NOTIFICATION)[keyof typeof AUDIT_EVENT_NAMES.NOTIFICATION]
  | (typeof AUDIT_EVENT_NAMES.LOCATION)[keyof typeof AUDIT_EVENT_NAMES.LOCATION]
  | (typeof AUDIT_EVENT_NAMES.ROLE)[keyof typeof AUDIT_EVENT_NAMES.ROLE]
  | (typeof AUDIT_EVENT_NAMES.GATE)[keyof typeof AUDIT_EVENT_NAMES.GATE]
  | (typeof AUDIT_EVENT_NAMES.EMAIL)[keyof typeof AUDIT_EVENT_NAMES.EMAIL]
  | (typeof AUDIT_EVENT_NAMES.SYSTEM)[keyof typeof AUDIT_EVENT_NAMES.SYSTEM]
  | (typeof AUDIT_EVENT_NAMES.ENTITY)[keyof typeof AUDIT_EVENT_NAMES.ENTITY];
