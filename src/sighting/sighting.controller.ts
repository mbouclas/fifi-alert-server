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
    NotFoundException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
    ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SightingService } from './sighting.service';
import {
    CreateSightingDto,
    SightingResponseDto,
    DismissSightingDto,
} from './dto';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { Session } from '../decorators/session.decorator';
import { UploadService } from '../upload/upload.service';

@ApiTags('Sightings')
@Controller('sightings')
@UseGuards(BearerTokenGuard)
@ApiBearerAuth()
export class SightingController {
    constructor(
        private readonly sightingService: SightingService,
        private readonly uploadService: UploadService,
    ) { }

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
    @ApiResponse({ status: 400, description: 'Invalid input or alert not active' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Alert not found' })
    async create(
        @Body() dto: CreateSightingDto,
        @Session() session: any,
    ): Promise<SightingResponseDto> {
        const sighting = await this.sightingService.create(dto, session.userId);

        // Enrich with coordinates
        const enriched = await this.sightingService.enrichWithCoordinates([
            sighting,
        ]);
        return enriched[0];
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
        example: 'cuid-alert-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Sightings retrieved successfully',
        type: [SightingResponseDto],
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Alert not found' })
    async findByAlert(
        @Param('alertId') alertId: string,
        @Session() session: any,
    ): Promise<SightingResponseDto[]> {
        const sightings = await this.sightingService.findByAlert(
            alertId,
            session.userId,
        );

        // Enrich with coordinates
        return this.sightingService.enrichWithCoordinates(sightings);
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
        example: 'cuid-sighting-123',
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
        @Param('id') id: string,
        @Body() dto: DismissSightingDto,
        @Session() session: any,
    ): Promise<SightingResponseDto> {
        const sighting = await this.sightingService.dismiss(
            id,
            dto,
            session.userId,
        );

        // Enrich with coordinates
        const enriched = await this.sightingService.enrichWithCoordinates([
            sighting,
        ]);
        return enriched[0];
    }

    /**
     * POST /sightings/:id/photo - Upload a photo for a sighting
     * Task 7.6
     */
    @Post(':id/photo')
    @UseInterceptors(FileInterceptor('photo'))
    @ApiConsumes('multipart/form-data')
    @ApiParam({ name: 'id', description: 'Sighting ID (UUID)' })
    @ApiOperation({ summary: 'Upload a photo for a sighting (max 10MB)' })
    @ApiResponse({
        status: 200,
        description: 'Photo uploaded successfully',
        schema: {
            example: {
                photoUrl: 'http://localhost:3000/uploads/sightings/1234567890-photo.jpg',
            },
        },
    })
    @ApiResponse({ status: 400, description: 'Invalid file type or size' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Sighting not found' })
    async uploadPhoto(
        @Param('id') id: string,
        @Session() session: any,
        @UploadedFile() file: Express.Multer.File,
    ): Promise<{ photoUrl: string }> {
        const userId = session.userId;

        // Verify sighting exists
        const sighting = await this.sightingService.findOne(id);
        if (!sighting) {
            throw new NotFoundException(`Sighting with ID ${id} not found`);
        }

        // Upload file
        const photoUrl = await this.uploadService.uploadImage(file, 'sightings');

        // Update sighting record with photo URL
        await this.sightingService.updatePhoto(id, photoUrl);

        return { photoUrl };
    }
}

