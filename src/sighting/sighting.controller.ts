import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  ParseIntPipe,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { SightingService } from './sighting.service';
import {
  CreateSightingDto,
  SightingResponseDto,
  DismissSightingDto,
  UploadSightingPhotosDto,
  SightingPhotoUploadResponseDto,
} from './dto';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { Session } from '../decorators/session.decorator';
import { UploadService } from '../upload/upload.service';
import { ImageUploadOptions } from '../upload/upload.service';
import {
  getMaxSightingPhotos,
  getSightingPhotoUploadWindowHours,
} from '../config/sighting.config';
import { getMaxFileSize } from '../config/upload.config';

/**
 * Sighting photos are re-encoded to web-sized JPEG with EXIF (incl. GPS)
 * stripped and stored under a random name, never the device filename.
 */
const sightingPhotoUploadOptions: ImageUploadOptions = {
  webOptimise: true,
  randomPublicId: true,
};

/** multer limits shared by both photo upload routes. Oversize parts get 413. */
const sightingPhotoMulterOptions = {
  limits: { fileSize: getMaxFileSize() },
};

const PHOTO_UPLOAD_THROTTLE = { default: { limit: 10, ttl: 60000 } };

/**
 * No global ValidationPipe is registered in main.ts, so DTO decorators only
 * take effect where a pipe is applied explicitly. `transform` is required so
 * `@Type(() => Number)` coerces `alert_id` before it reaches Prisma.
 */
const bodyValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
});

@ApiTags('Sightings')
@Controller('sightings')
@UseGuards(BearerTokenGuard)
@ApiBearerAuth()
export class SightingController {
  constructor(
    private readonly sightingService: SightingService,
    private readonly uploadService: UploadService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Report a sighting',
    description:
      'Report a sighting of a missing pet. The alert must be in ACTIVE status. The alert creator will be notified.',
  })
  @ApiResponse({
    status: 201,
    description: 'Sighting reported successfully',
    type: SightingResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or alert not active',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async create(
    @Body(bodyValidationPipe) dto: CreateSightingDto,
    @Session() session: any,
  ): Promise<SightingResponseDto> {
    return this.sightingService.create(dto, session.userId);
  }

  @Get('alert/:alertId')
  @ApiOperation({
    summary: 'Get sightings for an alert',
    description:
      'Retrieve all sightings for a specific alert. Non-creators cannot see dismissed sightings. Returns sightings ordered by sighting time (newest first).',
  })
  @ApiParam({
    name: 'alertId',
    description: 'Alert ID',
    example: 42,
  })
  @ApiResponse({
    status: 200,
    description: 'Sightings retrieved successfully',
    type: [SightingResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async findByAlert(
    @Param('alertId', ParseIntPipe) alertId: number,
    @Session() session: any,
  ): Promise<SightingResponseDto[]> {
    return this.sightingService.findByAlert(alertId, session.userId);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dismiss a sighting',
    description:
      'Mark a sighting as dismissed. Only the alert creator can dismiss sightings. Dismissed sightings are hidden from public view.',
  })
  @ApiParam({
    name: 'id',
    description: 'Sighting ID',
    example: 101,
  })
  @ApiResponse({
    status: 200,
    description: 'Sighting dismissed successfully',
    type: SightingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Sighting already dismissed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Only alert creator can dismiss sightings',
  })
  @ApiResponse({ status: 404, description: 'Sighting not found' })
  async dismiss(
    @Param('id', ParseIntPipe) id: number,
    @Body(bodyValidationPipe) dto: DismissSightingDto,
    @Session() session: any,
  ): Promise<SightingResponseDto> {
    return this.sightingService.dismiss(id, dto, session.userId);
  }

  /**
   * POST /sightings/:id/photos - Attach photos to a sighting
   *
   * Only the reporter may upload, and only within
   * SIGHTING_PHOTO_UPLOAD_WINDOW_HOURS of creating the sighting while the
   * alert is ACTIVE. URLs are persisted on the sighting by this call; there is
   * no follow-up PUT.
   */
  @Post(':id/photos')
  @Throttle(PHOTO_UPLOAD_THROTTLE)
  @UseInterceptors(
    FilesInterceptor(
      'photos',
      getMaxSightingPhotos(),
      sightingPhotoMulterOptions,
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadSightingPhotosDto })
  @ApiParam({ name: 'id', description: 'Sighting ID', example: 101 })
  @ApiOperation({
    summary: 'Upload photos for a sighting',
    description:
      `Attach 1 to ${getMaxSightingPhotos()} image files (MAX_SIGHTING_PHOTOS) to a sighting reported by the authenticated user, ` +
      `within ${getSightingPhotoUploadWindowHours()} hours of reporting and while the alert is ACTIVE. ` +
      'Accepted: JPEG, PNG, WebP, HEIC/HEIF (bytes are sniffed, the content-type header is not trusted), max 10MB each. ' +
      'Images are auto-oriented, resized to 1600px max edge, re-encoded to JPEG and stripped of EXIF/GPS. ' +
      'The returned URLs are persisted on the sighting (`photos`, and `photo` = first entry) by this call.',
  })
  @ApiResponse({
    status: 201,
    description: 'Photos uploaded and persisted on the sighting',
    type: SightingPhotoUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Zero files, unsupported type, file over the size limit, or more files than the sighting can still hold',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description:
      'Caller is not the reporter, the upload window has closed, or the alert is no longer active',
  })
  @ApiResponse({ status: 404, description: 'Sighting not found' })
  @ApiResponse({
    status: 413,
    description: 'A file exceeded the size limit (rejected before buffering)',
  })
  async uploadPhotos(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<SightingPhotoUploadResponseDto> {
    const userId = session.userId;
    const incoming = files ?? [];

    await this.sightingService.authorizePhotoUpload(
      id,
      userId,
      incoming.length,
    );

    const photoUrls = await this.uploadService.uploadImages(
      incoming,
      `sightings/${id}`,
      getMaxSightingPhotos(),
      sightingPhotoUploadOptions,
    );

    await this.sightingService.appendPhotos(id, photoUrls, userId);

    return { photoUrls };
  }

  /**
   * POST /sightings/:id/photo - Upload a single photo for a sighting
   *
   * Legacy single-file form of `POST /sightings/:id/photos`, kept for the
   * Android client. Same authorization, limits and processing.
   */
  @Post(':id/photo')
  @Throttle(PHOTO_UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('photo', sightingPhotoMulterOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: {
        photo: {
          type: 'string',
          format: 'binary',
          description:
            'Single image file (JPEG, PNG, WebP, HEIC/HEIF; max 10MB)',
        },
      },
    },
  })
  @ApiParam({ name: 'id', description: 'Sighting ID', example: 101 })
  @ApiOperation({
    summary: 'Upload a single photo for a sighting (legacy)',
    description:
      'Single-file variant of POST /sightings/{id}/photos with the same rules. Prefer the plural endpoint.',
    deprecated: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Photo uploaded and persisted on the sighting',
    schema: {
      example: {
        photoUrl:
          'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/sightings/101/5f1c2c8e.jpg',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Not the reporter, window closed, or alert not active',
  })
  @ApiResponse({ status: 404, description: 'Sighting not found' })
  async uploadPhoto(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ photoUrl: string }> {
    const userId = session.userId;

    if (!file) {
      throw new BadRequestException('At least one photo file is required');
    }

    await this.sightingService.authorizePhotoUpload(id, userId, 1);

    const photoUrl = await this.uploadService.uploadImage(
      file,
      `sightings/${id}`,
      sightingPhotoUploadOptions,
    );

    await this.sightingService.appendPhotos(id, [photoUrl], userId);

    return { photoUrl };
  }
}
