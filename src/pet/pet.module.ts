import { Module, forwardRef } from '@nestjs/common';
import { PetService } from './pet.service';
import { PetController } from './pet.controller';
import { SharedModule } from '@shared/shared.module';
import { AuthEndpointsModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [SharedModule, forwardRef(() => AuthEndpointsModule), UploadModule],
  providers: [PetService],
  controllers: [PetController],
  exports: [PetService],
})
export class PetModule {}
