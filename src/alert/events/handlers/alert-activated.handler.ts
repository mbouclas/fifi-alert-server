import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AlertEventNames } from '../alert-event-names';
import type { AlertActivatedEvent } from '../alert-status-changed.event';

/**
 * Handles ACTIVATED alert status changes.
 */
@Injectable()
export class AlertActivatedHandler {
  private readonly logger = new Logger(AlertActivatedHandler.name);

  @OnEvent(AlertEventNames.ACTIVATED, { async: true })
  handle(event: AlertActivatedEvent): void {
    this.logger.log(
      `Alert ${event.alertId} ${event.previousStatus ?? 'NEW'} -> ${event.newStatus} (source: ${event.source}, by: ${event.changedBy ?? 'system'})`,
    );
    this.logger.debug(JSON.stringify(event));
  }
}
