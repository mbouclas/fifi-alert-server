import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * RequestIdMiddleware
 *
 * Adds a unique request ID to each incoming request for log correlation.
 * The request ID is:
 * - Generated as a UUID v4 if not provided
 * - Attached to the request object as request.id
 * - Added to response headers as X-Request-ID
 * - Used in logs to trace requests across services
 *
 * Usage:
 * - Client can send X-Request-ID header to use specific ID
 * - Otherwise, server generates a new ID
 * - All logs for this request should include the request_id field
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    // Check if client provided a request ID
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    // Attach to request object for use in controllers/services
    req.id = requestId;

    // Add to response headers for client debugging
    res.setHeader('X-Request-ID', requestId);

    next();
  }
}
