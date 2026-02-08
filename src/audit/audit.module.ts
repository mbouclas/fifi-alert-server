/**
 * Audit Module
 *
 * Centralizes audit log functionality and event-driven audit logging.
 * Provides AuditLogService for querying audit data and automatically
 * listens for audit events to persist them to the database.
 *
 * @module AuditModule
 */

import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';
import { SharedModule } from '../shared/shared.module';
import { AuthEndpointsModule } from '../auth/auth.module';

@Module({
  imports: [
    SharedModule, // Provides PrismaService and EventEmitterModule
    AuthEndpointsModule, // Provides BearerTokenGuard and TokenService
  ],
  providers: [AuditLogService],
  controllers: [AuditLogController],
  exports: [AuditLogService],
})
export class AuditModule {}
