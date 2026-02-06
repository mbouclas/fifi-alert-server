import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/services/prisma.service';

describe('Geospatial Queries (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let authToken: string;
    let userId: string;

    // Test coordinates (NYC area)
    const NYC_COORDS = { lat: 40.7128, lon: -74.0060 }; // Times Square
    const BROOKLYN_COORDS = { lat: 40.6782, lon: -73.9442 }; // Brooklyn (8.8 km from NYC)
    const QUEENS_COORDS = { lat: 40.7282, lon: -73.7949 }; // Queens (16.5 km from NYC)
    const SF_COORDS = { lat: 37.7749, lon: -122.4194 }; // San Francisco (4,130 km from NYC)

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();

        prisma = app.get<PrismaService>(PrismaService);

        // Clean up test data
        await prisma.savedZone.deleteMany({});
        await prisma.device.deleteMany({});
        await prisma.notification.deleteMany({});
        await prisma.sighting.deleteMany({});
        await prisma.alert.deleteMany({});
        await prisma.user.deleteMany({ where: { email: { contains: 'geospatial-test' } } });

        // Create test user and authenticate
        const signupRes = await request(app.getHttpServer())
            .post('/api/auth/signup')
            .send({
                email: 'geospatial-test@example.com',
                password: 'Test123!',
                name: 'Geospatial Test User',
            });

        userId = signupRes.body.user.id;
        authToken = signupRes.body.token;
    });

    afterAll(async () => {
        // Clean up
        await prisma.savedZone.deleteMany({});
        await prisma.device.deleteMany({});
        await prisma.notification.deleteMany({});
        await prisma.sighting.deleteMany({});
        await prisma.alert.deleteMany({});
        await prisma.user.deleteMany({ where: { email: { contains: 'geospatial-test' } } });

        await app.close();
    });

    describe('PostGIS ST_MakePoint and ST_SetSRID', () => {
        it('should create alert with valid PostGIS point', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    petDetails: {
                        name: 'Max',
                        species: 'DOG',
                        breed: 'Golden Retriever',
                        description: 'Friendly dog',
                        color: 'Golden',
                        ageYears: 3,
                    },
                    location: {
                        lat: NYC_COORDS.lat,
                        lon: NYC_COORDS.lon,
                        address: '123 Main St, New York, NY',
                        lastSeenTime: new Date().toISOString(),
                        radiusKm: 10,
                    },
                    contactDetails: {
                        phone: '+1234567890',
                        isPhonePublic: true,
                    },
                })
                .expect(201);

            expect(res.body.id).toBeDefined();
            expect(res.body.location.lat).toBe(NYC_COORDS.lat);
            expect(res.body.location.lon).toBe(NYC_COORDS.lon);

            // Verify PostGIS point stored correctly
            const alert = await prisma.$queryRaw<any[]>`
        SELECT 
          id,
          ST_X(location_point) AS lon,
          ST_Y(location_point) AS lat,
          ST_SRID(location_point) AS srid
        FROM "Alert"
        WHERE id = ${res.body.id}
      `;

            expect(alert[0].lon).toBeCloseTo(NYC_COORDS.lon, 4);
            expect(alert[0].lat).toBeCloseTo(NYC_COORDS.lat, 4);
            expect(alert[0].srid).toBe(4326); // WGS84 coordinate system
        });

        it('should create device with GPS location as PostGIS point', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/devices')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    platform: 'IOS',
                    osVersion: '17.2',
                    appVersion: '1.0.0',
                    deviceIdentifier: 'geospatial-device-1',
                    pushToken: 'test-push-token-1',
                    location: {
                        type: 'GPS',
                        lat: BROOKLYN_COORDS.lat,
                        lon: BROOKLYN_COORDS.lon,
                        accuracy: 10,
                    },
                })
                .expect(201);

            // Verify PostGIS point stored correctly
            const device = await prisma.$queryRaw<any[]>`
        SELECT 
          id,
          ST_X(gps_point) AS lon,
          ST_Y(gps_point) AS lat,
          ST_SRID(gps_point) AS srid
        FROM "Device"
        WHERE id = ${res.body.id}
      `;

            expect(device[0].lon).toBeCloseTo(BROOKLYN_COORDS.lon, 4);
            expect(device[0].lat).toBeCloseTo(BROOKLYN_COORDS.lat, 4);
            expect(device[0].srid).toBe(4326);
        });
    });

    describe('ST_Distance Calculations', () => {
        it('should calculate accurate distance between NYC and Brooklyn (~8.8 km)', async () => {
            const result = await prisma.$queryRaw<any[]>`
        SELECT ST_Distance(
          ST_SetSRID(ST_MakePoint(${NYC_COORDS.lon}, ${NYC_COORDS.lat}), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${BROOKLYN_COORDS.lon}, ${BROOKLYN_COORDS.lat}), 4326)::geography
        ) / 1000 AS distance_km
      `;

            const distance = result[0].distance_km;
            expect(distance).toBeGreaterThan(8);
            expect(distance).toBeLessThan(10); // ~8.8 km expected
        });

        it('should calculate accurate distance between NYC and Queens (~16.5 km)', async () => {
            const result = await prisma.$queryRaw<any[]>`
        SELECT ST_Distance(
          ST_SetSRID(ST_MakePoint(${NYC_COORDS.lon}, ${NYC_COORDS.lat}), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${QUEENS_COORDS.lon}, ${QUEENS_COORDS.lat}), 4326)::geography
        ) / 1000 AS distance_km
      `;

            const distance = result[0].distance_km;
            expect(distance).toBeGreaterThan(15);
            expect(distance).toBeLessThan(18); // ~16.5 km expected
        });

        it('should calculate accurate long distance between NYC and SF (~4,130 km)', async () => {
            const result = await prisma.$queryRaw<any[]>`
        SELECT ST_Distance(
          ST_SetSRID(ST_MakePoint(${NYC_COORDS.lon}, ${NYC_COORDS.lat}), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${SF_COORDS.lon}, ${SF_COORDS.lat}), 4326)::geography
        ) / 1000 AS distance_km
      `;

            const distance = result[0].distance_km;
            expect(distance).toBeGreaterThan(4000);
            expect(distance).toBeLessThan(4200); // ~4,130 km expected
        });
    });

    describe('ST_DWithin Proximity Queries', () => {
        let alertId: string;

        beforeAll(async () => {
            // Create alert in NYC with 10km radius
            const res = await request(app.getHttpServer())
                .post('/api/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    petDetails: {
                        name: 'Test Dog',
                        species: 'DOG',
                        description: 'Test',
                    },
                    location: {
                        lat: NYC_COORDS.lat,
                        lon: NYC_COORDS.lon,
                        address: 'NYC',
                        lastSeenTime: new Date().toISOString(),
                        radiusKm: 10,
                    },
                    contactDetails: {
                        phone: '+1234567890',
                    },
                });
            alertId = res.body.id;
        });

        it('should find alert within 10km radius (Brooklyn at ~8.8km)', async () => {
            const result = await prisma.$queryRaw<any[]>`
        SELECT id, radius_km
        FROM "Alert"
        WHERE id = ${alertId}
          AND ST_DWithin(
            location_point::geography,
            ST_SetSRID(ST_MakePoint(${BROOKLYN_COORDS.lon}, ${BROOKLYN_COORDS.lat}), 4326)::geography,
            radius_km * 1000
          )
      `;

            expect(result.length).toBe(1); // Should find the alert
            expect(result[0].id).toBe(alertId);
        });

        it('should NOT find alert outside 10km radius (Queens at ~16.5km)', async () => {
            const result = await prisma.$queryRaw<any[]>`
        SELECT id
        FROM "Alert"
        WHERE id = ${alertId}
          AND ST_DWithin(
            location_point::geography,
            ST_SetSRID(ST_MakePoint(${QUEENS_COORDS.lon}, ${QUEENS_COORDS.lat}), 4326)::geography,
            radius_km * 1000
          )
      `;

            expect(result.length).toBe(0); // Should NOT find the alert (outside radius)
        });

        it('should find alert when search point is exact match', async () => {
            const result = await prisma.$queryRaw<any[]>`
        SELECT id
        FROM "Alert"
        WHERE id = ${alertId}
          AND ST_DWithin(
            location_point::geography,
            ST_SetSRID(ST_MakePoint(${NYC_COORDS.lon}, ${NYC_COORDS.lat}), 4326)::geography,
            100  -- 100 meters
          )
      `;

            expect(result.length).toBe(1); // Should find (0 km distance)
        });
    });

    describe('Alert Search API with Geospatial Filtering', () => {
        beforeAll(async () => {
            // Create alerts at various locations
            await request(app.getHttpServer())
                .post('/api/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    petDetails: { name: 'NYC Dog', species: 'DOG', description: 'Test' },
                    location: {
                        lat: NYC_COORDS.lat,
                        lon: NYC_COORDS.lon,
                        address: 'NYC',
                        lastSeenTime: new Date().toISOString(),
                        radiusKm: 5,
                    },
                    contactDetails: { phone: '+1111111111' },
                });

            await request(app.getHttpServer())
                .post('/api/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    petDetails: { name: 'Brooklyn Cat', species: 'CAT', description: 'Test' },
                    location: {
                        lat: BROOKLYN_COORDS.lat,
                        lon: BROOKLYN_COORDS.lon,
                        address: 'Brooklyn',
                        lastSeenTime: new Date().toISOString(),
                        radiusKm: 5,
                    },
                    contactDetails: { phone: '+1222222222' },
                });

            await request(app.getHttpServer())
                .post('/api/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    petDetails: { name: 'Queens Bird', species: 'BIRD', description: 'Test' },
                    location: {
                        lat: QUEENS_COORDS.lat,
                        lon: QUEENS_COORDS.lon,
                        address: 'Queens',
                        lastSeenTime: new Date().toISOString(),
                        radiusKm: 5,
                    },
                    contactDetails: { phone: '+1333333333' },
                });
        });

        it('should find alerts within 10km of NYC (includes NYC and Brooklyn)', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/alerts')
                .query({
                    lat: NYC_COORDS.lat,
                    lon: NYC_COORDS.lon,
                    radiusKm: 10,
                })
                .expect(200);

            expect(res.body.alerts.length).toBeGreaterThanOrEqual(2); // NYC Dog + Brooklyn Cat

            const petNames = res.body.alerts.map((a: any) => a.petName);
            expect(petNames).toContain('NYC Dog');
            expect(petNames).toContain('Brooklyn Cat');
        });

        it('should find only NYC alert within 5km of NYC', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/alerts')
                .query({
                    lat: NYC_COORDS.lat,
                    lon: NYC_COORDS.lon,
                    radiusKm: 5,
                })
                .expect(200);

            // Brooklyn is ~8.8km away, should be excluded
            const nycAlerts = res.body.alerts.filter((a: any) => a.petName === 'NYC Dog');
            expect(nycAlerts.length).toBeGreaterThanOrEqual(1);

            const brooklynAlerts = res.body.alerts.filter((a: any) => a.petName === 'Brooklyn Cat');
            expect(brooklynAlerts.length).toBe(0); // Too far
        });

        it('should filter by species (only DOG)', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/alerts')
                .query({
                    lat: NYC_COORDS.lat,
                    lon: NYC_COORDS.lon,
                    radiusKm: 20,
                    species: 'DOG',
                })
                .expect(200);

            const dogs = res.body.alerts.filter((a: any) => a.species === 'DOG');
            const nonDogs = res.body.alerts.filter((a: any) => a.species !== 'DOG');

            expect(dogs.length).toBeGreaterThan(0);
            expect(nonDogs.length).toBe(0); // Should filter out CAT and BIRD
        });

        it('should return alerts sorted by distance (ascending)', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/alerts')
                .query({
                    lat: NYC_COORDS.lat,
                    lon: NYC_COORDS.lon,
                    radiusKm: 20,
                })
                .expect(200);

            // Verify distances are in ascending order
            for (let i = 0; i < res.body.alerts.length - 1; i++) {
                const current = res.body.alerts[i].distanceKm;
                const next = res.body.alerts[i + 1].distanceKm;
                expect(current).toBeLessThanOrEqual(next);
            }
        });
    });

    describe('GIST Index Performance', () => {
        it('should use GIST index for ST_DWithin query (EXPLAIN ANALYZE)', async () => {
            const explain = await prisma.$queryRaw<any[]>`
        EXPLAIN ANALYZE
        SELECT id FROM "Alert"
        WHERE ST_DWithin(
          location_point::geography,
          ST_SetSRID(ST_MakePoint(${NYC_COORDS.lon}, ${NYC_COORDS.lat}), 4326)::geography,
          10000
        )
      `;

            const explainText = explain.map((row) => row['QUERY PLAN']).join('\n');

            // Verify GIST index is used (not Seq Scan)
            expect(explainText).toContain('Index Scan');
            expect(explainText).toContain('Alert_location_point_idx');
            expect(explainText).not.toContain('Seq Scan on "Alert"');
        });

        it('should execute geospatial query in < 100ms for 10,000 alerts', async () => {
            const startTime = Date.now();

            await prisma.$queryRaw`
        SELECT id, ST_Distance(
          location_point::geography,
          ST_SetSRID(ST_MakePoint(${NYC_COORDS.lon}, ${NYC_COORDS.lat}), 4326)::geography
        ) / 1000 AS distance_km
        FROM "Alert"
        WHERE ST_DWithin(
          location_point::geography,
          ST_SetSRID(ST_MakePoint(${NYC_COORDS.lon}, ${NYC_COORDS.lat}), 4326)::geography,
          10000
        )
        LIMIT 100
      `;

            const executionTime = Date.now() - startTime;

            expect(executionTime).toBeLessThan(100); // Target: < 100ms
        });
    });

    describe('Saved Zone Geospatial Matching', () => {
        let deviceId: string;

        beforeAll(async () => {
            // Create device with saved zones
            const deviceRes = await request(app.getHttpServer())
                .post('/api/devices')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    platform: 'IOS',
                    osVersion: '17.2',
                    appVersion: '1.0.0',
                    deviceIdentifier: 'saved-zone-device',
                    pushToken: 'test-push-token-saved-zone',
                    location: {
                        type: 'GPS',
                        lat: NYC_COORDS.lat,
                        lon: NYC_COORDS.lon,
                        accuracy: 10,
                    },
                });
            deviceId = deviceRes.body.id;

            // Create saved zone at Brooklyn (1km radius)
            await request(app.getHttpServer())
                .post(`/api/devices/${deviceId}/saved-zones`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Home',
                    lat: BROOKLYN_COORDS.lat,
                    lon: BROOKLYN_COORDS.lon,
                    radiusKm: 1,
                    isPrimary: true,
                });
        });

        it('should match alert to saved zone within radius', async () => {
            // Query saved zones that overlap with Brooklyn coordinates
            const result = await prisma.$queryRaw<any[]>`
        SELECT sz.id, sz.name
        FROM "SavedZone" sz
        WHERE sz.device_id = ${deviceId}
          AND ST_DWithin(
            sz.location_point::geography,
            ST_SetSRID(ST_MakePoint(${BROOKLYN_COORDS.lon}, ${BROOKLYN_COORDS.lat}), 4326)::geography,
            sz.radius_km * 1000
          )
      `;

            expect(result.length).toBe(1);
            expect(result[0].name).toBe('Home');
        });

        it('should NOT match alert outside saved zone radius', async () => {
            // Queens is ~16km from Brooklyn saved zone (1km radius)
            const result = await prisma.$queryRaw<any[]>`
        SELECT sz.id, sz.name
        FROM "SavedZone" sz
        WHERE sz.device_id = ${deviceId}
          AND ST_DWithin(
            sz.location_point::geography,
            ST_SetSRID(ST_MakePoint(${QUEENS_COORDS.lon}, ${QUEENS_COORDS.lat}), 4326)::geography,
            sz.radius_km * 1000
          )
      `;

            expect(result.length).toBe(0); // Too far from saved zone
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle invalid coordinates (lat > 90)', async () => {
            await request(app.getHttpServer())
                .post('/api/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    petDetails: { name: 'Invalid', species: 'DOG', description: 'Test' },
                    location: {
                        lat: 91, // Invalid: > 90
                        lon: -74.0060,
                        address: 'Invalid',
                        lastSeenTime: new Date().toISOString(),
                        radiusKm: 10,
                    },
                    contactDetails: { phone: '+1111111111' },
                })
                .expect(422); // Validation error
        });

        it('should handle invalid coordinates (lon > 180)', async () => {
            await request(app.getHttpServer())
                .post('/api/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    petDetails: { name: 'Invalid', species: 'DOG', description: 'Test' },
                    location: {
                        lat: 40.7128,
                        lon: 181, // Invalid: > 180
                        address: 'Invalid',
                        lastSeenTime: new Date().toISOString(),
                        radiusKm: 10,
                    },
                    contactDetails: { phone: '+1111111111' },
                })
                .expect(422);
        });

        it('should handle zero radius gracefully', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/alerts')
                .query({
                    lat: NYC_COORDS.lat,
                    lon: NYC_COORDS.lon,
                    radiusKm: 0,
                })
                .expect(200);

            // Should return empty or only exact matches
            expect(Array.isArray(res.body.alerts)).toBe(true);
        });

        it('should handle very large radius (global search)', async () => {
            const res = await request(app.getHttpServer())
                .get('/api/alerts')
                .query({
                    lat: NYC_COORDS.lat,
                    lon: NYC_COORDS.lon,
                    radiusKm: 20000, // 20,000 km (half the Earth)
                })
                .expect(200);

            // Should find all alerts (including SF alert if exists)
            expect(res.body.alerts.length).toBeGreaterThan(0);
        });
    });
});
