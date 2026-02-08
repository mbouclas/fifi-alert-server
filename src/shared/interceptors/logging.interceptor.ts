import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { sanitizeLogData } from '../logger.config';

/**
 * LoggingInterceptor
 *
 * Logs all incoming HTTP requests and their responses with:
 * - Request method, URL, and headers
 * - Request ID for correlation
 * - Response status code and duration
 * - User ID if authenticated
 * - Sanitized request body (PII removed)
 *
 * Logs are structured JSON for easy parsing and analysis.
 * Does NOT log sensitive data (passwords, tokens, PII).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string; user?: any }>();
    const response = ctx.getResponse<Response>();
    const { method, url, headers, body, id: requestId } = request;

    const startTime = Date.now();

    // Log incoming request
    this.logger.log({
      event: 'http_request',
      request_id: requestId,
      method,
      url,
      user_agent: headers['user-agent'],
      user_id: request.user?.id || request.user?.userId,
      body: this.shouldLogBody(url) ? sanitizeLogData(body) : undefined,
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          // Log successful response
          this.logger.log({
            event: 'http_response',
            request_id: requestId,
            method,
            url,
            status_code: statusCode,
            duration_ms: duration,
            user_id: request.user?.id || request.user?.userId,
          });
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;

          // Log error response
          this.logger.error({
            event: 'http_error',
            request_id: requestId,
            method,
            url,
            status_code: statusCode,
            duration_ms: duration,
            error_message: error.message,
            error_name: error.name,
            user_id: request.user?.id || request.user?.userId,
            stack:
              process.env.NODE_ENV === 'development' ? error.stack : undefined,
          });
        },
      }),
    );
  }

  /**
   * Determine if request body should be logged
   * Skip logging for file uploads and sensitive endpoints
   */
  private shouldLogBody(url: string): boolean {
    // Don't log file upload endpoints (large payloads)
    if (url.includes('/photos') || url.includes('/upload')) {
      return false;
    }

    // Don't log authentication endpoints (sensitive data)
    if (
      url.includes('/auth') ||
      url.includes('/login') ||
      url.includes('/register')
    ) {
      return false;
    }

    return true;
  }
}
