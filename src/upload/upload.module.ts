import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { LocalStorageStrategy } from './local-storage.strategy';
import { CloudinaryService } from './cloudinary.service';

@Module({
  providers: [UploadService, LocalStorageStrategy, CloudinaryService],
  exports: [UploadService, CloudinaryService],
})
export class UploadModule {}
