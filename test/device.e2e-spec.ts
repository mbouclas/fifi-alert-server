import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/services/prisma.service';
import { DevicePlatform } from '@prisma/client';

describe('Device API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Test data
  let testUserId: string;
  let testDeviceId: string;
  let testZoneId: string;
  let authToken: string;

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
      }),
    );
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
    await prisma.$disconnect();
    await app.close();
  });

  async function setupTestData() {
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'device-test@test.com',
        name: 'Device Test User',
      },
    });
    testUserId = user.id;

    // TODO: Setup authentication token
    authToken = 'mock-auth-token';
  }

  async function cleanupTestData() {
    // Delete in correct order
    await prisma.savedZone.deleteMany({
      where: {
        device: { user_id: testUserId },
      },
    });
    await prisma.device.deleteMany({
      where: { user_id: testUserId },
    });
    await prisma.user.deleteMany({
      where: { id: testUserId },
    });
  }

  describe('POST /devices', () => {
    it('should register a new device successfully (201)', async () => {
      const registerDto = {
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

      const response = await request(app.getHttpServer())
        .post('/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(registerDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.device_uuid).toBe(registerDto.device_uuid);
      expect(response.body.platform).toBe(registerDto.platform);
      expect(response.body.gps_latitude).toBeCloseTo(37.7749, 4);
      expect(response.body.gps_longitude).toBeCloseTo(-122.4194, 4);
      expect(response.body.postal_codes).toEqual(['94102', '94103']);
      expect(response.body.location_status).toBeDefined();
      expect(response.body.location_status.hasGps).toBe(true);

      testDeviceId = response.body.id;
    });

    it('should update existing device on re-registration (idempotent)', async () => {
      const updateDto = {
        device_uuid: '550e8400-e29b-41d4-a716-446655440000', // Same UUID
        platform: DevicePlatform.IOS,
        os_version: '17.3', // Updated version
        app_version: '1.0.6', // Updated version
        push_token: 'new-token-xyz',
      };

      const response = await request(app.getHttpServer())
        .post('/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(201);

      expect(response.body.id).toBe(testDeviceId); // Same device
      expect(response.body.os_version).toBe('17.3');
      expect(response.body.app_version).toBe('1.0.6');
      expect(response.body.push_token).toBe('new-token-xyz');
    });

    it('should reject invalid platform enum (422)', async () => {
      const invalidDto = {
        device_uuid: '550e8400-e29b-41d4-a716-446655440001',
        platform: 'INVALID_PLATFORM',
        os_version: '17.2',
        app_version: '1.0.0',
      };

      await request(app.getHttpServer())
        .post('/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidDto)
        .expect(422);
    });

    it('should reject invalid GPS coordinates (422)', async () => {
      const invalidDto = {
        device_uuid: '550e8400-e29b-41d4-a716-446655440002',
        platform: DevicePlatform.ANDROID,
        os_version: '14.0',
        app_version: '1.0.0',
        location: {
          gps: {
            latitude: 91, // Invalid: > 90
            longitude: -122.4194,
          },
        },
      };

      await request(app.getHttpServer())
        .post('/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidDto)
        .expect(422);
    });

    it('should accept device registration without location data', async () => {
      const minimalDto = {
        device_uuid: '550e8400-e29b-41d4-a716-446655440003',
        platform: DevicePlatform.ANDROID,
        os_version: '14.0',
        app_version: '1.0.0',
      };

      const response = await request(app.getHttpServer())
        .post('/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(minimalDto)
        .expect(201);

      expect(response.body.gps_latitude).toBeNull();
      expect(response.body.gps_longitude).toBeNull();
      expect(response.body.postal_codes).toEqual([]);
    });
  });

  describe('GET /devices', () => {
    it('should return all devices for current user', async () => {
      const response = await request(app.getHttpServer())
        .get('/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('device_uuid');
      expect(response.body[0]).toHaveProperty('location_status');
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer()).get('/devices').expect(401);
    });
  });

  describe('PATCH /devices/:id/location', () => {
    it('should update device location successfully (200)', async () => {
      const updateDto = {
        gps: {
          latitude: 37.7849,
          longitude: -122.4094,
          accuracy: 10.5,
        },
        postal_codes: ['94102', '94103', '94104'],
      };

      const response = await request(app.getHttpServer())
        .patch(`/devices/${testDeviceId}/location`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.gps_latitude).toBeCloseTo(37.7849, 4);
      expect(response.body.gps_longitude).toBeCloseTo(-122.4094, 4);
      expect(response.body.postal_codes).toEqual(['94102', '94103', '94104']);
    });

    it('should return 404 for non-existent device', async () => {
      const updateDto = {
        gps: {
          latitude: 37.7749,
          longitude: -122.4194,
        },
      };

      await request(app.getHttpServer())
        .patch('/devices/non-existent-device/location')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(404);
    });

    it('should reject more than 5 postal codes (422)', async () => {
      const updateDto = {
        postal_codes: ['94102', '94103', '94104', '94105', '94106', '94107'],
      };

      await request(app.getHttpServer())
        .patch(`/devices/${testDeviceId}/location`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(422);
    });
  });

  describe('PATCH /devices/:id/push-token', () => {
    it('should update push token successfully (200)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/devices/${testDeviceId}/push-token`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ push_token: 'updated-token-abc' })
        .expect(200);

      expect(response.body.push_token).toBe('updated-token-abc');
      expect(response.body.push_token_updated_at).toBeDefined();
    });

    it('should return 404 for non-existent device', async () => {
      await request(app.getHttpServer())
        .patch('/devices/non-existent-device/push-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ push_token: 'token' })
        .expect(404);
    });
  });

  describe('POST /devices/:id/saved-zones', () => {
    it('should create a saved zone successfully (201)', async () => {
      const createDto = {
        name: 'Home',
        latitude: 37.7749,
        longitude: -122.4194,
        radius_km: 2.5,
        priority: 1,
        is_active: true,
      };

      const response = await request(app.getHttpServer())
        .post(`/devices/${testDeviceId}/saved-zones`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Home');
      expect(response.body.latitude).toBeCloseTo(37.7749, 4);
      expect(response.body.longitude).toBeCloseTo(-122.4194, 4);
      expect(response.body.radius_km).toBe(2.5);

      testZoneId = response.body.id;
    });

    it('should create multiple zones up to limit of 5', async () => {
      const zoneNames = ['Work', 'Gym', 'Park', 'School'];

      for (const name of zoneNames) {
        await request(app.getHttpServer())
          .post(`/devices/${testDeviceId}/saved-zones`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name,
            latitude: 37.7749,
            longitude: -122.4194,
            radius_km: 1.5,
          })
          .expect(201);
      }

      // Should have 5 zones total now (1 from previous test + 4 here)
    });

    it('should reject 6th zone (max limit exceeded)', async () => {
      await request(app.getHttpServer())
        .post(`/devices/${testDeviceId}/saved-zones`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Too Many',
          latitude: 37.7749,
          longitude: -122.4194,
          radius_km: 1.5,
        })
        .expect(400);
    });

    it('should reject invalid radius (422)', async () => {
      await request(app.getHttpServer())
        .post(`/devices/${testDeviceId}/saved-zones`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid',
          latitude: 37.7749,
          longitude: -122.4194,
          radius_km: 25, // Invalid: > 20
        })
        .expect(422);
    });

    it('should reject invalid name length (422)', async () => {
      await request(app.getHttpServer())
        .post(`/devices/${testDeviceId}/saved-zones`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'A'.repeat(51), // Invalid: > 50 chars
          latitude: 37.7749,
          longitude: -122.4194,
          radius_km: 2.0,
        })
        .expect(422);
    });
  });

  describe('GET /devices/:id/saved-zones', () => {
    it('should return all saved zones for a device', async () => {
      const response = await request(app.getHttpServer())
        .get(`/devices/${testDeviceId}/saved-zones`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(5); // Max limit
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('latitude');
      expect(response.body[0]).toHaveProperty('longitude');
    });

    it('should return 404 for non-existent device', async () => {
      await request(app.getHttpServer())
        .get('/devices/non-existent-device/saved-zones')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PATCH /devices/saved-zones/:zoneId', () => {
    it('should update a saved zone successfully (200)', async () => {
      const updateDto = {
        name: 'Updated Home',
        radius_km: 3.0,
        priority: 2,
        is_active: false,
      };

      const response = await request(app.getHttpServer())
        .patch(`/devices/saved-zones/${testZoneId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.name).toBe('Updated Home');
      expect(response.body.radius_km).toBe(3.0);
      expect(response.body.priority).toBe(2);
      expect(response.body.is_active).toBe(false);
    });

    it('should handle partial updates', async () => {
      const partialDto = {
        name: 'Home Sweet Home',
      };

      const response = await request(app.getHttpServer())
        .patch(`/devices/saved-zones/${testZoneId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(partialDto)
        .expect(200);

      expect(response.body.name).toBe('Home Sweet Home');
      expect(response.body.radius_km).toBe(3.0); // Unchanged from previous test
    });

    it('should return 404 for non-existent zone', async () => {
      await request(app.getHttpServer())
        .patch('/devices/saved-zones/non-existent-zone')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test' })
        .expect(404);
    });
  });

  describe('DELETE /devices/saved-zones/:zoneId', () => {
    it('should delete a saved zone successfully (204)', async () => {
      await request(app.getHttpServer())
        .delete(`/devices/saved-zones/${testZoneId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify deletion
      const response = await request(app.getHttpServer())
        .get(`/devices/${testDeviceId}/saved-zones`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.length).toBe(4); // 5 - 1 = 4
    });

    it('should return 404 for non-existent zone', async () => {
      await request(app.getHttpServer())
        .delete('/devices/saved-zones/non-existent-zone')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 404 when trying to delete already deleted zone', async () => {
      await request(app.getHttpServer())
        .delete(`/devices/saved-zones/${testZoneId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
