import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertService } from './alert.service';
import { PrismaService } from '../services/prisma.service';
import { RateLimitService } from './rate-limit.service';
import { AlertStatusEventPublisher } from './events/alert-status-event.publisher';
import { AlertStatus, PetSpecies } from '../generated/prisma';
import { CreateAlertDto, UpdateAlertDto, ResolveAlertDto, AlertOutcome } from './dto';
import type { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';
import { NotificationService } from '../notification/notification.service';

describe('AlertService', () => {
    let service: AlertService;
    let prisma: PrismaService;

    const mockAlertStatusEvents = {
        activated: jest.fn(),
        resolved: jest.fn(),
        cancelled: jest.fn(),
        expired: jest.fn(),
    };

    const mockPrismaService = {
        $queryRaw: jest.fn(),
        $queryRawUnsafe: jest.fn(),
        $executeRaw: jest.fn(),
        alert: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        user: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
        pet: {
            findUnique: jest.fn(),
            update: jest.fn(),
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

    const mockNotificationService = {
        queueAlertNotifications: jest.fn().mockResolvedValue(undefined),
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
                {
                    provide: NotificationService,
                    useValue: mockNotificationService,
                },
                {
                    provide: AlertStatusEventPublisher,
                    useValue: mockAlertStatusEvents,
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
            expect(mockNotificationService.queueAlertNotifications).toHaveBeenCalledTimes(1);
            expect(mockNotificationService.queueAlertNotifications).toHaveBeenCalledWith(alertId);
        });

        it('should still create the alert when queuing notifications fails', async () => {
            const userId = 1;
            const alertId = 43;

            mockPrismaService.$queryRaw.mockResolvedValueOnce([{ id: alertId }]);
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({
                id: alertId,
                creator_id: userId,
                pet_name: 'Max',
                pet_species: PetSpecies.DOG,
                status: AlertStatus.ACTIVE,
                sightings: [],
            });
            mockNotificationService.queueAlertNotifications.mockRejectedValueOnce(
                new Error('Redis unavailable'),
            );

            const result = await service.create(userId, mockCreateDto);

            expect(result.id).toBe(alertId);
            expect(mockNotificationService.queueAlertNotifications).toHaveBeenCalledWith(alertId);
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
                        orderBy: { sighting_time: 'desc' },
                    },
                    pet: { select: { tagId: true } },
                },
            });
        });

        const publicAlertRow = () => ({
            id: 7,
            creator_id: 1,
            pet_id: 5,
            pet: { tagId: 'LUNA2M4PQ' },
            pet_name: 'Luna',
            pet_species: PetSpecies.CAT,
            pet_breed: null,
            pet_description: 'Grey tabby',
            pet_color: 'Grey',
            pet_age_years: 2,
            pet_photos: ['https://cdn/luna.jpg'],
            last_seen_lat: 35.1712345,
            last_seen_lon: 33.3698765,
            location_address: 'Strovolos',
            alert_radius_km: 5,
            status: AlertStatus.ACTIVE,
            time_last_seen: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
            expires_at: new Date(),
            resolved_at: null,
            cancelled_at: null,
            renewal_count: 0,
            contact_phone: '+35799000000',
            contact_email: 'owner@example.com',
            is_phone_public: true,
            affected_postal_codes: ['2000', '2001'],
            notes: 'Shy, do not chase',
            reward_offered: true,
            reward_amount: '100.00',
            sightings: [{ id: 1 }],
        });

        it('maps tagId from the linked pet', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce(publicAlertRow());

            const result = await service.findById(7, 1);

            expect(result!.tagId).toBe('LUNA2M4PQ');
        });

        it('returns tagId null when the alert has no registered pet', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({
                ...publicAlertRow(),
                pet_id: null,
                pet: null,
            });

            const result = await service.findById(7, 1);

            expect(result!.tagId).toBeNull();
        });

        it('redacts member-only fields for anonymous callers', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce(publicAlertRow());

            const result = await service.findById(7, undefined);

            expect(result!.creatorId).toBeUndefined();
            expect(result!.contactEmail).toBeUndefined();
            expect(result!.notes).toBeUndefined();
            expect(result!.affectedPostalCodes).toBeUndefined();
            expect(result!.lastSeenLat).toBe(35.171);
            expect(result!.lastSeenLon).toBe(33.37);
            // Public-by-design fields survive
            expect(result!.tagId).toBe('LUNA2M4PQ');
            expect(result!.contactPhone).toBe('+35799000000');
            expect(result!.petPhotos).toEqual(['https://cdn/luna.jpg']);
            expect(result!.rewardAmount).toBe(100);
            expect(result!.sightingCount).toBe(1);
        });

        it('hides contactPhone from anonymous callers when not public', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({
                ...publicAlertRow(),
                is_phone_public: false,
            });

            const result = await service.findById(7, undefined);

            expect(result!.contactPhone).toBeUndefined();
        });

        it('keeps creatorId, notes and postal codes for bearer non-creators', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce(publicAlertRow());

            const result = await service.findById(7, 99);

            expect(result!.creatorId).toBe(1);
            expect(result!.notes).toBe('Shy, do not chase');
            expect(result!.affectedPostalCodes).toEqual(['2000', '2001']);
            expect(result!.contactEmail).toBeUndefined();
            expect(result!.lastSeenLat).toBe(35.1712345);
        });
    });

    describe('findActiveByTagId', () => {
        const row = {
            id: 7,
            creator_id: 1,
            pet_id: 5,
            pet: { tagId: 'LUNA2M4PQ' },
            pet_name: 'Luna',
            pet_species: PetSpecies.CAT,
            pet_description: 'Grey tabby',
            pet_photos: [],
            last_seen_lat: 35.1,
            last_seen_lon: 33.3,
            alert_radius_km: 5,
            status: AlertStatus.ACTIVE,
            time_last_seen: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
            expires_at: new Date(),
            renewal_count: 0,
            contact_phone: '+35799000000',
            contact_email: 'owner@example.com',
            is_phone_public: false,
            affected_postal_codes: [],
            notes: 'private',
            reward_offered: false,
            reward_amount: null,
            sightings: [],
        };

        it('queries the newest ACTIVE alert for the tag', async () => {
            mockPrismaService.alert.findFirst.mockResolvedValueOnce(row);

            const result = await service.findActiveByTagId('LUNA2M4PQ');

            expect(mockPrismaService.alert.findFirst).toHaveBeenCalledWith({
                where: { status: AlertStatus.ACTIVE, pet: { tagId: 'LUNA2M4PQ' } },
                orderBy: { created_at: 'desc' },
                include: {
                    sightings: {
                        where: { dismissed: false },
                        orderBy: { sighting_time: 'desc' },
                    },
                    pet: { select: { tagId: true } },
                },
            });
            expect(result!.id).toBe(7);
            expect(result!.tagId).toBe('LUNA2M4PQ');
            expect(result!.creatorId).toBeUndefined();
            expect(result!.notes).toBeUndefined();
            expect(result!.contactPhone).toBeUndefined();
        });

        it('returns null when the tag has no active alert', async () => {
            mockPrismaService.alert.findFirst.mockResolvedValueOnce(null);

            expect(await service.findActiveByTagId('ZZZZZZZZZ')).toBeNull();
        });

        it('shows the creator their own contact details', async () => {
            mockPrismaService.alert.findFirst.mockResolvedValueOnce(row);

            const result = await service.findActiveByTagId('LUNA2M4PQ', 1);

            expect(result!.creatorId).toBe(1);
            expect(result!.contactEmail).toBe('owner@example.com');
            expect(result!.contactPhone).toBe('+35799000000');
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

        it('should map every column and show contact details to the creator', async () => {
            const timeLastSeen = new Date('2026-09-25T17:09:00.000Z');
            const mockAlert = {
                id: 14,
                creator_id: 7,
                pet_id: 10,
                pet_name: 'Bobos',
                pet_species: PetSpecies.DOG,
                pet_breed: null,
                pet_description: 'Dog · male · small',
                pet_color: null,
                pet_age_years: null,
                pet_photos: ['a.jpg'],
                last_seen_lat: 35.1725,
                last_seen_lon: 33.3653,
                location_address: null,
                alert_radius_km: 5.0,
                status: AlertStatus.ACTIVE,
                time_last_seen: timeLastSeen,
                created_at: new Date(),
                updated_at: new Date(),
                expires_at: new Date(),
                resolved_at: null,
                cancelled_at: null,
                renewal_count: 1,
                contact_phone: '+35799000000',
                contact_email: 'owner@example.com',
                is_phone_public: false,
                affected_postal_codes: ['1010'],
                notes: 'I miss him',
                reward_offered: true,
                reward_amount: '50.00',
                sightings: [{ id: 1 }, { id: 2 }],
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);

            const result = await service.findById(14, 7); // Creator

            expect(result).toMatchObject({
                id: 14,
                creatorId: 7,
                petId: 10,
                petName: 'Bobos',
                petSpecies: PetSpecies.DOG,
                petPhotos: ['a.jpg'],
                lastSeenLat: 35.1725,
                lastSeenLon: 33.3653,
                alertRadiusKm: 5.0,
                status: AlertStatus.ACTIVE,
                timeLastSeen,
                renewalCount: 1,
                contactPhone: '+35799000000',
                contactEmail: 'owner@example.com',
                isPhonePublic: false,
                affectedPostalCodes: ['1010'],
                notes: 'I miss him',
                rewardOffered: true,
                rewardAmount: 50,
                sightingCount: 2,
            });
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

    describe('cancel', () => {
        it('should cancel an active alert and record the reason', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                pet_id: null,
                status: AlertStatus.ACTIVE,
                cancelled_at: null,
                notes: null,
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);
            mockPrismaService.alert.update.mockResolvedValueOnce({
                ...mockAlert,
                status: AlertStatus.CANCELLED,
            });
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({
                ...mockAlert,
                status: AlertStatus.CANCELLED,
                sightings: [],
            });

            const result = await service.cancel(1, 1, { reason: 'Posted by mistake' });

            expect(result.status).toBe(AlertStatus.CANCELLED);
            expect(mockPrismaService.alert.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: {
                    status: AlertStatus.CANCELLED,
                    cancelled_at: expect.any(Date),
                    notes: 'Posted by mistake',
                },
            });
            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ action: 'alert_cancelled' }),
            );
            expect(mockAlertStatusEvents.cancelled).toHaveBeenCalledWith(
                expect.objectContaining({
                    alertId: 1,
                    creatorId: 1,
                    previousStatus: AlertStatus.ACTIVE,
                    changedBy: 1,
                    source: 'user',
                    reason: 'Posted by mistake',
                }),
            );
        });

        it('should clear the pet missing flag when no other alert is active', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                pet_id: 7,
                status: AlertStatus.DRAFT,
                cancelled_at: null,
                notes: null,
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);
            mockPrismaService.alert.update.mockResolvedValueOnce(mockAlert);
            mockPrismaService.alert.count.mockResolvedValueOnce(0);
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({ ...mockAlert, sightings: [] });

            await service.cancel(1, 1, {});

            expect(mockPrismaService.alert.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: { status: AlertStatus.CANCELLED, cancelled_at: expect.any(Date) },
            });
            expect(mockPrismaService.pet.update).toHaveBeenCalledWith({
                where: { id: 7 },
                data: { isMissing: false },
            });
        });

        it('should keep the pet missing flag when another alert is still active', async () => {
            const mockAlert = {
                id: 1,
                creator_id: 1,
                pet_id: 7,
                status: AlertStatus.ACTIVE,
                cancelled_at: null,
                notes: null,
            };

            mockPrismaService.alert.findUnique.mockResolvedValueOnce(mockAlert);
            mockPrismaService.alert.update.mockResolvedValueOnce(mockAlert);
            mockPrismaService.alert.count.mockResolvedValueOnce(1);
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({ ...mockAlert, sightings: [] });

            await service.cancel(1, 1, {});

            expect(mockPrismaService.pet.update).not.toHaveBeenCalled();
        });

        it('should throw NotFoundException if alert not found', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce(null);

            await expect(service.cancel(999, 1, {})).rejects.toThrow(NotFoundException);
        });

        it('should throw ForbiddenException if user is not the creator', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({
                id: 1,
                creator_id: 2,
                status: AlertStatus.ACTIVE,
            });

            await expect(service.cancel(1, 1, {})).rejects.toThrow(ForbiddenException);
        });

        it.each([AlertStatus.RESOLVED, AlertStatus.EXPIRED, AlertStatus.CANCELLED])(
            'should throw UnprocessableEntityException for a %s alert',
            async (status) => {
                mockPrismaService.alert.findUnique.mockResolvedValueOnce({
                    id: 1,
                    creator_id: 1,
                    status,
                });

                await expect(service.cancel(1, 1, {})).rejects.toThrow(UnprocessableEntityException);
                expect(mockPrismaService.alert.update).not.toHaveBeenCalled();
            },
        );
    });

    describe('renew', () => {
        it('should reject renewing a cancelled alert', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValueOnce({
                id: 1,
                creator_id: 1,
                status: AlertStatus.CANCELLED,
                renewal_count: 0,
            });

            await expect(service.renew(1, 1)).rejects.toThrow(UnprocessableEntityException);
            expect(mockPrismaService.alert.update).not.toHaveBeenCalled();
        });

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
                    tag_id: 'LUNA2M4PQ',
                },
            ];

            mockPrismaService.$queryRawUnsafe.mockResolvedValueOnce(mockAlerts);

            const result = await service.findNearby(
                {
                    lat: 37.7749,
                    lon: -122.4194,
                    radiusKm: 10,
                    status: AlertStatus.ACTIVE,
                    limit: 20,
                    offset: 0,
                },
                1,
            );

            expect(result).toBeDefined();
            expect(result.length).toBe(1);
            expect(result[0].distanceKm).toBe(2.5);
            expect(result[0].tagId).toBe('LUNA2M4PQ');
            expect(result[0].creatorId).toBe(1);
            expect(mockPrismaService.$queryRawUnsafe).toHaveBeenCalledTimes(1);

            const [sql, ...params] = mockPrismaService.$queryRawUnsafe.mock.calls[0];
            expect(sql).toContain('LEFT JOIN pet p ON p.id = a.pet_id');
            expect(sql).toContain('p.tag_id');
            expect(sql).toContain('ORDER BY distance_km ASC');
            expect(params[0]).toBe(AlertStatus.ACTIVE);
        });

        it('orders newest first without coordinates', async () => {
            mockPrismaService.$queryRawUnsafe.mockResolvedValueOnce([]);

            await service.findNearby({ limit: 20, offset: 0 });

            const [sql] = mockPrismaService.$queryRawUnsafe.mock.calls[0];
            expect(sql).toContain('ORDER BY a.created_at DESC');
            expect(sql).toContain('a.status = $1');
        });

        it('redacts member-only fields for anonymous callers', async () => {
            mockPrismaService.$queryRawUnsafe.mockResolvedValueOnce([
                {
                    id: 2,
                    creator_id: 9,
                    pet_id: null,
                    tag_id: null,
                    pet_name: 'Rex',
                    pet_species: PetSpecies.DOG,
                    pet_description: 'Brown',
                    pet_photos: [],
                    last_seen_lat: 35.1712345,
                    last_seen_lon: 33.3698765,
                    alert_radius_km: 5,
                    status: AlertStatus.ACTIVE,
                    time_last_seen: new Date(),
                    created_at: new Date(),
                    updated_at: new Date(),
                    expires_at: new Date(),
                    renewal_count: 0,
                    contact_phone: '+35799000000',
                    contact_email: 'owner@example.com',
                    is_phone_public: true,
                    affected_postal_codes: ['2000'],
                    notes: 'private',
                    reward_offered: false,
                    reward_amount: null,
                    distance_km: null,
                },
            ]);

            const [dto] = await service.findNearby({ limit: 20, offset: 0 });

            expect(dto.tagId).toBeNull();
            expect(dto.creatorId).toBeUndefined();
            expect(dto.contactEmail).toBeUndefined();
            expect(dto.notes).toBeUndefined();
            expect(dto.affectedPostalCodes).toBeUndefined();
            expect(dto.lastSeenLat).toBe(35.171);
            expect(dto.lastSeenLon).toBe(33.37);
            expect(dto.contactPhone).toBe('+35799000000');
            expect(dto.distanceKm).toBeUndefined();
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
            process.env.WEB_APP_URL = 'https://fifi-alert.com';
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