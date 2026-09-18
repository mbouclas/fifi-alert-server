import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma-lib/client';
import { PrismaService } from '../services/prisma.service';
import { LanguageService } from '../i18n/language.service';
import {
	CreatePetTypeDto,
	PetTypeOrderBy,
	PetTypeResponseDto,
	SortDirection,
	UpdatePetTypeDto,
} from './dto';
import {
	PetTypeWithTranslations,
	petTypeInclude,
	toPetTypeResponse,
} from './pet-type.mapper';

/**
 * Options controlling how pet types are rendered in responses.
 */
export interface PetTypeReadOptions {
	/** Resolved request language code. */
	lang: string;
	/** Attach the full translations map (admin views). */
	includeTranslations?: boolean;
}

@Injectable()
export class PetTypesService {
	private readonly logger = new Logger(PetTypesService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly languageService: LanguageService,
	) { }

	/**
	 * Create a new pet type with its translations.
	 * The default language translation is required.
	 */
	async create(
		data: CreatePetTypeDto,
		opts: PetTypeReadOptions,
	): Promise<PetTypeResponseDto> {
		const { translations, ...rest } = data;
		await this.assertTranslations(translations, true);

		try {
			const petType = await this.prisma.petType.create({
				data: {
					...rest,
					translations: {
						create: Object.entries(translations).map(([langCode, name]) => ({
							langCode,
							name,
						})),
					},
				},
				include: petTypeInclude,
			});
			return this.toResponse(petType, { ...opts, includeTranslations: true });
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError) {
				if (error.code === 'P2002') {
					throw new ConflictException('Pet type slug already exists');
				}
			}
			this.logger.error('Failed to create pet type', error);
			throw error;
		}
	}

	/**
	 * List all pet types.
	 *
	 * Ordering by `name` is done in memory on the resolved translation, since
	 * Prisma cannot order by a filtered relation row (the table is tiny).
	 */
	async findAll(
		orderBy: PetTypeOrderBy = PetTypeOrderBy.ORDER,
		orderDir: SortDirection = SortDirection.ASC,
		opts: PetTypeReadOptions,
	): Promise<PetTypeResponseDto[]> {
		const byName = orderBy === PetTypeOrderBy.NAME;

		const petTypes = await this.prisma.petType.findMany({
			orderBy: byName ? { order: 'asc' } : { [orderBy]: orderDir },
			include: petTypeInclude,
		});

		const defaultLang = await this.languageService.getDefaultCode();
		const mapped = petTypes.map((pt) =>
			toPetTypeResponse(pt, opts.lang, defaultLang, opts.includeTranslations),
		);

		if (byName) {
			const dir = orderDir === SortDirection.DESC ? -1 : 1;
			mapped.sort((a, b) => dir * a.name.localeCompare(b.name, opts.lang));
		}

		return mapped;
	}

	/**
	 * Fetch a pet type by ID.
	 */
	async findOne(id: number, opts: PetTypeReadOptions): Promise<PetTypeResponseDto> {
		const petType = await this.prisma.petType.findUnique({
			where: { id },
			include: petTypeInclude,
		});

		if (!petType) {
			throw new NotFoundException(`Pet type ${id} not found`);
		}

		return this.toResponse(petType, opts);
	}

	/**
	 * Fetch a pet type by slug.
	 */
	async findBySlug(slug: string, opts: PetTypeReadOptions): Promise<PetTypeResponseDto> {
		const petType = await this.prisma.petType.findUnique({
			where: { slug },
			include: petTypeInclude,
		});

		if (!petType) {
			throw new NotFoundException(`Pet type ${slug} not found`);
		}

		return this.toResponse(petType, opts);
	}

	/**
	 * Update an existing pet type. Provided translations are upserted;
	 * languages not mentioned are left untouched.
	 */
	async update(
		id: number,
		data: UpdatePetTypeDto,
		opts: PetTypeReadOptions,
	): Promise<PetTypeResponseDto> {
		const { translations, ...rest } = data;
		const updateInput: Prisma.PetTypeUpdateInput = { ...rest };

		if (translations) {
			await this.assertTranslations(translations, false);
			updateInput.translations = {
				upsert: Object.entries(translations).map(([langCode, name]) => ({
					where: { petTypeId_langCode: { petTypeId: id, langCode } },
					update: { name },
					create: { langCode, name },
				})),
			};
		}

		try {
			const petType = await this.prisma.petType.update({
				where: { id },
				data: updateInput,
				include: petTypeInclude,
			});
			return this.toResponse(petType, { ...opts, includeTranslations: true });
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError) {
				if (error.code === 'P2025') {
					throw new NotFoundException(`Pet type ${id} not found`);
				}
				if (error.code === 'P2002') {
					throw new ConflictException('Pet type slug already exists');
				}
			}
			this.logger.error('Failed to update pet type', error);
			throw error;
		}
	}

	/**
	 * Delete a pet type (translations cascade).
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

	/**
	 * Ensure every translation key is an active language and, when required,
	 * that the default language is present.
	 */
	private async assertTranslations(
		translations: Record<string, string>,
		requireDefault: boolean,
	): Promise<void> {
		const active = await this.languageService.getActive();
		const activeCodes = new Set(active.map((l) => l.code));
		const defaultCode = await this.languageService.getDefaultCode();

		const unknown = Object.keys(translations).filter((c) => !activeCodes.has(c));
		if (unknown.length > 0) {
			throw new BadRequestException(
				`Unknown or inactive language code(s): ${unknown.join(', ')}. See GET /languages.`,
			);
		}

		if (requireDefault && !(defaultCode in translations)) {
			throw new BadRequestException(
				`A translation for the default language "${defaultCode}" is required`,
			);
		}
	}

	private async toResponse(
		petType: PetTypeWithTranslations,
		opts: PetTypeReadOptions,
	): Promise<PetTypeResponseDto> {
		const defaultLang = await this.languageService.getDefaultCode();
		return toPetTypeResponse(petType, opts.lang, defaultLang, opts.includeTranslations);
	}
}
