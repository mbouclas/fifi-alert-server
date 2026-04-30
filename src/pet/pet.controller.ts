import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { PetService } from './pet.service';
import {
  CreatePetDto,
  UpdatePetDto,
  PetResponseDto,
  UploadPetPhotosDto,
  PetPhotoUploadResponseDto,
} from './dto';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { Session } from '../decorators/session.decorator';
import { AllowAnonymous } from '../auth/decorators/allow-anonymous.decorator';
import { UploadService } from '../upload/upload.service';

@ApiTags('Pets')
@Controller('pets')
@UseGuards(BearerTokenGuard)
@ApiBearerAuth()
export class PetController {
  constructor(
    private readonly petService: PetService,
    private readonly uploadService: UploadService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new pet',
    description:
      'Register a new pet for the authenticated user. A unique tag ID will be automatically generated.',
  })
  @ApiResponse({
    status: 201,
    description: 'Pet created successfully',
    type: PetResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async create(
    @Body() dto: CreatePetDto,
    @Session() session: any,
  ): Promise<PetResponseDto> {
    const userId = session.userId;
    return this.petService.createPet(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all pets for the authenticated user',
    description: 'Retrieve a list of all pets owned by the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of pets',
    type: [PetResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Session() session: any): Promise<PetResponseDto[]> {
    const userId = session.userId;
    return this.petService.findAllByUser(userId);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiOperation({
    summary: 'Get a pet by ID',
    description: 'Retrieve details of a specific pet. User must own the pet.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pet details',
    type: PetResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your pet' })
  @ApiResponse({ status: 404, description: 'Pet not found' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
  ): Promise<PetResponseDto> {
    const userId = session.userId;
    return this.petService.findOne(id, userId);
  }

  @Get('tag/:tagId')
  @AllowAnonymous() // Public endpoint - no authentication required
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 lookups per minute to prevent abuse
  @ApiParam({ name: 'tagId', description: 'Pet tag ID', example: 'PET7K9X2A' })
  @ApiOperation({
    summary: 'Get a pet by tag ID (public lookup)',
    description:
      'Retrieve pet details using the unique tag ID. This endpoint is useful for finding lost pets. Rate limited to 20 requests per minute.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pet details',
    type: PetResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Pet not found' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - rate limit exceeded',
  })
  async findByTagId(@Param('tagId') tagId: string): Promise<PetResponseDto> {
    return this.petService.findByTagId(tagId);
  }

  @Put(':id')
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiOperation({
    summary: 'Update a pet',
    description: 'Update details of a specific pet. User must own the pet.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pet updated successfully',
    type: PetResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your pet' })
  @ApiResponse({ status: 404, description: 'Pet not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePetDto,
    @Session() session: any,
  ): Promise<PetResponseDto> {
    const userId = session.userId;
    return this.petService.updatePet(id, userId, dto);
  }

  @Post(':id/photos')
  @UseInterceptors(FilesInterceptor('photos', 5))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadPetPhotosDto })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiOperation({
    summary: 'Upload photos for a pet',
    description:
      'Upload image files for a pet owned by the authenticated user. Use the returned public URLs in the photos array when creating or updating pet details.',
  })
  @ApiResponse({
    status: 201,
    description: 'Photos uploaded successfully',
    type: PetPhotoUploadResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your pet' })
  @ApiResponse({ status: 404, description: 'Pet not found' })
  async uploadPhotos(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<PetPhotoUploadResponseDto> {
    const userId = session.userId;

    await this.petService.findOne(id, userId);
    const photoUrls = await this.uploadService.uploadImages(
      files,
      `pets/${id}`,
    );

    return { photoUrls };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiOperation({
    summary: 'Delete a pet',
    description: 'Delete a pet from the system. User must own the pet.',
  })
  @ApiResponse({
    status: 204,
    description: 'Pet deleted successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your pet' })
  @ApiResponse({ status: 404, description: 'Pet not found' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
  ): Promise<void> {
    const userId = session.userId;
    return this.petService.deletePet(id, userId);
  }

  @Patch(':id/missing')
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiOperation({
    summary: 'Mark pet as missing',
    description:
      'Mark a pet as missing. This can trigger alert creation in the future.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pet marked as missing',
    type: PetResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your pet' })
  @ApiResponse({ status: 404, description: 'Pet not found' })
  @ApiResponse({ status: 422, description: 'Pet is already marked as missing' })
  async markAsMissing(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
  ): Promise<PetResponseDto> {
    const userId = session.userId;
    return this.petService.markAsMissing(id, userId);
  }

  @Patch(':id/found')
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiOperation({
    summary: 'Mark pet as found',
    description:
      'Mark a missing pet as found. This can trigger alert resolution in the future.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pet marked as found',
    type: PetResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your pet' })
  @ApiResponse({ status: 404, description: 'Pet not found' })
  @ApiResponse({ status: 422, description: 'Pet is not marked as missing' })
  async markAsFound(
    @Param('id', ParseIntPipe) id: number,
    @Session() session: any,
  ): Promise<PetResponseDto> {
    const userId = session.userId;
    return this.petService.markAsFound(id, userId);
  }
}
