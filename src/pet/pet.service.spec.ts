import { Test, TestingModule } from '@nestjs/testing';
import { PetService } from './pet.service';
import { PrismaService } from '../services/prisma.service';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Gender, Size } from '@prisma-lib/client';

describe('PetService', () => {
  let service: PetService;
  let prisma: PrismaService;

  const petTypeDog = { id: 1, name: 'Dog', slug: 'dog' };
  const petTypeCat = { id: 2, name: 'Cat', slug: 'cat' };

  const mockPrismaService = {
    pet: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    petType: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PetService>(PetService);
    prisma = module.get<PrismaService>(PrismaService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPet', () => {
    it('should create a pet with a generated tagId', async () => {
      const userId = 1;
      const petData = {
        petTypeId: petTypeDog.id,
        name: 'Buddy',
        gender: Gender.MALE,
        size: Size.MEDIUM,
      };

      const expectedPet = {
        id: 1,
        tagId: 'ABC123XYZ',
        userId,
        ...petData,
        petType: petTypeDog,
        photos: [],
        isMissing: false,
        birthday: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock findUnique to return null (no collision)
      mockPrismaService.pet.findUnique.mockResolvedValue(null);
      mockPrismaService.petType.findUnique.mockResolvedValue(petTypeDog);
      mockPrismaService.pet.create.mockResolvedValue(expectedPet);

      const result = await service.createPet(userId, petData);

      expect(result).toEqual(expectedPet);
      expect(mockPrismaService.pet.create).toHaveBeenCalledWith({
        data: {
          name: petData.name,
          gender: petData.gender,
          size: petData.size,
          tagId: expect.any(String),
          user: { connect: { id: userId } },
          petType: { connect: { id: petTypeDog.id } },
        },
        include: { petType: true },
      });
    });

    it('should throw UnprocessableEntityException when pet type is missing', async () => {
      const userId = 1;
      const petData = {
        petTypeId: 999,
        name: 'Unknown',
      };

      mockPrismaService.pet.findUnique.mockResolvedValue(null);
      mockPrismaService.petType.findUnique.mockResolvedValue(null);

      await expect(service.createPet(userId, petData)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mockPrismaService.pet.create).not.toHaveBeenCalled();
    });

    it('should retry tag ID generation on collision', async () => {
      const userId = 1;
      const petData = {
        petTypeId: petTypeCat.id,
        name: 'Mittens',
      };

      // First call returns collision, second call returns null
      mockPrismaService.pet.findUnique
        .mockResolvedValueOnce({ id: 999, tagId: 'COLLISION' })
        .mockResolvedValueOnce(null);

      mockPrismaService.petType.findUnique.mockResolvedValue(petTypeCat);
      mockPrismaService.pet.create.mockResolvedValue({
        id: 1,
        tagId: 'NEWTAGID',
        userId,
        ...petData,
        petType: petTypeCat,
        photos: [],
        isMissing: false,
        gender: null,
        size: null,
        birthday: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.createPet(userId, petData);

      expect(result).toBeDefined();
      expect(mockPrismaService.pet.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('findAllByUser', () => {
    it('should return all pets for a user', async () => {
      const userId = 1;
      const mockPets = [
        {
          id: 1,
          tagId: 'PET123ABC',
          userId,
          petTypeId: petTypeDog.id,
          petType: petTypeDog,
          name: 'Buddy',
          gender: Gender.MALE,
          photos: [],
          size: Size.MEDIUM,
          isMissing: false,
          birthday: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 2,
          tagId: 'PET456DEF',
          userId,
          petTypeId: petTypeCat.id,
          petType: petTypeCat,
          name: 'Mittens',
          gender: Gender.FEMALE,
          photos: [],
          size: Size.SMALL,
          isMissing: false,
          birthday: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockPrismaService.pet.findMany.mockResolvedValue(mockPets);

      const result = await service.findAllByUser(userId);

      expect(result).toEqual(mockPets);
      expect(mockPrismaService.pet.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { created_at: 'desc' },
        include: { petType: true },
      });
    });
  });

  describe('findOne', () => {
    it('should return a pet by ID', async () => {
      const petId = 1;
      const userId = 1;
      const mockPet = {
        id: petId,
        tagId: 'PET123ABC',
        userId,
        petTypeId: petTypeDog.id,
        petType: petTypeDog,
        name: 'Buddy',
        gender: Gender.MALE,
        photos: [],
        size: Size.MEDIUM,
        isMissing: false,
        birthday: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.pet.findUnique.mockResolvedValue(mockPet);

      const result = await service.findOne(petId, userId);

      expect(result).toEqual(mockPet);
      expect(mockPrismaService.pet.findUnique).toHaveBeenCalledWith({
        where: { id: petId },
        include: { petType: true },
      });
    });

    it('should throw NotFoundException if pet not found', async () => {
      mockPrismaService.pet.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own the pet', async () => {
      const petId = 1;
      const ownerId = 1;
      const requesterId = 2;

      const mockPet = {
        id: petId,
        userId: ownerId,
        tagId: 'PET123ABC',
        petTypeId: petTypeDog.id,
        petType: petTypeDog,
        name: 'Buddy',
        gender: Gender.MALE,
        photos: [],
        size: Size.MEDIUM,
        isMissing: false,
        birthday: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.pet.findUnique.mockResolvedValue(mockPet);

      await expect(service.findOne(petId, requesterId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findByTagId', () => {
    it('should return a pet by tag ID', async () => {
      const tagId = 'PET123ABC';
      const mockPet = {
        id: 1,
        tagId,
        userId: 1,
        petTypeId: petTypeDog.id,
        petType: petTypeDog,
        name: 'Buddy',
        gender: Gender.MALE,
        photos: [],
        size: Size.MEDIUM,
        isMissing: false,
        birthday: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.pet.findUnique.mockResolvedValue(mockPet);

      const result = await service.findByTagId(tagId);

      expect(result).toEqual(mockPet);
      expect(mockPrismaService.pet.findUnique).toHaveBeenCalledWith({
        where: { tagId },
        include: { petType: true },
      });
    });

    it('should throw NotFoundException if tag ID not found', async () => {
      mockPrismaService.pet.findUnique.mockResolvedValue(null);

      await expect(service.findByTagId('INVALID')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updatePet', () => {
    it('should update a pet successfully', async () => {
      const petId = 1;
      const userId = 1;
      const updateData = { name: 'Updated Name' };

      const existingPet = {
        id: petId,
        userId,
        tagId: 'PET123ABC',
        petTypeId: petTypeDog.id,
        petType: petTypeDog,
        name: 'Buddy',
        gender: Gender.MALE,
        photos: [],
        size: Size.MEDIUM,
        isMissing: false,
        birthday: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedPet = { ...existingPet, ...updateData };

      mockPrismaService.pet.findUnique.mockResolvedValue(existingPet);
      mockPrismaService.pet.update.mockResolvedValue(updatedPet);

      const result = await service.updatePet(petId, userId, updateData);

      expect(result).toEqual(updatedPet);
      expect(mockPrismaService.pet.update).toHaveBeenCalledWith({
        where: { id: petId },
        data: updateData,
        include: { petType: true },
      });
    });
  });

  describe('deletePet', () => {
    it('should delete a pet successfully', async () => {
      const petId = 1;
      const userId = 1;

      const mockPet = {
        id: petId,
        userId,
        tagId: 'PET123ABC',
        petTypeId: petTypeDog.id,
        petType: petTypeDog,
        name: 'Buddy',
        gender: Gender.MALE,
        photos: [],
        size: Size.MEDIUM,
        isMissing: false,
        birthday: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.pet.findUnique.mockResolvedValue(mockPet);
      mockPrismaService.pet.delete.mockResolvedValue(mockPet);

      await service.deletePet(petId, userId);

      expect(mockPrismaService.pet.delete).toHaveBeenCalledWith({
        where: { id: petId },
      });
    });
  });

  describe('markAsMissing', () => {
    it('should mark a pet as missing', async () => {
      const petId = 1;
      const userId = 1;

      const mockPet = {
        id: petId,
        userId,
        tagId: 'PET123ABC',
        petTypeId: petTypeDog.id,
        petType: petTypeDog,
        name: 'Buddy',
        gender: Gender.MALE,
        photos: [],
        size: Size.MEDIUM,
        isMissing: false,
        birthday: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedPet = { ...mockPet, isMissing: true };

      mockPrismaService.pet.findUnique.mockResolvedValue(mockPet);
      mockPrismaService.pet.update.mockResolvedValue(updatedPet);

      const result = await service.markAsMissing(petId, userId);

      expect(result.isMissing).toBe(true);
      expect(mockPrismaService.pet.update).toHaveBeenCalledWith({
        where: { id: petId },
        data: { isMissing: true },
        include: { petType: true },
      });
    });

    it('should throw error if pet is already missing', async () => {
      const petId = 1;
      const userId = 1;

      const mockPet = {
        id: petId,
        userId,
        tagId: 'PET123ABC',
        petTypeId: petTypeDog.id,
        petType: petTypeDog,
        name: 'Buddy',
        gender: Gender.MALE,
        photos: [],
        size: Size.MEDIUM,
        isMissing: true, // Already missing
        birthday: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.pet.findUnique.mockResolvedValue(mockPet);

      await expect(service.markAsMissing(petId, userId)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('markAsFound', () => {
    it('should mark a pet as found', async () => {
      const petId = 1;
      const userId = 1;

      const mockPet = {
        id: petId,
        userId,
        tagId: 'PET123ABC',
        petTypeId: petTypeDog.id,
        petType: petTypeDog,
        name: 'Buddy',
        gender: Gender.MALE,
        photos: [],
        size: Size.MEDIUM,
        isMissing: true, // Currently missing
        birthday: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedPet = { ...mockPet, isMissing: false };

      mockPrismaService.pet.findUnique.mockResolvedValue(mockPet);
      mockPrismaService.pet.update.mockResolvedValue(updatedPet);

      const result = await service.markAsFound(petId, userId);

      expect(result.isMissing).toBe(false);
      expect(mockPrismaService.pet.update).toHaveBeenCalledWith({
        where: { id: petId },
        data: { isMissing: false },
        include: { petType: true },
      });
    });

    it('should throw error if pet is not marked as missing', async () => {
      const petId = 1;
      const userId = 1;

      const mockPet = {
        id: petId,
        userId,
        tagId: 'PET123ABC',
        petTypeId: petTypeDog.id,
        petType: petTypeDog,
        name: 'Buddy',
        gender: Gender.MALE,
        photos: [],
        size: Size.MEDIUM,
        isMissing: false, // Not missing
        birthday: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.pet.findUnique.mockResolvedValue(mockPet);

      await expect(service.markAsFound(petId, userId)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('findAllMissing', () => {
    it('should return all missing pets', async () => {
      const mockMissingPets = [
        {
          id: 1,
          tagId: 'PET123ABC',
          userId: 1,
          petTypeId: petTypeDog.id,
          petType: petTypeDog,
          name: 'Buddy',
          gender: Gender.MALE,
          photos: [],
          size: Size.MEDIUM,
          isMissing: true,
          birthday: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockPrismaService.pet.findMany.mockResolvedValue(mockMissingPets);

      const result = await service.findAllMissing();

      expect(result).toEqual(mockMissingPets);
      expect(mockPrismaService.pet.findMany).toHaveBeenCalledWith({
        where: { isMissing: true },
        orderBy: { updated_at: 'desc' },
        include: { petType: true },
      });
    });
  });
});
