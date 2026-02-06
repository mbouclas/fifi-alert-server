import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '../services/audit-log.service';

/**
 * Audit decorator
 * 
 * Marks an endpoint to be audited. Use with AuditLogInterceptor.
 * 
 * @param action - The audit action to log
 * 
 * @example
 * @Audit('user_banned')
 * @Post('users/:id/ban')
 * async banUser() { ... }
 */
export const Audit = (action: AuditAction) => SetMetadata('auditAction', action);
