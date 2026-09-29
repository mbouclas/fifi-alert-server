import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdoptionStatus, Prisma } from '@prisma-lib/client';
import { AdoptionService, MAX_ADOPTION_PHOTOS } from './adoption.service';
import { PrismaService } from '../services/prisma.service';
import { PetService } from '../pet/pet.service';
import { adoptionListingInclude } from './adoption.mapper';

// nanoid (pulled in by PetService) ships ESM only.
jest.mock('nanoid', () => ({ customAlphabet: () => () => 'TAG000001' }));

/** Render a tagged-template call (strings + values) into one SQL string for assertions. */
function renderSql(call: any[]): string {
  const [strings, ...values] = call;
  return strings.reduce((acc: string, str: string, i: number) => {
    const v = values[i - 1];
    const isSqlFragment =
      v !== null && typeof v === 'object' && Array.isArray(v.strings) && 'sql' in v;
    const rendered = isSqlFragment ? v.sql : v === undefined ? '' : '?';
    return acc + rendered + str;
  });
}

describe('AdoptionService', () => {
  let service: AdoptionService;

  const mockTx = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    adoptionListing: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockPrisma = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn((fn: any) => fn(mockTx)),
    adoptionListing: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    pet: {
      update: jest.fn(),
    },
  };

  const mockPetService = {
    createPet: jest.fn(),
    updatePet: jest.fn(),
    deletePet: jest.fn(),
  };

  const ownerId = 10;
  const baseListing = {
    id: 1,
    petId: 5,
    userId: ownerId,
    status: AdoptionStatus.AVAILABLE,
    lat: 35.1,
    lon: 33.3,
    locationAddress: null,
    description: null,
    adoptedAt: null,
    created_at: new Date(),
    updated_at: new Date(),
    pet: { id: 5, photos: [] },
    user: { id: ownerId, name: 'Owner' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdoptionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PetService, useValue: mockPetService },
      ],
    }).compile();

    service = module.get(AdoptionService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockTx));
  });

  describe('create', () => {
    it('creates the pet inside the transaction and inserts the listing with a PostGIS point', async () => {
      mockPetService.createPet.mockResolvedValue({ id: 5 });
      mockTx.$queryRaw.mockResolvedValue([{ id: 1 }]);
      mockTx.adoptionListing.findUniqueOrThrow.mockResolvedValue(baseListing);

      const result = await service.create(ownerId, {
        petTypeId: 1,
        name: 'Buddy',
        lat: 35.1,
        lon: 33.3,
        description: 'Friendly',
      });

      expect(result).toBe(baseListing);
      expect(mockPetService.createPet).toHaveBeenCalledWith(
        ownerId,
        { petTypeId: 1, name: 'Buddy' },
        mockTx,
      );
      const sql = renderSql(mockTx.$queryRaw.mock.calls[0]);
      expect(sql).toContain('INSERT INTO adoption_listing');
      expect(sql).toContain('ST_SetSRID(ST_MakePoint(?, ?), 4326)');
      expect(mockTx.adoptionListing.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 1 },
        include: adoptionListingInclude,
      });
    });

    it('maps a unique violation on pet_id to 409', async () => {
      mockPrisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(
        service.create(ownerId, { petTypeId: 1, name: 'B', lat: 0, lon: 0 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAvailable', () => {
    beforeEach(() => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          { id: 2, distance_km: 1.5 },
          { id: 1, distance_km: 3.2 },
        ])
        .mockResolvedValueOnce([{ count: 2 }]);
      mockPrisma.adoptionListing.findMany.mockResolvedValue([
        { ...baseListing, id: 1 },
        { ...baseListing, id: 2 },
      ]);
    });

    it('uses ST_DWithin and orders by distance when lat/lon are given', async () => {
      const result = await service.findAvailable({
        lat: 35,
        lon: 33,
        radiusKm: 5,
        limit: 20,
        offset: 0,
      });

      const sql = renderSql(mockPrisma.$queryRaw.mock.calls[0]);
      expect(sql).toContain('ST_DWithin(al.location_point::geography');
      expect(sql).toContain('ORDER BY distance_km ASC');
      expect(sql).toContain("al.status = 'AVAILABLE'");
      expect(result.total).toBe(2);
      // re-ordered to match the raw query order (2 then 1)
      expect(result.data.map((l) => l.id)).toEqual([2, 1]);
      expect(result.distances.get(2)).toBe(1.5);
    });

    it('orders by created_at and has no geo clause without coordinates', async () => {
      await service.findAvailable({ limit: 20, offset: 0 });
      const sql = renderSql(mockPrisma.$queryRaw.mock.calls[0]);
      expect(sql).not.toContain('ST_DWithin');
      expect(sql).toContain('ORDER BY al.created_at DESC');
    });

    it('applies type, gender, size and age filters', async () => {
      await service.findAvailable({
        petTypeId: 3,
        gender: 'MALE' as any,
        size: 'SMALL' as any,
        minAgeMonths: 6,
        maxAgeMonths: 24,
        limit: 20,
        offset: 0,
      });
      const sql = renderSql(mockPrisma.$queryRaw.mock.calls[0]);
      expect(sql).toContain('p.pet_type_id = ?');
      expect(sql).toContain('p.gender = ?::"Gender"');
      expect(sql).toContain('p.size = ?::"Size"');
      expect(sql).toContain("INTERVAL '1 month'");
      expect(sql).toContain('p.birthday IS NOT NULL');
    });

    it('rejects lat without lon', async () => {
      await expect(
        service.findAvailable({ lat: 35, limit: 20, offset: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects minAgeMonths greater than maxAgeMonths', async () => {
      await expect(
        service.findAvailable({ minAgeMonths: 10, maxAgeMonths: 2 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOneForRequester', () => {
    it('returns an AVAILABLE listing to anyone', async () => {
      mockPrisma.adoptionListing.findUnique.mockResolvedValue(baseListing);
      await expect(service.findOneForRequester(1)).resolves.toBe(baseListing);
    });

    it('hides a non-available listing from strangers with 404', async () => {
      mockPrisma.adoptionListing.findUnique.mockResolvedValue({
        ...baseListing,
        status: AdoptionStatus.ADOPTED,
      });
      await expect(service.findOneForRequester(1, 99)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOneForRequester(1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('shows a non-available listing to its owner', async () => {
      const adopted = { ...baseListing, status: AdoptionStatus.ADOPTED };
      mockPrisma.adoptionListing.findUnique.mockResolvedValue(adopted);
      await expect(service.findOneForRequester(1, ownerId)).resolves.toBe(
        adopted,
      );
    });
  });

  describe('ownership', () => {
    it('throws 403 when another user manages the listing', async () => {
      mockPrisma.adoptionListing.findUnique.mockResolvedValue(baseListing);
      await expect(service.markAdopted(1, 99)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws 404 when the listing does not exist', async () => {
      mockPrisma.adoptionListing.findUnique.mockResolvedValue(null);
      await expect(service.withdraw(1, ownerId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('status transitions', () => {
    const withStatus = (status: AdoptionStatus) =>
      mockPrisma.adoptionListing.findUnique.mockResolvedValue({
        ...baseListing,
        status,
      });

    it('markAdopted: AVAILABLE -> ADOPTED with adoptedAt', async () => {
      withStatus(AdoptionStatus.AVAILABLE);
      mockPrisma.adoptionListing.update.mockResolvedValue({});
      await service.markAdopted(1, ownerId);
      expect(mockPrisma.adoptionListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: AdoptionStatus.ADOPTED,
            adoptedAt: expect.any(Date),
          },
        }),
      );
    });

    it.each([AdoptionStatus.ADOPTED, AdoptionStatus.WITHDRAWN])(
      'markAdopted rejects %s with 409',
      async (status) => {
        withStatus(status);
        await expect(service.markAdopted(1, ownerId)).rejects.toThrow(
          ConflictException,
        );
      },
    );

    it.each([AdoptionStatus.ADOPTED, AdoptionStatus.WITHDRAWN])(
      'withdraw rejects %s with 409',
      async (status) => {
        withStatus(status);
        await expect(service.withdraw(1, ownerId)).rejects.toThrow(
          ConflictException,
        );
      },
    );

    it('relist: WITHDRAWN -> AVAILABLE', async () => {
      withStatus(AdoptionStatus.WITHDRAWN);
      mockPrisma.adoptionListing.update.mockResolvedValue({});
      await service.relist(1, ownerId);
      expect(mockPrisma.adoptionListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: AdoptionStatus.AVAILABLE },
        }),
      );
    });

    it.each([AdoptionStatus.AVAILABLE, AdoptionStatus.ADOPTED])(
      'relist rejects %s with 409',
      async (status) => {
        withStatus(status);
        await expect(service.relist(1, ownerId)).rejects.toThrow(
          ConflictException,
        );
      },
    );
  });

  describe('update', () => {
    beforeEach(() => {
      mockPrisma.adoptionListing.findUnique.mockResolvedValue(baseListing);
      mockTx.adoptionListing.findUniqueOrThrow.mockResolvedValue(baseListing);
    });

    it('delegates pet fields to PetService and refreshes the point when lat/lon change', async () => {
      await service.update(1, ownerId, {
        name: 'New name',
        lat: 1,
        lon: 2,
        description: 'd',
      });

      expect(mockPetService.updatePet).toHaveBeenCalledWith(
        5,
        ownerId,
        { name: 'New name' },
        mockTx,
      );
      expect(mockTx.adoptionListing.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { lat: 1, lon: 2, description: 'd' },
      });
      const sql = renderSql(mockTx.$executeRaw.mock.calls[0]);
      expect(sql).toContain('SET location_point = ST_SetSRID');
    });

    it('rejects lon without lat', async () => {
      await expect(service.update(1, ownerId, { lon: 2 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('does not touch the pet when only listing fields change', async () => {
      await service.update(1, ownerId, { description: 'only' });
      expect(mockPetService.updatePet).not.toHaveBeenCalled();
      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes through PetService so the listing cascades', async () => {
      mockPrisma.adoptionListing.findUnique.mockResolvedValue(baseListing);
      await service.remove(1, ownerId);
      expect(mockPetService.deletePet).toHaveBeenCalledWith(5, ownerId);
    });
  });

  describe('addPhotos', () => {
    it('appends URLs to the pet', async () => {
      mockPrisma.adoptionListing.findUnique.mockResolvedValue(baseListing);
      mockPrisma.adoptionListing.findUniqueOrThrow.mockResolvedValue(baseListing);
      await service.addPhotos(1, ownerId, ['https://x/1.jpg']);
      expect(mockPrisma.pet.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { photos: { push: ['https://x/1.jpg'] } },
      });
    });

    it('rejects when the total would exceed the limit', async () => {
      mockPrisma.adoptionListing.findUnique.mockResolvedValue({
        ...baseListing,
        pet: { id: 5, photos: new Array(MAX_ADOPTION_PHOTOS).fill('u') },
      });
      await expect(
        service.addPhotos(1, ownerId, ['https://x/1.jpg']),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.pet.update).not.toHaveBeenCalled();
    });
  });
});
