import { AlertStatus } from '../../generated/prisma';

/** What triggered the status change */
export type AlertStatusChangeSource = 'user' | 'pet_found' | 'system_expiry';

/**
 * Common payload for every alert status change event
 */
export interface AlertStatusChangedEvent {
  alertId: number;
  petId: number | null;
  creatorId: number;
  /** null when the alert did not exist before (creation) */
  previousStatus: AlertStatus | null;
  newStatus: AlertStatus;
  /** User who triggered the change; null for system-driven changes */
  changedBy: number | null;
  source: AlertStatusChangeSource;
  occurredAt: Date;
}

export type AlertActivatedEvent = AlertStatusChangedEvent;

export interface AlertResolvedEvent extends AlertStatusChangedEvent {
  outcome?: string;
  notes?: string;
  shareSuccessStory?: boolean;
}

export interface AlertCancelledEvent extends AlertStatusChangedEvent {
  reason?: string;
}

export type AlertExpiredEvent = AlertStatusChangedEvent;

/** Event input without the fields the publisher fills in */
export type AlertEventInput<T extends AlertStatusChangedEvent> = Omit<
  T,
  'newStatus' | 'occurredAt'
> & { occurredAt?: Date };
