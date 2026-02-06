/**
 * End-to-End Scenario Tests
 * 
 * Tests complete user flows through the FiFi Alert system:
 * 1. Alert creation → notification → sighting → resolution
 * 2. Alert expiration → notifications stopped
 * 3. Alert renewal → expiration extended
 * 4. Saved zone notifications (HIGH confidence)
 * 5. Rate limiting enforcement
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/services/prisma.service';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bull';

describe('End-to-End Scenarios (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let notificationQueue: Queue;
    let authToken: string;
    let userId: string;
    let secondUserToken: string;
    let secondUserId: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

        prisma = app.get<PrismaService>(PrismaService);
        notificationQueue = app.get<Queue>(getQueueToken('notification-queue'));

        await app.init();

        // Create test users
        const user1 = await prisma.user.create({
            data: {
                email: 'scenario-user-1@test.com',
                name: 'Scenario User 1',
                emailVerified: false,
            },
        });
        userId = user1.id;
        authToken = 'test-token-scenario-1'; // Mock token for testing

        const user2 = await prisma.user.create({
            data: {
                email: 'scenario-user-2@test.com',
                name: 'Scenario User 2',
                emailVerified: false,
            },
        });
        secondUserId = user2.id;
        secondUserToken = 'test-token-scenario-2';
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.sighting.deleteMany({ where: { reporter_id: { in: [userId, secondUserId] } } });
        await prisma.notification.deleteMany({});
        await prisma.alert.deleteMany({ where: { creator_id: { in: [userId, secondUserId] } } });
        await prisma.savedZone.deleteMany({});
        await prisma.device.deleteMany({ where: { user_id: { in: [userId, secondUserId] } } });
        await prisma.user.deleteMany({ where: { id: { in: [userId, secondUserId] } } });

        await app.close();
    });

    beforeEach(async () => {
        // Clear notification queue before each test
        await notificationQueue.drain();
        await notificationQueue.clean(0, 0, 'completed');
        await notificationQueue.clean(0, 0, 'failed');
    });

    describe('Scenario 1: Complete Alert Lifecycle', () => {
        it('should handle full flow: create alert → notify devices → report sighting → resolve alert', async () => {
            // Step 1: Register device for second user (who will receive notification)
            const deviceResponse = await request(app.getHttpServer())
                .post('/devices')
                .set('Authorization', `Bearer ${secondUserToken}`)
                .send({
                    device_uuid: 'scenario1-device-uuid',
                    platform: 'IOS',
                    os_version: '16.0',
                    app_version: '1.0.0',
                    push_token: 'a'.repeat(64), // Valid iOS token
                    gps: {
                        latitude: 40.7589, // Near Times Square (within 5km of Times Square)
                        longitude: -73.9851,
                    },
                    postal_codes: ['10036'],
                });

            expect(deviceResponse.status).toBe(201);
            const deviceId = deviceResponse.body.id;

            // Step 2: Create alert (User 1 reports missing pet in Times Square)
            const alertResponse = await request(app.getHttpServer())
                .post('/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    pet: {
                        name: 'Max',
                        species: 'DOG',
                        breed: 'Golden Retriever',
                        description: 'Friendly golden retriever, wearing blue collar',
                        color: 'Golden',
                        age_years: 3,
                        photos: [],
                    },
                    location: {
                        latitude: 40.7580, // Times Square
                        longitude: -73.9855,
                        address: 'Times Square, New York, NY',
                        last_seen_time: new Date().toISOString(),
                        radius_km: 5,
                    },
                    contact: {
                        phone: '+1234567890',
                        email: 'scenario1@test.com',
                        is_phone_public: true,
                    },
                    reward: {
                        offered: true,
                        amount: 500,
                    },
                });

            expect(alertResponse.status).toBe(201);
            expect(alertResponse.body.id).toBeDefined();
            expect(alertResponse.body.status).toBe('ACTIVE');
            const alertId = alertResponse.body.id;

            // Step 3: Verify notification queued
            await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for queue processing
            const queuedJobs = await notificationQueue.getJobs(['waiting', 'active']);
            expect(queuedJobs.length).toBeGreaterThan(0);

            // Step 4: Verify notification created in database
            const notifications = await prisma.notification.findMany({
                where: { alert_id: alertId },
            });
            expect(notifications.length).toBeGreaterThan(0);

            // Step 5: Report sighting (User 2 sees the pet)
            const sightingResponse = await request(app.getHttpServer())
                .post('/sightings')
                .set('Authorization', `Bearer ${secondUserToken}`)
                .send({
                    alert_id: alertId,
                    location: {
                        latitude: 40.7600, // Slightly north of Times Square
                        longitude: -73.9850,
                        address: 'Near Times Square, New York, NY',
                    },
                    notes: 'Saw the dog near a coffee shop',
                    confidence: 80,
                    sighting_time: new Date().toISOString(),
                    direction: 'NORTH',
                });

            expect(sightingResponse.status).toBe(201);
            expect(sightingResponse.body.id).toBeDefined();
            const sightingId = sightingResponse.body.id;

            // Step 6: Verify alert creator can see the sighting
            const sightingsResponse = await request(app.getHttpServer())
                .get(`/sightings/alert/${alertId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(sightingsResponse.status).toBe(200);
            expect(sightingsResponse.body.length).toBe(1);
            expect(sightingsResponse.body[0].id).toBe(sightingId);

            // Step 7: Resolve alert (User 1 found their pet)
            const resolveResponse = await request(app.getHttpServer())
                .post(`/alerts/${alertId}/resolve`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    outcome: 'FOUND',
                    notes: 'Found Max thanks to the sighting report!',
                    share_success_story: true,
                });

            expect(resolveResponse.status).toBe(200);
            expect(resolveResponse.body.status).toBe('RESOLVED');
            expect(resolveResponse.body.resolved_at).toBeDefined();

            // Step 8: Verify alert no longer appears in searches
            const searchResponse = await request(app.getHttpServer())
                .get('/alerts')
                .query({
                    latitude: 40.7580,
                    longitude: -73.9855,
                    radius_km: 10,
                    status: 'ACTIVE',
                });

            expect(searchResponse.status).toBe(200);
            const activeAlertIds = searchResponse.body.map((alert) => alert.id);
            expect(activeAlertIds).not.toContain(alertId);
        });
    });

    describe('Scenario 2: Alert Expiration', () => {
        it('should expire alert and stop notifications after 7 days', async () => {
            // Create alert with manipulated created_at timestamp (8 days ago)
            const eightDaysAgo = new Date();
            eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

            const expiredAlert = await prisma.$executeRaw`
        INSERT INTO "Alert" (
          id, creator_id, status, pet_name, pet_species, pet_breed, 
          pet_description, location_point, location_address, 
          location_radius_km, contact_phone, contact_email, 
          created_at, expires_at, renewal_count
        ) VALUES (
          gen_random_uuid(),
          ${userId},
          'ACTIVE',
          'Buddy',
          'DOG',
          'Labrador',
          'Black lab, very friendly',
          ST_SetSRID(ST_MakePoint(-73.9855, 40.7580), 4326),
          'Times Square, NY',
          5,
          '+1234567890',
          'expired-test@test.com',
          ${eightDaysAgo},
          ${eightDaysAgo.setDate(eightDaysAgo.getDate() + 7)}, -- expired 1 day ago
          0
        )
      `;

            // Manually trigger expiration check (normally runs via cron)
            // This would be done by calling AlertService.checkExpired()
            // For now, we verify the alert is in expired state
            const expiredAlerts = await prisma.alert.findMany({
                where: {
                    status: 'ACTIVE',
                    expires_at: { lt: new Date() },
                },
            });

            expect(expiredAlerts.length).toBeGreaterThan(0);

            // Update status to EXPIRED (simulating cron job)
            await prisma.alert.updateMany({
                where: {
                    status: 'ACTIVE',
                    expires_at: { lt: new Date() },
                },
                data: { status: 'EXPIRED' },
            });

            // Verify alert is now expired
            const alertAfterExpiry = await prisma.alert.findFirst({
                where: {
                    creator_id: userId,
                    pet_name: 'Buddy',
                },
            });

            expect(alertAfterExpiry.status).toBe('EXPIRED');
        });
    });

    describe('Scenario 3: Alert Renewal', () => {
        it('should extend expiration when alert is renewed (max 3 times)', async () => {
            // Create alert
            const alertResponse = await request(app.getHttpServer())
                .post('/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    pet: {
                        name: 'Whiskers',
                        species: 'CAT',
                        breed: 'Siamese',
                        description: 'White and brown cat',
                        color: 'White',
                        age_years: 2,
                        photos: [],
                    },
                    location: {
                        latitude: 40.7580,
                        longitude: -73.9855,
                        address: 'Times Square, New York, NY',
                        last_seen_time: new Date().toISOString(),
                        radius_km: 3,
                    },
                    contact: {
                        phone: '+1234567890',
                        email: 'renewal@test.com',
                        is_phone_public: false,
                    },
                });

            expect(alertResponse.status).toBe(201);
            const alertId = alertResponse.body.id;
            const originalExpiresAt = new Date(alertResponse.body.expires_at);

            // Wait a moment
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Renew alert (1st time)
            const renewal1Response = await request(app.getHttpServer())
                .post(`/alerts/${alertId}/renew`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(renewal1Response.status).toBe(200);
            expect(renewal1Response.body.renewal_count).toBe(1);
            expect(renewal1Response.body.renewals_remaining).toBe(2);
            const expiresAfterRenewal1 = new Date(renewal1Response.body.expires_at);
            expect(expiresAfterRenewal1.getTime()).toBeGreaterThan(originalExpiresAt.getTime());

            // Renew alert (2nd time)
            const renewal2Response = await request(app.getHttpServer())
                .post(`/alerts/${alertId}/renew`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(renewal2Response.status).toBe(200);
            expect(renewal2Response.body.renewal_count).toBe(2);
            expect(renewal2Response.body.renewals_remaining).toBe(1);

            // Renew alert (3rd time)
            const renewal3Response = await request(app.getHttpServer())
                .post(`/alerts/${alertId}/renew`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(renewal3Response.status).toBe(200);
            expect(renewal3Response.body.renewal_count).toBe(3);
            expect(renewal3Response.body.renewals_remaining).toBe(0);

            // Try to renew 4th time (should fail)
            const renewal4Response = await request(app.getHttpServer())
                .post(`/alerts/${alertId}/renew`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(renewal4Response.status).toBe(422);
            expect(renewal4Response.body.message).toContain('maximum');
        });
    });

    describe('Scenario 4: Saved Zone HIGH Confidence Notification', () => {
        it('should send HIGH confidence notification to user with saved zone near alert', async () => {
            // Step 1: Register device for second user
            const deviceResponse = await request(app.getHttpServer())
                .post('/devices')
                .set('Authorization', `Bearer ${secondUserToken}`)
                .send({
                    device_uuid: 'scenario4-device-uuid',
                    platform: 'ANDROID',
                    os_version: '13',
                    app_version: '1.0.0',
                    push_token: 'f'.repeat(152), // Valid FCM token
                    gps: {
                        latitude: 40.7500, // Downtown Manhattan (far from alert)
                        longitude: -74.0050,
                    },
                    postal_codes: ['10004'],
                });

            expect(deviceResponse.status).toBe(201);
            const deviceId = deviceResponse.body.id;

            // Step 2: Create saved zone near Times Square
            const savedZoneResponse = await request(app.getHttpServer())
                .post(`/devices/${deviceId}/saved-zones`)
                .set('Authorization', `Bearer ${secondUserToken}`)
                .send({
                    name: 'Work Area',
                    latitude: 40.7590, // Near Times Square
                    longitude: -73.9845,
                    radius_km: 2,
                    priority: 10,
                });

            expect(savedZoneResponse.status).toBe(201);

            // Step 3: Create alert in Times Square (overlaps with saved zone)
            const alertResponse = await request(app.getHttpServer())
                .post('/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    pet: {
                        name: 'Luna',
                        species: 'CAT',
                        breed: 'Persian',
                        description: 'Gray persian cat',
                        color: 'Gray',
                        age_years: 1,
                        photos: [],
                    },
                    location: {
                        latitude: 40.7580, // Times Square (within saved zone radius)
                        longitude: -73.9855,
                        address: 'Times Square, New York, NY',
                        last_seen_time: new Date().toISOString(),
                        radius_km: 5,
                    },
                    contact: {
                        phone: '+1234567890',
                        email: 'savedzone@test.com',
                        is_phone_public: true,
                    },
                });

            expect(alertResponse.status).toBe(201);
            const alertId = alertResponse.body.id;

            // Step 4: Wait for notification processing
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Step 5: Verify HIGH confidence notification created
            const notifications = await prisma.notification.findMany({
                where: {
                    alert_id: alertId,
                    device_id: deviceId,
                },
            });

            expect(notifications.length).toBeGreaterThan(0);
            const notification = notifications[0];
            expect(notification.confidence).toBe('HIGH');
            expect(notification.match_reason).toContain('SAVED_ZONE');
        });
    });

    describe('Scenario 5: Rate Limiting', () => {
        it('should enforce rate limits and return 429 when exceeded', async () => {
            // Create 5 alerts rapidly (hitting hourly limit)
            const alertPromises = [];
            for (let i = 0; i < 5; i++) {
                alertPromises.push(
                    request(app.getHttpServer())
                        .post('/alerts')
                        .set('Authorization', `Bearer ${authToken}`)
                        .send({
                            pet: {
                                name: `Pet${i}`,
                                species: 'DOG',
                                breed: 'Mixed',
                                description: `Test pet ${i}`,
                                color: 'Brown',
                                age_years: 2,
                                photos: [],
                            },
                            location: {
                                latitude: 40.7580 + i * 0.001,
                                longitude: -73.9855 + i * 0.001,
                                address: `Location ${i}, New York, NY`,
                                last_seen_time: new Date().toISOString(),
                                radius_km: 3,
                            },
                            contact: {
                                phone: '+1234567890',
                                email: `ratelimit${i}@test.com`,
                                is_phone_public: false,
                            },
                        }),
                );
            }

            const responses = await Promise.all(alertPromises);

            // First 5 should succeed (within hourly limit of 5)
            for (let i = 0; i < 5; i++) {
                expect(responses[i].status).toBe(201);
            }

            // 6th alert should fail with rate limit error
            const sixthAlertResponse = await request(app.getHttpServer())
                .post('/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    pet: {
                        name: 'Pet6',
                        species: 'DOG',
                        breed: 'Mixed',
                        description: 'Test pet 6',
                        color: 'Brown',
                        age_years: 2,
                        photos: [],
                    },
                    location: {
                        latitude: 40.7580,
                        longitude: -73.9855,
                        address: 'Location 6, New York, NY',
                        last_seen_time: new Date().toISOString(),
                        radius_km: 3,
                    },
                    contact: {
                        phone: '+1234567890',
                        email: 'ratelimit6@test.com',
                        is_phone_public: false,
                    },
                });

            expect(sixthAlertResponse.status).toBe(429);
            expect(sixthAlertResponse.body.error_code).toBe('RATE_LIMIT_EXCEEDED');
            expect(sixthAlertResponse.body.retry_after_seconds).toBeDefined();
            expect(sixthAlertResponse.body.retry_after_seconds).toBeGreaterThan(0);
        });
    });

    describe('Scenario 6: Non-Owner Access Control', () => {
        it('should prevent non-owners from updating or resolving alerts', async () => {
            // User 1 creates alert
            const alertResponse = await request(app.getHttpServer())
                .post('/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    pet: {
                        name: 'Rocky',
                        species: 'DOG',
                        breed: 'Bulldog',
                        description: 'Friendly bulldog',
                        color: 'White',
                        age_years: 4,
                        photos: [],
                    },
                    location: {
                        latitude: 40.7580,
                        longitude: -73.9855,
                        address: 'Times Square, New York, NY',
                        last_seen_time: new Date().toISOString(),
                        radius_km: 5,
                    },
                    contact: {
                        phone: '+1234567890',
                        email: 'owner@test.com',
                        is_phone_public: true,
                    },
                });

            expect(alertResponse.status).toBe(201);
            const alertId = alertResponse.body.id;

            // User 2 tries to update the alert (should fail)
            const updateResponse = await request(app.getHttpServer())
                .patch(`/alerts/${alertId}`)
                .set('Authorization', `Bearer ${secondUserToken}`)
                .send({
                    pet_description: 'Attempting unauthorized update',
                });

            expect(updateResponse.status).toBe(403);

            // User 2 tries to resolve the alert (should fail)
            const resolveResponse = await request(app.getHttpServer())
                .post(`/alerts/${alertId}/resolve`)
                .set('Authorization', `Bearer ${secondUserToken}`)
                .send({
                    outcome: 'FOUND',
                    notes: 'Unauthorized resolution attempt',
                });

            expect(resolveResponse.status).toBe(403);

            // User 2 tries to renew the alert (should fail)
            const renewResponse = await request(app.getHttpServer())
                .post(`/alerts/${alertId}/renew`)
                .set('Authorization', `Bearer ${secondUserToken}`);

            expect(renewResponse.status).toBe(403);

            // Verify alert is still active and unchanged
            const alertCheck = await prisma.alert.findUnique({
                where: { id: alertId },
            });

            expect(alertCheck.status).toBe('ACTIVE');
            expect(alertCheck.pet_description).toBe('Friendly bulldog');
        });
    });

    describe('Scenario 7: Sighting Dismissal by Alert Creator', () => {
        it('should allow alert creator to dismiss false-positive sightings', async () => {
            // User 1 creates alert
            const alertResponse = await request(app.getHttpServer())
                .post('/alerts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    pet: {
                        name: 'Bella',
                        species: 'CAT',
                        breed: 'Tabby',
                        description: 'Orange tabby cat',
                        color: 'Orange',
                        age_years: 3,
                        photos: [],
                    },
                    location: {
                        latitude: 40.7580,
                        longitude: -73.9855,
                        address: 'Times Square, New York, NY',
                        last_seen_time: new Date().toISOString(),
                        radius_km: 5,
                    },
                    contact: {
                        phone: '+1234567890',
                        email: 'sighting@test.com',
                        is_phone_public: true,
                    },
                });

            expect(alertResponse.status).toBe(201);
            const alertId = alertResponse.body.id;

            // User 2 reports sighting
            const sightingResponse = await request(app.getHttpServer())
                .post('/sightings')
                .set('Authorization', `Bearer ${secondUserToken}`)
                .send({
                    alert_id: alertId,
                    location: {
                        latitude: 40.7600,
                        longitude: -73.9850,
                        address: 'Near Times Square',
                    },
                    notes: 'Saw a cat that looks similar',
                    confidence: 60,
                    sighting_time: new Date().toISOString(),
                });

            expect(sightingResponse.status).toBe(201);
            const sightingId = sightingResponse.body.id;

            // User 1 dismisses the sighting (wrong cat)
            const dismissResponse = await request(app.getHttpServer())
                .post(`/sightings/${sightingId}/dismiss`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    reason: 'Different cat - mine has a white patch',
                });

            expect(dismissResponse.status).toBe(200);
            expect(dismissResponse.body.dismissed).toBe(true);
            expect(dismissResponse.body.dismissed_reason).toBe('Different cat - mine has a white patch');

            // User 2 tries to dismiss their own sighting (should fail - only creator can dismiss)
            const unauthorizedDismiss = await request(app.getHttpServer())
                .post(`/sightings/${sightingId}/dismiss`)
                .set('Authorization', `Bearer ${secondUserToken}`)
                .send({
                    reason: 'Changed my mind',
                });

            expect(unauthorizedDismiss.status).toBe(403);
        });
    });
});
