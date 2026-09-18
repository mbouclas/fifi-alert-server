import { Test, TestingModule } from '@nestjs/testing';
import { PetTypesService } from './pet-types.service';
import { PrismaService } from '../services/prisma.service';
import { LanguageService } from '../i18n/language.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma-lib/client';
import { PetTypeOrderBy, SortDirection } from './dto';
import { petTypeInclude } from './pet-type.mapper';

describe('PetTypesService', () => {
  let service: PetTypesService;

  const now = new Date();
  const dog = {
    id: 1,
    slug: 'dog',
    order: 10,
    meta: null,
    settings: null,
    created_at: now,
    updated_at: now,
    translations: [
      { id: 1, petTypeId: 1, langCode: 'el', name: 'Σκύλος' },
      { id: 2, petTypeId: 1, langCode: 'en', name: 'Dog' },
    ],
  };
  const cat = {
    ...dog,
    id: 2,
    slug: 'cat',
    order: 20,
    translations: [
      { id: 3, petTypeId: 2, langCode: 'el', name: 'Γάτα' },
      { id: 4, petTypeId: 2, langCode: 'en', name: 'Cat' },
    ],
  };
  /** Only has a Greek translation. */
  const ferret = {
    ...dog,
    id: 3,
    slug: 'ferret',
    order: 30,
    translations: [{ id: 5, petTypeId: 3, langCode: 'el', name: 'Κουνάβι' }],
  };

  const languages = [
    { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', isDefault: true, isActive: true, sortOrder: 10 },
    { code: 'en', name: 'English', nativeName: 'English', isDefault: false, isActive: true, sortOrder: 20 },
  ];

  const mockPrismaService = {
    petType: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockLanguageService = {
    getActive: jest.fn().mockResolvedValue(languages),
    getDefaultCode: jest.fn().mockResolvedValue('el'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetTypesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LanguageService, useValue: mockLanguageService },
      ],
    }).compile();

    service = module.get<PetTypesService>(PetTypesService);

    jest.clearAllMocks();
    mockLanguageService.getActive.mockResolvedValue(languages);
    mockLanguageService.getDefaultCode.mockResolvedValue('el');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a pet type with nested translations and return all of them', async () => {
      const dto = { translations: { el: 'Σκύλος', en: 'Dog' }, slug: 'dog', order: 10 };
      mockPrismaService.petType.create.mockResolvedValue(dog);

      const result = await service.create(dto, { lang: 'en' });

      expect(mockPrismaService.petType.create).toHaveBeenCalledWith({
        data: {
          slug: 'dog',
          order: 10,
          translations: {
            create: [
              { langCode: 'el', name: 'Σκύλος' },
              { langCode: 'en', name: 'Dog' },
            ],
          },
        },
        include: petTypeInclude,
      });
      expect(result).toMatchObject({
        id: 1,
        slug: 'dog',
        name: 'Dog',
        lang: 'en',
        translations: { el: 'Σκύλος', en: 'Dog' },
      });
    });

    it('should reject when the default language translation is missing', async () => {
      await expect(
        service.create({ translations: { en: 'Dog' }, slug: 'dog' }, { lang: 'el' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.petType.create).not.toHaveBeenCalled();
    });

    it('should reject unknown language codes', async () => {
      await expect(
        service.create(
          { translations: { el: 'Σκύλος', xx: 'Nope' }, slug: 'dog' },
          { lang: 'el' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException on duplicate slug', async () => {
      mockPrismaService.petType.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create({ translations: { el: 'Σκύλος' }, slug: 'dog' }, { lang: 'el' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return pet types in the requested language ordered by manual order by default', async () => {
      mockPrismaService.petType.findMany.mockResolvedValue([dog, cat]);

      const result = await service.findAll(undefined, undefined, { lang: 'en' });

      expect(mockPrismaService.petType.findMany).toHaveBeenCalledWith({
        orderBy: { order: 'asc' },
        include: petTypeInclude,
      });
      expect(result.map((r) => r.name)).toEqual(['Dog', 'Cat']);
      expect(result[0].lang).toBe('en');
      expect(result[0]).not.toHaveProperty('translations');
    });

    it('should fall back to the default language when a translation is missing', async () => {
      mockPrismaService.petType.findMany.mockResolvedValue([ferret]);

      const [result] = await service.findAll(undefined, undefined, { lang: 'en' });

      expect(result.name).toBe('Κουνάβι');
      expect(result.lang).toBe('el');
    });

    it('should include the translations map when requested', async () => {
      mockPrismaService.petType.findMany.mockResolvedValue([dog]);

      const [result] = await service.findAll(undefined, undefined, {
        lang: 'el',
        includeTranslations: true,
      });

      expect(result.translations).toEqual({ el: 'Σκύλος', en: 'Dog' });
    });

    it('should sort by the resolved name in memory when ordering by name', async () => {
      mockPrismaService.petType.findMany.mockResolvedValue([dog, cat]);

      const result = await service.findAll(PetTypeOrderBy.NAME, SortDirection.DESC, {
        lang: 'en',
      });

      expect(mockPrismaService.petType.findMany).toHaveBeenCalledWith({
        orderBy: { order: 'asc' },
        include: petTypeInclude,
      });
      expect(result.map((r) => r.name)).toEqual(['Dog', 'Cat']);

      const asc = await service.findAll(PetTypeOrderBy.NAME, SortDirection.ASC, { lang: 'en' });
      expect(asc.map((r) => r.name)).toEqual(['Cat', 'Dog']);
    });

    it('should pass other order fields to the database', async () => {
      mockPrismaService.petType.findMany.mockResolvedValue([]);

      await service.findAll(PetTypeOrderBy.SLUG, SortDirection.DESC, { lang: 'el' });

      expect(mockPrismaService.petType.findMany).toHaveBeenCalledWith({
        orderBy: { slug: 'desc' },
        include: petTypeInclude,
      });
    });
  });

  describe('findOne', () => {
    it('should return a pet type by id in the requested language', async () => {
      mockPrismaService.petType.findUnique.mockResolvedValue(dog);

      await expect(service.findOne(1, { lang: 'el' })).resolves.toMatchObject({
        id: 1,
        name: 'Σκύλος',
        lang: 'el',
      });
      expect(mockPrismaService.petType.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: petTypeInclude,
      });
    });

    it('should throw NotFoundException when missing', async () => {
      mockPrismaService.petType.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999, { lang: 'el' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findBySlug', () => {
    it('should return a pet type by slug', async () => {
      mockPrismaService.petType.findUnique.mockResolvedValue(dog);

      await expect(service.findBySlug('dog', { lang: 'en' })).resolves.toMatchObject({
        slug: 'dog',
        name: 'Dog',
      });
    });

    it('should throw NotFoundException when missing', async () => {
      mockPrismaService.petType.findUnique.mockResolvedValue(null);

      await expect(service.findBySlug('missing', { lang: 'el' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should upsert provided translations and return all of them', async () => {
      mockPrismaService.petType.update.mockResolvedValue(dog);

      const result = await service.update(1, { translations: { en: 'Doggo' }, order: 15 }, {
        lang: 'el',
      });

      expect(mockPrismaService.petType.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          order: 15,
          translations: {
            upsert: [
              {
                where: { petTypeId_langCode: { petTypeId: 1, langCode: 'en' } },
                update: { name: 'Doggo' },
                create: { langCode: 'en', name: 'Doggo' },
              },
            ],
          },
        },
        include: petTypeInclude,
      });
      expect(result.translations).toEqual({ el: 'Σκύλος', en: 'Dog' });
    });

    it('should not require the default language on update', async () => {
      mockPrismaService.petType.update.mockResolvedValue(dog);

      await expect(
        service.update(1, { translations: { en: 'Dog' } }, { lang: 'el' }),
      ).resolves.toBeDefined();
    });

    it('should reject unknown language codes', async () => {
      await expect(
        service.update(1, { translations: { xx: 'Nope' } }, { lang: 'el' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when missing', async () => {
      mockPrismaService.petType.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('missing', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(service.update(999, { order: 1 }, { lang: 'el' })).rejects.toThrow(
        NotFoundException,
      );
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

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
