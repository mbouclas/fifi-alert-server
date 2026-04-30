import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { Pet, Prisma, AlertStatus } from '@prisma-lib/client';
import { customAlphabet } from 'nanoid';
import { CreatePetDto, UpdatePetDto } from './dto';

type PetWithType = Prisma.PetGetPayload<{ include: { petType: true } }>;

@Injectable()
export class PetService {
  private readonly logger = new Logger(PetService.name);
  // Custom alphabet for tagId: uppercase letters and numbers (no confusing chars like 0, O, I, 1)
  private readonly nanoid = customAlphabet(
    '23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
    9,
  );

  constructor(private readonly prisma: PrismaService) { }

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
  ): Promise<PetWithType> {
    const tagId = await this.generateTagId();
    await this.requirePetType(data.petTypeId);

    const { petTypeId, ...petData } = data;

    try {
      return await this.prisma.pet.create({
        data: {
          ...petData,
          tagId,
          user: { connect: { id: userId } },
          petType: { connect: { id: petTypeId } },
        },
        include: { petType: true },
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
   * Find all pets for a specific user
   */
  async findAllByUser(userId: number): Promise<PetWithType[]> {
    return this.prisma.pet.findMany({
      where: { userId },
      orderBy: { created_at: 'desc' },
      include: { petType: true },
    });
  }

  /**
   * Find a single pet by ID
   * Optional userId validation to ensure user owns the pet
   */
  async findOne(id: number, userId?: number): Promise<PetWithType> {
    const pet = await this.prisma.pet.findUnique({
      where: { id },
      include: { petType: true },
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
      include: { petType: true },
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
  ): Promise<PetWithType> {
    // Verify ownership first
    await this.findOne(id, userId);

    const { petTypeId, ...updateData } = data;
    const updateInput: Prisma.PetUpdateInput = { ...updateData };

    if (petTypeId !== undefined) {
      await this.requirePetType(petTypeId);
      updateInput.petType = { connect: { id: petTypeId } };
    }

    try {
      return await this.prisma.pet.update({
        where: { id },
        data: updateInput,
        include: { petType: true },
      });
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
      include: { petType: true },
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
      include: { petType: true },
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
            pet_id: id,
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
      include: { petType: true },
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
