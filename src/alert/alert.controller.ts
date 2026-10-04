import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ParseIntPipe,
  UseInterceptors,
  UploadedFiles,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiSecurity,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AlertService } from './alert.service';
import {
  CreateAlertDto,
  UpdateAlertDto,
  ResolveAlertDto,
  CancelAlertDto,
  ListAlertsQueryDto,
  AlertResponseDto,
  ReunionSnapshotDto,
} from './dto';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { ClientKeyGuard } from '../auth/guards/client-key.guard';
import { AllowAnonymous } from '../auth/decorators/allow-anonymous.decorator';
import { RequireClientKey } from '../auth/decorators/require-client-key.decorator';
import { User } from '../decorators/user.decorator';
import { TagIdPipe } from '../pet/pipes/tag-id.pipe';
import { AlertStatus } from '../generated/prisma';
import { UploadService } from '../upload/upload.service';

@ApiTags('alerts')
@Controller('alerts')
export class AlertController {
  constructor(
    private readonly alertService: AlertService,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * POST /alerts - Create a new alert
   * Task 2.11
   */
  @Post()
  @UseGuards(BearerTokenGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new missing pet alert' })
  @ApiResponse({
    status: 201,
    description: 'Alert created successfully',
    type: AlertResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async create(
    @User('id') userId: number,
    @Body() createAlertDto: CreateAlertDto,
  ): Promise<AlertResponseDto> {
    return this.alertService.create(userId, createAlertDto);
  }

  /**
   * GET /alerts/by-tag/:tagId - Public alert page lookup by collar tag.
   * Declared before GET /alerts/:id so the literal segment wins.
   */
  @Get('by-tag/:tagId')
  @AllowAnonymous()
  @RequireClientKey()
  @UseGuards(ClientKeyGuard)
  @ApiSecurity('client-key')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiParam({
    name: 'tagId',
    description:
      'Collar tag id (9 chars, alphabet 23456789ABCDEFGHJKLMNPQRSTUVWXYZ)',
    example: 'LUNA2M4PQ',
  })
  @ApiOperation({
    summary: 'Get the newest ACTIVE alert for a collar tag',
    description:
      'Backs the public `/active-alerts/{tagId}` page. Requires `X-Client-Key` when no bearer token is sent. ' +
      'Anonymous callers receive a redacted payload (no `creatorId`, `contactEmail`, `notes`, `affectedPostalCodes`; coordinates rounded to ~100 m).',
  })
  @ApiResponse({
    status: 200,
    description: 'Active alert for this tag',
    type: AlertResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Malformed tag id' })
  @ApiResponse({ status: 401, description: 'Missing or invalid client key' })
  @ApiResponse({
    status: 404,
    description: 'Unknown tag, or the pet has no ACTIVE alert',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async findByTag(
    @Param('tagId', TagIdPipe) tagId: string,
    @User('id') userId?: number,
  ): Promise<AlertResponseDto> {
    const alert = await this.alertService.findActiveByTagId(tagId, userId);

    if (!alert) {
      throw new NotFoundException(`No active alert for tag ${tagId}`);
    }

    return alert;
  }

  /**
   * GET /alerts/by-tag/:tagId/reunion - Public "pet is home" snapshot.
   * Backs the web `/thank-you/{tagId}` page (BACKEND_WORK_ORDER_THANK_YOU.md §3.2).
   */
  @Get('by-tag/:tagId/reunion')
  @AllowAnonymous()
  @RequireClientKey()
  @UseGuards(ClientKeyGuard)
  @ApiSecurity('client-key')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiParam({
    name: 'tagId',
    description:
      'Collar tag id (9 chars, alphabet 23456789ABCDEFGHJKLMNPQRSTUVWXYZ)',
    example: 'PET7K9X2A',
  })
  @ApiOperation({
    summary: 'Get the reunion snapshot for a collar tag',
    description:
      'Frozen when the owner resolves an alert as FOUND_SAFE, FOUND_INJURED or RETURNED_HOME. ' +
      'Requires `X-Client-Key` when no bearer token is sent; the bearer is otherwise ignored. ' +
      'The snapshot is the public DTO: it never contains owner data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reunion snapshot for this tag',
    type: ReunionSnapshotDto,
  })
  @ApiResponse({ status: 400, description: 'Malformed tag id' })
  @ApiResponse({ status: 401, description: 'Missing or invalid client key' })
  @ApiResponse({
    status: 404,
    description: 'No reunion snapshot for this tag, or it has expired',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async findReunionByTag(
    @Param('tagId', TagIdPipe) tagId: string,
  ): Promise<ReunionSnapshotDto> {
    const snapshot = await this.alertService.findReunionByTagId(tagId);

    if (!snapshot) {
      throw new NotFoundException(`No reunion for tag ${tagId}`);
    }

    return snapshot;
  }

  /**
   * GET /alerts/:id - View a specific alert
   * Task 2.11
   */
  @Get(':id')
  @AllowAnonymous()
  @RequireClientKey()
  @UseGuards(ClientKeyGuard)
  @ApiSecurity('client-key')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiOperation({
    summary: 'Get alert by ID',
    description:
      'Requires `X-Client-Key` when no bearer token is sent. Anonymous callers receive a redacted payload ' +
      '(no `creatorId`, `contactEmail`, `notes`, `affectedPostalCodes`; coordinates rounded to ~100 m).',
  })
  @ApiResponse({
    status: 200,
    description: 'Alert found',
    type: AlertResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid client key' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @User('id') userId?: number,
  ): Promise<AlertResponseDto> {
    const alert = await this.alertService.findById(id, userId);

    if (!alert) {
      throw new NotFoundException(`Alert with ID ${id} not found`);
    }

    return alert;
  }

  /**
   * GET /alerts - List/search alerts
   * Task 2.11
   */
  @Get()
  @AllowAnonymous()
  @RequireClientKey()
  @UseGuards(ClientKeyGuard)
  @ApiSecurity('client-key')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Search for alerts by location',
    description:
      'Requires `X-Client-Key` when no bearer token is sent. Without `lat`/`lon` results are newest first; ' +
      'with both, results are ordered by `distanceKm` within `radiusKm`. Anonymous callers always receive ' +
      'ACTIVE alerts only (any `status` filter is ignored) with a redacted payload.',
  })
  @ApiResponse({
    status: 200,
    description: 'Alerts found',
    type: [AlertResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid client key' })
  async findAll(
    @Query() query: ListAlertsQueryDto,
    @User('id') userId?: number,
  ): Promise<AlertResponseDto[]> {
    if (userId === undefined) {
      // Public callers must never see DRAFT/RESOLVED/EXPIRED/CANCELLED alerts.
      query = { ...query, status: AlertStatus.ACTIVE };
    }
    return this.alertService.findNearby(query, userId);
  }

  /**
   * PATCH /alerts/:id - Update an alert
   * Task 2.11
   */
  @Patch(':id')
  @UseGuards(BearerTokenGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiOperation({ summary: 'Update an existing alert' })
  @ApiResponse({
    status: 200,
    description: 'Alert updated successfully',
    type: AlertResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not the alert creator',
  })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @User('id') userId: number,
    @Body() updateAlertDto: UpdateAlertDto,
  ): Promise<AlertResponseDto> {
    return this.alertService.update(id, userId, updateAlertDto);
  }

  /**
   * POST /alerts/:id/resolve - Resolve an alert
   * Task 2.11
   */
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BearerTokenGuard)
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
    }),
  )
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiOperation({
    summary: 'Mark an alert as resolved',
    description:
      'For found outcomes on a tagged pet this freezes the public reunion snapshot ' +
      '(GET /alerts/by-tag/{tagId}/reunion). With `shareSuccessStory: true` every helper ' +
      '(users who received the alert, sighting reporters) gets one "pet is home" push deep-linking to /thank-you/{tagId}.',
  })
  @ApiResponse({
    status: 200,
    description: 'Alert resolved successfully',
    type: AlertResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (e.g. thankYouMessage longer than 500 chars)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not the alert creator',
  })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  @ApiResponse({ status: 422, description: 'Alert already resolved' })
  async resolve(
    @Param('id', ParseIntPipe) id: number,
    @User('id') userId: number,
    @Body() resolveAlertDto: ResolveAlertDto,
  ): Promise<AlertResponseDto> {
    return this.alertService.resolve(id, userId, resolveAlertDto);
  }

  /**
   * POST /alerts/:id/cancel - Cancel an alert
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BearerTokenGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiOperation({
    summary: 'Cancel an alert',
    description:
      'Withdraws a DRAFT or ACTIVE alert (e.g. posted by mistake). Sets status to CANCELLED and stops any pending notification waves. Use /resolve instead when the pet was found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Alert cancelled successfully',
    type: AlertResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not the alert creator',
  })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  @ApiResponse({
    status: 422,
    description:
      'Alert is not DRAFT or ACTIVE (already resolved, expired or cancelled)',
  })
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @User('id') userId: number,
    @Body() cancelAlertDto: CancelAlertDto,
  ): Promise<AlertResponseDto> {
    return this.alertService.cancel(id, userId, cancelAlertDto);
  }

  /**
   * POST /alerts/:id/renew - Renew an alert
   * Task 2.11
   */
  @Post(':id/renew')
  @UseGuards(BearerTokenGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiOperation({ summary: 'Renew an alert (extend expiration by 7 days)' })
  @ApiResponse({
    status: 200,
    description: 'Alert renewed successfully',
    type: AlertResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not the alert creator',
  })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  @ApiResponse({
    status: 422,
    description: 'Maximum renewal limit reached or alert is cancelled',
  })
  async renew(
    @Param('id', ParseIntPipe) id: number,
    @User('id') userId: number,
  ): Promise<AlertResponseDto> {
    return this.alertService.renew(id, userId);
  }

  /**
   * POST /alerts/:id/photos - Upload photos for an alert
   * Task 7.5
   */
  @Post(':id/photos')
  @UseGuards(BearerTokenGuard)
  @UseInterceptors(FilesInterceptor('photos', 5))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiOperation({
    summary: 'Upload photos for an alert (max 5 files, 10MB each)',
  })
  @ApiResponse({
    status: 200,
    description: 'Photos uploaded successfully',
    schema: {
      example: {
        photoUrls: [
          'http://localhost:3000/uploads/alerts/1234567890-photo1.jpg',
        ],
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not the alert creator',
  })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async uploadPhotos(
    @Param('id', ParseIntPipe) id: number,
    @User('id') userId: number,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<{ photoUrls: string[] }> {
    // Upload files
    const photoUrls = await this.uploadService.uploadImages(files, 'alerts');

    // Save photo URLs to alert record
    await this.alertService.addPhotos(id, userId, photoUrls);

    return { photoUrls };
  }
}
