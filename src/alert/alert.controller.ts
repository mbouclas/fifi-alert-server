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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AlertService } from './alert.service';
import {
  CreateAlertDto,
  UpdateAlertDto,
  ResolveAlertDto,
  ListAlertsQueryDto,
  AlertResponseDto,
} from './dto';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { User } from '../decorators/user.decorator';
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
   * GET /alerts/:id - View a specific alert
   * Task 2.11
   */
  @Get(':id')
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiOperation({ summary: 'Get alert by ID' })
  @ApiResponse({
    status: 200,
    description: 'Alert found',
    type: AlertResponseDto,
  })
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
  @ApiOperation({ summary: 'Search for alerts by location' })
  @ApiResponse({
    status: 200,
    description: 'Alerts found',
    type: [AlertResponseDto],
  })
  async findAll(
    @Query() query: ListAlertsQueryDto,
  ): Promise<AlertResponseDto[]> {
    return this.alertService.findNearby(query);
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
  @UseGuards(BearerTokenGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiOperation({ summary: 'Mark an alert as resolved' })
  @ApiResponse({
    status: 200,
    description: 'Alert resolved successfully',
    type: AlertResponseDto,
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
  @ApiResponse({ status: 422, description: 'Maximum renewal limit reached' })
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
