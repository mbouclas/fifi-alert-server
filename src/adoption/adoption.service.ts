import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdoptionStatus, Prisma } from '@prisma-lib/client';
import { PrismaService } from '../services/prisma.service';
import { PetService } from '../pet/pet.service';
import { CreatePetDto, UpdatePetDto } from '../pet/dto';
import {
  CreateAdoptionListingDto,
  ListAdoptionsQueryDto,
  UpdateAdoptionListingDto,
} from './dto';
import {
  AdoptionListingWithRelations,
  adoptionListingInclude,
} from './adoption.mapper';

/** Maximum number of photos a listed pet may carry in total. */
export const MAX_ADOPTION_PHOTOS = 10;

export interface PaginatedListings {
  data: AdoptionListingWithRelations[];
  distances: Map<number, number | undefined>;
  total: number;
  limit: number;
  offset: number;
}

interface IdDistanceRow {
  id: number;
  distance_km: number | null;
}

/**
 * Adoption board: pets offered for adoption by their owners.
 *
 * A listing is 1:1 with a Pet. The Pet row is created through PetService so
 * tag generation and pet type validation stay in one place; the listing row
 * is inserted with raw SQL because Prisma cannot write the PostGIS point.
 */
@Injectable()
export class AdoptionService {
  private readonly logger = new Logger(AdoptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly petService: PetService,
  ) {}

  /**
   * Create a pet and its adoption listing atomically.
   */
  async create(
    userId: number,
    dto: CreateAdoptionListingDto,
  ): Promise<AdoptionListingWithRelations> {
    const { lat, lon, locationAddress, description, ...petFields } = dto;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const pet = await this.petService.createPet(
          userId,
          petFields as CreatePetDto,
          tx,
        );

        const rows = await tx.$queryRaw<Array<{ id: number }>>`
          INSERT INTO adoption_listing (
            pet_id, user_id, status, lat, lon, location_point,
            location_address, description, created_at, updated_at
          ) VALUES (
            ${pet.id},
            ${userId},
            'AVAILABLE'::"AdoptionStatus",
            ${lat},
            ${lon},
            ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326),
            ${locationAddress ?? null},
            ${description ?? null},
            NOW(),
            NOW()
          )
          RETURNING id
        `;

        return tx.adoptionListing.findUniqueOrThrow({
          where: { id: rows[0].id },
          include: adoptionListingInclude,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Pet already has an adoption listing');
      }
      throw error;
    }
  }

  /**
   * Browse AVAILABLE listings with optional radius, type, gender, size and
   * age filters. Ordered by distance when lat/lon are given, else newest first.
   */
  async findAvailable(query: ListAdoptionsQueryDto): Promise<PaginatedListings> {
    const {
      lat,
      lon,
      radiusKm = 10,
      petTypeId,
      gender,
      size,
      minAgeMonths,
      maxAgeMonths,
      limit = 20,
      offset = 0,
    } = query;

    const hasLat = lat !== undefined && lat !== null;
    const hasLon = lon !== undefined && lon !== null;
    if (hasLat !== hasLon) {
      throw new BadRequestException('lat and lon must be provided together');
    }
    const hasGeo = hasLat && hasLon;

    if (
      minAgeMonths !== undefined &&
      maxAgeMonths !== undefined &&
      minAgeMonths > maxAgeMonths
    ) {
      throw new BadRequestException('minAgeMonths cannot exceed maxAgeMonths');
    }

    const conditions: Prisma.Sql[] = [
      Prisma.sql`al.status = 'AVAILABLE'::"AdoptionStatus"`,
    ];

    if (petTypeId !== undefined) {
      conditions.push(Prisma.sql`p.pet_type_id = ${petTypeId}`);
    }
    if (gender) {
      conditions.push(Prisma.sql`p.gender = ${gender}::"Gender"`);
    }
    if (size) {
      conditions.push(Prisma.sql`p.size = ${size}::"Size"`);
    }
    if (minAgeMonths !== undefined) {
      conditions.push(
        Prisma.sql`p.birthday IS NOT NULL AND p.birthday <= NOW() - (${minAgeMonths}::int * INTERVAL '1 month')`,
      );
    }
    if (maxAgeMonths !== undefined) {
      conditions.push(
        Prisma.sql`p.birthday IS NOT NULL AND p.birthday >= NOW() - ((${maxAgeMonths}::int + 1) * INTERVAL '1 month')`,
      );
    }

    const origin = hasGeo
      ? Prisma.sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`
      : Prisma.empty;

    if (hasGeo) {
      conditions.push(
        Prisma.sql`ST_DWithin(al.location_point::geography, ${origin}, ${radiusKm} * 1000)`,
      );
    }

    const where = Prisma.join(conditions, ' AND ');
    const distanceSelect = hasGeo
      ? Prisma.sql`ST_Distance(al.location_point::geography, ${origin}) / 1000`
      : Prisma.sql`NULL::float`;
    const orderBy = hasGeo
      ? Prisma.sql`distance_km ASC, al.created_at DESC`
      : Prisma.sql`al.created_at DESC`;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<IdDistanceRow[]>`
        SELECT al.id, ${distanceSelect} AS distance_km
        FROM adoption_listing al
        JOIN pet p ON p.id = al.pet_id
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM adoption_listing al
        JOIN pet p ON p.id = al.pet_id
        WHERE ${where}
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    const ids = rows.map((r) => r.id);
    const distances = new Map<number, number | undefined>(
      rows.map((r) => [
        r.id,
        r.distance_km === null || r.distance_km === undefined
          ? undefined
          : Number(r.distance_km),
      ]),
    );

    if (ids.length === 0) {
      return { data: [], distances, total, limit, offset };
    }

    const listings = await this.prisma.adoptionListing.findMany({
      where: { id: { in: ids } },
      include: adoptionListingInclude,
    });

    const byId = new Map(listings.map((l) => [l.id, l]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((l): l is AdoptionListingWithRelations => l !== undefined);

    return { data, distances, total, limit, offset };
  }

  /**
   * Fetch a single listing for a (possibly anonymous) requester.
   * Non-AVAILABLE listings are only visible to their owner; everyone else
   * gets 404 so existence is not leaked.
   */
  async findOneForRequester(
    id: number,
    requesterId?: number,
  ): Promise<AdoptionListingWithRelations> {
    const listing = await this.prisma.adoptionListing.findUnique({
      where: { id },
      include: adoptionListingInclude,
    });

    if (!listing) {
      throw new NotFoundException(`Adoption listing ${id} not found`);
    }

    if (
      listing.status !== AdoptionStatus.AVAILABLE &&
      listing.userId !== requesterId
    ) {
      throw new NotFoundException(`Adoption listing ${id} not found`);
    }

    return listing;
  }

  /**
   * All listings owned by a user, any status, newest first.
   */
  async findMine(userId: number): Promise<AdoptionListingWithRelations[]> {
    return this.prisma.adoptionListing.findMany({
      where: { userId },
      orderBy: { created_at: 'desc' },
      include: adoptionListingInclude,
    });
  }

  /**
   * Load a listing and assert the caller owns it.
   */
  async requireOwned(
    id: number,
    userId: number,
  ): Promise<AdoptionListingWithRelations> {
    const listing = await this.prisma.adoptionListing.findUnique({
      where: { id },
      include: adoptionListingInclude,
    });

    if (!listing) {
      throw new NotFoundException(`Adoption listing ${id} not found`);
    }
    if (listing.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to manage this listing',
      );
    }
    return listing;
  }

  /**
   * Update listing and/or pet fields. lat/lon must be sent together.
   */
  async update(
    id: number,
    userId: number,
    dto: UpdateAdoptionListingDto,
  ): Promise<AdoptionListingWithRelations> {
    const listing = await this.requireOwned(id, userId);
    const { lat, lon, locationAddress, description, ...petFields } = dto;

    const hasLat = lat !== undefined;
    const hasLon = lon !== undefined;
    if (hasLat !== hasLon) {
      throw new BadRequestException('lat and lon must be provided together');
    }

    const listingData: Prisma.AdoptionListingUpdateInput = {};
    if (hasLat && hasLon) {
      listingData.lat = lat;
      listingData.lon = lon;
    }
    if (locationAddress !== undefined) {
      listingData.locationAddress = locationAddress;
    }
    if (description !== undefined) {
      listingData.description = description;
    }

    const hasPetChanges = Object.keys(petFields).length > 0;

    return this.prisma.$transaction(async (tx) => {
      if (hasPetChanges) {
        await this.petService.updatePet(
          listing.petId,
          userId,
          petFields as UpdatePetDto,
          tx,
        );
      }

      if (Object.keys(listingData).length > 0) {
        await tx.adoptionListing.update({ where: { id }, data: listingData });
      }

      if (hasLat && hasLon) {
        await tx.$executeRaw`
          UPDATE adoption_listing
          SET location_point = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
          WHERE id = ${id}
        `;
      }

      return tx.adoptionListing.findUniqueOrThrow({
        where: { id },
        include: adoptionListingInclude,
      });
    });
  }

  /**
   * AVAILABLE -> ADOPTED.
   */
  async markAdopted(
    id: number,
    userId: number,
  ): Promise<AdoptionListingWithRelations> {
    const listing = await this.requireOwned(id, userId);
    if (listing.status !== AdoptionStatus.AVAILABLE) {
      throw new ConflictException(
        `Only AVAILABLE listings can be marked adopted (current: ${listing.status})`,
      );
    }
    return this.prisma.adoptionListing.update({
      where: { id },
      data: { status: AdoptionStatus.ADOPTED, adoptedAt: new Date() },
      include: adoptionListingInclude,
    });
  }

  /**
   * AVAILABLE -> WITHDRAWN (hidden from the board, can be relisted).
   */
  async withdraw(
    id: number,
    userId: number,
  ): Promise<AdoptionListingWithRelations> {
    const listing = await this.requireOwned(id, userId);
    if (listing.status !== AdoptionStatus.AVAILABLE) {
      throw new ConflictException(
        `Only AVAILABLE listings can be withdrawn (current: ${listing.status})`,
      );
    }
    return this.prisma.adoptionListing.update({
      where: { id },
      data: { status: AdoptionStatus.WITHDRAWN },
      include: adoptionListingInclude,
    });
  }

  /**
   * WITHDRAWN -> AVAILABLE. Adopted listings cannot be relisted.
   */
  async relist(
    id: number,
    userId: number,
  ): Promise<AdoptionListingWithRelations> {
    const listing = await this.requireOwned(id, userId);
    if (listing.status !== AdoptionStatus.WITHDRAWN) {
      throw new ConflictException(
        `Only WITHDRAWN listings can be relisted (current: ${listing.status})`,
      );
    }
    return this.prisma.adoptionListing.update({
      where: { id },
      data: { status: AdoptionStatus.AVAILABLE },
      include: adoptionListingInclude,
    });
  }

  /**
   * Delete the listing together with its pet (cascade).
   */
  async remove(id: number, userId: number): Promise<void> {
    const listing = await this.requireOwned(id, userId);
    await this.petService.deletePet(listing.petId, userId);
    this.logger.log(`Adoption listing ${id} (pet ${listing.petId}) deleted`);
  }

  /**
   * Append uploaded photo URLs to the listed pet.
   */
  async addPhotos(
    id: number,
    userId: number,
    urls: string[],
  ): Promise<AdoptionListingWithRelations> {
    const listing = await this.requireOwned(id, userId);
    const current = listing.pet.photos?.length ?? 0;

    if (current + urls.length > MAX_ADOPTION_PHOTOS) {
      throw new BadRequestException(
        `A listing may have at most ${MAX_ADOPTION_PHOTOS} photos (currently ${current})`,
      );
    }

    await this.prisma.pet.update({
      where: { id: listing.petId },
      data: { photos: { push: urls } },
    });

    return this.prisma.adoptionListing.findUniqueOrThrow({
      where: { id },
      include: adoptionListingInclude,
    });
  }
}
