import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
  Logger,
  Inject,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import petConfig from '../config/pet.config';
import { PrismaService } from '../services/prisma.service';
import { Pet, Prisma, AlertStatus } from '@prisma-lib/client';
import { customAlphabet } from 'nanoid';
import { CreatePetDto, UpdatePetDto } from './dto';

import { PetWithType, petWithTypeInclude, orderedPetPhotos } from './pet.mapper';
import { AlertStatusEventPublisher } from '../alert/events/alert-status-event.publisher';

export type { PetWithType };

@Injectable()
export class PetService {
  private readonly logger = new Logger(PetService.name);
  // Custom alphabet for tagId: uppercase letters and numbers (no confusing chars like 0, O, I, 1)
  private readonly nanoid = customAlphabet(
    '23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
    9,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertStatusEvents: AlertStatusEventPublisher,
    @Inject(petConfig.KEY)
    private readonly petCfg: ConfigType<typeof petConfig>,
  ) { }

  /**
   * Validate the photo set of a pet: enforce the configured max count and
   * ensure the primary photo (when set) is one of the photos.
   */
  private validatePhotos(
    photos: string[],
    primaryPhoto: string | null | undefined,
  ): void {
    if (photos.length > this.petCfg.maxPhotos) {
      throw new UnprocessableEntityException(
        `A pet can have at most ${this.petCfg.maxPhotos} photos`,
      );
    }
    if (primaryPhoto && !photos.includes(primaryPhoto)) {
      throw new UnprocessableEntityException(
        'Primary photo must be one of the pet photos',
      );
    }
  }

  /**
   * Ensure a pet type exists before creating/updating a pet.
   */
  private async requirePetType(petTypeId: number): Promise<void> {
    const petType = await this.prisma.petType.findUnique({
      where: { id: petTypeId },
      select: { id: true },
    });

    if (!petType) {
      throw new UnprocessableEntityException(
        `Pet type ${petTypeId} does not exist`,
      );
    }
  }

  /**
   * Generate a unique pet tag ID
   * Format: 9 alphanumeric characters, uppercase, no confusing characters
   * Example: PET7K9X2A
   */
  private async generateTagId(): Promise<string> {
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const tagId = this.nanoid();

      // Check if tagId already exists
      const existing = await this.prisma.pet.findUnique({
        where: { tagId },
      });

      if (!existing) {
        return tagId;
      }

      // If collision detected, retry
      console.warn(`Tag ID collision detected: ${tagId}, retrying...`);
    }

    // If all retries fail, throw error
    throw new ConflictException(
      'Failed to generate unique tag ID after multiple attempts',
    );
  }

  /**
   * Create a new pet for a user
   */
  async createPet(
    userId: number,
    data: CreatePetDto,
    tx?: Prisma.TransactionClient,
  ): Promise<PetWithType> {
    const tagId = await this.generateTagId();
    await this.requirePetType(data.petTypeId);
    this.validatePhotos(data.photos ?? [], data.primaryPhoto);

    const { petTypeId, ...petData } = data;
    const db = tx ?? this.prisma;

    try {
      return await db.pet.create({
        data: {
          ...petData,
          tagId,
          user: { connect: { id: userId } },
          petType: { connect: { id: petTypeId } },
        },
        include: petWithTypeInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          // Unique constraint violation (should be rare with our generation logic)
          throw new ConflictException('Pet with this tag ID already exists');
        }
        if (error.code === 'P2003') {
          throw new UnprocessableEntityException('Pet type does not exist');
        }
      }
      throw error;
    }
  }

  /**
   * Find all personal pets for a specific user.
   * Pets listed for adoption are excluded; see AdoptionService.findMine.
   */
  async findAllByUser(userId: number): Promise<PetWithType[]> {
    return this.prisma.pet.findMany({
      where: { userId, adoptionListing: null },
      orderBy: { created_at: 'desc' },
      include: petWithTypeInclude,
    });
  }

  /**
   * Find a single pet by ID
   * Optional userId validation to ensure user owns the pet
   */
  async findOne(id: number, userId?: number): Promise<PetWithType> {
    const pet = await this.prisma.pet.findUnique({
      where: { id },
      include: petWithTypeInclude,
    });

    if (!pet) {
      throw new NotFoundException(`Pet with ID ${id} not found`);
    }

    // If userId provided, verify ownership
    if (userId !== undefined && pet.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this pet',
      );
    }

    return pet;
  }

  /**
   * Find a pet by its unique tag ID (public lookup)
   */
  async findByTagId(tagId: string): Promise<PetWithType> {
    const pet = await this.prisma.pet.findUnique({
      where: { tagId },
      include: petWithTypeInclude,
    });

    if (!pet) {
      throw new NotFoundException(`Pet with tag ID ${tagId} not found`);
    }

    return pet;
  }

  /**
   * Update a pet's information
   * Ensures user owns the pet before updating
   */
  async updatePet(
    id: number,
    userId: number,
    data: UpdatePetDto,
    tx?: Prisma.TransactionClient,
  ): Promise<PetWithType> {
    // Verify ownership first
    const existing = await this.findOne(id, userId);

    const { petTypeId, ...updateData } = data;
    const updateInput: Prisma.PetUpdateInput = { ...updateData };

    if (data.photos !== undefined || data.primaryPhoto !== undefined) {
      const photos = data.photos ?? existing.photos;
      const primaryPhoto =
        data.primaryPhoto !== undefined
          ? data.primaryPhoto
          : existing.primaryPhoto;
      this.validatePhotos(photos, data.primaryPhoto);
      // Drop a stored primary that is no longer part of the photo set.
      if (primaryPhoto && !photos.includes(primaryPhoto)) {
        updateInput.primaryPhoto = null;
      }
    }

    if (petTypeId !== undefined) {
      await this.requirePetType(petTypeId);
      updateInput.petType = { connect: { id: petTypeId } };
    }

    const snapshotChanged =
      data.photos !== undefined ||
      data.primaryPhoto !== undefined ||
      data.name !== undefined;

    // Run the update and the alert snapshot sync in one transaction. When a
    // caller already holds a transaction client, reuse it instead of nesting.
    const run = async (client: Prisma.TransactionClient) => {
      const updated = await client.pet.update({
        where: { id },
        data: updateInput,
        include: petWithTypeInclude,
      });
      if (snapshotChanged) {
        await this.syncAlertSnapshots(client, updated);
      }
      return updated;
    };

    try {
      return await (tx ? run(tx) : this.prisma.$transaction(run));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Pet with ID ${id} not found`);
        }
        if (error.code === 'P2003') {
          throw new UnprocessableEntityException('Pet type does not exist');
        }
      }
      throw error;
    }
  }

  /**
   * Copy the pet's current name and photos (primary first) into the snapshot
   * of every open alert for this pet, so viewers see the latest pet info after
   * the alert was created. Closed alerts keep their history untouched.
   */
  private async syncAlertSnapshots(
    tx: Prisma.TransactionClient,
    pet: Pet,
  ): Promise<void> {
    const { count } = await tx.alert.updateMany({
      where: {
        pet_id: pet.id,
        status: { in: [AlertStatus.ACTIVE, AlertStatus.DRAFT] },
      },
      data: {
        pet_name: pet.name,
        pet_photos: orderedPetPhotos(pet),
        updated_at: new Date(),
      },
    });
    if (count > 0) {
      this.logger.log(
        `Refreshed pet snapshot on ${count} open alert(s) for pet ${pet.id}`,
      );
    }
  }

  /**
   * Delete a pet
   * Ensures user owns the pet before deleting
   */
  async deletePet(id: number, userId: number): Promise<void> {
    // Verify ownership first
    await this.findOne(id, userId);

    try {
      await this.prisma.pet.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Pet with ID ${id} not found`);
      }
      throw error;
    }
  }

  /**
   * Mark a pet as missing
   */
  async markAsMissing(id: number, userId: number): Promise<PetWithType> {
    // Verify ownership
    const pet = await this.findOne(id, userId);

    if (pet.isMissing) {
      throw new UnprocessableEntityException(
        'Pet is already marked as missing',
      );
    }

    return this.prisma.pet.update({
      where: { id },
      data: { isMissing: true },
      include: petWithTypeInclude,
    });
  }

  /**
   * Mark a pet as found
   * Automatically resolves any active alerts for this pet
   */
  async markAsFound(id: number, userId: number): Promise<PetWithType> {
    // Verify ownership
    const pet = await this.findOne(id, userId);

    if (!pet.isMissing) {
      throw new UnprocessableEntityException('Pet is not marked as missing');
    }

    // Update pet status
    const updatedPet = await this.prisma.pet.update({
      where: { id },
      data: { isMissing: false },
      include: petWithTypeInclude,
    });

    // Auto-resolve any active alerts for this pet
    try {
      const activeAlerts = await this.prisma.alert.findMany({
        where: {
          pet_id: id,
          status: AlertStatus.ACTIVE,
        },
      });

      if (activeAlerts.length > 0) {
        const now = new Date();
        const resolvedCount = await this.prisma.alert.updateMany({
          where: {
            id: { in: activeAlerts.map((alert) => alert.id) },
            status: AlertStatus.ACTIVE,
          },
          data: {
            status: AlertStatus.RESOLVED,
            resolved_at: now,
            notes: `Pet found! Alert auto-resolved when pet was marked as found.`,
          },
        });

        this.logger.log(
          `Pet ${id} marked as found. Auto-resolved ${resolvedCount.count} active alert(s).`,
        );

        for (const alert of activeAlerts) {
          this.alertStatusEvents.resolved({
            alertId: alert.id,
            petId: id,
            creatorId: alert.creator_id,
            previousStatus: alert.status,
            changedBy: userId,
            source: 'pet_found',
            occurredAt: now,
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to auto-resolve alerts for pet ${id}:`, error);
      // Don't fail the operation if alert resolution fails
    }

    return updatedPet;
  }

  /**
   * Find all missing pets (for admin/system use)
   */
  async findAllMissing(): Promise<PetWithType[]> {
    return this.prisma.pet.findMany({
      where: { isMissing: true },
      orderBy: { updated_at: 'desc' },
      include: petWithTypeInclude,
    });
  }

  /**
   * Find pets with filters (for admin use)
   */
  async findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.PetWhereInput;
    orderBy?: Prisma.PetOrderByWithRelationInput;
  }): Promise<Pet[]> {
    const { skip, take, where, orderBy } = params;
    return this.prisma.pet.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }
}
