import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/services/prisma.service';
import { Gender, Size, AlertStatus } from '../src/generated/prisma';
import { TokenService } from '../src/auth/services/token.service';

describe('Pet API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  // Test data
  let testUserId: number;
  let testUser2Id: number;
  let testPetId: number;
  let testPetTagId: string;
  let authToken: string;
  let authToken2: string;
  let petTypeDogId: number;
  let petTypeCatId: number;
  let petTypeBirdId: number;

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
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    );
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    tokenService = moduleFixture.get<TokenService>(TokenService);

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
    // Create pet types used in tests
    const dogType = await prisma.petType.upsert({
      where: { slug: 'dog' },
      update: { name: 'Dog' },
      create: { name: 'Dog', slug: 'dog' },
    });
    const catType = await prisma.petType.upsert({
      where: { slug: 'cat' },
      update: { name: 'Cat' },
      create: { name: 'Cat', slug: 'cat' },
    });
    const birdType = await prisma.petType.upsert({
      where: { slug: 'bird' },
      update: { name: 'Bird' },
      create: { name: 'Bird', slug: 'bird' },
    });

    petTypeDogId = dogType.id;
    petTypeCatId = catType.id;
    petTypeBirdId = birdType.id;

    // Create test users
    const user1 = await prisma.user.create({
      data: {
        email: 'pet-test-user1@test.com',
        name: 'Pet Test User 1',
        firstName: 'Pet',
        lastName: 'User1',
      },
    });
    testUserId = user1.id;

    const user2 = await prisma.user.create({
      data: {
        email: 'pet-test-user2@test.com',
        name: 'Pet Test User 2',
        firstName: 'Pet',
        lastName: 'User2',
      },
    });
    testUser2Id = user2.id;

    const user1WithRelations = await prisma.user.findUnique({
      where: { id: testUserId },
      include: {
        roles: { include: { role: true } },
        gates: { include: { gate: true } },
      },
    });
    const user2WithRelations = await prisma.user.findUnique({
      where: { id: testUser2Id },
      include: {
        roles: { include: { role: true } },
        gates: { include: { gate: true } },
      },
    });

    const token1 = await tokenService.generateAccessToken(
      user1WithRelations as any,
    );
    const token2 = await tokenService.generateAccessToken(
      user2WithRelations as any,
    );

    authToken = token1.token;
    authToken2 = token2.token;
  }

  async function cleanupTestData() {
    // Delete in correct order (alerts first due to FK)
    await prisma.alert.deleteMany({
      where: {
        OR: [{ creator_id: testUserId }, { creator_id: testUser2Id }],
      },
    });

    // Delete pets
    await prisma.pet.deleteMany({
      where: {
        OR: [{ userId: testUserId }, { userId: testUser2Id }],
      },
    });

    // Delete pet types created for tests
    await prisma.petType.deleteMany({
      where: {
        slug: { in: ['dog', 'cat', 'bird'] },
      },
    });

    // Delete sessions created for test users
    await prisma.session.deleteMany({
      where: { userId: { in: [testUserId, testUser2Id] } },
    });

    // Delete users
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [testUserId, testUser2Id],
        },
      },
    });
  }

  describe('POST /pets', () => {
    it('should create a new pet successfully (201)', async () => {
      const createDto = {
        petTypeId: petTypeDogId,
        name: 'Max',
        gender: Gender.MALE,
        size: Size.MEDIUM,
        photos: [
          'https://example.com/max1.jpg',
          'https://example.com/max2.jpg',
        ],
        birthday: '2020-05-15T00:00:00.000Z',
      };

      const response = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('tagId');
      expect(response.body.tagId).toHaveLength(9); // Tag ID should be 9 characters
      expect(response.body.name).toBe(createDto.name);
      expect(response.body.petTypeId).toBe(createDto.petTypeId);
      expect(response.body.petType).toHaveProperty('id', createDto.petTypeId);
      expect(response.body.petType).toHaveProperty('slug', 'dog');
      expect(response.body.gender).toBe(createDto.gender);
      expect(response.body.size).toBe(createDto.size);
      expect(response.body.isMissing).toBe(false);
      expect(response.body.photos).toEqual(createDto.photos);
      expect(response.body.userId).toBe(testUserId);

      testPetId = response.body.id;
      testPetTagId = response.body.tagId;
    });

    it('should reject pet creation without required fields (422)', async () => {
      const invalidDto = {
        // Missing required 'petTypeId' and 'name'
        gender: Gender.FEMALE,
      };

      await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidDto)
        .expect(422);
    });

    it('should reject pet creation with invalid enum values (422)', async () => {
      const invalidDto = {
        petTypeId: 999999,
        name: 'Buddy',
      };

      await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidDto)
        .expect(422);
    });

    it('should reject pet creation with invalid photo URLs (422)', async () => {
      const invalidDto = {
        petTypeId: petTypeCatId,
        name: 'Whiskers',
        photos: ['not-a-valid-url', 'also-invalid'],
      };

      await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidDto)
        .expect(422);
    });

    it('should create pet with minimal required fields (201)', async () => {
      const minimalDto = {
        petTypeId: petTypeCatId,
        name: 'Mittens',
      };

      const response = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(minimalDto)
        .expect(201);

      expect(response.body.name).toBe('Mittens');
      expect(response.body.petTypeId).toBe(petTypeCatId);
      expect(response.body.petType).toHaveProperty('slug', 'cat');
      expect(response.body.gender).toBeUndefined();
      expect(response.body.size).toBeUndefined();
      expect(response.body.photos).toEqual([]);
    });
  });

  describe('GET /pets', () => {
    it('should return all pets for authenticated user (200)', async () => {
      const response = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2); // At least 2 pets created
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('tagId');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('petTypeId');
      expect(response.body[0]).toHaveProperty('petType');
    });

    it('should return empty array for user with no pets (200)', async () => {
      const response = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${authToken2}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should require authentication (401)', async () => {
      await request(app.getHttpServer()).get('/pets').expect(401);
    });
  });

  describe('GET /pets/:id', () => {
    it('should return pet details by ID (200)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/pets/${testPetId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(testPetId);
      expect(response.body.name).toBe('Max');
      expect(response.body.petTypeId).toBe(petTypeDogId);
      expect(response.body.petType).toHaveProperty('slug', 'dog');
    });

    it("should reject access to another user's pet (403)", async () => {
      await request(app.getHttpServer())
        .get(`/pets/${testPetId}`)
        .set('Authorization', `Bearer ${authToken2}`)
        .expect(403);
    });

    it('should return 404 for non-existent pet', async () => {
      await request(app.getHttpServer())
        .get('/pets/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('GET /pets/tag/:tagId (Public Endpoint)', () => {
    it('should return pet details by tag ID without authentication (200)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/pets/tag/${testPetTagId}`)
        .expect(200);

      expect(response.body.tagId).toBe(testPetTagId);
      expect(response.body.name).toBe('Max');
      expect(response.body.petTypeId).toBe(petTypeDogId);
      expect(response.body.petType).toHaveProperty('slug', 'dog');
    });

    it('should return 404 for non-existent tag ID', async () => {
      await request(app.getHttpServer()).get('/pets/tag/INVALID99').expect(404);
    });

    it('should enforce rate limiting (429)', async () => {
      // Make 21 requests rapidly (rate limit is 20 per minute)
      const requests: Array<Promise<request.Response>> = [];
      for (let i = 0; i < 21; i++) {
        requests.push(
          request(app.getHttpServer()).get(`/pets/tag/${testPetTagId}`),
        );
      }

      const responses = await Promise.all(requests);
      const hasRateLimitError = responses.some((r) => r.status === 429);
      expect(hasRateLimitError).toBe(true);
    }, 30000); // Increase timeout for rate limit test
  });

  describe('PUT /pets/:id', () => {
    it('should update pet details (200)', async () => {
      const updateDto = {
        name: 'Maximus',
        size: Size.LARGE,
        photos: ['https://example.com/max3.jpg'],
      };

      const response = await request(app.getHttpServer())
        .put(`/pets/${testPetId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.id).toBe(testPetId);
      expect(response.body.name).toBe('Maximus');
      expect(response.body.size).toBe(Size.LARGE);
      expect(response.body.petTypeId).toBe(petTypeDogId); // Should remain unchanged
    });

    it("should reject update to another user's pet (403)", async () => {
      const updateDto = {
        name: 'Hacked Name',
      };

      await request(app.getHttpServer())
        .put(`/pets/${testPetId}`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send(updateDto)
        .expect(403);
    });

    it('should return 404 for non-existent pet', async () => {
      const updateDto = {
        name: 'Ghost Pet',
      };

      await request(app.getHttpServer())
        .put('/pets/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(404);
    });
  });

  describe('PATCH /pets/:id/missing', () => {
    it('should mark pet as missing (200)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/pets/${testPetId}/missing`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(testPetId);
      expect(response.body.isMissing).toBe(true);
    });

    it('should reject marking already missing pet (422)', async () => {
      await request(app.getHttpServer())
        .patch(`/pets/${testPetId}/missing`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(422);
    });

    it("should reject marking another user's pet (403)", async () => {
      await request(app.getHttpServer())
        .patch(`/pets/${testPetId}/missing`)
        .set('Authorization', `Bearer ${authToken2}`)
        .expect(403);
    });
  });

  describe('PATCH /pets/:id/found', () => {
    it('should mark pet as found (200)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/pets/${testPetId}/found`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(testPetId);
      expect(response.body.isMissing).toBe(false);
    });

    it('should reject marking already found pet (422)', async () => {
      await request(app.getHttpServer())
        .patch(`/pets/${testPetId}/found`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(422);
    });
  });

  describe('Integration: Pet-Alert Workflow', () => {
    let alertId: number;

    it('should auto-mark pet as missing when creating alert with petId', async () => {
      // First, mark pet as not missing
      await prisma.pet.update({
        where: { id: testPetId },
        data: { isMissing: false },
      });

      // Create alert with petId
      const createAlertDto = {
        petId: testPetId,
        pet: {
          name: 'Maximus',
          species: 'DOG',
          description: 'Friendly golden retriever',
        },
        location: {
          lat: 37.7749,
          lon: -122.4194,
          lastSeenTime: new Date().toISOString(),
          radiusKm: 5,
        },
        contact: {
          isPhonePublic: false,
        },
      };

      const response = await request(app.getHttpServer())
        .post('/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createAlertDto)
        .expect(201);

      alertId = response.body.id;

      // Verify pet is now marked as missing
      const pet = await prisma.pet.findUnique({
        where: { id: testPetId },
      });
      expect(pet).not.toBeNull();
      if (!pet) {
        throw new Error('Pet not found after alert creation');
      }
      expect(pet.isMissing).toBe(true);
    });

    it('should auto-resolve alerts when pet is marked as found', async () => {
      // Mark pet as found
      await request(app.getHttpServer())
        .patch(`/pets/${testPetId}/found`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify alert is auto-resolved
      const alert = await prisma.alert.findUnique({
        where: { id: alertId },
      });
      expect(alert).not.toBeNull();
      if (!alert) {
        throw new Error('Alert not found after resolving pet');
      }
      expect(alert.status).toBe(AlertStatus.RESOLVED);
      expect(alert.resolved_at).toBeDefined();
    });
  });

  describe('DELETE /pets/:id', () => {
    let petToDeleteId: number;

    beforeAll(async () => {
      // Create a pet specifically for deletion test
      const pet = await prisma.pet.create({
        data: {
          userId: testUserId,
          tagId: 'DELTEST99',
          petTypeId: petTypeBirdId,
          name: 'Tweety',
          isMissing: false,
        },
      });
      petToDeleteId = pet.id;
    });

    it('should delete pet (204)', async () => {
      await request(app.getHttpServer())
        .delete(`/pets/${petToDeleteId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify pet is deleted
      const deletedPet = await prisma.pet.findUnique({
        where: { id: petToDeleteId },
      });
      expect(deletedPet).toBeNull();
    });

    it("should reject deletion of another user's pet (403)", async () => {
      await request(app.getHttpServer())
        .delete(`/pets/${testPetId}`)
        .set('Authorization', `Bearer ${authToken2}`)
        .expect(403);
    });

    it('should return 404 for non-existent pet', async () => {
      await request(app.getHttpServer())
        .delete('/pets/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('User Context: GET /users/:userId/pets', () => {
    it('should return all pets for a specific user (200)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${testUserId}/pets`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body.every((pet) => pet.userId === testUserId)).toBe(
        true,
      );
    });

    it("should reject access to another user's pets (403)", async () => {
      await request(app.getHttpServer())
        .get(`/users/${testUserId}/pets`)
        .set('Authorization', `Bearer ${authToken2}`)
        .expect(403);
    });
  });
});
