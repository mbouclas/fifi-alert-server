import { Module } from '@nestjs/common';
import { GateController } from './gate.controller';
import { GateService } from './gate.service';
import { SharedModule } from '../shared/shared.module';
import { AuthEndpointsModule } from '../auth/auth.module';

@Module({
  imports: [SharedModule, AuthEndpointsModule],
  controllers: [GateController],
  providers: [GateService],
  exports: [GateService],
})
export class GateModule {}
