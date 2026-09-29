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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AdoptionService } from './adoption.service';
import {
  AdoptionListingResponseDto,
  CreateAdoptionListingDto,
  ListAdoptionsQueryDto,
  PaginatedAdoptionListingsResponseDto,
  UpdateAdoptionListingDto,
} from './dto';
import { UploadPetPhotosDto } from '../pet/dto';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { ClientKeyGuard } from '../auth/guards/client-key.guard';
import { AllowAnonymous } from '../auth/decorators/allow-anonymous.decorator';
import { RequireClientKey } from '../auth/decorators/require-client-key.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Session } from '../decorators/session.decorator';
import { UploadService } from '../upload/upload.service';
import { Lang } from '../i18n/decorators/lang.decorator';
import { LanguageService } from '../i18n/language.service';
import {
  AdoptionListingWithRelations,
  toAdoptionListingResponse,
} from './adoption.mapper';
import type { ITokenUser } from '../auth/services/token.service';

/**
 * Adoption board endpoints.
 *
 * Browsing (`GET /adoptions`, `GET /adoptions/:id`) needs no logged-in user
 * but requires a valid `X-Client-Key` header. Everything else needs a bearer
 * token and operates on the caller's own listings.
 *
 * Embedded `pet.petType.name` is localised: `?lang=` -> `Accept-Language`
 * -> default language (see GET /languages).
 */
@ApiTags('Adoptions')
@Controller('adoptions')
@UseGuards(BearerTokenGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    transformOptions: { enableImplicitConversion: true },
  }),
)
@ApiQuery({
  name: 'lang',
  required: false,
  example: 'el',
  description:
    'Language for `pet.petType.name`. Falls back to Accept-Language, then the default language.',
})
@ApiHeader({
  name: 'Accept-Language',
  required: false,
  description: 'Used when `lang` is omitted.',
})
export class AdoptionController {
  constructor(
    private readonly adoptionService: AdoptionService,
    private readonly uploadService: UploadService,
    private readonly languageService: LanguageService,
  ) {}

  private async localize(
    listing: AdoptionListingWithRelations,
    lang: string,
    distanceKm?: number,
  ): Promise<AdoptionListingResponseDto> {
    const defaultLang = await this.languageService.getDefaultCode();
    return toAdoptionListingResponse(listing, lang, defaultLang, distanceKm);
  }

  private async localizeMany(
    listings: AdoptionListingWithRelations[],
    lang: string,
    distances?: Map<number, number | undefined>,
  ): Promise<AdoptionListingResponseDto[]> {
    const defaultLang = await this.languageService.getDefaultCode();
    return listings.map((l) =>
      toAdoptionListingResponse(l, lang, defaultLang, distances?.get(l.id)),
    );
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List my adoption listings',
    description:
      'All listings created by the authenticated user, in every status, newest first.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listings owned by the caller',
    type: [AdoptionListingResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findMine(
    @Session() session: any,
    @Lang() lang: string,
  ): Promise<AdoptionListingResponseDto[]> {
    const listings = await this.adoptionService.findMine(session.userId);
    return this.localizeMany(listings, lang);
  }

  @Get()
  @AllowAnonymous()
  @RequireClientKey()
  @UseGuards(ClientKeyGuard)
  @ApiSecurity('client-key')
  @ApiOperation({
    summary: 'Browse available adoption listings',
    description:
      'Public board of pets available for adoption. Requires the `X-Client-Key` header; a bearer token is not needed. ' +
      'Pass `lat` and `lon` together to search within `radiusKm` (results are then ordered by distance and include `distanceKm`). ' +
      'Further filters: `petTypeId`, `gender`, `size`, `minAgeMonths`, `maxAgeMonths`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated available listings',
    type: PaginatedAdoptionListingsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query (e.g. lat without lon)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid client key' })
  async findAvailable(
    @Query() query: ListAdoptionsQueryDto,
    @Lang() lang: string,
  ): Promise<PaginatedAdoptionListingsResponseDto> {
    const result = await this.adoptionService.findAvailable(query);
    const data = await this.localizeMany(result.data, lang, result.distances);
    return {
      data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }

  @Get(':id')
  @AllowAnonymous()
  @RequireClientKey()
  @UseGuards(ClientKeyGuard)
  @ApiSecurity('client-key')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Adoption listing ID' })
  @ApiOperation({
    summary: 'Get an adoption listing',
    description:
      'Requires the `X-Client-Key` header. Only AVAILABLE listings are visible to the public; ' +
      'the owner (with a bearer token) can also see their ADOPTED and WITHDRAWN listings.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing details',
    type: AdoptionListingResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid client key' })
  @ApiResponse({ status: 404, description: 'Listing not found or not available' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ITokenUser | undefined,
    @Lang() lang: string,
  ): Promise<AdoptionListingResponseDto> {
    const listing = await this.adoptionService.findOneForRequester(id, user?.id);
    return this.localize(listing, lang);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create an adoption listing',
    description:
      'Creates a new pet (same fields as POST /pets) and lists it for adoption at the given location. ' +
      'The pet does not appear in GET /pets; use GET /adoptions/mine instead.',
  })
  @ApiResponse({
    status: 201,
    description: 'Listing created',
    type: AdoptionListingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 422, description: 'Pet type does not exist' })
  async create(
    @Body() dto: CreateAdoptionListingDto,
    @Session() session: any,
    @Lang() lang: string,
  ): Promise<AdoptionListingResponseDto> {
    const listing = await this.adoptionService.create(session.userId, dto);
    return this.localize(listing, lang);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Adoption listing ID' })
  @ApiOperation({
    summary: 'Update my adoption listing',
    description:
      'Update listing fields (location, description) and/or the linked pet (name, gender, size, photos, ...). `lat` and `lon` must be sent together.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing updated',
    type: AdoptionListingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not your listing' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdoptionListingDto,
    @Session() session: any,
    @Lang() lang: string,
  ): Promise<AdoptionListingResponseDto> {
    const listing = await this.adoptionService.update(id, session.userId, dto);
    return this.localize(listing, lang);
  }

  @Patch(':id/adopted')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Adoption listing ID' })
  @ApiOperation({
    summary: 'Mark my listing as adopted',
    description: 'Transitions AVAILABLE -> ADOPTED and removes it from the public board.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing marked adopted',
    type: AdoptionListingResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not your listing' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  @ApiResponse({ status: 409, description: 'Listing is not AVAILABLE' })
  async markAdopted(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
    @Lang() lang: string,
  ): Promise<AdoptionListingResponseDto> {
    const listing = await this.adoptionService.markAdopted(id, session.userId);
    return this.localize(listing, lang);
  }

  @Patch(':id/withdraw')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Adoption listing ID' })
  @ApiOperation({
    summary: 'Withdraw my listing',
    description: 'Transitions AVAILABLE -> WITHDRAWN (hidden from the board; can be relisted).',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing withdrawn',
    type: AdoptionListingResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not your listing' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  @ApiResponse({ status: 409, description: 'Listing is not AVAILABLE' })
  async withdraw(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
    @Lang() lang: string,
  ): Promise<AdoptionListingResponseDto> {
    const listing = await this.adoptionService.withdraw(id, session.userId);
    return this.localize(listing, lang);
  }

  @Patch(':id/relist')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Adoption listing ID' })
  @ApiOperation({
    summary: 'Relist my withdrawn listing',
    description: 'Transitions WITHDRAWN -> AVAILABLE. Adopted listings cannot be relisted.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing relisted',
    type: AdoptionListingResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not your listing' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  @ApiResponse({ status: 409, description: 'Listing is not WITHDRAWN' })
  async relist(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
    @Lang() lang: string,
  ): Promise<AdoptionListingResponseDto> {
    const listing = await this.adoptionService.relist(id, session.userId);
    return this.localize(listing, lang);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Adoption listing ID' })
  @ApiOperation({
    summary: 'Delete my adoption listing',
    description: 'Deletes the listing and the linked pet permanently.',
  })
  @ApiResponse({ status: 204, description: 'Listing deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not your listing' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
  ): Promise<void> {
    await this.adoptionService.remove(id, session.userId);
  }

  @Post(':id/photos')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('photos', 5))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadPetPhotosDto })
  @ApiParam({ name: 'id', description: 'Adoption listing ID' })
  @ApiOperation({
    summary: 'Upload photos for my listed pet',
    description:
      'Upload up to 5 image files per request (10 in total per listing). Unlike POST /pets/{id}/photos, the URLs are saved to the pet immediately.',
  })
  @ApiResponse({
    status: 201,
    description: 'Photos uploaded and attached',
    type: AdoptionListingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file, or photo limit exceeded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not your listing' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async uploadPhotos(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Lang() lang: string,
  ): Promise<AdoptionListingResponseDto> {
    const listing = await this.adoptionService.requireOwned(id, session.userId);
    const urls = await this.uploadService.uploadImages(
      files,
      `pets/${listing.petId}`,
    );
    const updated = await this.adoptionService.addPhotos(id, session.userId, urls);
    return this.localize(updated, lang);
  }
}
