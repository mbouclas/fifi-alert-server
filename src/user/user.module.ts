import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { AlertZoneService } from './alert-zone.service';
import { AlertZoneCacheService } from './alert-zone-cache.service';
import { SharedModule } from '@shared/shared.module';
import { UserController } from './user.controller';
import { PetModule } from '../pet/pet.module';

@Module({
  imports: [SharedModule, forwardRef(() => PetModule)],
  providers: [UserService, AlertZoneService, AlertZoneCacheService],
  exports: [UserService, AlertZoneService, AlertZoneCacheService],
  controllers: [UserController],
})
export class UserModule { }
