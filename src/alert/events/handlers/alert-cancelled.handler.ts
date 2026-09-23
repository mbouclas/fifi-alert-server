import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AlertEventNames } from '../alert-event-names';
import type { AlertCancelledEvent } from '../alert-status-changed.event';

/**
 * Handles CANCELLED alert status changes.
 */
@Injectable()
export class AlertCancelledHandler {
  private readonly logger = new Logger(AlertCancelledHandler.name);

  @OnEvent(AlertEventNames.CANCELLED, { async: true })
  handle(event: AlertCancelledEvent): void {
    this.logger.log(
      `Alert ${event.alertId} ${event.previousStatus ?? 'NEW'} -> ${event.newStatus} (source: ${event.source}, by: ${event.changedBy ?? 'system'})`,
    );
    this.logger.debug(JSON.stringify(event));
  }
}
