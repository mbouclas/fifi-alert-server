import { Test, TestingModule } from '@nestjs/testing';
import { PetTypesService } from './pet-types.service';
import { PrismaService } from '../services/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma-lib/client';
import { PetTypeOrderBy, SortDirection } from './dto';

describe('PetTypesService', () => {
  let service: PetTypesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    petType: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetTypesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PetTypesService>(PetTypesService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a pet type', async () => {
      const dto = { name: 'Dog', slug: 'dog', order: 10 };
      const created = {
        id: 1,
        ...dto,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.petType.create.mockResolvedValue(created);

      await expect(service.create(dto)).resolves.toEqual(created);
      expect(mockPrismaService.petType.create).toHaveBeenCalledWith({
        data: dto,
      });
    });

    it('should throw ConflictException on duplicate slug', async () => {
      const dto = { name: 'Dog', slug: 'dog' };
      mockPrismaService.petType.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.create(dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return pet types ordered by manual order by default', async () => {
      const petTypes = [
        { id: 1, name: 'Dog', slug: 'dog', order: 10 },
        { id: 2, name: 'Cat', slug: 'cat', order: 20 },
      ];
      mockPrismaService.petType.findMany.mockResolvedValue(petTypes);

      await expect(service.findAll()).resolves.toEqual(petTypes);
      expect(mockPrismaService.petType.findMany).toHaveBeenCalledWith({
        orderBy: { order: 'asc' },
      });
    });

    it('should apply custom ordering', async () => {
      mockPrismaService.petType.findMany.mockResolvedValue([]);

      await expect(
        service.findAll(PetTypeOrderBy.NAME, SortDirection.DESC),
      ).resolves.toEqual([]);
      expect(mockPrismaService.petType.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a pet type by id', async () => {
      const petType = { id: 1, name: 'Dog', slug: 'dog' };
      mockPrismaService.petType.findUnique.mockResolvedValue(petType);

      await expect(service.findOne(1)).resolves.toEqual(petType);
    });

    it('should throw NotFoundException when missing', async () => {
      mockPrismaService.petType.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findBySlug', () => {
    it('should return a pet type by slug', async () => {
      const petType = { id: 1, name: 'Dog', slug: 'dog' };
      mockPrismaService.petType.findUnique.mockResolvedValue(petType);

      await expect(service.findBySlug('dog')).resolves.toEqual(petType);
    });

    it('should throw NotFoundException when missing', async () => {
      mockPrismaService.petType.findUnique.mockResolvedValue(null);

      await expect(service.findBySlug('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a pet type', async () => {
      const updated = { id: 1, name: 'Dog', slug: 'dog' };
      mockPrismaService.petType.update.mockResolvedValue(updated);

      await expect(service.update(1, { name: 'Dog' })).resolves.toEqual(
        updated,
      );
    });

    it('should throw NotFoundException when missing', async () => {
      mockPrismaService.petType.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('missing', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.update(999, { name: 'Missing' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a pet type', async () => {
      mockPrismaService.petType.delete.mockResolvedValue({ id: 1 });

      await expect(service.remove(1)).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when missing', async () => {
      mockPrismaService.petType.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('missing', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(service.remove(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
