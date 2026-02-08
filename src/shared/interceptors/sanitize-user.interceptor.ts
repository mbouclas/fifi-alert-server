import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * SanitizeUserInterceptor
 *
 * Removes sensitive fields from User model responses:
 * - passwords from accounts relations
 * - tokens from sessions relations
 * - any other sensitive authentication data
 *
 * Works with:
 * - Single user objects
 * - Arrays of users
 * - Nested users in other objects (e.g., created_by, reporter)
 * - Paginated responses
 *
 * @example
 * // Apply to controller
 * @UseInterceptors(SanitizeUserInterceptor)
 * @Controller('users')
 * export class UserController {}
 *
 * @example
 * // Apply to specific endpoint
 * @UseInterceptors(SanitizeUserInterceptor)
 * @Get(':id')
 * async findOne(@Param('id') id: number) {}
 */
@Injectable()
export class SanitizeUserInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(map((data) => this.sanitize(data)));
    }

    /**
     * Recursively sanitize data, handling all response types
     */
    private sanitize(data: any): any {
        if (data === null || data === undefined) {
            return data;
        }

        // Handle arrays
        if (Array.isArray(data)) {
            return data.map((item) => this.sanitize(item));
        }

        // Handle objects (but not Date objects or other special types)
        if (typeof data === 'object') {
            // Return Date objects and other special objects as-is
            if (data instanceof Date || data.constructor.name !== 'Object') {
                return data;
            }

            // Check if this is a paginated response
            if (data.items && Array.isArray(data.items)) {
                return {
                    ...data,
                    items: data.items.map((item: any) => this.sanitize(item)),
                };
            }

            // Check if this is a user object (has typical user fields)
            if (this.isUserObject(data)) {
                return this.sanitizeUser(data);
            }

            // Recursively sanitize nested objects
            const sanitized: any = {};
            for (const key in data) {
                if (data.hasOwnProperty(key)) {
                    sanitized[key] = this.sanitize(data[key]);
                }
            }
            return sanitized;
        }

        // Return primitives as-is
        return data;
    }

    /**
     * Check if an object appears to be a User model
     */
    private isUserObject(obj: any): boolean {
        // User objects typically have id, email, and createdAt
        return (
            obj &&
            typeof obj === 'object' &&
            'email' in obj &&
            ('id' in obj || 'createdAt' in obj)
        );
    }

    /**
     * Sanitize a User object by removing sensitive fields
     */
    private sanitizeUser(user: any): any {
        const sanitized = { ...user };

        // Remove password from accounts relation
        if (sanitized.accounts && Array.isArray(sanitized.accounts)) {
            sanitized.accounts = sanitized.accounts.map((account: any) => {
                const { password, refreshToken, accessToken, idToken, ...safeAccount } =
                    account;
                return safeAccount;
            });
        }

        // Remove tokens from sessions relation
        if (sanitized.sessions && Array.isArray(sanitized.sessions)) {
            sanitized.sessions = sanitized.sessions.map((session: any) => {
                const { token, ...safeSession } = session;
                return safeSession;
            });
        }

        // Recursively sanitize nested user relations
        // e.g., roles, gates, devices, etc.
        for (const key in sanitized) {
            if (sanitized.hasOwnProperty(key) && sanitized[key] !== null) {
                if (Array.isArray(sanitized[key])) {
                    sanitized[key] = sanitized[key].map((item: any) =>
                        this.sanitize(item),
                    );
                } else if (typeof sanitized[key] === 'object') {
                    sanitized[key] = this.sanitize(sanitized[key]);
                }
            }
        }

        return sanitized;
    }
}
