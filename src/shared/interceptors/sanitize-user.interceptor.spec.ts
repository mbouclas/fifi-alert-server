import { SanitizeUserInterceptor } from './sanitize-user.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('SanitizeUserInterceptor', () => {
    let interceptor: SanitizeUserInterceptor;

    beforeEach(() => {
        interceptor = new SanitizeUserInterceptor();
    });

    const mockExecutionContext = {} as ExecutionContext;
    const createMockCallHandler = (data: any): CallHandler => ({
        handle: () => of(data),
    });

    describe('sanitize single user object', () => {
        it('should remove password from accounts', (done) => {
            const userData = {
                id: 1,
                email: 'test@example.com',
                name: 'Test User',
                createdAt: new Date(),
                accounts: [
                    {
                        id: 1,
                        providerId: 'credential',
                        password: 'supersecret',
                        accessToken: 'access123',
                        refreshToken: 'refresh456',
                        idToken: 'id789',
                        userId: 1,
                    },
                ],
            };

            interceptor
                .intercept(mockExecutionContext, createMockCallHandler(userData))
                .subscribe((result) => {
                    expect(result.accounts).toBeDefined();
                    expect(result.accounts[0].password).toBeUndefined();
                    expect(result.accounts[0].accessToken).toBeUndefined();
                    expect(result.accounts[0].refreshToken).toBeUndefined();
                    expect(result.accounts[0].idToken).toBeUndefined();
                    expect(result.accounts[0].providerId).toBe('credential');
                    expect(result.accounts[0].userId).toBe(1);
                    done();
                });
        });

        it('should remove tokens from sessions', (done) => {
            const userData = {
                id: 1,
                email: 'test@example.com',
                name: 'Test User',
                createdAt: new Date(),
                sessions: [
                    {
                        id: 1,
                        token: 'session-token-secret',
                        expiresAt: new Date(),
                        userId: 1,
                    },
                ],
            };

            interceptor
                .intercept(mockExecutionContext, createMockCallHandler(userData))
                .subscribe((result) => {
                    expect(result.sessions).toBeDefined();
                    expect(result.sessions[0].token).toBeUndefined();
                    expect(result.sessions[0].id).toBe(1);
                    expect(result.sessions[0].userId).toBe(1);
                    done();
                });
        });

        it('should handle user without accounts or sessions', (done) => {
            const userData = {
                id: 1,
                email: 'test@example.com',
                name: 'Test User',
                createdAt: new Date(),
            };

            interceptor
                .intercept(mockExecutionContext, createMockCallHandler(userData))
                .subscribe((result) => {
                    expect(result).toEqual(userData);
                    done();
                });
        });
    });

    describe('sanitize array of users', () => {
        it('should remove passwords from all users in array', (done) => {
            const usersData = [
                {
                    id: 1,
                    email: 'test1@example.com',
                    createdAt: new Date(),
                    accounts: [{ id: 1, password: 'secret1', providerId: 'credential' }],
                },
                {
                    id: 2,
                    email: 'test2@example.com',
                    createdAt: new Date(),
                    accounts: [{ id: 2, password: 'secret2', providerId: 'credential' }],
                },
            ];

            interceptor
                .intercept(mockExecutionContext, createMockCallHandler(usersData))
                .subscribe((result) => {
                    expect(result).toHaveLength(2);
                    expect(result[0].accounts[0].password).toBeUndefined();
                    expect(result[1].accounts[0].password).toBeUndefined();
                    expect(result[0].accounts[0].providerId).toBe('credential');
                    expect(result[1].accounts[0].providerId).toBe('credential');
                    done();
                });
        });
    });

    describe('sanitize paginated response', () => {
        it('should sanitize users in paginated response', (done) => {
            const paginatedData = {
                items: [
                    {
                        id: 1,
                        email: 'test@example.com',
                        createdAt: new Date(),
                        accounts: [
                            { id: 1, password: 'secret', providerId: 'credential' },
                        ],
                    },
                ],
                total: 1,
                limit: 10,
                offset: 0,
            };

            interceptor
                .intercept(mockExecutionContext, createMockCallHandler(paginatedData))
                .subscribe((result) => {
                    expect(result.items).toBeDefined();
                    expect(result.items[0].accounts[0].password).toBeUndefined();
                    expect(result.items[0].accounts[0].providerId).toBe('credential');
                    expect(result.total).toBe(1);
                    done();
                });
        });
    });

    describe('sanitize nested user objects', () => {
        it('should sanitize nested user in alert object', (done) => {
            const alertData = {
                id: 'alert-123',
                status: 'ACTIVE',
                created_by: {
                    id: 1,
                    email: 'creator@example.com',
                    createdAt: new Date(),
                    accounts: [
                        { id: 1, password: 'secret', providerId: 'credential' },
                    ],
                },
            };

            interceptor
                .intercept(mockExecutionContext, createMockCallHandler(alertData))
                .subscribe((result) => {
                    expect(result.created_by.accounts[0].password).toBeUndefined();
                    expect(result.created_by.accounts[0].providerId).toBe('credential');
                    done();
                });
        });

        it('should handle deeply nested users', (done) => {
            const complexData = {
                alerts: [
                    {
                        id: 'alert-1',
                        reporter: {
                            id: 1,
                            email: 'reporter@example.com',
                            createdAt: new Date(),
                            accounts: [
                                { id: 1, password: 'secret1', providerId: 'credential' },
                            ],
                            sessions: [{ id: 1, token: 'token1', userId: 1 }],
                        },
                    },
                ],
            };

            interceptor
                .intercept(mockExecutionContext, createMockCallHandler(complexData))
                .subscribe((result) => {
                    expect(
                        result.alerts[0].reporter.accounts[0].password,
                    ).toBeUndefined();
                    expect(result.alerts[0].reporter.sessions[0].token).toBeUndefined();
                    expect(result.alerts[0].reporter.accounts[0].providerId).toBe(
                        'credential',
                    );
                    done();
                });
        });
    });

    describe('handle non-user data', () => {
        it('should pass through non-user objects unchanged', (done) => {
            const nonUserData = {
                id: 1,
                name: 'Test Item',
                value: 123,
            };

            interceptor
                .intercept(mockExecutionContext, createMockCallHandler(nonUserData))
                .subscribe((result) => {
                    expect(result).toEqual(nonUserData);
                    done();
                });
        });

        it('should handle null and undefined', (done) => {
            interceptor
                .intercept(mockExecutionContext, createMockCallHandler(null))
                .subscribe((result) => {
                    expect(result).toBeNull();
                    done();
                });
        });

        it('should handle primitives', (done) => {
            interceptor
                .intercept(mockExecutionContext, createMockCallHandler('test string'))
                .subscribe((result) => {
                    expect(result).toBe('test string');
                    done();
                });
        });
    });

    describe('preserve user relations', () => {
        it('should preserve roles, gates, and other safe relations', (done) => {
            const userData = {
                id: 1,
                email: 'test@example.com',
                name: 'Test User',
                createdAt: new Date(),
                roles: [
                    {
                        id: 1,
                        role: { id: 1, name: 'admin', level: 0 },
                    },
                ],
                gates: [
                    {
                        id: 1,
                        gate: { id: 1, name: 'feature-x', active: true },
                    },
                ],
                devices: [{ id: 1, platform: 'ios', pushToken: 'device-token' }],
                accounts: [
                    { id: 1, password: 'secret', providerId: 'credential' },
                ],
            };

            interceptor
                .intercept(mockExecutionContext, createMockCallHandler(userData))
                .subscribe((result) => {
                    expect(result.roles).toEqual(userData.roles);
                    expect(result.gates).toEqual(userData.gates);
                    expect(result.devices).toEqual(userData.devices);
                    expect(result.accounts[0].password).toBeUndefined();
                    done();
                });
        });
    });
});
