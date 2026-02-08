import { Module } from '@nestjs/common';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';
import { SavedZoneService } from './saved-zone.service';
import { PrismaService } from '../services/prisma.service';
import { AuthEndpointsModule } from '../auth/auth.module';

@Module({
  imports: [AuthEndpointsModule],
  controllers: [DeviceController],
  providers: [DeviceService, SavedZoneService, PrismaService],
  exports: [DeviceService, SavedZoneService],
})
export class DeviceModule {}
