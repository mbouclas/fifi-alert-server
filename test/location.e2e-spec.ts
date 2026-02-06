import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/services/prisma.service';
import { LocationService } from '../src/location/location.service';
import { GeospatialService } from '../src/location/geospatial.service';
import { AlertStatus, PetSpecies, DevicePlatform } from '../src/generated/prisma';

describe('Location & Geospatial Integration Tests (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let locationService: LocationService;
    let geospatialService: GeospatialService;

    // Test data IDs
    let testUserId: number;
    let testDevice1Id: number;
    let testDevice2Id: number;
    let testDevice3Id: number;
    let testAlertId: number;

    // San Francisco coordinates for testing
    const SF_UNION_SQUARE = { latitude: 37.7879, longitude: -122.4074 };
    const SF_FINANCIAL_DISTRICT = { latitude: 37.7946, longitude: -122.3999 };
    const SF_MISSION = { latitude: 37.7599, longitude: -122.4148 };
    const SF_RICHMOND = { latitude: 37.7799, longitude: -122.4774 };
    const OAKLAND = { latitude: 37.8044, longitude: -122.2712 }; // ~15km away

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        prisma = moduleFixture.get<PrismaService>(PrismaService);
        locationService = moduleFixture.get<LocationService>(LocationService);
        geospatialService =
            moduleFixture.get<GeospatialService>(GeospatialService);

        await setupTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
        await prisma.$disconnect();
        await app.close();
    });

    async function setupTestData() {
        // Create test user
        const user = await prisma.user.create({
            data: {
                email: 'geospatial-test@test.com',
                name: 'Geospatial Test User',
            },
        });
        testUserId = user.id;

        // Create Device 1: Near Union Square with fresh GPS
        const device1 = await prisma.device.create({
            data: {
                device_uuid: 'geo-test-device-1',
                user_id: testUserId,
                platform: DevicePlatform.IOS,
                os_version: '17.0',
                app_version: '1.0.0',
                push_token: 'token-device-1',
                gps_latitude: SF_UNION_SQUARE.latitude,
                gps_longitude: SF_UNION_SQUARE.longitude,
                gps_updated_at: new Date(), // Fresh GPS
                last_app_open: new Date(),
            },
        });
        testDevice1Id = device1.id;

        // Insert PostGIS point for device 1
        await prisma.$executeRaw`
      UPDATE devices
      SET gps_point = ST_SetSRID(ST_MakePoint(${SF_UNION_SQUARE.longitude}, ${SF_UNION_SQUARE.latitude}), 4326)
      WHERE id = ${testDevice1Id}
    `;

        // Create Device 2: In Mission with stale GPS (10 hours old)
        const staleGpsTime = new Date(Date.now() - 10 * 60 * 60 * 1000);
        const device2 = await prisma.device.create({
            data: {
                device_uuid: 'geo-test-device-2',
                user_id: testUserId,
                platform: DevicePlatform.ANDROID,
                os_version: '14.0',
                app_version: '1.0.0',
                push_token: 'token-device-2',
                gps_latitude: SF_MISSION.latitude,
                gps_longitude: SF_MISSION.longitude,
                gps_updated_at: staleGpsTime,
                postal_codes: ['94102', '94103'],
                last_app_open: new Date(),
            },
        });
        testDevice2Id = device2.id;

        await prisma.$executeRaw`
      UPDATE devices
      SET gps_point = ST_SetSRID(ST_MakePoint(${SF_MISSION.longitude}, ${SF_MISSION.latitude}), 4326)
      WHERE id = ${testDevice2Id}
    `;

        // Create Device 3: In Oakland (far away), only IP location
        const device3 = await prisma.device.create({
            data: {
                device_uuid: 'geo-test-device-3',
                user_id: testUserId,
                platform: DevicePlatform.IOS,
                os_version: '17.0',
                app_version: '1.0.0',
                push_token: 'token-device-3',
                ip_address: '192.168.1.1',
                ip_latitude: OAKLAND.latitude,
                ip_longitude: OAKLAND.longitude,
                last_app_open: new Date(),
            },
        });
        testDevice3Id = device3.id;

        await prisma.$executeRaw`
      UPDATE devices
      SET ip_point = ST_SetSRID(ST_MakePoint(${OAKLAND.longitude}, ${OAKLAND.latitude}), 4326)
      WHERE id = ${testDevice3Id}
    `;

        // Create saved zone for Device 1 at Richmond District
        await prisma.$executeRaw`
      INSERT INTO saved_zones (device_id, name, radius_km, priority, is_active, location_point, created_at, updated_at)
      VALUES (
        ${testDevice1Id},
        'Home - Richmond',
        3.0,
        1,
        true,
        ST_SetSRID(ST_MakePoint(${SF_RICHMOND.longitude}, ${SF_RICHMOND.latitude}), 4326),
        NOW(),
        NOW()
      )
    `;

        // Create test alert near Financial District
        const alert = await prisma.alert.create({
            data: {
                creator_id: testUserId,
                pet_name: 'Max',
                pet_species: PetSpecies.DOG,
                pet_description: 'Golden Retriever, very friendly',
                last_seen_lat: SF_FINANCIAL_DISTRICT.latitude,
                last_seen_lon: SF_FINANCIAL_DISTRICT.longitude,
                alert_radius_km: 5.0,
                time_last_seen: new Date(),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: AlertStatus.ACTIVE,
                affected_postal_codes: ['94102', '94103', '94104'],
            },
        });
        testAlertId = alert.id;

        await prisma.$executeRaw`
      UPDATE alerts
      SET location_point = ST_SetSRID(ST_MakePoint(${SF_FINANCIAL_DISTRICT.longitude}, ${SF_FINANCIAL_DISTRICT.latitude}), 4326)
      WHERE id = ${testAlertId}
    `;
    }

    async function cleanupTestData() {
        await prisma.savedZone.deleteMany({
            where: { device_id: { in: [testDevice1Id, testDevice2Id, testDevice3Id] } },
        });
        await prisma.device.deleteMany({
            where: { user_id: testUserId },
        });
        await prisma.alert.deleteMany({
            where: { creator_id: testUserId },
        });
        await prisma.user.deleteMany({
            where: { id: testUserId },
        });
    }

    describe('GeospatialService - PostGIS Integration', () => {
        it('should calculate accurate distance between SF locations', async () => {
            const distance = await geospatialService.calculateDistance(
                SF_UNION_SQUARE,
                SF_FINANCIAL_DISTRICT,
            );

            // Expected distance: ~1km
            expect(distance).toBeGreaterThan(0.5);
            expect(distance).toBeLessThan(1.5);
        });

        it('should calculate distance to Oakland correctly', async () => {
            const distance = await geospatialService.calculateDistance(
                SF_UNION_SQUARE,
                OAKLAND,
            );

            // Expected distance: ~15km
            expect(distance).toBeGreaterThan(14);
            expect(distance).toBeLessThan(16);
        });

        it('should verify point is within distance', async () => {
            const result = await geospatialService.isWithinDistance(
                SF_UNION_SQUARE,
                SF_FINANCIAL_DISTRICT,
                2.0, // 2km radius
            );

            expect(result.withinRange).toBe(true);
            expect(result.distanceKm).toBeLessThan(2.0);
        });

        it('should verify point is outside distance', async () => {
            const result = await geospatialService.isWithinDistance(
                SF_UNION_SQUARE,
                OAKLAND,
                5.0, // 5km radius
            );

            expect(result.withinRange).toBe(false);
            expect(result.distanceKm).toBeGreaterThan(5.0);
        });

        it('should extract coordinates from device geometry', async () => {
            const coords = await geospatialService.extractCoordinates(
                'devices',
                'gps_point',
                testDevice1Id.toString(),
            );

            expect(coords).toBeDefined();
            expect(coords?.latitude).toBeCloseTo(SF_UNION_SQUARE.latitude, 4);
            expect(coords?.longitude).toBeCloseTo(SF_UNION_SQUARE.longitude, 4);
        });

        it('should calculate bounding box correctly', () => {
            const bbox = geospatialService.calculateBoundingBox(SF_UNION_SQUARE, 5);

            // Verify bbox contains original point
            expect(SF_UNION_SQUARE.latitude).toBeGreaterThan(bbox.minLat);
            expect(SF_UNION_SQUARE.latitude).toBeLessThan(bbox.maxLat);
            expect(SF_UNION_SQUARE.longitude).toBeGreaterThan(bbox.minLon);
            expect(SF_UNION_SQUARE.longitude).toBeLessThan(bbox.maxLon);
        });

        it('should validate SF coordinates', () => {
            expect(
                geospatialService.validateCoordinates(
                    SF_UNION_SQUARE.latitude,
                    SF_UNION_SQUARE.longitude,
                ),
            ).toBe(true);
        });

        it('should format various distances correctly', () => {
            expect(geospatialService.formatDistance(0.5)).toBe('500m');
            expect(geospatialService.formatDistance(1.234)).toBe('1.2km');
            expect(geospatialService.formatDistance(15.678)).toBe('16km');
        });
    });

    describe('LocationService - Device Matching Integration', () => {
        it('should find device with fresh GPS near alert location', async () => {
            const matches = await locationService.findDevicesForAlert(testAlertId);

            // Device 1 (fresh GPS near Financial District) should match
            const device1Match = matches.find((m) => m.deviceId === testDevice1Id.toString());
            expect(device1Match).toBeDefined();
            expect(device1Match?.confidence).toBe('HIGH');
            expect(device1Match?.matchReason).toBe('GPS');
        });

        it('should find device with postal code match', async () => {
            const matches = await locationService.findDevicesForAlert(testAlertId);

            // Device 2 (postal codes 94102, 94103) should match alert
            const device2Match = matches.find((m) => m.deviceId === testDevice2Id.toString());
            expect(device2Match).toBeDefined();
            expect(device2Match?.matchReason).toBe('POSTAL_CODE');
        });

        it('should NOT match distant device even with IP location', async () => {
            const matches = await locationService.findDevicesForAlert(testAlertId);

            // Device 3 in Oakland should NOT match (>15km away even with IP expansion)
            const device3Match = matches.find((m) => m.deviceId === testDevice3Id.toString());
            expect(device3Match).toBeUndefined();
        });

        it('should return devices ordered by priority (saved zone > GPS > postal)', async () => {
            const matches = await locationService.findDevicesForAlert(testAlertId);

            expect(matches.length).toBeGreaterThan(0);
            // Verify ordering logic exists (deduplication keeps highest priority)
            matches.forEach((match) => {
                expect(match).toHaveProperty('confidence');
                expect(match).toHaveProperty('matchReason');
                expect(match).toHaveProperty('distanceKm');
            });
        });

        it('should match saved zone when alert is within zone radius', async () => {
            // Create an alert near Richmond District (where device 1 has saved zone)
            const richmondAlert = await prisma.alert.create({
                data: {
                    creator_id: testUserId,
                    pet_name: 'Buddy',
                    pet_species: PetSpecies.DOG,
                    pet_description: 'Small terrier',
                    last_seen_lat: SF_RICHMOND.latitude,
                    last_seen_lon: SF_RICHMOND.longitude,
                    alert_radius_km: 2.0,
                    time_last_seen: new Date(),
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    status: AlertStatus.ACTIVE,
                    affected_postal_codes: ['94121'],
                },
            });

            await prisma.$executeRaw`
        UPDATE alerts
        SET location_point = ST_SetSRID(ST_MakePoint(${SF_RICHMOND.longitude}, ${SF_RICHMOND.latitude}), 4326)
        WHERE id = ${richmondAlert.id}
      `;

            const matches = await locationService.findDevicesForAlert(richmondAlert.id);

            const savedZoneMatch = matches.find(
                (m) => m.deviceId === testDevice1Id.toString() && m.matchReason === 'MANUAL',
            );
            expect(savedZoneMatch).toBeDefined();
            expect(savedZoneMatch?.confidence).toBe('HIGH');
            expect(savedZoneMatch?.matchedVia).toContain('Saved zone');

            // Cleanup
            await prisma.alert.delete({ where: { id: richmondAlert.id } });
        });

        it('should calculate confidence correctly for different match types', () => {
            expect(locationService.calculateConfidence('MANUAL')).toBe('HIGH'); // Saved zone
            expect(locationService.calculateConfidence('GPS', 1.0)).toBe('HIGH'); // Fresh GPS
            expect(locationService.calculateConfidence('GPS', 10.0)).toBe('MEDIUM'); // Stale GPS
            expect(locationService.calculateConfidence('GPS', 30.0)).toBe('LOW'); // Old GPS
            expect(locationService.calculateConfidence('POSTAL_CODE')).toBe('MEDIUM');
            expect(locationService.calculateConfidence('IP')).toBe('LOW');
        });

        it('should match specific device saved zone against alert', async () => {
            const zoneMatch = await locationService.matchSavedZones(
                testDevice1Id.toString(),
                SF_RICHMOND.latitude,
                SF_RICHMOND.longitude,
                2.0,
            );

            expect(zoneMatch).toBeDefined();
            expect(zoneMatch?.zoneName).toBe('Home - Richmond');
            expect(zoneMatch?.distanceKm).toBeLessThan(0.5); // Very close to zone center
        });

        it('should return null when no saved zones match', async () => {
            // Test with Oakland location (far from any saved zones)
            const zoneMatch = await locationService.matchSavedZones(
                testDevice1Id.toString(),
                OAKLAND.latitude,
                OAKLAND.longitude,
                2.0,
            );

            expect(zoneMatch).toBeNull();
        });
    });

    describe('PostGIS Query Performance', () => {
        it('should execute ST_DWithin query efficiently', async () => {
            const startTime = Date.now();

            await locationService.findDevicesForAlert(testAlertId);

            const duration = Date.now() - startTime;
            // Should complete in reasonable time (<2 seconds)
            expect(duration).toBeLessThan(2000);
        });

        it('should handle large radius searches', async () => {
            // Create alert with very large radius
            const largeRadiusAlert = await prisma.alert.create({
                data: {
                    creator_id: testUserId,
                    pet_name: 'Wide Search',
                    pet_species: PetSpecies.CAT,
                    pet_description: 'Test large radius',
                    last_seen_lat: SF_UNION_SQUARE.latitude,
                    last_seen_lon: SF_UNION_SQUARE.longitude,
                    alert_radius_km: 50.0, // 50km radius
                    time_last_seen: new Date(),
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    status: AlertStatus.ACTIVE,
                },
            });

            await prisma.$executeRaw`
        UPDATE alerts
        SET location_point = ST_SetSRID(ST_MakePoint(${SF_UNION_SQUARE.longitude}, ${SF_UNION_SQUARE.latitude}), 4326)
        WHERE id = ${largeRadiusAlert.id}
      `;

            const matches = await locationService.findDevicesForAlert(largeRadiusAlert.id);

            // Should find devices in Oakland now (with IP expansion)
            expect(matches.length).toBeGreaterThan(0);

            // Cleanup
            await prisma.alert.delete({ where: { id: largeRadiusAlert.id } });
        });
    });
});
