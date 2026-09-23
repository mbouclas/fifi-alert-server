import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AlertEventNames } from '../alert-event-names';
import type { AlertExpiredEvent } from '../alert-status-changed.event';

/**
 * Handles EXPIRED alert status changes.
 */
@Injectable()
export class AlertExpiredHandler {
  private readonly logger = new Logger(AlertExpiredHandler.name);

  @OnEvent(AlertEventNames.EXPIRED, { async: true })
  handle(event: AlertExpiredEvent): void {
    this.logger.log(
      `Alert ${event.alertId} ${event.previousStatus ?? 'NEW'} -> ${event.newStatus} (source: ${event.source}, by: ${event.changedBy ?? 'system'})`,
    );
    this.logger.debug(JSON.stringify(event));
  }
}
