import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AuditLogService } from '../services/audit-log.service';

/**
 * Audit Log Interceptor
 * 
 * Automatically logs authentication events based on route metadata.
 * Use with @SetMetadata('auditAction', 'action_name') decorator.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
    constructor(private readonly auditLogService: AuditLogService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const auditAction = Reflect.getMetadata('auditAction', context.getHandler());

        if (!auditAction) {
            return next.handle();
        }

        const userId = request.user?.id;
        const actorId = request.user?.id; // For most cases, actor is the same as user
        const ipAddress = request.ip || request.connection?.remoteAddress;
        const userAgent = request.headers['user-agent'];

        return next.handle().pipe(
            tap(() => {
                // Log successful operation
                this.auditLogService.log({
                    action: auditAction,
                    userId,
                    actorId,
                    ipAddress,
                    userAgent,
                    metadata: {
                        method: request.method,
                        url: request.url,
                        params: request.params,
                    },
                });
            }),
            catchError((error) => {
                // Log failed operation
                this.auditLogService.log({
                    action: `${auditAction}_failed` as any,
                    userId,
                    actorId,
                    ipAddress,
                    userAgent,
                    metadata: {
                        method: request.method,
                        url: request.url,
                        params: request.params,
                        error: error.message,
                    },
                });
                throw error;
            }),
        );
    }
}
