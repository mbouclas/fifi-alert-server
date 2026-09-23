import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertStatus } from '../../generated/prisma';
import { AlertEventNames } from './alert-event-names';
import {
  AlertActivatedEvent,
  AlertCancelledEvent,
  AlertEventInput,
  AlertExpiredEvent,
  AlertResolvedEvent,
  AlertStatusChangedEvent,
} from './alert-status-changed.event';

/**
 * Single entry point for publishing alert status change events.
 * Each method emits the status-specific event plus the generic
 * STATUS_CHANGED event. Publishing never throws.
 */
@Injectable()
export class AlertStatusEventPublisher {
  private readonly logger = new Logger(AlertStatusEventPublisher.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  activated(input: AlertEventInput<AlertActivatedEvent>): void {
    this.publish(AlertEventNames.ACTIVATED, AlertStatus.ACTIVE, input);
  }

  resolved(input: AlertEventInput<AlertResolvedEvent>): void {
    this.publish(AlertEventNames.RESOLVED, AlertStatus.RESOLVED, input);
  }

  cancelled(input: AlertEventInput<AlertCancelledEvent>): void {
    this.publish(AlertEventNames.CANCELLED, AlertStatus.CANCELLED, input);
  }

  expired(input: AlertEventInput<AlertExpiredEvent>): void {
    this.publish(AlertEventNames.EXPIRED, AlertStatus.EXPIRED, input);
  }

  private publish<T extends AlertStatusChangedEvent>(
    eventName: AlertEventNames,
    newStatus: AlertStatus,
    input: AlertEventInput<T>,
  ): void {
    const event = {
      ...input,
      newStatus,
      occurredAt: input.occurredAt ?? new Date(),
    } as T;

    try {
      this.eventEmitter.emit(eventName, event);
      this.eventEmitter.emit(AlertEventNames.STATUS_CHANGED, event);
    } catch (error) {
      this.logger.error(
        `Failed to publish ${eventName} for alert ${input.alertId}:`,
        error,
      );
    }
  }
}
