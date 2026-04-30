import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MinUserLevelGuard } from '../min-user-level.guard';
import { MIN_USER_LEVEL_KEY } from '../../decorators/min-user-level.decorator';
import { ALLOW_ANONYMOUS_KEY } from '../../decorators/allow-anonymous.decorator';
import { UserService } from '../../../user/user.service';

describe('MinUserLevelGuard', () => {
    let guard: MinUserLevelGuard;
    let reflector: Reflector;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MinUserLevelGuard,
                {
                    provide: Reflector,
                    useValue: {
                        getAllAndOverride: jest.fn(),
                    },
                },
            ],
        }).compile();

        guard = module.get<MinUserLevelGuard>(MinUserLevelGuard);
        reflector = module.get<Reflector>(Reflector);
    });

    const createMockContext = (user?: any): ExecutionContext =>
        ({
            switchToHttp: () => ({
                getRequest: () => ({ user }),
            }),
            getHandler: () => jest.fn(),
            getClass: () => class MockController { },
        }) as any;

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    describe('when no min level is specified', () => {
        it('should allow access', () => {
            jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(undefined); // no min level

            const context = createMockContext();
            expect(guard.canActivate(context)).toBe(true);
        });

        it('should allow access when minLevel is null', () => {
            jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(null); // no min level

            const context = createMockContext();
            expect(guard.canActivate(context)).toBe(true);
        });
    });

    describe('when route is anonymous', () => {
        it('should allow access without checking level', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true); // isAnonymous

            const context = createMockContext();
            expect(guard.canActivate(context)).toBe(true);

            // Should not call getAllAndOverride for MIN_USER_LEVEL_KEY
            expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(1);
            expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
                ALLOW_ANONYMOUS_KEY,
                expect.any(Array),
            );
        });
    });

    describe('when user is not authenticated', () => {
        it('should throw ForbiddenException', () => {
            jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(50); // min level = 50

            const context = createMockContext(); // no user

            try {
                guard.canActivate(context);
                fail('Should have thrown ForbiddenException');
            } catch (error) {
                expect(error).toBeInstanceOf(ForbiddenException);
                expect(error.message).toBe('User not authenticated');
            }
        });
    });

    describe('when user has sufficient level', () => {
        it('should allow access when user has exactly the minimum level', () => {
            const mockUser = {
                id: 1,
                email: 'admin@example.com',
                roles: [{ slug: 'admin', level: 50 }],
            };

            jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(50); // min level = 50

            jest.spyOn(UserService, 'userHasMinLevel').mockReturnValue(true);

            const context = createMockContext(mockUser);
            expect(guard.canActivate(context)).toBe(true);
            expect(UserService.userHasMinLevel).toHaveBeenCalledWith(mockUser, 50);
        });

        it('should allow access when user has higher level (lower number)', () => {
            const mockUser = {
                id: 1,
                email: 'superadmin@example.com',
                roles: [{ slug: 'superadmin', level: 10 }],
            };

            jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(50); // min level = 50

            jest.spyOn(UserService, 'userHasMinLevel').mockReturnValue(true);

            const context = createMockContext(mockUser);
            expect(guard.canActivate(context)).toBe(true);
            expect(UserService.userHasMinLevel).toHaveBeenCalledWith(mockUser, 50);
        });

        it('should allow access when user has multiple roles and one satisfies', () => {
            const mockUser = {
                id: 1,
                email: 'user@example.com',
                roles: [
                    { slug: 'user', level: 100 },
                    { slug: 'admin', level: 50 },
                ],
            };

            jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(50); // min level = 50

            jest.spyOn(UserService, 'userHasMinLevel').mockReturnValue(true);

            const context = createMockContext(mockUser);
            expect(guard.canActivate(context)).toBe(true);
        });

        it('should allow access when minLevel is 0 and user has level 0', () => {
            const mockUser = {
                id: 1,
                email: 'superadmin@example.com',
                roles: [{ slug: 'superadmin', level: 0 }],
            };

            jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(0); // min level = 0

            jest.spyOn(UserService, 'userHasMinLevel').mockReturnValue(true);

            const context = createMockContext(mockUser);
            expect(guard.canActivate(context)).toBe(true);
            expect(UserService.userHasMinLevel).toHaveBeenCalledWith(mockUser, 0);
        });
    });

    describe('when user has insufficient level', () => {
        it('should throw ForbiddenException with descriptive message', () => {
            const mockUser = {
                id: 1,
                email: 'user@example.com',
                roles: [{ slug: 'user', level: 100 }],
            };

            jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(50); // min level = 50

            jest.spyOn(UserService, 'userHasMinLevel').mockReturnValue(false);

            const context = createMockContext(mockUser);
            try {
                guard.canActivate(context);
                fail('Should have thrown ForbiddenException');
            } catch (error) {
                expect(error).toBeInstanceOf(ForbiddenException);
                expect(error.message).toBe(
                    'Insufficient permissions. Minimum role level required: 50',
                );
            }
        });

        it('should include the required level in error message', () => {
            const mockUser = {
                id: 1,
                email: 'user@example.com',
                roles: [{ slug: 'user', level: 100 }],
            };

            jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(10); // min level = 10

            jest.spyOn(UserService, 'userHasMinLevel').mockReturnValue(false);

            const context = createMockContext(mockUser);
            expect(() => guard.canActivate(context)).toThrow(
                'Insufficient permissions. Minimum role level required: 10',
            );
        });

        it('should have consistent error message format', () => {
            const mockUser = {
                id: 1,
                email: 'user@example.com',
                roles: [{ slug: 'user', level: 100 }],
            };

            jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(25); // min level = 25

            jest.spyOn(UserService, 'userHasMinLevel').mockReturnValue(false);

            const context = createMockContext(mockUser);
            expect(() => guard.canActivate(context)).toThrow(
                'Insufficient permissions. Minimum role level required: 25',
            );
        });
    });

    describe('metadata resolution', () => {
        it('should use getAllAndOverride which checks method first, then class', () => {
            const mockUser = {
                id: 1,
                email: 'admin@example.com',
                roles: [{ slug: 'admin', level: 50 }],
            };

            const mockReflector = jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(50); // min level = 50

            jest.spyOn(UserService, 'userHasMinLevel').mockReturnValue(true);

            const context = createMockContext(mockUser);
            guard.canActivate(context);

            const callsForMinLevel = mockReflector.mock.calls.filter(
                (call) => call[0] === MIN_USER_LEVEL_KEY,
            );
            expect(callsForMinLevel.length).toBe(1);
            expect(callsForMinLevel[0][1]).toEqual(expect.any(Array));
            expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
                MIN_USER_LEVEL_KEY,
                [expect.any(Function), expect.any(Function)],
            );
        });
    });

    describe('with real role level helper', () => {
        it('should allow flattened JWT roles from BearerTokenGuard', () => {
            const mockUser = {
                id: 1,
                email: 'admin@example.com',
                roles: [{ slug: 'admin', level: 50 }],
            };

            jest
                .spyOn(reflector, 'getAllAndOverride')
                .mockReturnValueOnce(false) // not anonymous
                .mockReturnValueOnce(50); // min level = 50

            const context = createMockContext(mockUser);
            expect(guard.canActivate(context)).toBe(true);
        });
    });
});
