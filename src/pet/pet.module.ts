import { Module, forwardRef } from '@nestjs/common';
import { PetService } from './pet.service';
import { PetController } from './pet.controller';
import { SharedModule } from '@shared/shared.module';
import { AuthEndpointsModule } from '../auth/auth.module';

@Module({
  imports: [SharedModule, forwardRef(() => AuthEndpointsModule)],
  providers: [PetService],
  controllers: [PetController],
  exports: [PetService],
})
export class PetModule {}
