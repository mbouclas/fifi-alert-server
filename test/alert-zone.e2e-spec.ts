import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/services/prisma.service';

describe('Alert Zones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let userId: number;
  let testEmail: string;

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

    prisma = app.get<PrismaService>(PrismaService);

    // Create a test user and authenticate
    testEmail = `test-alertzone-${Date.now()}@example.com`;
    const signupResponse = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: testEmail,
        password: 'TestPassword123!',
        name: 'Alert Zone Test User',
      })
      .expect(201);

    authToken = signupResponse.body.token;
    userId = signupResponse.body.user.id;
  });

  afterAll(async () => {
    // Cleanup: Delete test user and their alert zones
    await prisma.alertZone.deleteMany({
      where: { user_id: userId },
    });
    await prisma.user.delete({
      where: { id: userId },
    });

    await app.close();
  });

  afterEach(async () => {
    // Clean up alert zones after each test
    await prisma.alertZone.deleteMany({
      where: { user_id: userId },
    });
  });

  describe('POST /users/me/alert-zones', () => {
    it('should create an alert zone with valid input', async () => {
      const createDto = {
        name: 'Home',
        latitude: 37.7749,
        longitude: -122.4194,
        radius_meters: 500,
        priority: 1,
        is_active: true,
      };

      const response = await request(app.getHttpServer())
        .post('/users/me/alert-zones')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Home',
        latitude: 37.7749,
        longitude: -122.4194,
        radius_meters: 500,
        radius_km: 0.5,
        priority: 1,
        is_active: true,
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.created_at).toBeDefined();
      expect(response.body.updated_at).toBeDefined();
    });

    it('should return 400 when max zones exceeded', async () => {
      // Create 10 zones (max limit)
      for (let i = 0; i < 10; i++) {
        await prisma.$queryRaw`
          INSERT INTO alert_zone (user_id, name, location_point, radius_meters, priority, is_active)
          VALUES (
            ${userId},
            ${`Zone ${i}`},
            ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326),
            500,
            1,
            true
          )
        `;
      }

      const createDto = {
        name: 'One Too Many',
        latitude: 37.7749,
        longitude: -122.4194,
        radius_meters: 500,
      };

      await request(app.getHttpServer())
        .post('/users/me/alert-zones')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(400);
    });

    it('should return 401 when not authenticated', async () => {
      const createDto = {
        name: 'Home',
        latitude: 37.7749,
        longitude: -122.4194,
        radius_meters: 500,
      };

      await request(app.getHttpServer())
        .post('/users/me/alert-zones')
        .send(createDto)
        .expect(401);
    });

    it('should return 400 for invalid radius (too small)', async () => {
      const createDto = {
        name: 'Home',
        latitude: 37.7749,
        longitude: -122.4194,
        radius_meters: 30, // Below minimum of 50
      };

      await request(app.getHttpServer())
        .post('/users/me/alert-zones')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(400);
    });

    it('should return 400 for invalid radius (too large)', async () => {
      const createDto = {
        name: 'Home',
        latitude: 37.7749,
        longitude: -122.4194,
        radius_meters: 6000, // Above maximum of 5000
      };

      await request(app.getHttpServer())
        .post('/users/me/alert-zones')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(400);
    });

    it('should return 400 for invalid latitude', async () => {
      const createDto = {
        name: 'Home',
        latitude: 91, // Above maximum of 90
        longitude: -122.4194,
        radius_meters: 500,
      };

      await request(app.getHttpServer())
        .post('/users/me/alert-zones')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(400);
    });

    it('should return 400 for invalid longitude', async () => {
      const createDto = {
        name: 'Home',
        latitude: 37.7749,
        longitude: 181, // Above maximum of 180
        radius_meters: 500,
      };

      await request(app.getHttpServer())
        .post('/users/me/alert-zones')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(400);
    });

    it('should return 400 for missing required fields', async () => {
      const createDto = {
        name: 'Home',
        // Missing latitude, longitude, radius_meters
      };

      await request(app.getHttpServer())
        .post('/users/me/alert-zones')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(400);
    });
  });

  describe('GET /users/me/alert-zones', () => {
    it('should return all zones for the authenticated user', async () => {
      // Create 2 zones
      await prisma.$queryRaw`
        INSERT INTO alert_zone (user_id, name, location_point, radius_meters, priority, is_active)
        VALUES 
          (${userId}, 'Home', ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326), 500, 2, true),
          (${userId}, 'Work', ST_SetSRID(ST_MakePoint(-122.4294, 37.7799), 4326), 300, 1, true)
      `;

      const response = await request(app.getHttpServer())
        .get('/users/me/alert-zones')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe('Home');
      expect(response.body[0].priority).toBe(2);
      expect(response.body[1].name).toBe('Work');
      expect(response.body[1].priority).toBe(1);
    });

    it('should return empty array for new user', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me/alert-zones')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return 401 when not authenticated', async () => {
      await request(app.getHttpServer())
        .get('/users/me/alert-zones')
        .expect(401);
    });

    it("should not return other users' zones", async () => {
      // Create another user
      const otherEmail = `other-${Date.now()}@example.com`;
      const otherUserResponse = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: otherEmail,
          password: 'TestPassword123!',
          name: 'Other User',
        });

      const otherUserId = otherUserResponse.body.user.id;

      // Create zone for other user
      await prisma.$queryRaw`
        INSERT INTO alert_zone (user_id, name, location_point, radius_meters, priority, is_active)
        VALUES (${otherUserId}, 'Other Home', ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326), 500, 1, true)
      `;

      // Query as first user
      const response = await request(app.getHttpServer())
        .get('/users/me/alert-zones')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual([]);

      // Cleanup
      await prisma.alertZone.deleteMany({ where: { user_id: otherUserId } });
      await prisma.user.delete({ where: { id: otherUserId } });
    });
  });

  describe('GET /users/me/alert-zones/:id', () => {
    let zoneId: number;

    beforeEach(async () => {
      // Create a test zone
      const result = await prisma.$queryRaw<Array<{ id: number }>>`
        INSERT INTO alert_zone (user_id, name, location_point, radius_meters, priority, is_active)
        VALUES (${userId}, 'Test Zone', ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326), 500, 1, true)
        RETURNING id
      `;
      zoneId = result[0].id;
    });

    it('should return a single zone', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/me/alert-zones/${zoneId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: zoneId,
        name: 'Test Zone',
        latitude: 37.7749,
        longitude: -122.4194,
        radius_meters: 500,
      });
    });

    it('should return 404 when zone does not exist', async () => {
      await request(app.getHttpServer())
        .get('/users/me/alert-zones/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 403 when zone belongs to another user', async () => {
      // Create another user
      const otherEmail = `other-${Date.now()}@example.com`;
      const otherUserResponse = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: otherEmail,
          password: 'TestPassword123!',
          name: 'Other User',
        });

      const otherUserId = otherUserResponse.body.user.id;
      const otherToken = otherUserResponse.body.token;

      // Create zone for other user
      const result = await prisma.$queryRaw<Array<{ id: number }>>`
        INSERT INTO alert_zone (user_id, name, location_point, radius_meters, priority, is_active)
        VALUES (${otherUserId}, 'Other Zone', ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326), 500, 1, true)
        RETURNING id
      `;
      const otherZoneId = result[0].id;

      // Try to access other user's zone
      await request(app.getHttpServer())
        .get(`/users/me/alert-zones/${otherZoneId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      // Cleanup
      await prisma.alertZone.delete({ where: { id: otherZoneId } });
      await prisma.user.delete({ where: { id: otherUserId } });
    });
  });

  describe('PATCH /users/me/alert-zones/:id', () => {
    let zoneId: number;

    beforeEach(async () => {
      const result = await prisma.$queryRaw<Array<{ id: number }>>`
        INSERT INTO alert_zone (user_id, name, location_point, radius_meters, priority, is_active)
        VALUES (${userId}, 'Test Zone', ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326), 500, 1, true)
        RETURNING id
      `;
      zoneId = result[0].id;
    });

    it('should update zone successfully', async () => {
      const updateDto = {
        name: 'Updated Zone',
        radius_meters: 1000,
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/me/alert-zones/${zoneId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.name).toBe('Updated Zone');
      expect(response.body.radius_meters).toBe(1000);
    });

    it('should return 403 when not owner', async () => {
      // Create another user
      const otherEmail = `other-${Date.now()}@example.com`;
      const otherUserResponse = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: otherEmail,
          password: 'TestPassword123!',
          name: 'Other User',
        });

      const otherToken = otherUserResponse.body.token;
      const otherUserId = otherUserResponse.body.user.id;

      await request(app.getHttpServer())
        .patch(`/users/me/alert-zones/${zoneId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hacked' })
        .expect(403);

      // Cleanup
      await prisma.user.delete({ where: { id: otherUserId } });
    });

    it('should return 404 when zone does not exist', async () => {
      await request(app.getHttpServer())
        .patch('/users/me/alert-zones/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test' })
        .expect(404);
    });
  });

  describe('DELETE /users/me/alert-zones/:id', () => {
    let zoneId: number;

    beforeEach(async () => {
      const result = await prisma.$queryRaw<Array<{ id: number }>>`
        INSERT INTO alert_zone (user_id, name, location_point, radius_meters, priority, is_active)
        VALUES (${userId}, 'Test Zone', ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326), 500, 1, true)
        RETURNING id
      `;
      zoneId = result[0].id;
    });

    it('should delete zone successfully', async () => {
      await request(app.getHttpServer())
        .delete(`/users/me/alert-zones/${zoneId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify deletion
      const zones = await prisma.alertZone.findMany({
        where: { user_id: userId },
      });
      expect(zones).toHaveLength(0);
    });

    it('should return 403 when not owner', async () => {
      // Create another user
      const otherEmail = `other-${Date.now()}@example.com`;
      const otherUserResponse = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: otherEmail,
          password: 'TestPassword123!',
          name: 'Other User',
        });

      const otherToken = otherUserResponse.body.token;
      const otherUserId = otherUserResponse.body.user.id;

      await request(app.getHttpServer())
        .delete(`/users/me/alert-zones/${zoneId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      // Cleanup
      await prisma.user.delete({ where: { id: otherUserId } });
    });

    it('should return 404 when zone does not exist', async () => {
      await request(app.getHttpServer())
        .delete('/users/me/alert-zones/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
