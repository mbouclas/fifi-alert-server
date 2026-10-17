import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '@shared/shared.module';
import { AuthEndpointsModule } from '../auth/auth.module';
import { I18nModule } from '../i18n/i18n.module';
import { InvitationService } from './invitation.service';
import { InvitationController } from './invitation.controller';

/**
 * "Invite a friend" (BACKEND_WORK_ORDER_INVITATIONS.md).
 *
 * Conversion tracking is wired through auth domain events
 * (`USER_REGISTERED`, `EMAIL_VERIFIED`), so the auth module never depends on
 * this one.
 */
@Module({
  imports: [SharedModule, forwardRef(() => AuthEndpointsModule), I18nModule],
  providers: [InvitationService],
  controllers: [InvitationController],
  exports: [InvitationService],
})
export class InvitationModule {}
