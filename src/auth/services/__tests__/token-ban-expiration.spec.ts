import { Test, TestingModule } from '@nestjs/testing';
import { TokenService } from '../token.service';
import { PrismaService } from '../../../services/prisma.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('TokenService - Ban Expiration Logic', () => {
    let service: TokenService;
    let prisma: PrismaService;
    let testUser: any;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot(),
                JwtModule.register({
                    secret: process.env.JWT_SECRET || 'test-secret',
                    signOptions: { expiresIn: '15m' },
                }),
            ],
            providers: [TokenService, PrismaService],
        }).compile();

        service = module.get<TokenService>(TokenService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    beforeEach(async () => {
        // Create a test user with roles and gates
        testUser = await prisma.user.create({
            data: {
                email: `test-${Date.now()}@example.com`,
                name: 'Test User',
                banned: false,
                roles: {
                    create: [],
                },
                gates: {
                    create: [],
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
    });

    afterEach(async () => {
        // Clean up test user and sessions
        if (testUser) {
            await prisma.session.deleteMany({
                where: { userId: testUser.id },
            });
            await prisma.user.delete({
                where: { id: testUser.id },
            });
        }
    });

    describe('Ban Expiration - Automatic Unban', () => {
        it('should automatically unban user when ban has expired', async () => {
            // Generate token for user first
            const { token } = await service.generateAccessToken(testUser);

            // Then ban user with expiration in the past
            const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
            await prisma.user.update({
                where: { id: testUser.id },
                data: {
                    banned: true,
                    banReason: 'Test ban',
                    banExpires: pastDate,
                },
            });

            // Validate token - should automatically unban
            const result = await service.validateAccessToken(token);
            expect(result).toBeDefined();
            expect(result.id).toBe(testUser.id);

            // Verify user is unbanned in database
            const updatedUser = await prisma.user.findUnique({
                where: { id: testUser.id },
            });
            expect(updatedUser?.banned).toBe(false);
            expect(updatedUser?.banReason).toBeNull();
            expect(updatedUser?.banExpires).toBeNull();
        });

        it('should throw error for user with active ban (not expired)', async () => {
            // Generate token for user first
            const { token } = await service.generateAccessToken(testUser);

            // Then ban user with expiration in the future
            const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now
            await prisma.user.update({
                where: { id: testUser.id },
                data: {
                    banned: true,
                    banReason: 'Test active ban',
                    banExpires: futureDate,
                },
            });

            // Validate token - should throw error
            try {
                await service.validateAccessToken(token);
                fail('Expected UnauthorizedException to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(UnauthorizedException);
                expect(error.message).toContain('User account is banned');
            }

            // Verify user is still banned in database
            const updatedUser = await prisma.user.findUnique({
                where: { id: testUser.id },
            });
            expect(updatedUser?.banned).toBe(true);
            expect(updatedUser?.banReason).toBe('Test active ban');
        });

        it('should throw error for permanently banned user (no expiration)', async () => {
            // Generate token for user first
            const { token } = await service.generateAccessToken(testUser);

            // Then permanently ban user (no expiration date)
            await prisma.user.update({
                where: { id: testUser.id },
                data: {
                    banned: true,
                    banReason: 'Permanent ban',
                    banExpires: null,
                },
            });

            // Validate token - should throw error
            try {
                await service.validateAccessToken(token);
                fail('Expected UnauthorizedException to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(UnauthorizedException);
                expect(error.message).toContain('User account is banned');
            }

            // Verify user is still banned
            const updatedUser = await prisma.user.findUnique({
                where: { id: testUser.id },
            });
            expect(updatedUser?.banned).toBe(true);
            expect(updatedUser?.banReason).toBe('Permanent ban');
        });

        it('should allow access for unbanned user', async () => {
            // User is not banned
            const { token } = await service.generateAccessToken(testUser);

            // Validate token - should succeed
            const result = await service.validateAccessToken(token);
            expect(result).toBeDefined();
            expect(result.id).toBe(testUser.id);
            expect(result.email).toBe(testUser.email);
        });
    });

    describe('Ban Edge Cases', () => {
        it('should handle ban expiring exactly at current time', async () => {
            // Generate token for user first
            const { token } = await service.generateAccessToken(testUser);

            // Ban expires exactly now (edge case)
            const now = new Date();
            await prisma.user.update({
                where: { id: testUser.id },
                data: {
                    banned: true,
                    banReason: 'Test ban at exact time',
                    banExpires: now,
                },
            });

            // Small delay to ensure time has passed
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Validate token - should unban since time has passed
            const result = await service.validateAccessToken(token);
            expect(result).toBeDefined();

            // Verify user is unbanned
            const updatedUser = await prisma.user.findUnique({
                where: { id: testUser.id },
            });
            expect(updatedUser?.banned).toBe(false);
        });
    });
});
