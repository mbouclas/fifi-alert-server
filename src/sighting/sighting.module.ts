import { Module } from '@nestjs/common';
import { SightingController } from './sighting.controller';
import { SightingService } from './sighting.service';
import { PrismaService } from '../services/prisma.service';
import { AlertModule } from '../alert/alert.module';
import { AuthEndpointsModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { UploadModule } from '../upload/upload.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    AlertModule,
    AuthEndpointsModule,
    NotificationModule,
    UploadModule,
    SharedModule,
  ],
  controllers: [SightingController],
  providers: [SightingService, PrismaService],
  exports: [SightingService],
})
export class SightingModule { }
