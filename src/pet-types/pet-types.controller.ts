import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiHeader,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { MinUserLevelGuard } from '../auth/guards/min-user-level.guard';
import { MinUserLevel } from '../auth/decorators/min-user-level.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ITokenUser } from '../auth/services/token.service';
import { Lang } from '../i18n/decorators/lang.decorator';
import { PetTypesService } from './pet-types.service';
import {
    CreatePetTypeDto,
    ListPetTypesQueryDto,
    PetTypeResponseDto,
    PetTypeOrderBy,
    SortDirection,
    UpdatePetTypeDto,
} from './dto';

/** Role level at or below which callers see the full translations map. */
const ADMIN_LEVEL = 5;

/**
 * REST endpoints for managing pet types.
 *
 * Read operations are available to authenticated users. Mutating operations
 * require super admin privileges (level <= 5).
 *
 * `name` is returned in the language resolved from `?lang=`, then the
 * `Accept-Language` header, then the default language (see GET /languages).
 * Administrators additionally receive the full `translations` map.
 */
@Controller('pet-types')
@ApiTags('Pet Types')
@ApiBearerAuth()
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
@MinUserLevel(ADMIN_LEVEL)
export class PetTypesController {
    constructor(private readonly petTypesService: PetTypesService) { }

    /**
     * Create a new pet type.
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a pet type' })
    @ApiResponse({
        status: 201,
        description: 'Pet type created successfully',
        type: PetTypeResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Unknown language code or missing default-language translation',
    })
    @ApiResponse({
        status: 409,
        description: 'Duplicate pet type slug',
    })
    async create(
        @Body() dto: CreatePetTypeDto,
        @Lang() lang: string,
    ): Promise<PetTypeResponseDto> {
        return this.petTypesService.create(dto, { lang });
    }

    /**
     * List all pet types.
     */
    @Get()
    @ApiOperation({ summary: 'List pet types' })
    @ApiResponse({
        status: 200,
        description: 'List of pet types',
        type: [PetTypeResponseDto],
    })
    @ApiQuery({
        name: 'orderBy',
        required: false,
        enum: PetTypeOrderBy,
        enumName: 'PetTypeOrderBy',
        example: PetTypeOrderBy.ORDER,
        description:
            'Sort field. Options: id, name, slug, order, created_at, updated_at. `name` sorts by the resolved translation.',
    })
    @ApiQuery({
        name: 'orderDir',
        required: false,
        enum: SortDirection,
        enumName: 'SortDirection',
        example: SortDirection.ASC,
        description: 'Sort direction. Options: asc, desc.',
    })
    @ApiQuery({
        name: 'lang',
        required: false,
        example: 'el',
        description:
            'Language for `name`. Falls back to Accept-Language, then the default language.',
    })
    @ApiHeader({
        name: 'Accept-Language',
        required: false,
        description: 'Used when `lang` is omitted.',
    })
    @MinUserLevel(100)
    async findAll(
        @Query() query: ListPetTypesQueryDto,
        @Lang() lang: string,
        @CurrentUser() user: ITokenUser,
    ): Promise<PetTypeResponseDto[]> {
        return this.petTypesService.findAll(query.orderBy, query.orderDir, {
            lang,
            includeTranslations: this.isAdmin(user),
        });
    }

    /**
     * Fetch a pet type by slug.
     */
    @Get('slug/:slug')
    @ApiParam({ name: 'slug', description: 'Pet type slug' })
    @ApiOperation({ summary: 'Get pet type by slug' })
    @ApiResponse({
        status: 200,
        description: 'Pet type details',
        type: PetTypeResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Pet type not found' })
    @ApiQuery({
        name: 'lang',
        required: false,
        example: 'el',
        description:
            'Language for `name`. Falls back to Accept-Language, then the default language.',
    })
    @ApiHeader({
        name: 'Accept-Language',
        required: false,
        description: 'Used when `lang` is omitted.',
    })
    @MinUserLevel(100)
    async findBySlug(
        @Param('slug') slug: string,
        @Lang() lang: string,
        @CurrentUser() user: ITokenUser,
    ): Promise<PetTypeResponseDto> {
        return this.petTypesService.findBySlug(slug, {
            lang,
            includeTranslations: this.isAdmin(user),
        });
    }

    /**
     * Fetch a pet type by ID.
     */
    @Get(':id')
    @ApiParam({ name: 'id', description: 'Pet type ID' })
    @ApiOperation({ summary: 'Get pet type by ID' })
    @ApiResponse({
        status: 200,
        description: 'Pet type details',
        type: PetTypeResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Pet type not found' })
    @ApiQuery({
        name: 'lang',
        required: false,
        example: 'el',
        description:
            'Language for `name`. Falls back to Accept-Language, then the default language.',
    })
    @ApiHeader({
        name: 'Accept-Language',
        required: false,
        description: 'Used when `lang` is omitted.',
    })
    @MinUserLevel(100)
    async findOne(
        @Param('id', ParseIntPipe) id: number,
        @Lang() lang: string,
        @CurrentUser() user: ITokenUser,
    ): Promise<PetTypeResponseDto> {
        return this.petTypesService.findOne(id, {
            lang,
            includeTranslations: this.isAdmin(user),
        });
    }

    /**
     * Update a pet type by ID.
     */
    @Patch(':id')
    @ApiParam({ name: 'id', description: 'Pet type ID' })
    @ApiOperation({
        summary: 'Update a pet type',
        description:
            'Provided `translations` keys are upserted; languages not mentioned are left unchanged.',
    })
    @ApiResponse({
        status: 200,
        description: 'Pet type updated successfully',
        type: PetTypeResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Unknown language code' })
    @ApiResponse({ status: 404, description: 'Pet type not found' })
    @ApiResponse({
        status: 409,
        description: 'Duplicate pet type slug',
    })
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePetTypeDto,
        @Lang() lang: string,
    ): Promise<PetTypeResponseDto> {
        return this.petTypesService.update(id, dto, { lang });
    }

    /**
     * Delete a pet type by ID.
     */
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiParam({ name: 'id', description: 'Pet type ID' })
    @ApiOperation({ summary: 'Delete a pet type' })
    @ApiResponse({ status: 204, description: 'Pet type deleted successfully' })
    @ApiResponse({ status: 404, description: 'Pet type not found' })
    async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.petTypesService.remove(id);
    }

    /** Lower level = higher privilege; the token already carries the user's roles. */
    private isAdmin(user: ITokenUser | undefined): boolean {
        return !!user?.roles?.some((r) => r.level <= ADMIN_LEVEL);
    }
}
