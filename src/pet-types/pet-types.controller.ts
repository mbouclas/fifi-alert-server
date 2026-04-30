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
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { MinUserLevelGuard } from '../auth/guards/min-user-level.guard';
import { MinUserLevel } from '../auth/decorators/min-user-level.decorator';
import { PetTypesService } from './pet-types.service';
import {
    CreatePetTypeDto,
    ListPetTypesQueryDto,
    PetTypeResponseDto,
    PetTypeOrderBy,
    SortDirection,
    UpdatePetTypeDto,
} from './dto';

/**
 * REST endpoints for managing pet types.
 *
 * Read operations are available to authenticated users. Mutating operations
 * require super admin privileges (level <= 5).
 */
@Controller('pet-types')
@ApiTags('Pet Types')
@ApiBearerAuth()
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
@MinUserLevel(5)
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
        status: 409,
        description: 'Duplicate pet type name or slug',
    })
    async create(@Body() dto: CreatePetTypeDto): Promise<PetTypeResponseDto> {
        return this.petTypesService.create(dto);
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
            'Sort field. Options: id, name, slug, order, created_at, updated_at.',
    })
    @ApiQuery({
        name: 'orderDir',
        required: false,
        enum: SortDirection,
        enumName: 'SortDirection',
        example: SortDirection.ASC,
        description: 'Sort direction. Options: asc, desc.',
    })
    @MinUserLevel(100)
    async findAll(
        @Query() query: ListPetTypesQueryDto,
    ): Promise<PetTypeResponseDto[]> {
        return this.petTypesService.findAll(query.orderBy, query.orderDir);
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
    @MinUserLevel(100)
    async findBySlug(@Param('slug') slug: string): Promise<PetTypeResponseDto> {
        return this.petTypesService.findBySlug(slug);
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
    @MinUserLevel(100)
    async findOne(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PetTypeResponseDto> {
        return this.petTypesService.findOne(id);
    }

    /**
     * Update a pet type by ID.
     */
    @Patch(':id')
    @ApiParam({ name: 'id', description: 'Pet type ID' })
    @ApiOperation({ summary: 'Update a pet type' })
    @ApiResponse({
        status: 200,
        description: 'Pet type updated successfully',
        type: PetTypeResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Pet type not found' })
    @ApiResponse({
        status: 409,
        description: 'Duplicate pet type name or slug',
    })
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePetTypeDto,
    ): Promise<PetTypeResponseDto> {
        return this.petTypesService.update(id, dto);
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
}
