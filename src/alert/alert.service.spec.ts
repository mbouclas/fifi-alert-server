import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertService } from './alert.service';
import { PrismaService } from '../services/prisma.service';
import { RateLimitService } from './rate-limit.service';
import { AlertStatus, PetSpecies } from '../generated/prisma';
import { CreateAlertDto, UpdateAlertDto, ResolveAlertDto, AlertOutcome } from './dto';
import type { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';

describe('AlertService', () => {
    let service: AlertService;
    let prisma: PrismaService;

    const mockPrismaService = {
        $queryRaw: jest.fn(),
        $executeRaw: jest.fn(),
        alert: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
        },
        user: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
        pet: {
            findUnique: jest.fn(),
        },
    };

    const mockRateLimitService = {
        checkAlertCreationLimit: jest.fn(),
    };

    const mockEventEmitter = {
        emit: jest.fn(),
    };

    const mockEmailProvider = {
        send: jest.fn().mockResolvedValue({
            id: 'test-message-id',
            success: true,
        }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AlertService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: RateLimitService,
                    useValue: mockRateLimitService,
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

        service = module.get<AlertService>(AlertService);
        prisma = module.get<PrismaService>(PrismaService);

        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        const mockCreateDto: CreateAlertDto = {
            pet: {
                name: 'Max',
                species: PetSpecies.DOG,
                breed: 'Golden Retriever',
                description: 'Friendly golden retriever',
                color: 'Golden',
                ageYears: 3,
                photos: ['https://example.com/photo1.jpg'],
            },
            location: {
                lat: 37.7749,
                lon: -122.4194,
                address: '123 Market St, San Francisco, CA',
                lastSeenTime: '2026-02-05T10:00:00Z',
                radiusKm: 5.0,
            },
            contact: {
                phone: '+14155550101',
                email: 'owner@example.com',
                isPhonePublic: true,
            },
            reward: {
                offered: true,
                amount: 500,
            },
            notes: 'Please help find Max!',
        };

        it('should create an alert successfully', async () => {
            const userId = 1;
            const alertId = 42;

            // Mock the insert query
            mockPrismaService.$queryRaw.mockResolvedValueOnce([{ id: alertId }]);

            // Mock findById
            const mockAlert = {
                id: alertId,
                creator_id: userId,
                pet_name: 'Max',
                pet_species: PetSpecies.DOG,
                status: AlertStatus.ACTIVE,
                sightings: [],
            };
            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);

            const result = await service.create(userId, mockCreateDto);

            expect(result).toBeDefined();
            expect(result.id).toBe(alertId);
            expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1);
        });
    });

    describe('findById', () => {
        it('should return an alert when found', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                pet_name: 'Max',
                pet_species: PetSpecies.DOG,
                pet_breed: 'Golden Retriever',
                pet_description: 'Friendly dog',
                pet_color: 'Golden',
                pet_age_years: 3,
                pet_photos: [],
                last_seen_lat: 37.7749,
                last_seen_lon: -122.4194,
                location_address: 'SF',
                alert_radius_km: 5.0,
                status: AlertStatus.ACTIVE,
                time_last_seen: new Date(),
                created_at: new Date(),
                updated_at: new Date(),
                expires_at: new Date(),
                resolved_at: null,
                renewal_count: 0,
                contact_phone: '+14155550101',
                contact_email: 'owner@example.com',
                is_phone_public: true,
                affected_postal_codes: [],
                notes: null,
                reward_offered: false,
                reward_amount: null,
                sightings: [],
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);

            const result = await service.findById(1, 1);

            expect(result).toBeDefined();
            expect(result!.id).toBe(1);
            expect(result!.petName).toBe('Max');
            expect(mockPrismaService.alert.findUnique).toHaveBeenCalledWith({
                where: { id: 1 },
                include: {
                    sightings: {
                        where: { dismissed: false },
                        orderBy: { sightingTime: 'desc' },
                    },
                },
            });
        });

        it('should return null when alert not found', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce(null);

            const result = await service.findById(999);

            expect(result).toBeNull();
        });

        it('should hide contact email from non-creators', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                pet_name: 'Max',
                pet_species: PetSpecies.DOG,
                pet_breed: null,
                pet_description: 'Friendly dog',
                pet_color: null,
                pet_age_years: null,
                pet_photos: [],
                last_seen_lat: 37.7749,
                last_seen_lon: -122.4194,
                location_address: null,
                alert_radius_km: 5.0,
                status: AlertStatus.ACTIVE,
                time_last_seen: new Date(),
                created_at: new Date(),
                updated_at: new Date(),
                expires_at: new Date(),
                resolved_at: null,
                renewal_count: 0,
                contact_phone: '+14155550101',
                contact_email: 'owner@example.com',
                is_phone_public: false,
                affected_postal_codes: [],
                notes: null,
                reward_offered: false,
                reward_amount: null,
                sightings: [],
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);

            const result = await service.findById(1, 999); // Different user

            expect(result!.contactEmail).toBeUndefined();
            expect(result!.contactPhone).toBeUndefined(); // Phone is not public
        });
    });

    describe('update', () => {
        it('should update an alert successfully', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                creatorId: 1,
                pet_photos: ['photo1.jpg'],
                petPhotos: ['photo1.jpg'],
            };

            const updateDto: UpdateAlertDto = {
                petDescription: 'Updated description',
                notes: 'Updated notes',
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);
            mockPrismaService.alert.update.mockResolvedValueOnce({ ...mockAlert, ...updateDto });
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({
                ...mockAlert,
                pet_description: updateDto.petDescription,
                sightings: []
            });

            const result = await service.update(1, 1, updateDto);

            expect(result).toBeDefined();
            expect(mockPrismaService.alert.update).toHaveBeenCalled();
        });

        it('should throw NotFoundException when alert does not exist', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce(null);

            await expect(service.update(999, 1, {})).rejects.toThrow(NotFoundException);
        });

        it('should throw ForbiddenException when user is not the creator', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                creatorId: 1,
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);

            await expect(service.update(1, 999, {})).rejects.toThrow(ForbiddenException);
        });

        it('should append photos to existing photos', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                creatorId: 1,
                pet_photos: ['photo1.jpg'],
                petPhotos: ['photo1.jpg'],
            };

            const updateDto: UpdateAlertDto = {
                petPhotos: ['photo2.jpg', 'photo3.jpg'],
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);
            mockPrismaService.alert.update.mockResolvedValueOnce(mockAlert);
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({ ...mockAlert, sightings: [] });

            await service.update(1, 1, updateDto);

            expect(mockPrismaService.alert.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: expect.objectContaining({
                    petPhotos: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],
                }),
            });
        });
    });

    describe('resolve', () => {
        it('should resolve an alert successfully', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                creatorId: 1,
                status: AlertStatus.ACTIVE,
            };

            const resolveDto: ResolveAlertDto = {
                outcome: AlertOutcome.FOUND_SAFE,
                notes: 'Found safe at home!',
                shareSuccessStory: true,
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);
            mockPrismaService.alert.update.mockResolvedValueOnce({
                ...mockAlert,
                status: AlertStatus.RESOLVED,
            });
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({
                ...mockAlert,
                status: AlertStatus.RESOLVED,
                sightings: [],
            });

            const result = await service.resolve(1, 1, resolveDto);

            expect(result).toBeDefined();
            expect(mockPrismaService.alert.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: expect.objectContaining({
                    status: AlertStatus.RESOLVED,
                    resolvedAt: expect.any(Date),
                }),
            });
        });

        it('should throw NotFoundException when alert does not exist', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce(null);

            const resolveDto: ResolveAlertDto = {
                outcome: AlertOutcome.FOUND_SAFE,
                notes: 'Found!',
                shareSuccessStory: false,
            };

            await expect(service.resolve(999, 1, resolveDto)).rejects.toThrow(NotFoundException);
        });

        it('should throw ForbiddenException when user is not the creator', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                creatorId: 1,
                status: AlertStatus.ACTIVE,
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);

            const resolveDto: ResolveAlertDto = {
                outcome: AlertOutcome.FOUND_SAFE,
                notes: 'Found!',
                shareSuccessStory: false,
            };

            await expect(service.resolve(1, 999, resolveDto)).rejects.toThrow(ForbiddenException);
        });

        it('should throw UnprocessableEntityException when alert is already resolved', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                creatorId: 1,
                status: AlertStatus.RESOLVED,
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);

            const resolveDto: ResolveAlertDto = {
                outcome: AlertOutcome.FOUND_SAFE,
                notes: 'Found!',
                shareSuccessStory: false,
            };

            await expect(service.resolve(1, 1, resolveDto)).rejects.toThrow(UnprocessableEntityException);
        });
    });

    describe('renew', () => {
        it('should renew an alert successfully', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                creatorId: 1,
                renewal_count: 1,
                renewalCount: 1,
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);
            mockPrismaService.alert.update.mockResolvedValueOnce({
                ...mockAlert,
                renewal_count: 2,
            });
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({
                ...mockAlert,
                renewal_count: 2,
                sightings: [],
            });

            const result = await service.renew(1, 1);

            expect(result).toBeDefined();
            expect(mockPrismaService.alert.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: expect.objectContaining({
                    renewalCount: 2,
                    expiresAt: expect.any(Date),
                }),
            });
        });

        it('should throw NotFoundException when alert does not exist', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce(null);

            await expect(service.renew(999, 1)).rejects.toThrow(NotFoundException);
        });

        it('should throw ForbiddenException when user is not the creator', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                creatorId: 1,
                renewal_count: 1,
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);

            await expect(service.renew(1, 999)).rejects.toThrow(ForbiddenException);
        });

        it('should throw UnprocessableEntityException when renewal limit is reached', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                creatorId: 1,
                renewal_count: 3,
                renewalCount: 3,
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);

            await expect(service.renew(1, 1)).rejects.toThrow(UnprocessableEntityException);
        });
    });

    describe('findNearby', () => {
        it('should find nearby alerts with geospatial query', async () => {
            const mockAlerts = [
                {
                    id: 1,
                    creator_id: 1,
                    pet_name: 'Max',
                    pet_species: PetSpecies.DOG,
                    pet_breed: 'Golden Retriever',
                    pet_description: 'Friendly dog',
                    pet_color: 'Golden',
                    pet_age_years: 3,
                    pet_photos: [],
                    last_seen_lat: 37.7749,
                    last_seen_lon: -122.4194,
                    location_address: 'SF',
                    alert_radius_km: 5.0,
                    status: AlertStatus.ACTIVE,
                    time_last_seen: new Date(),
                    created_at: new Date(),
                    updated_at: new Date(),
                    expires_at: new Date(),
                    resolved_at: null,
                    renewal_count: 0,
                    contact_phone: '+14155550101',
                    contact_email: 'owner@example.com',
                    is_phone_public: true,
                    affected_postal_codes: [],
                    notes: null,
                    reward_offered: false,
                    reward_amount: null,
                    distance_km: 2.5,
                },
            ];

            mockPrismaService.$queryRaw.mockResolvedValueOnce(mockAlerts);

            const result = await service.findNearby({
                lat: 37.7749,
                lon: -122.4194,
                radiusKm: 10,
                status: AlertStatus.ACTIVE,
                limit: 20,
                offset: 0,
            });

            expect(result).toBeDefined();
            expect(result.length).toBe(1);
            expect(result[0].distanceKm).toBe(2.5);
            expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1);
        });
    });
    describe('Email Methods', () => {
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

        const mockAlert = {
            id: 42,
            creatorId: 1,
            pet: {
                name: 'Max',
                species: PetSpecies.DOG,
                breed: 'Golden Retriever',
                description: 'Friendly dog',
                color: 'Golden',
                ageYears: 3,
                photos: ['https://example.com/photo1.jpg'],
            },
            location: {
                lat: 37.7749,
                lon: -122.4194,
                address: '123 Market St, San Francisco, CA',
                radiusKm: 5.0,
            },
            status: AlertStatus.ACTIVE,
            resolvedAt: null,
            reward: {
                offered: true,
                amount: 500,
            },
        };

        beforeEach(() => {
            process.env.MAIL_NOTIFICATIONS_FROM = 'noreply@fifi-alert.com';
            process.env.APP_URL = 'https://fifi-alert.com';
        });

        describe('sendAlertCreatedEmail', () => {
            it('should send alert created email successfully', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);

                const result = await service.sendAlertCreatedEmail(mockAlert as any);

                expect(result.success).toBe(true);
                expect(result.message).toContain('Alert created email sent');
                expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
                    where: { id: mockUser.id },
                });
            });

            it('should throw error when user not found', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

                await expect(service.sendAlertCreatedEmail(mockAlert as any)).rejects.toThrow(
                    'USER_NOT_FOUND',
                );
            });

            it('should throw error when email send fails', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
                mockEmailProvider.send.mockRejectedValueOnce(new Error('Send failed'));

                await expect(service.sendAlertCreatedEmail(mockAlert as any)).rejects.toThrow(
                    'FAILED_TO_SEND_ALERT_CREATED_EMAIL',
                );
            });
        });

        describe('sendAlertResolvedEmail', () => {
            const resolvedAlert = {
                ...mockAlert,
                status: AlertStatus.RESOLVED,
                resolvedAt: new Date(),
            };

            it('should send alert resolved email successfully', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);

                const result = await service.sendAlertResolvedEmail(
                    resolvedAlert as any,
                    'FOUND',
                );

                expect(result.success).toBe(true);
                expect(result.message).toContain('Alert resolved email sent');
                expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
                    where: { id: mockUser.id },
                });
            });

            it('should throw error when user not found', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

                await expect(
                    service.sendAlertResolvedEmail(resolvedAlert as any, 'FOUND'),
                ).rejects.toThrow('USER_NOT_FOUND');
            });

            it('should throw error when email send fails', async () => {
                mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
                mockEmailProvider.send.mockRejectedValueOnce(new Error('Send failed'));

                await expect(
                    service.sendAlertResolvedEmail(resolvedAlert as any, 'FOUND'),
                ).rejects.toThrow('FAILED_TO_SEND_ALERT_RESOLVED_EMAIL');
            });
        });

        describe('sendAlertNearYouEmails', () => {
            const userIds = [1, 2, 3];
            const users = [
                { ...mockUser, id: 1 },
                { ...mockUser, id: 2, email: 'user2@example.com' },
                { ...mockUser, id: 3, email: 'user3@example.com' },
            ];

            it('should send emails to all nearby users successfully', async () => {
                mockPrismaService.user.findMany.mockResolvedValueOnce(users);

                const result = await service.sendAlertNearYouEmails(userIds, mockAlert as any);

                expect(result.success).toBe(3);
                expect(result.failed).toBe(0);
                expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
                    where: { id: { in: userIds } },
                });
            });

            it('should return zeros when no users found', async () => {
                mockPrismaService.user.findMany.mockResolvedValueOnce([]);

                const result = await service.sendAlertNearYouEmails(userIds, mockAlert as any);

                expect(result.success).toBe(0);
                expect(result.failed).toBe(0);
            });

            it('should handle partial failures gracefully', async () => {
                mockPrismaService.user.findMany.mockResolvedValueOnce(users);

                // First email succeeds, second fails, third succeeds
                mockEmailProvider.send
                    .mockResolvedValueOnce({ id: 'msg-1', success: true })
                    .mockRejectedValueOnce(new Error('Send failed'))
                    .mockResolvedValueOnce({ id: 'msg-3', success: true });

                const result = await service.sendAlertNearYouEmails(userIds, mockAlert as any);

                expect(result.success).toBe(2);
                expect(result.failed).toBe(1);
            });
        });
    });
});