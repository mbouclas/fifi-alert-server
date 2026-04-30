import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/services/prisma.service';
import { TokenService } from '../src/auth/services/token.service';

describe('Pet Types API (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let tokenService: TokenService;
    let authToken: string;
    let testUserId: number;
    let createdPetTypeId: number;

    // MinUserLevel guard test users
    let superAdminUserId: number;
    let superAdminToken: string;
    let regularUserUserId: number;
    let regularUserToken: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
                errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            }),
        );
        await app.init();

        prisma = moduleFixture.get<PrismaService>(PrismaService);
        tokenService = moduleFixture.get<TokenService>(TokenService);

        // Clean up any existing test users first
        await prisma.userRole.deleteMany({
            where: {
                user: {
                    email: {
                        in: [
                            'pet-type-test-user@test.com',
                            'super-admin-pet-type@test.com',
                            'regular-user-pet-type@test.com',
                        ],
                    },
                },
            },
        });
        await prisma.session.deleteMany({
            where: {
                user: {
                    email: {
                        in: [
                            'pet-type-test-user@test.com',
                            'super-admin-pet-type@test.com',
                            'regular-user-pet-type@test.com',
                        ],
                    },
                },
            },
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [
                        'pet-type-test-user@test.com',
                        'super-admin-pet-type@test.com',
                        'regular-user-pet-type@test.com',
                    ],
                },
            },
        });

        const user = await prisma.user.create({
            data: {
                email: 'pet-type-test-user@test.com',
                name: 'Pet Type Test User',
                firstName: 'Pet',
                lastName: 'Type',
            },
        });
        testUserId = user.id;

        const userWithRelations = await prisma.user.findUnique({
            where: { id: testUserId },
            include: {
                roles: { include: { role: true } },
                gates: { include: { gate: true } },
            },
        });

        const token = await tokenService.generateAccessToken(
            userWithRelations as any,
        );
        authToken = token.token;

        // Create roles for MinUserLevel guard tests
        const superAdminRole = await prisma.role.upsert({
            where: { name: 'super-admin-pet-type-test' },
            update: {},
            create: {
                name: 'super-admin-pet-type-test',
                slug: 'super-admin-pet-type-test',
                level: 5,
            },
        });

        const regularUserRole = await prisma.role.upsert({
            where: { name: 'regular-user-pet-type-test' },
            update: {},
            create: {
                name: 'regular-user-pet-type-test',
                slug: 'regular-user-pet-type-test',
                level: 100,
            },
        });

        // Create super admin user (level 5)
        const superAdminUser = await prisma.user.create({
            data: {
                email: 'super-admin-pet-type@test.com',
                name: 'Super Admin Pet Type',
                firstName: 'Super',
                lastName: 'Admin',
            },
        });
        superAdminUserId = superAdminUser.id;

        await prisma.userRole.create({
            data: {
                user_id: superAdminUserId,
                role_id: superAdminRole.id,
            },
        });

        const superAdminWithRelations = await prisma.user.findUnique({
            where: { id: superAdminUserId },
            include: {
                roles: { include: { role: true } },
                gates: { include: { gate: true } },
            },
        });

        const superAdminTokenResult = await tokenService.generateAccessToken(
            superAdminWithRelations as any,
        );
        superAdminToken = superAdminTokenResult.token;

        // Create regular user (level 100 - insufficient for level 5 requirement)
        const regularUser = await prisma.user.create({
            data: {
                email: 'regular-user-pet-type@test.com',
                name: 'Regular User Pet Type',
                firstName: 'Regular',
                lastName: 'User',
            },
        });
        regularUserUserId = regularUser.id;

        await prisma.userRole.create({
            data: {
                user_id: regularUserUserId,
                role_id: regularUserRole.id,
            },
        });

        const regularUserWithRelations = await prisma.user.findUnique({
            where: { id: regularUserUserId },
            include: {
                roles: { include: { role: true } },
                gates: { include: { gate: true } },
            },
        });

        const regularUserTokenResult = await tokenService.generateAccessToken(
            regularUserWithRelations as any,
        );
        regularUserToken = regularUserTokenResult.token;
    });

    afterAll(async () => {
        // Clean up in correct order to avoid foreign key constraints
        await prisma.pet.deleteMany({
            where: {
                petType: {
                    slug: { in: ['dog', 'cat', 'bird', 'pet-type-test'] },
                },
            },
        });
        await prisma.petType.deleteMany({
            where: { slug: { in: ['dog', 'cat', 'bird', 'pet-type-test'] } },
        });
        if (testUserId || superAdminUserId || regularUserUserId) {
            await prisma.userRole.deleteMany({
                where: {
                    user_id: {
                        in: [
                            testUserId,
                            superAdminUserId,
                            regularUserUserId,
                        ].filter(Boolean),
                    },
                },
            });
            await prisma.session.deleteMany({
                where: {
                    userId: {
                        in: [
                            testUserId,
                            superAdminUserId,
                            regularUserUserId,
                        ].filter(Boolean),
                    },
                },
            });
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: [
                            testUserId,
                            superAdminUserId,
                            regularUserUserId,
                        ].filter(Boolean),
                    },
                },
            });
        }
        await prisma.role.deleteMany({
            where: {
                slug: {
                    in: [
                        'super-admin-pet-type-test',
                        'regular-user-pet-type-test',
                    ],
                },
            },
        });
        await prisma.$disconnect();
        await app.close();
    });

    describe('POST /pet-types', () => {
        it('should create a pet type (201)', async () => {
            const dto = {
                name: 'Pet Type Test',
                slug: 'pet-type-test',
                order: 50,
            };

            const response = await request(app.getHttpServer())
                .post('/pet-types')
                .set('Authorization', `Bearer ${authToken}`)
                .send(dto)
                .expect(201);

            createdPetTypeId = response.body.id;
            expect(response.body.name).toBe(dto.name);
            expect(response.body.slug).toBe(dto.slug);
            expect(response.body.order).toBe(dto.order);
        });
    });

    describe('GET /pet-types', () => {
        it('should list pet types (200)', async () => {
            const response = await request(app.getHttpServer())
                .get('/pet-types?orderBy=order&orderDir=asc')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('order');
        });
    });

    describe('GET /pet-types/:id', () => {
        it('should get pet type by id (200)', async () => {
            const response = await request(app.getHttpServer())
                .get(`/pet-types/${createdPetTypeId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.id).toBe(createdPetTypeId);
        });
    });

    describe('GET /pet-types/slug/:slug', () => {
        it('should get pet type by slug (200)', async () => {
            const response = await request(app.getHttpServer())
                .get('/pet-types/slug/pet-type-test')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.slug).toBe('pet-type-test');
        });
    });

    describe('PATCH /pet-types/:id', () => {
        it('should update a pet type (200)', async () => {
            const response = await request(app.getHttpServer())
                .patch(`/pet-types/${createdPetTypeId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Pet Type Updated', order: 60 })
                .expect(200);

            expect(response.body.id).toBe(createdPetTypeId);
            expect(response.body.name).toBe('Pet Type Updated');
            expect(response.body.order).toBe(60);
        });
    });

    describe('DELETE /pet-types/:id', () => {
        it('should delete a pet type (204)', async () => {
            await request(app.getHttpServer())
                .delete(`/pet-types/${createdPetTypeId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(204);

            const deleted = await prisma.petType.findUnique({
                where: { id: createdPetTypeId },
            });
            expect(deleted).toBeNull();
        });
    });

    describe('MinUserLevel Guard - GET /pet-types (findAll)', () => {
        it('should allow user with level 5 to access findAll', async () => {
            const response = await request(app.getHttpServer())
                .get('/pet-types')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should allow regular authenticated users to access findAll', async () => {
            const response = await request(app.getHttpServer())
                .get('/pet-types')
                .set('Authorization', `Bearer ${regularUserToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should block unauthenticated requests', async () => {
            await request(app.getHttpServer()).get('/pet-types').expect(401);
        });
    });
});
