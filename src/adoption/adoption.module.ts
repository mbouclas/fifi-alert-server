import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '@shared/shared.module';
import { AuthEndpointsModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { PetModule } from '../pet/pet.module';
import { I18nModule } from '../i18n/i18n.module';
import { AdoptionService } from './adoption.service';
import { AdoptionController } from './adoption.controller';

@Module({
  imports: [
    SharedModule,
    forwardRef(() => AuthEndpointsModule),
    PetModule,
    UploadModule,
    I18nModule,
  ],
  providers: [AdoptionService],
  controllers: [AdoptionController],
  exports: [AdoptionService],
})
export class AdoptionModule {}
