import { Module } from '@nestjs/common';
import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';
import { AlertOwnerGuard } from './guards';
import { PrismaService } from '../services/prisma.service';
import { AuthEndpointsModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { RateLimitService } from './rate-limit.service';
import { SharedModule } from '../shared/shared.module';
import { NotificationModule } from '../notification/notification.module';
import { AlertEventsModule, ALERT_STATUS_HANDLERS } from './events';

@Module({
  imports: [
    AuthEndpointsModule,
    UploadModule,
    SharedModule,
    NotificationModule,
    AlertEventsModule,
  ],
  controllers: [AlertController],
  providers: [
    AlertService,
    AlertOwnerGuard,
    PrismaService,
    RateLimitService,
    ...ALERT_STATUS_HANDLERS,
  ],
  exports: [AlertService],
})
export class AlertModule {}
