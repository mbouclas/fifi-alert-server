import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { AlertStatusEventPublisher } from './alert-status-event.publisher';

/**
 * Provides the alert status event publisher.
 * Kept separate from AlertModule so other modules (e.g. PetModule) can
 * publish alert events without importing AlertModule.
 */
@Module({
  imports: [SharedModule],
  providers: [AlertStatusEventPublisher],
  exports: [AlertStatusEventPublisher],
})
export class AlertEventsModule {}
