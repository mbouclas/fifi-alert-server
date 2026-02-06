import { Module } from '@nestjs/common';
import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';
import { AlertOwnerGuard } from './guards';
import { PrismaService } from '../services/prisma.service';
import { AuthEndpointsModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { RateLimitService } from './rate-limit.service';

@Module({
    imports: [AuthEndpointsModule, UploadModule],
    controllers: [AlertController],
    providers: [AlertService, AlertOwnerGuard, PrismaService, RateLimitService],
    exports: [AlertService],
})
export class AlertModule { }
