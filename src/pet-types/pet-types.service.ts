import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { Prisma, PetType as PetTypeModel } from '@prisma-lib/client';
import { PrismaService } from '../services/prisma.service';
import {
	CreatePetTypeDto,
	PetTypeOrderBy,
	SortDirection,
	UpdatePetTypeDto,
} from './dto';

@Injectable()
export class PetTypesService {
	private readonly logger = new Logger(PetTypesService.name);

	constructor(private readonly prisma: PrismaService) { }

	/**
	 * Create a new pet type.
	 */
	async create(data: CreatePetTypeDto): Promise<PetTypeModel> {
		try {
			return await this.prisma.petType.create({ data });
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError) {
				if (error.code === 'P2002') {
					throw new ConflictException(
						'Pet type name or slug already exists',
					);
				}
			}
			this.logger.error('Failed to create pet type', error);
			throw error;
		}
	}

	/**
	 * List all pet types.
	 */
	async findAll(
		orderBy: PetTypeOrderBy = PetTypeOrderBy.ORDER,
		orderDir: SortDirection = SortDirection.ASC,
	): Promise<PetTypeModel[]> {
		return this.prisma.petType.findMany({
			orderBy: { [orderBy]: orderDir },
		});
	}

	/**
	 * Fetch a pet type by ID.
	 */
	async findOne(id: number): Promise<PetTypeModel> {
		const petType = await this.prisma.petType.findUnique({
			where: { id },
		});

		if (!petType) {
			throw new NotFoundException(`Pet type ${id} not found`);
		}

		return petType;
	}

	/**
	 * Fetch a pet type by slug.
	 */
	async findBySlug(slug: string): Promise<PetTypeModel> {
		const petType = await this.prisma.petType.findUnique({
			where: { slug },
		});

		if (!petType) {
			throw new NotFoundException(`Pet type ${slug} not found`);
		}

		return petType;
	}

	/**
	 * Update an existing pet type.
	 */
	async update(id: number, data: UpdatePetTypeDto): Promise<PetTypeModel> {
		try {
			return await this.prisma.petType.update({
				where: { id },
				data,
			});
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError) {
				if (error.code === 'P2025') {
					throw new NotFoundException(`Pet type ${id} not found`);
				}
				if (error.code === 'P2002') {
					throw new ConflictException(
						'Pet type name or slug already exists',
					);
				}
			}
			this.logger.error('Failed to update pet type', error);
			throw error;
		}
	}

	/**
	 * Delete a pet type.
	 */
	async remove(id: number): Promise<void> {
		try {
			await this.prisma.petType.delete({
				where: { id },
			});
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError) {
				if (error.code === 'P2025') {
					throw new NotFoundException(`Pet type ${id} not found`);
				}
			}
			this.logger.error('Failed to delete pet type', error);
			throw error;
		}
	}
}
