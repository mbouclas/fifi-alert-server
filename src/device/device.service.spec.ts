import { Test, TestingModule } from '@nestjs/testing';
import { DeviceService } from './device.service';
import { PrismaService } from '../services/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { DevicePlatform, LocationSource } from '@prisma/client';
import { RegisterDeviceDto, UpdateLocationDto } from './dto';

describe('DeviceService', () => {
    let service: DeviceService;
    let prisma: jest.Mocked<PrismaService>;

    const mockPrismaService = {
        device: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        $queryRaw: jest.fn(),
        $executeRaw: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DeviceService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
            ],
        }).compile();

        service = module.get<DeviceService>(DeviceService);
        prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('register', () => {
        const userId = 'user-123';
        const validDto: RegisterDeviceDto = {
            device_uuid: '550e8400-e29b-41d4-a716-446655440000',
            platform: DevicePlatform.IOS,
            os_version: '17.2',
            app_version: '1.0.5',
            push_token: 'ePEzOxMfT0KP...',
            location: {
                gps: {
                    latitude: 37.7749,
                    longitude: -122.4194,
                    accuracy: 15.5,
                },
                ipAddress: '192.168.1.100',
                postalCodes: ['94102', '94103'],
            },
        };

        it('should create a new device when it does not exist', async () => {
            // Mock device does not exist
            prisma.device.findFirst.mockResolvedValue(null);

            // Mock insert query
            prisma.$queryRaw.mockResolvedValue([{ id: 'device-999' }]);

            // Mock device fetch
            prisma.device.findUnique.mockResolvedValue({
                id: 'device-999',
                user_id: userId,
                device_uuid: validDto.device_uuid,
                platform: validDto.platform,
                os_version: validDto.os_version,
                app_version: validDto.app_version,
                push_token: validDto.push_token,
                push_token_updated_at: new Date(),
                gps_latitude: validDto.location!.gps!.latitude,
                gps_longitude: validDto.location!.gps!.longitude,
                gps_accuracy: validDto.location!.gps!.accuracy,
                gps_updated_at: new Date(),
                ip_address: validDto.location!.ipAddress,
                ip_latitude: null,
                ip_longitude: null,
                postal_codes: validDto.location!.postalCodes!,
                last_app_open: new Date(),
                created_at: new Date(),
                updated_at: new Date(),
                saved_zones: [],
            } as any);

            const result = await service.register(validDto, userId);

            expect(result.id).toBe('device-999');
            expect(result.device_uuid).toBe(validDto.device_uuid);
            expect(result.platform).toBe(validDto.platform);
            expect(prisma.device.findFirst).toHaveBeenCalledWith({
                where: {
                    device_uuid: validDto.device_uuid,
                    user_id: userId,
                },
            });
            expect(prisma.$queryRaw).toHaveBeenCalled();
        });

        it('should update existing device when it already exists (idempotent)', async () => {
            const existingDevice = {
                id: 'device-existing',
                user_id: userId,
                device_uuid: validDto.device_uuid,
                platform: DevicePlatform.ANDROID,
                os_version: '13.0',
                app_version: '1.0.0',
                push_token: 'old-token',
                push_token_updated_at: new Date('2026-01-01'),
                gps_latitude: 37.7,
                gps_longitude: -122.4,
                gps_accuracy: 20,
                gps_updated_at: new Date('2026-01-01'),
                ip_address: '192.168.1.50',
                ip_latitude: null,
                ip_longitude: null,
                postal_codes: ['94101'],
                last_app_open: new Date('2026-01-01'),
                created_at: new Date('2026-01-01'),
                updated_at: new Date('2026-01-01'),
            };

            prisma.device.findFirst.mockResolvedValue(existingDevice as any);
            prisma.device.update.mockResolvedValue({ ...existingDevice } as any);
            prisma.device.findUnique.mockResolvedValue({
                ...existingDevice,
                platform: validDto.platform,
                os_version: validDto.os_version,
                app_version: validDto.app_version,
                push_token: validDto.push_token,
                saved_zones: [],
            } as any);

            const result = await service.register(validDto, userId);

            expect(result.id).toBe('device-existing');
            expect(prisma.device.update).toHaveBeenCalledWith({
                where: { id: 'device-existing' },
                data: expect.objectContaining({
                    platform: validDto.platform,
                    os_version: validDto.os_version,
                    app_version: validDto.app_version,
                    push_token: validDto.push_token,
                }),
            });
            expect(prisma.$executeRaw).toHaveBeenCalled(); // GPS geometry update
        });

        it('should handle registration without location data', async () => {
            const minimalDto: RegisterDeviceDto = {
                device_uuid: '550e8400-e29b-41d4-a716-446655440001',
                platform: DevicePlatform.ANDROID,
                os_version: '14.0',
                app_version: '1.0.0',
            };

            prisma.device.findFirst.mockResolvedValue(null);
            prisma.$queryRaw.mockResolvedValue([{ id: 'device-minimal' }]);
            prisma.device.findUnique.mockResolvedValue({
                id: 'device-minimal',
                user_id: userId,
                device_uuid: minimalDto.device_uuid,
                platform: minimalDto.platform,
                os_version: minimalDto.os_version,
                app_version: minimalDto.app_version,
                push_token: null,
                push_token_updated_at: null,
                gps_latitude: null,
                gps_longitude: null,
                gps_accuracy: null,
                gps_updated_at: null,
                ip_address: null,
                ip_latitude: null,
                ip_longitude: null,
                postal_codes: [],
                last_app_open: new Date(),
                created_at: new Date(),
                updated_at: new Date(),
                saved_zones: [],
            } as any);

            const result = await service.register(minimalDto, userId);

            expect(result.gps_latitude).toBeNull();
            expect(result.gps_longitude).toBeNull();
            expect(result.postal_codes).toEqual([]);
        });
    });

    describe('updateLocation', () => {
        const userId = 'user-123';
        const deviceId = 'device-123';

        const updateDto: UpdateLocationDto = {
            gps: {
                latitude: 37.7849,
                longitude: -122.4094,
                accuracy: 10.5,
            },
            postal_codes: ['94102', '94103', '94104'],
        };

        it('should update device location successfully', async () => {
            const existingDevice = {
                id: deviceId,
                user_id: userId,
                device_uuid: '550e8400-e29b-41d4-a716-446655440000',
                platform: DevicePlatform.IOS,
                os_version: '17.2',
                app_version: '1.0.5',
                push_token: 'token',
                push_token_updated_at: new Date(),
                gps_latitude: 37.7,
                gps_longitude: -122.4,
                gps_accuracy: 20,
                gps_updated_at: new Date('2026-01-01'),
                ip_address: null,
                ip_latitude: null,
                ip_longitude: null,
                postal_codes: ['94101'],
                last_app_open: new Date(),
                created_at: new Date(),
                updated_at: new Date(),
            };

            prisma.device.findFirst.mockResolvedValue(existingDevice as any);
            prisma.device.update.mockResolvedValue({ ...existingDevice } as any);
            prisma.device.findUnique.mockResolvedValue({
                ...existingDevice,
                gps_latitude: updateDto.gps!.latitude,
                gps_longitude: updateDto.gps!.longitude,
                gps_accuracy: updateDto.gps!.accuracy,
                postal_codes: updateDto.postal_codes!,
                saved_zones: [],
            } as any);

            const result = await service.updateLocation(deviceId, updateDto, userId);

            expect(result.gps_latitude).toBe(updateDto.gps!.latitude);
            expect(result.gps_longitude).toBe(updateDto.gps!.longitude);
            expect(result.postal_codes).toEqual(updateDto.postal_codes);
            expect(prisma.device.update).toHaveBeenCalled();
            expect(prisma.$executeRaw).toHaveBeenCalled(); // PostGIS geometry update
        });

        it('should throw NotFoundException if device does not exist', async () => {
            prisma.device.findFirst.mockResolvedValue(null);

            await expect(
                service.updateLocation(deviceId, updateDto, userId),
            ).rejects.toThrow(NotFoundException);
            await expect(
                service.updateLocation(deviceId, updateDto, userId),
            ).rejects.toThrow('Device with ID device-123 not found or does not belong to user');
        });

        it('should throw NotFoundException if device belongs to different user', async () => {
            prisma.device.findFirst.mockResolvedValue({
                id: deviceId,
                user_id: 'other-user',
            } as any);

            await expect(
                service.updateLocation(deviceId, updateDto, userId),
            ).rejects.toThrow(NotFoundException);
        });

        it('should handle partial location updates', async () => {
            const partialDto: UpdateLocationDto = {
                postal_codes: ['94105'],
            };

            const existingDevice = {
                id: deviceId,
                user_id: userId,
                gps_latitude: 37.7,
                gps_longitude: -122.4,
                postal_codes: ['94101'],
            };

            prisma.device.findFirst.mockResolvedValue(existingDevice as any);
            prisma.device.update.mockResolvedValue({ ...existingDevice } as any);
            prisma.device.findUnique.mockResolvedValue({
                ...existingDevice,
                postal_codes: partialDto.postal_codes,
                saved_zones: [],
            } as any);

            const result = await service.updateLocation(deviceId, partialDto, userId);

            expect(result.postal_codes).toEqual(['94105']);
            expect(prisma.$executeRaw).not.toHaveBeenCalled(); // No GPS update
        });
    });

    describe('updatePushToken', () => {
        const userId = 'user-123';
        const deviceId = 'device-123';
        const newToken = 'new-push-token-xyz';

        it('should update push token successfully', async () => {
            const existingDevice = {
                id: deviceId,
                user_id: userId,
                push_token: 'old-token',
                push_token_updated_at: new Date('2026-01-01'),
            };

            prisma.device.findFirst.mockResolvedValue(existingDevice as any);
            prisma.device.update.mockResolvedValue({
                ...existingDevice,
                push_token: newToken,
                push_token_updated_at: new Date(),
                saved_zones: [],
            } as any);

            const result = await service.updatePushToken(deviceId, newToken, userId);

            expect(result.push_token).toBe(newToken);
            expect(prisma.device.update).toHaveBeenCalledWith({
                where: { id: deviceId },
                data: {
                    push_token: newToken,
                    push_token_updated_at: expect.any(Date),
                },
                include: {
                    saved_zones: true,
                },
            });
        });

        it('should throw NotFoundException if device does not exist', async () => {
            prisma.device.findFirst.mockResolvedValue(null);

            await expect(
                service.updatePushToken(deviceId, newToken, userId),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('findByUserId', () => {
        const userId = 'user-123';

        it('should return all devices for a user', async () => {
            const mockDevices = [
                {
                    id: 'device-1',
                    user_id: userId,
                    device_uuid: 'uuid-1',
                    platform: DevicePlatform.IOS,
                    os_version: '17.2',
                    app_version: '1.0.5',
                    push_token: 'token-1',
                    push_token_updated_at: new Date(),
                    gps_latitude: 37.7749,
                    gps_longitude: -122.4194,
                    gps_accuracy: 15,
                    gps_updated_at: new Date(),
                    ip_address: null,
                    ip_latitude: null,
                    ip_longitude: null,
                    postal_codes: ['94102'],
                    last_app_open: new Date(),
                    created_at: new Date(),
                    updated_at: new Date(),
                    saved_zones: [{ id: 'zone-1', name: 'Home' }],
                },
                {
                    id: 'device-2',
                    user_id: userId,
                    device_uuid: 'uuid-2',
                    platform: DevicePlatform.ANDROID,
                    os_version: '14.0',
                    app_version: '1.0.0',
                    push_token: 'token-2',
                    push_token_updated_at: new Date(),
                    gps_latitude: null,
                    gps_longitude: null,
                    gps_accuracy: null,
                    gps_updated_at: null,
                    ip_address: '192.168.1.100',
                    ip_latitude: 37.7,
                    ip_longitude: -122.4,
                    postal_codes: [],
                    last_app_open: new Date(),
                    created_at: new Date(),
                    updated_at: new Date(),
                    saved_zones: [],
                },
            ];

            prisma.device.findMany.mockResolvedValue(mockDevices as any);

            const result = await service.findByUserId(userId);

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('device-1');
            expect(result[1].id).toBe('device-2');
            expect(prisma.device.findMany).toHaveBeenCalledWith({
                where: { user_id: userId },
                include: { saved_zones: true },
                orderBy: { last_app_open: 'desc' },
            });
        });

        it('should return empty array if user has no devices', async () => {
            prisma.device.findMany.mockResolvedValue([]);

            const result = await service.findByUserId(userId);

            expect(result).toEqual([]);
        });
    });

    describe('getLocationStatus', () => {
        it('should return fresh GPS status for recent GPS data', () => {
            const device = {
                id: 'device-1',
                gps_latitude: 37.7749,
                gps_longitude: -122.4194,
                gps_updated_at: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
                ip_latitude: null,
                ip_longitude: null,
                postal_codes: ['94102'],
            } as any;

            const status = service.getLocationStatus(device, 2);

            expect(status.hasGps).toBe(true);
            expect(status.gpsFreshness).toBe('fresh');
            expect(status.gpsAgeHours).toBeLessThan(2);
            expect(status.postalCodeCount).toBe(1);
            expect(status.savedZoneCount).toBe(2);
            expect(status.primarySource).toBe(LocationSource.GPS);
        });

        it('should return stale GPS status for GPS data between 2-24 hours old', () => {
            const device = {
                id: 'device-1',
                gps_latitude: 37.7749,
                gps_longitude: -122.4194,
                gps_updated_at: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
                ip_latitude: null,
                ip_longitude: null,
                postal_codes: [],
            } as any;

            const status = service.getLocationStatus(device, 0);

            expect(status.hasGps).toBe(true);
            expect(status.gpsFreshness).toBe('stale');
            expect(status.gpsAgeHours).toBeGreaterThan(2);
            expect(status.gpsAgeHours).toBeLessThan(24);
        });

        it('should return old GPS status for GPS data older than 24 hours', () => {
            const device = {
                id: 'device-1',
                gps_latitude: 37.7749,
                gps_longitude: -122.4194,
                gps_updated_at: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
                ip_latitude: null,
                ip_longitude: null,
                postal_codes: [],
            } as any;

            const status = service.getLocationStatus(device, 0);

            expect(status.hasGps).toBe(true);
            expect(status.gpsFreshness).toBe('old');
            expect(status.gpsAgeHours).toBeGreaterThan(24);
        });

        it('should prioritize postal codes over stale GPS', () => {
            const device = {
                id: 'device-1',
                gps_latitude: 37.7749,
                gps_longitude: -122.4194,
                gps_updated_at: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago (stale)
                ip_latitude: null,
                ip_longitude: null,
                postal_codes: ['94102', '94103'],
            } as any;

            const status = service.getLocationStatus(device, 0);

            expect(status.gpsFreshness).toBe('stale');
            expect(status.primarySource).toBe(LocationSource.POSTAL_CODE);
        });

        it('should handle device with no location data', () => {
            const device = {
                id: 'device-1',
                gps_latitude: null,
                gps_longitude: null,
                gps_updated_at: null,
                ip_latitude: null,
                ip_longitude: null,
                postal_codes: [],
            } as any;

            const status = service.getLocationStatus(device, 0);

            expect(status.hasGps).toBe(false);
            expect(status.gpsFreshness).toBe('none');
            expect(status.hasIpLocation).toBe(false);
            expect(status.postalCodeCount).toBe(0);
            expect(status.savedZoneCount).toBe(0);
            expect(status.primarySource).toBe(LocationSource.IP_ADDRESS); // Fallback
        });

        it('should handle IP-based location', () => {
            const device = {
                id: 'device-1',
                gps_latitude: null,
                gps_longitude: null,
                gps_updated_at: null,
                ip_latitude: 37.7,
                ip_longitude: -122.4,
                postal_codes: [],
            } as any;

            const status = service.getLocationStatus(device, 0);

            expect(status.hasGps).toBe(false);
            expect(status.hasIpLocation).toBe(true);
            expect(status.primarySource).toBe(LocationSource.IP_ADDRESS);
        });
    });
});
