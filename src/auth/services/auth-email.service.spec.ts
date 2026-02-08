import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthEmailService } from './auth-email.service';
import { PrismaService } from '../../services/prisma.service';
import type { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';

describe('AuthEmailService', () => {
    let service: AuthEmailService;
    let prisma: PrismaService;
    let mockEmailProvider: jest.Mocked<IEmailProvider>;

    const mockPrismaService = {
        user: {
            findUnique: jest.fn(),
        },
    };

    const mockEventEmitter = {
        emit: jest.fn(),
    };

    const mockUser = {
        id: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        name: 'John Doe',
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        banned: false,
        banReason: null,
        banExpires: null,
        settings: {},
        meta: {},
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        mockEmailProvider = {
            send: jest.fn().mockResolvedValue({
                id: 'test-message-id',
                success: true,
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthEmailService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: EventEmitter2,
                    useValue: mockEventEmitter,
                },
                {
                    provide: 'IEmailProvider',
                    useValue: mockEmailProvider,
                },
            ],
        }).compile();

        service = module.get<AuthEmailService>(AuthEmailService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('Email Methods', () => {
        beforeEach(() => {
            process.env.MAIL_NOTIFICATIONS_FROM = 'noreply@fifi-alert.com';
            process.env.APP_URL = 'https://fifi-alert.com';
        });

        describe('sendEmailVerificationEmail', () => {
            const verificationToken = 'test-verification-token-123';

            it('should send email verification email successfully', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);

                const result = await service.sendEmailVerificationEmail(
                    mockUser.id,
                    verificationToken,
                );

                expect(result.success).toBe(true);
                expect(result.message).toContain('Verification email sent');
                expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
                    where: { id: mockUser.id },
                });
                expect(mockEmailProvider.send).toHaveBeenCalled();
            });

            it('should throw error when user not found', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

                await expect(
                    service.sendEmailVerificationEmail(mockUser.id, verificationToken),
                ).rejects.toThrow('USER_NOT_FOUND');
            });

            it('should throw error when email send fails', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
                mockEmailProvider.send.mockRejectedValueOnce(new Error('Send failed'));

                await expect(
                    service.sendEmailVerificationEmail(mockUser.id, verificationToken),
                ).rejects.toThrow('FAILED_TO_SEND_EMAIL_VERIFICATION_EMAIL');
            });
        });

        describe('sendAccountActivationEmail', () => {
            const activationToken = 'test-activation-token-456';

            it('should send account activation email successfully', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);

                const result = await service.sendAccountActivationEmail(
                    mockUser.id,
                    activationToken,
                );

                expect(result.success).toBe(true);
                expect(result.message).toContain('Activation email sent');
                expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
                    where: { id: mockUser.id },
                });
                expect(mockEmailProvider.send).toHaveBeenCalled();
            });

            it('should throw error when user not found', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

                await expect(
                    service.sendAccountActivationEmail(mockUser.id, activationToken),
                ).rejects.toThrow('USER_NOT_FOUND');
            });

            it('should throw error when email send fails', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
                mockEmailProvider.send.mockRejectedValueOnce(new Error('Send failed'));

                await expect(
                    service.sendAccountActivationEmail(mockUser.id, activationToken),
                ).rejects.toThrow('FAILED_TO_SEND_ACCOUNT_ACTIVATION_EMAIL');
            });
        });

        describe('sendLoginNotificationEmail', () => {
            const loginDetails = {
                ipAddress: '192.168.1.100',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                location: 'San Francisco, CA',
                timestamp: new Date('2026-02-08T10:00:00Z'),
            };

            it('should send login notification email successfully', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);

                const result = await service.sendLoginNotificationEmail(
                    mockUser.id,
                    loginDetails,
                );

                expect(result.success).toBe(true);
                expect(result.message).toContain('Login notification sent');
                expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
                    where: { id: mockUser.id },
                });
                expect(mockEmailProvider.send).toHaveBeenCalled();
            });

            it('should throw error when user not found', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

                await expect(
                    service.sendLoginNotificationEmail(mockUser.id, loginDetails),
                ).rejects.toThrow('USER_NOT_FOUND');
            });

            it('should throw error when email send fails', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
                mockEmailProvider.send.mockRejectedValueOnce(new Error('Send failed'));

                await expect(
                    service.sendLoginNotificationEmail(mockUser.id, loginDetails),
                ).rejects.toThrow('FAILED_TO_SEND_LOGIN_NOTIFICATION_EMAIL');
            });

            it('should handle login details with optional fields', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);

                const minimalLoginDetails = {
                    timestamp: new Date('2026-02-08T10:00:00Z'),
                };

                const result = await service.sendLoginNotificationEmail(
                    mockUser.id,
                    minimalLoginDetails,
                );

                expect(result.success).toBe(true);
                expect(mockEmailProvider.send).toHaveBeenCalled();
            });
        });

        describe('sendPasswordChangedEmail', () => {
            it('should send password changed email successfully', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);

                const result = await service.sendPasswordChangedEmail(mockUser.id);

                expect(result.success).toBe(true);
                expect(result.message).toContain('Password change confirmation sent');
                expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
                    where: { id: mockUser.id },
                });
                expect(mockEmailProvider.send).toHaveBeenCalled();
            });

            it('should throw error when user not found', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

                await expect(
                    service.sendPasswordChangedEmail(mockUser.id),
                ).rejects.toThrow('USER_NOT_FOUND');
            });

            it('should throw error when email send fails', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
                mockEmailProvider.send.mockRejectedValueOnce(new Error('Send failed'));

                await expect(
                    service.sendPasswordChangedEmail(mockUser.id),
                ).rejects.toThrow('FAILED_TO_SEND_PASSWORD_CHANGED_EMAIL');
            });
        });
    });
});
