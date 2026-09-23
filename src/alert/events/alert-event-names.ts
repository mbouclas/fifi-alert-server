/**
 * Alert status lifecycle event names.
 * Emitted by AlertStatusEventPublisher whenever an alert changes status.
 * Kept outside the `audit.**` namespace so the audit listener ignores them.
 */
export enum AlertEventNames {
  /** Emitted for every status change, alongside the status-specific event */
  STATUS_CHANGED = 'alert.status.changed',
  /** Alert went live (currently on creation) */
  ACTIVATED = 'alert.status.activated',
  /** Alert resolved by its creator or because the pet was marked found */
  RESOLVED = 'alert.status.resolved',
  /** Alert withdrawn by its creator */
  CANCELLED = 'alert.status.cancelled',
  /** Alert auto-expired by the expiration cron */
  EXPIRED = 'alert.status.expired',
}
