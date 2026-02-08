import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/services/prisma.service';
import {
  AlertStatus,
  NotificationConfidence,
  PetSpecies,
} from '@prisma/client';

describe('Sighting API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Test data
  let testUserId: string;
  let testReporterId: string;
  let testAlertId: string;
  let testSightingId: string;
  let authToken: string;
  let reporterToken: string;

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
    // Create test users
    const creator = await prisma.user.create({
      data: {
        email: 'creator-sighting@test.com',
        name: 'Alert Creator',
      },
    });
    testUserId = creator.id;

    const reporter = await prisma.user.create({
      data: {
        email: 'reporter-sighting@test.com',
        name: 'Sighting Reporter',
      },
    });
    testReporterId = reporter.id;

    // Create ACTIVE alert with PostGIS geometry
    const alertResult = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO alerts (
        creator_id, status, pet_species, pet_name, pet_description,
        location_point, location_address, expires_at
      )
      VALUES (
        ${testUserId}::text,
        ${AlertStatus.ACTIVE}::"AlertStatus",
        ${PetSpecies.DOG}::"PetSpecies",
        'Max',
        'Golden Retriever, very friendly',
        ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326),
        'San Francisco, CA',
        ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)}
      )
      RETURNING id
    `;
    testAlertId = alertResult[0].id;

    // TODO: Setup authentication tokens
    // For now, tests will fail authentication unless BearerTokenGuard is mocked
    authToken = 'mock-auth-token-creator';
    reporterToken = 'mock-auth-token-reporter';
  }

  async function cleanupTestData() {
    // Delete in correct order to avoid foreign key constraints
    await prisma.sighting.deleteMany({
      where: { alert_id: testAlertId },
    });
    await prisma.alert.deleteMany({
      where: { id: testAlertId },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [testUserId, testReporterId] },
      },
    });
  }

  describe('POST /sightings', () => {
    it('should create a sighting successfully (201)', async () => {
      const createDto = {
        alert_id: testAlertId,
        location: {
          latitude: 37.7849,
          longitude: -122.4094,
          address: '456 Oak Ave, San Francisco, CA',
        },
        photo: 'https://storage.fifi-alert.com/sightings/photo1.jpg',
        notes: 'Saw a golden retriever matching the description',
        confidence: NotificationConfidence.HIGH,
        sighting_time: new Date().toISOString(),
        direction: 'Heading north towards the park',
      };

      // TODO: Add proper authentication once auth is configured
      const response = await request(app.getHttpServer())
        .post('/sightings')
        .set('Authorization', `Bearer ${reporterToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.alert_id).toBe(testAlertId);
      expect(response.body.latitude).toBeCloseTo(37.7849, 4);
      expect(response.body.longitude).toBeCloseTo(-122.4094, 4);
      expect(response.body.dismissed).toBe(false);

      testSightingId = response.body.id;
    });

    it('should reject invalid coordinates (422)', async () => {
      const invalidDto = {
        alert_id: testAlertId,
        location: {
          latitude: 91, // Invalid: > 90
          longitude: -122.4094,
          address: '456 Oak Ave',
        },
        confidence: NotificationConfidence.MEDIUM,
        sighting_time: new Date().toISOString(),
      };

      await request(app.getHttpServer())
        .post('/sightings')
        .set('Authorization', `Bearer ${reporterToken}`)
        .send(invalidDto)
        .expect(422);
    });

    it('should reject sighting for non-existent alert (404)', async () => {
      const createDto = {
        alert_id: 'non-existent-alert-id',
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          address: '123 Main St',
        },
        confidence: NotificationConfidence.MEDIUM,
        sighting_time: new Date().toISOString(),
      };

      await request(app.getHttpServer())
        .post('/sightings')
        .set('Authorization', `Bearer ${reporterToken}`)
        .send(createDto)
        .expect(404);
    });

    it('should reject sighting for non-ACTIVE alert (400)', async () => {
      // Create RESOLVED alert
      const resolvedAlertResult = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO alerts (
          creator_id, status, pet_species, pet_name, pet_description,
          location_point, location_address, expires_at
        )
        VALUES (
          ${testUserId}::text,
          ${AlertStatus.RESOLVED}::"AlertStatus",
          ${PetSpecies.CAT}::"PetSpecies",
          'Whiskers',
          'Orange tabby cat',
          ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326),
          'San Francisco, CA',
          ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)}
        )
        RETURNING id
      `;
      const resolvedAlertId = resolvedAlertResult[0].id;

      const createDto = {
        alert_id: resolvedAlertId,
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          address: '123 Main St',
        },
        confidence: NotificationConfidence.MEDIUM,
        sighting_time: new Date().toISOString(),
      };

      await request(app.getHttpServer())
        .post('/sightings')
        .set('Authorization', `Bearer ${reporterToken}`)
        .send(createDto)
        .expect(400);

      // Cleanup
      await prisma.alert.delete({ where: { id: resolvedAlertId } });
    });

    it('should handle optional fields correctly', async () => {
      const minimalDto = {
        alert_id: testAlertId,
        location: {
          latitude: 37.7849,
          longitude: -122.4094,
          address: '789 Pine St, San Francisco, CA',
        },
        confidence: NotificationConfidence.LOW,
        sighting_time: new Date().toISOString(),
      };

      const response = await request(app.getHttpServer())
        .post('/sightings')
        .set('Authorization', `Bearer ${reporterToken}`)
        .send(minimalDto)
        .expect(201);

      expect(response.body.photo).toBeNull();
      expect(response.body.notes).toBeNull();
      expect(response.body.direction).toBeNull();
    });
  });

  describe('GET /sightings/alert/:alertId', () => {
    beforeAll(async () => {
      // Create test sightings (one dismissed, one active)
      await prisma.$executeRaw`
        INSERT INTO sightings (
          alert_id, reported_by, location_point, address,
          confidence, sighting_time, dismissed
        )
        VALUES (
          ${testAlertId}::text,
          ${testReporterId}::text,
          ST_SetSRID(ST_MakePoint(-122.4094, 37.7849), 4326),
          '100 Market St',
          ${NotificationConfidence.MEDIUM}::"NotificationConfidence",
          ${new Date()},
          false
        )
      `;

      await prisma.$executeRaw`
        INSERT INTO sightings (
          alert_id, reported_by, location_point, address,
          confidence, sighting_time, dismissed, dismissed_at, dismissed_reason
        )
        VALUES (
          ${testAlertId}::text,
          ${testReporterId}::text,
          ST_SetSRID(ST_MakePoint(-122.4000, 37.7800), 4326),
          '200 Broadway',
          ${NotificationConfidence.LOW}::"NotificationConfidence",
          ${new Date()},
          true,
          ${new Date()},
          'Not my pet'
        )
      `;
    });

    it('should return all sightings for alert creator (including dismissed)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/sightings/alert/${testAlertId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);

      // Creator should see dismissed sightings
      const dismissedSightings = response.body.filter((s: any) => s.dismissed);
      expect(dismissedSightings.length).toBeGreaterThan(0);
    });

    it('should filter dismissed sightings for non-creators', async () => {
      const response = await request(app.getHttpServer())
        .get(`/sightings/alert/${testAlertId}`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);

      // Non-creator should not see dismissed sightings
      const dismissedSightings = response.body.filter((s: any) => s.dismissed);
      expect(dismissedSightings.length).toBe(0);
    });

    it('should return 404 for non-existent alert', async () => {
      await request(app.getHttpServer())
        .get('/sightings/alert/non-existent-alert')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return sightings with coordinates', async () => {
      const response = await request(app.getHttpServer())
        .get(`/sightings/alert/${testAlertId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('latitude');
      expect(response.body[0]).toHaveProperty('longitude');
      expect(typeof response.body[0].latitude).toBe('number');
      expect(typeof response.body[0].longitude).toBe('number');
    });
  });

  describe('POST /sightings/:id/dismiss', () => {
    let dismissibleSightingId: string;

    beforeAll(async () => {
      // Create a sighting to dismiss
      const result = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO sightings (
          alert_id, reported_by, location_point, address,
          confidence, sighting_time
        )
        VALUES (
          ${testAlertId}::text,
          ${testReporterId}::text,
          ST_SetSRID(ST_MakePoint(-122.4000, 37.7800), 4326),
          '300 Elm St',
          ${NotificationConfidence.MEDIUM}::"NotificationConfidence",
          ${new Date()}
        )
        RETURNING id
      `;
      dismissibleSightingId = result[0].id;
    });

    it('should dismiss sighting by alert creator (200)', async () => {
      const dismissDto = {
        reason: 'This is not my pet - different breed',
      };

      const response = await request(app.getHttpServer())
        .post(`/sightings/${dismissibleSightingId}/dismiss`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(dismissDto)
        .expect(200);

      expect(response.body.dismissed).toBe(true);
      expect(response.body.dismissed_reason).toBe(dismissDto.reason);
      expect(response.body.dismissed_at).toBeDefined();
    });

    it('should reject dismissal by non-creator (403)', async () => {
      // Create another sighting
      const result = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO sightings (
          alert_id, reported_by, location_point, address,
          confidence, sighting_time
        )
        VALUES (
          ${testAlertId}::text,
          ${testReporterId}::text,
          ST_SetSRID(ST_MakePoint(-122.4100, 37.7750), 4326),
          '400 Main St',
          ${NotificationConfidence.HIGH}::"NotificationConfidence",
          ${new Date()}
        )
        RETURNING id
      `;
      const newSightingId = result[0].id;

      const dismissDto = {
        reason: 'Invalid dismissal attempt',
      };

      await request(app.getHttpServer())
        .post(`/sightings/${newSightingId}/dismiss`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send(dismissDto)
        .expect(403);
    });

    it('should reject dismissal of already dismissed sighting (400)', async () => {
      const dismissDto = {
        reason: 'Trying to dismiss again',
      };

      await request(app.getHttpServer())
        .post(`/sightings/${dismissibleSightingId}/dismiss`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(dismissDto)
        .expect(400);
    });

    it('should return 404 for non-existent sighting', async () => {
      const dismissDto = {
        reason: 'Does not matter',
      };

      await request(app.getHttpServer())
        .post('/sightings/non-existent-sighting/dismiss')
        .set('Authorization', `Bearer ${authToken}`)
        .send(dismissDto)
        .expect(404);
    });

    it('should require reason field', async () => {
      const result = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO sightings (
          alert_id, reported_by, location_point, address,
          confidence, sighting_time
        )
        VALUES (
          ${testAlertId}::text,
          ${testReporterId}::text,
          ST_SetSRID(ST_MakePoint(-122.4200, 37.7700), 4326),
          '500 Oak St',
          ${NotificationConfidence.MEDIUM}::"NotificationConfidence",
          ${new Date()}
        )
        RETURNING id
      `;
      const anotherSightingId = result[0].id;

      // Missing reason field
      await request(app.getHttpServer())
        .post(`/sightings/${anotherSightingId}/dismiss`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(422);
    });
  });
});
