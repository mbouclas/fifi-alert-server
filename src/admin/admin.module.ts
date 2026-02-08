import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { SharedModule } from '../shared/shared.module';
import { UserModule } from '../user/user.module';
import { AuthEndpointsModule } from '../auth/auth.module';

@Module({
  imports: [SharedModule, UserModule, AuthEndpointsModule],
  controllers: [AdminController],
})
export class AdminModule {}
