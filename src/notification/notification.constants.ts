export const NOTIFICATION_QUEUE = 'notification-queue';

/**
 * Escalation waves.
 *
 * A single blast to every match maximises noise on alerts that resolve in ten minutes.
 * Instead we stage delivery by confidence and re-check that the alert is still ACTIVE
 * before each wave fires — which is also how a wave gets "cancelled": a resolved alert
 * simply short-circuits.
 */
export const ESCALATION_WAVES = [
  { wave: 'HIGH' as const, delayMs: 0 },
  { wave: 'MEDIUM' as const, delayMs: 15 * 60 * 1000 },
  { wave: 'LOW' as const, delayMs: 60 * 60 * 1000 },
];

/** Quiet hours, local time. Anything below HIGH confidence is held back. */
export const QUIET_HOURS_START = 22; // 22:00
export const QUIET_HOURS_END = 7; // 07:00

/** Maximum notifications a single user may receive in a rolling 24h window, per tier. */
export const DAILY_CAP_BY_CONFIDENCE: Record<string, number> = {
  HIGH: 10,
  MEDIUM: 5,
  LOW: 2,
};

/** Canonical exclusion reason codes, recorded on the Notification row for auditing. */
export const EXCLUSION_REASONS = {
  PUSH_TOKEN_MISSING: 'PUSH_TOKEN_MISSING',
  QUIET_HOURS: 'QUIET_HOURS',
  DAILY_CAP: 'DAILY_CAP',
  ALREADY_NOTIFIED: 'ALREADY_NOTIFIED',
} as const;
