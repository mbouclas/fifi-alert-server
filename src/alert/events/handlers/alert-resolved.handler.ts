import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AlertEventNames } from '../alert-event-names';
import type { AlertResolvedEvent } from '../alert-status-changed.event';

/**
 * Handles RESOLVED alert status changes.
 */
@Injectable()
export class AlertResolvedHandler {
  private readonly logger = new Logger(AlertResolvedHandler.name);

  @OnEvent(AlertEventNames.RESOLVED, { async: true })
  handle(event: AlertResolvedEvent): void {
    this.logger.log(
      `Alert ${event.alertId} ${event.previousStatus ?? 'NEW'} -> ${event.newStatus} (source: ${event.source}, by: ${event.changedBy ?? 'system'})`,
    );
    this.logger.debug(JSON.stringify(event));
  }
}
