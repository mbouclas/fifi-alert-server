import { Module } from '@nestjs/common';
import { PetTypesService } from './pet-types.service';
import { PetTypesController } from './pet-types.controller';
import { SharedModule } from '@shared/shared.module';
import { AuthEndpointsModule } from '../auth/auth.module';

@Module({
  imports: [SharedModule, AuthEndpointsModule],
  providers: [PetTypesService],
  controllers: [PetTypesController],
  exports: [PetTypesService],
})
export class PetTypesModule { }
