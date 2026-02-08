import { Test, TestingModule } from '@nestjs/testing';
import {
    INestApplication,
    Controller,
    Get,
    UseGuards,
    Module,
    ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { BearerTokenGuard } from '../src/auth/guards/bearer-token.guard';
import { MinUserLevelGuard } from '../src/auth/guards/min-user-level.guard';
import { MinUserLevel } from '../src/auth/decorators/min-user-level.decorator';
import { PrismaService } from '../src/services/prisma.service';
import { TokenService } from '../src/auth/services/token.service';
import { JwtService } from '@nestjs/jwt';

/**
 * Test Controller for MinUserLevel Guard Integration Tests
 */
@Controller('test-min-level')
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
class TestMinLevelController {
    @Get('no-restriction')
    noRestriction() {
        return { message: 'No level restriction' };
    }

    @Get('admin-only')
    @MinUserLevel(50)
    adminOnly() {
        return { message: 'Admin area (level <= 50)' };
    }

    @Get('super-admin-only')
    @MinUserLevel(10)
    superAdminOnly() {
        return { message: 'Super admin area (level <= 10)' };
    }
}

/**
 * Test Controller with class-level MinUserLevel
 */
@Controller('test-class-level')
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
@MinUserLevel(50)
class TestClassLevelController {
    @Get('default')
    defaultEndpoint() {
        return { message: 'Uses class level (50)' };
    }

    @Get('override')
    @MinUserLevel(10)
    overrideEndpoint() {
        return { message: 'Overrides to level 10' };
    }

    @Get('relaxed')
    @MinUserLevel(100)
    relaxedEndpoint() {
        return { message: 'Relaxed to level 100' };
    }
}

/**
 * Test Module
 */
@Module({
    controllers: [TestMinLevelController, TestClassLevelController],
    providers: [
        PrismaService,
        TokenService,
        BearerTokenGuard,
        MinUserLevelGuard,
        {
            provide: JwtService,
            useValue: {
                sign: jest.fn(),
                verify: jest.fn(),
            },
        },
    ],
})
class TestModule { }

/**
 * MinUserLevelGuard Integration Tests (e2e)
 *
 * Tests the MinUserLevel guard with real authentication and database interactions
 */
describe('MinUserLevelGuard (e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let tokenService: TokenService;

    let superAdminToken: string; // level 10
    let adminToken: string; // level 50
    let userToken: string; // level 100

    let superAdminUserId: number;
    let adminUserId: number;
    let regularUserId: number;

    let superAdminRoleId: number;
    let adminRoleId: number;
    let userRoleId: number;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [TestModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ transform: true }));
        await app.init();

        prisma = app.get<PrismaService>(PrismaService);
        tokenService = app.get<TokenService>(TokenService);

        // Create test roles
        superAdminRoleId = (
            await prisma.role.upsert({
                where: { slug: 'test-superadmin' },
                create: {
                    name: 'Test Super Admin',
                    slug: 'test-superadmin',
                    level: 10,
                    active: true,
                },
                update: {},
            })
        ).id;

        adminRoleId = (
            await prisma.role.upsert({
                where: { slug: 'test-admin' },
                create: {
                    name: 'Test Admin',
                    slug: 'test-admin',
                    level: 50,
                    active: true,
                },
                update: {},
            })
        ).id;

        userRoleId = (
            await prisma.role.upsert({
                where: { slug: 'test-user' },
                create: {
                    name: 'Test User',
                    slug: 'test-user',
                    level: 100,
                    active: true,
                },
                update: {},
            })
        ).id;

        // Create test users with different roles
        const superAdmin = await prisma.user.create({
            data: {
                email: `superadmin-${Date.now()}@test.com`,
                name: 'Super Admin',
                firstName: 'Super',
                lastName: 'Admin',
                emailVerified: true,
                roles: {
                    create: {
                        role_id: superAdminRoleId,
                    },
                },
            },
            include: {
                roles: {
                    include: {
                        role: true,
                    },
                },
                gates: {
                    include: {
                        gate: true,
                    },
                },
            },
        });
        superAdminUserId = superAdmin.id;
        superAdminToken = tokenService.generateAccessToken(superAdmin);

        const admin = await prisma.user.create({
            data: {
                email: `admin-${Date.now()}@test.com`,
                name: 'Admin',
                firstName: 'Admin',
                lastName: 'User',
                emailVerified: true,
                roles: {
                    create: {
                        role_id: adminRoleId,
                    },
                },
            },
            include: {
                roles: {
                    include: {
                        role: true,
                    },
                },
                gates: {
                    include: {
                        gate: true,
                    },
                },
            },
        });
        adminUserId = admin.id;
        adminToken = tokenService.generateAccessToken(admin);

        const user = await prisma.user.create({
            data: {
                email: `user-${Date.now()}@test.com`,
                name: 'User',
                firstName: 'Regular',
                lastName: 'User',
                emailVerified: true,
                roles: {
                    create: {
                        role_id: userRoleId,
                    },
                },
            },
            include: {
                roles: {
                    include: {
                        role: true,
                    },
                },
                gates: {
                    include: {
                        gate: true,
                    },
                },
            },
        });
        regularUserId = user.id;
        userToken = tokenService.generateAccessToken(user);
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.userRole.deleteMany({
            where: {
                user_id: { in: [superAdminUserId, adminUserId, regularUserId] },
            },
        });

        await prisma.user.deleteMany({
            where: {
                id: { in: [superAdminUserId, adminUserId, regularUserId] },
            },
        });

        await prisma.role.deleteMany({
            where: {
                id: { in: [superAdminRoleId, adminRoleId, userRoleId] },
            },
        });

        await app.close();
    });

    describe('Route-level MinUserLevel', () => {
        describe('GET /test-min-level/no-restriction', () => {
            it('should allow super admin (level 10)', () => {
                return request(app.getHttpServer())
                    .get('/test-min-level/no-restriction')
                    .set('Authorization', `Bearer ${superAdminToken}`)
                    .expect(200)
                    .expect({ message: 'No level restriction' });
            });

            it('should allow admin (level 50)', () => {
                return request(app.getHttpServer())
                    .get('/test-min-level/no-restriction')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200)
                    .expect({ message: 'No level restriction' });
            });

            it('should allow regular user (level 100)', () => {
                return request(app.getHttpServer())
                    .get('/test-min-level/no-restriction')
                    .set('Authorization', `Bearer ${userToken}`)
                    .expect(200)
                    .expect({ message: 'No level restriction' });
            });

            it('should deny unauthenticated request', () => {
                return request(app.getHttpServer())
                    .get('/test-min-level/no-restriction')
                    .expect(401);
            });
        });

        describe('GET /test-min-level/admin-only (requires level <= 50)', () => {
            it('should allow super admin (level 10)', () => {
                return request(app.getHttpServer())
                    .get('/test-min-level/admin-only')
                    .set('Authorization', `Bearer ${superAdminToken}`)
                    .expect(200)
                    .expect({ message: 'Admin area (level <= 50)' });
            });

            it('should allow admin (level 50)', () => {
                return request(app.getHttpServer())
                    .get('/test-min-level/admin-only')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200)
                    .expect({ message: 'Admin area (level <= 50)' });
            });

            it('should deny regular user (level 100)', () => {
                return request(app.getHttpServer())
                    .get('/test-min-level/admin-only')
                    .set('Authorization', `Bearer ${userToken}`)
                    .expect(403)
                    .expect((res) => {
                        expect(res.body.message).toContain(
                            'Insufficient permissions. Minimum role level required: 50',
                        );
                    });
            });
        });

        describe('GET /test-min-level/super-admin-only (requires level <= 10)', () => {
            it('should allow super admin (level 10)', () => {
                return request(app.getHttpServer())
                    .get('/test-min-level/super-admin-only')
                    .set('Authorization', `Bearer ${superAdminToken}`)
                    .expect(200)
                    .expect({ message: 'Super admin area (level <= 10)' });
            });

            it('should deny admin (level 50)', () => {
                return request(app.getHttpServer())
                    .get('/test-min-level/super-admin-only')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(403)
                    .expect((res) => {
                        expect(res.body.message).toContain(
                            'Insufficient permissions. Minimum role level required: 10',
                        );
                    });
            });

            it('should deny regular user (level 100)', () => {
                return request(app.getHttpServer())
                    .get('/test-min-level/super-admin-only')
                    .set('Authorization', `Bearer ${userToken}`)
                    .expect(403)
                    .expect((res) => {
                        expect(res.body.message).toContain(
                            'Insufficient permissions. Minimum role level required: 10',
                        );
                    });
            });
        });
    });

    describe('Class-level MinUserLevel with Method Override', () => {
        describe('GET /test-class-level/default (class level: 50)', () => {
            it('should allow super admin (level 10)', () => {
                return request(app.getHttpServer())
                    .get('/test-class-level/default')
                    .set('Authorization', `Bearer ${superAdminToken}`)
                    .expect(200)
                    .expect({ message: 'Uses class level (50)' });
            });

            it('should allow admin (level 50)', () => {
                return request(app.getHttpServer())
                    .get('/test-class-level/default')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200)
                    .expect({ message: 'Uses class level (50)' });
            });

            it('should deny regular user (level 100)', () => {
                return request(app.getHttpServer())
                    .get('/test-class-level/default')
                    .set('Authorization', `Bearer ${userToken}`)
                    .expect(403);
            });
        });

        describe('GET /test-class-level/override (method overrides to level 10)', () => {
            it('should allow super admin (level 10)', () => {
                return request(app.getHttpServer())
                    .get('/test-class-level/override')
                    .set('Authorization', `Bearer ${superAdminToken}`)
                    .expect(200)
                    .expect({ message: 'Overrides to level 10' });
            });

            it('should deny admin (level 50) - method override tightens restriction', () => {
                return request(app.getHttpServer())
                    .get('/test-class-level/override')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(403)
                    .expect((res) => {
                        expect(res.body.message).toContain(
                            'Insufficient permissions. Minimum role level required: 10',
                        );
                    });
            });

            it('should deny regular user (level 100)', () => {
                return request(app.getHttpServer())
                    .get('/test-class-level/override')
                    .set('Authorization', `Bearer ${userToken}`)
                    .expect(403);
            });
        });

        describe('GET /test-class-level/relaxed (method relaxes to level 100)', () => {
            it('should allow super admin (level 10)', () => {
                return request(app.getHttpServer())
                    .get('/test-class-level/relaxed')
                    .set('Authorization', `Bearer ${superAdminToken}`)
                    .expect(200)
                    .expect({ message: 'Relaxed to level 100' });
            });

            it('should allow admin (level 50)', () => {
                return request(app.getHttpServer())
                    .get('/test-class-level/relaxed')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200)
                    .expect({ message: 'Relaxed to level 100' });
            });

            it('should allow regular user (level 100) - method override relaxes restriction', () => {
                return request(app.getHttpServer())
                    .get('/test-class-level/relaxed')
                    .set('Authorization', `Bearer ${userToken}`)
                    .expect(200)
                    .expect({ message: 'Relaxed to level 100' });
            });
        });
    });

    describe('Guard Order', () => {
        it('BearerTokenGuard should fail before MinUserLevelGuard', () => {
            return request(app.getHttpServer())
                .get('/test-min-level/admin-only')
                .expect(401); // 401 from BearerTokenGuard, not 403 from MinUserLevelGuard
        });
    });

    describe('Error Messages', () => {
        it('should include required level in 403 error message', () => {
            return request(app.getHttpServer())
                .get('/test-min-level/admin-only')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403)
                .expect((res) => {
                    expect(res.body.message).toBe(
                        'Insufficient permissions. Minimum role level required: 50',
                    );
                    expect(res.body.statusCode).toBe(403);
                    expect(res.body.error).toBe('Forbidden');
                });
        });
    });
});
