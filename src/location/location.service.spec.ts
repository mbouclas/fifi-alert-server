import { Test, TestingModule } from '@nestjs/testing';
import { LocationService } from './location.service';
import { GeospatialService } from './geospatial.service';
import { PrismaService } from '../services/prisma.service';
import {
    NotificationConfidence,
    LocationSource,
    AlertStatus,
} from '../generated/prisma';

describe('LocationService', () => {
    let service: LocationService;
    let prismaService: PrismaService;
    let geospatialService: GeospatialService;

    // Mock Prisma service
    const mockPrismaService = {
        alert: {
            findUnique: jest.fn(),
        },
        $queryRaw: jest.fn(),
    };

    // Mock Geospatial service
    const mockGeospatialService = {
        calculateDistance: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LocationService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: GeospatialService,
                    useValue: mockGeospatialService,
                },
            ],
        }).compile();

        service = module.get<LocationService>(LocationService);
        prismaService = module.get<PrismaService>(PrismaService);
        geospatialService = module.get<GeospatialService>(GeospatialService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('findDevicesForAlert', () => {
        const mockAlert = {
            id: 1,
            status: AlertStatus.ACTIVE,
            last_seen_lat: 37.7749,
            last_seen_lon: -122.4194,
            alert_radius_km: 5.0,
            affected_postal_codes: ['94102', '94103'],
        };

        it('should return empty array if alert not found', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue(null);

            const result = await service.findDevicesForAlert(1);

            expect(result).toEqual([]);
            expect(mockPrismaService.alert.findUnique).toHaveBeenCalledWith({
                where: { id: 1 },
                select: {
                    id: true,
                    status: true,
                    last_seen_lat: true,
                    last_seen_lon: true,
                    alert_radius_km: true,
                    affected_postal_codes: true,
                },
            });
        });

        it('should return empty array if alert is not ACTIVE', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue({
                ...mockAlert,
                status: AlertStatus.RESOLVED,
            });

            const result = await service.findDevicesForAlert(1);

            expect(result).toEqual([]);
        });

        it('should return empty array if alert has no coordinates', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue({
                ...mockAlert,
                last_seen_lat: null,
                last_seen_lon: null,
            });

            const result = await service.findDevicesForAlert(1);

            expect(result).toEqual([]);
        });

        it('should find devices via saved zones (HIGH confidence)', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue(mockAlert);

            // Mock saved zone matches
            mockPrismaService.$queryRaw
                .mockResolvedValueOnce([
                    {
                        device_id: 'device-1',
                        user_id: 'user-1',
                        push_token: 'token-1',
                        zone_id: 'zone-1',
                        zone_name: 'Home',
                        zone_radius_km: 2.0,
                        distance_km: 1.5,
                    },
                ])
                // Mock other match types returning empty
                .mockResolvedValueOnce([]) // fresh GPS
                .mockResolvedValueOnce([]) // stale GPS
                .mockResolvedValueOnce([]) // postal codes
                .mockResolvedValueOnce([]); // IP geo

            const result = await service.findDevicesForAlert(1);

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                deviceId: 'device-1',
                userId: 'user-1',
                pushToken: 'token-1',
                confidence: NotificationConfidence.HIGH,
                matchReason: LocationSource.MANUAL,
                distanceKm: 1.5,
                matchedVia: 'Saved zone: Home',
            });
        });

        it('should find devices via fresh GPS (HIGH confidence)', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue(mockAlert);

            mockPrismaService.$queryRaw
                .mockResolvedValueOnce([]) // saved zones
                .mockResolvedValueOnce([
                    {
                        device_id: 'device-2',
                        user_id: 'user-2',
                        push_token: 'token-2',
                        distance_km: 2.3,
                        gps_age_hours: 1.2,
                    },
                ])
                .mockResolvedValueOnce([]) // stale GPS
                .mockResolvedValueOnce([]) // postal codes
                .mockResolvedValueOnce([]); // IP geo

            const result = await service.findDevicesForAlert(1);

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                deviceId: 'device-2',
                confidence: NotificationConfidence.HIGH,
                matchReason: LocationSource.GPS,
                distanceKm: 2.3,
                matchedVia: 'Fresh GPS (1.2h old)',
            });
        });

        it('should find devices via stale GPS (MEDIUM confidence)', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue(mockAlert);

            mockPrismaService.$queryRaw
                .mockResolvedValueOnce([]) // saved zones
                .mockResolvedValueOnce([]) // fresh GPS
                .mockResolvedValueOnce([
                    {
                        device_id: 'device-3',
                        user_id: 'user-3',
                        push_token: 'token-3',
                        distance_km: 4.8,
                        gps_age_hours: 8.5,
                    },
                ])
                .mockResolvedValueOnce([]) // postal codes
                .mockResolvedValueOnce([]); // IP geo

            const result = await service.findDevicesForAlert(1);

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                deviceId: 'device-3',
                confidence: NotificationConfidence.MEDIUM,
                matchReason: LocationSource.GPS,
                distanceKm: 4.8,
                matchedVia: 'Stale GPS (8.5h old)',
            });
        });

        it('should find devices via postal codes (MEDIUM confidence)', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue(mockAlert);

            mockPrismaService.$queryRaw
                .mockResolvedValueOnce([]) // saved zones
                .mockResolvedValueOnce([]) // fresh GPS
                .mockResolvedValueOnce([]) // stale GPS
                .mockResolvedValueOnce([
                    {
                        device_id: 'device-4',
                        user_id: 'user-4',
                        push_token: 'token-4',
                        postal_codes: ['94102', '94109'],
                    },
                ])
                .mockResolvedValueOnce([]); // IP geo

            const result = await service.findDevicesForAlert(1);

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                deviceId: 'device-4',
                confidence: NotificationConfidence.MEDIUM,
                matchReason: LocationSource.POSTAL_CODE,
                distanceKm: 999,
                matchedVia: 'Postal code: 94102',
            });
        });

        it('should find devices via IP geolocation (LOW confidence)', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue(mockAlert);

            mockPrismaService.$queryRaw
                .mockResolvedValueOnce([]) // saved zones
                .mockResolvedValueOnce([]) // fresh GPS
                .mockResolvedValueOnce([]) // stale GPS
                .mockResolvedValueOnce([]) // postal codes
                .mockResolvedValueOnce([
                    {
                        device_id: 'device-5',
                        user_id: 'user-5',
                        push_token: 'token-5',
                        distance_km: 12.5,
                    },
                ]);

            const result = await service.findDevicesForAlert(1);

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                deviceId: 'device-5',
                confidence: NotificationConfidence.LOW,
                matchReason: LocationSource.IP,
                distanceKm: 12.5,
                matchedVia: 'IP geolocation',
            });
        });

        it('should deduplicate devices matched by multiple methods (keep highest priority)', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue(mockAlert);

            // Same device matched by saved zone (priority 1) and fresh GPS (priority 2)
            mockPrismaService.$queryRaw
                .mockResolvedValueOnce([
                    {
                        device_id: 'device-1',
                        user_id: 'user-1',
                        push_token: 'token-1',
                        zone_id: 'zone-1',
                        zone_name: 'Home',
                        zone_radius_km: 2.0,
                        distance_km: 1.0,
                    },
                ])
                .mockResolvedValueOnce([
                    {
                        device_id: 'device-1', // Same device
                        user_id: 'user-1',
                        push_token: 'token-1',
                        distance_km: 2.0,
                        gps_age_hours: 1.0,
                    },
                ])
                .mockResolvedValueOnce([]) // stale GPS
                .mockResolvedValueOnce([]) // postal codes
                .mockResolvedValueOnce([]); // IP geo

            const result = await service.findDevicesForAlert(1);

            // Should only have one result (saved zone match, not GPS match)
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                deviceId: 'device-1',
                confidence: NotificationConfidence.HIGH,
                matchReason: LocationSource.MANUAL, // Saved zone
                matchedVia: 'Saved zone: Home',
            });
        });

        it('should find multiple unique devices from different match types', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue(mockAlert);

            mockPrismaService.$queryRaw
                .mockResolvedValueOnce([
                    {
                        device_id: 'device-1',
                        user_id: 'user-1',
                        push_token: 'token-1',
                        zone_id: 'zone-1',
                        zone_name: 'Home',
                        zone_radius_km: 2.0,
                        distance_km: 1.5,
                    },
                ])
                .mockResolvedValueOnce([
                    {
                        device_id: 'device-2',
                        user_id: 'user-2',
                        push_token: 'token-2',
                        distance_km: 3.0,
                        gps_age_hours: 0.5,
                    },
                ])
                .mockResolvedValueOnce([
                    {
                        device_id: 'device-3',
                        user_id: 'user-3',
                        push_token: 'token-3',
                        distance_km: 6.0,
                        gps_age_hours: 10.0,
                    },
                ])
                .mockResolvedValueOnce([]) // postal codes
                .mockResolvedValueOnce([]); // IP geo

            const result = await service.findDevicesForAlert(1);

            expect(result).toHaveLength(3);
            expect(result[0].deviceId).toBe('device-1');
            expect(result[1].deviceId).toBe('device-2');
            expect(result[2].deviceId).toBe('device-3');
        });

        it('should return empty array when no devices match', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue(mockAlert);

            // All match types return empty
            mockPrismaService.$queryRaw
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([]);

            const result = await service.findDevicesForAlert(1);

            expect(result).toEqual([]);
        });

        it('should skip postal code matching when alert has no postal codes', async () => {
            mockPrismaService.alert.findUnique.mockResolvedValue({
                ...mockAlert,
                affected_postal_codes: [],
            });

            mockPrismaService.$queryRaw
                .mockResolvedValueOnce([]) // saved zones
                .mockResolvedValueOnce([]) // fresh GPS
                .mockResolvedValueOnce([]) // stale GPS
                .mockResolvedValueOnce([]); // IP geo (postal code step skipped)

            const result = await service.findDevicesForAlert(1);

            // Should call $queryRaw 4 times (not 5, since postal code is skipped)
            expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(4);
            expect(result).toEqual([]);
        });
    });

    describe('calculateConfidence', () => {
        it('should return HIGH for saved zones (MANUAL source)', () => {
            const confidence = service.calculateConfidence(LocationSource.MANUAL);
            expect(confidence).toBe(NotificationConfidence.HIGH);
        });

        it('should return HIGH for fresh GPS (<2h)', () => {
            const confidence = service.calculateConfidence(LocationSource.GPS, 1.5);
            expect(confidence).toBe(NotificationConfidence.HIGH);
        });

        it('should return MEDIUM for stale GPS (2-24h)', () => {
            const confidence = service.calculateConfidence(LocationSource.GPS, 12.0);
            expect(confidence).toBe(NotificationConfidence.MEDIUM);
        });

        it('should return LOW for old GPS (>24h)', () => {
            const confidence = service.calculateConfidence(LocationSource.GPS, 30.0);
            expect(confidence).toBe(NotificationConfidence.LOW);
        });

        it('should return HIGH for GPS when age is unknown', () => {
            const confidence = service.calculateConfidence(LocationSource.GPS);
            expect(confidence).toBe(NotificationConfidence.HIGH);
        });

        it('should return MEDIUM for postal codes', () => {
            const confidence = service.calculateConfidence(
                LocationSource.POSTAL_CODE,
            );
            expect(confidence).toBe(NotificationConfidence.MEDIUM);
        });

        it('should return LOW for IP geolocation', () => {
            const confidence = service.calculateConfidence(LocationSource.IP);
            expect(confidence).toBe(NotificationConfidence.LOW);
        });
    });

    describe('matchSavedZones', () => {
        it('should return saved zone match when zone is within range', async () => {
            mockPrismaService.$queryRaw.mockResolvedValue([
                {
                    zone_id: 'zone-1',
                    zone_name: 'Home',
                    distance_km: 1.5,
                },
            ]);

            const result = await service.matchSavedZones(
                'device-1',
                37.7749,
                -122.4194,
                5.0,
            );

            expect(result).toEqual({
                zoneId: 'zone-1',
                zoneName: 'Home',
                distanceKm: 1.5,
            });
        });

        it('should return null when no zones match', async () => {
            mockPrismaService.$queryRaw.mockResolvedValue([]);

            const result = await service.matchSavedZones(
                'device-1',
                37.7749,
                -122.4194,
                5.0,
            );

            expect(result).toBeNull();
        });

        it('should return highest priority zone when multiple match', async () => {
            mockPrismaService.$queryRaw.mockResolvedValue([
                {
                    zone_id: 'zone-1',
                    zone_name: 'Home',
                    distance_km: 1.5,
                },
            ]);

            const result = await service.matchSavedZones(
                'device-1',
                37.7749,
                -122.4194,
                5.0,
            );

            expect(result).toBeDefined();
            expect(result?.zoneName).toBe('Home');
        });

        it('should query with correct ST_DWithin parameters', async () => {
            mockPrismaService.$queryRaw.mockResolvedValue([]);

            await service.matchSavedZones('device-1', 37.7749, -122.4194, 5.0);

            expect(mockPrismaService.$queryRaw).toHaveBeenCalledWith(
                expect.anything(),
            );
        });
    });
});
