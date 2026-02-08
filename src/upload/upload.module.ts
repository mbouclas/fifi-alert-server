import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { LocalStorageStrategy } from './local-storage.strategy';

@Module({
  providers: [UploadService, LocalStorageStrategy],
  exports: [UploadService],
})
export class UploadModule {}
