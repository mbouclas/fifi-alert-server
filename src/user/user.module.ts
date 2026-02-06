import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { SharedModule } from '@shared/shared.module';
import { UserController } from './user.controller';

@Module({
  imports: [SharedModule],
  providers: [UserService],
  exports: [UserService],
  controllers: [UserController],
})
export class UserModule {}
