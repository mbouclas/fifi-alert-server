import {
    Controller,
    Post,
    Get,
    Patch,
    Delete,
    Body,
    Param,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
} from '@nestjs/swagger';
import { DeviceService } from './device.service';
import { SavedZoneService } from './saved-zone.service';
import {
    RegisterDeviceDto,
    UpdateLocationDto,
    DeviceResponseDto,
    CreateSavedZoneDto,
    UpdateSavedZoneDto,
    SavedZoneResponseDto,
} from './dto';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { Session } from '../decorators/session.decorator';

@ApiTags('Devices')
@Controller('devices')
@UseGuards(BearerTokenGuard)
@ApiBearerAuth()
export class DeviceController {
    constructor(
        private readonly deviceService: DeviceService,
        private readonly savedZoneService: SavedZoneService,
    ) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Register or update a device',
        description:
            'Register a new device or update an existing device. This is an idempotent operation - calling with the same device_uuid will update the existing device.',
    })
    @ApiResponse({
        status: 201,
        description: 'Device registered successfully',
        type: DeviceResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Invalid input' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async register(
        @Body() dto: RegisterDeviceDto,
        @Session() session: any,
    ): Promise<DeviceResponseDto> {
        return this.deviceService.register(dto, session.userId);
    }

    @Get()
    @ApiOperation({
        summary: 'Get all devices for current user',
        description: 'Retrieve all devices registered to the current user, ordered by last app open.',
    })
    @ApiResponse({
        status: 200,
        description: 'Devices retrieved successfully',
        type: [DeviceResponseDto],
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async findAll(@Session() session: any): Promise<DeviceResponseDto[]> {
        return this.deviceService.findByUserId(session.userId);
    }

    @Patch(':id/location')
    @ApiOperation({
        summary: 'Update device location',
        description:
            'Update GPS coordinates and/or postal codes for a device. Only the device owner can update location.',
    })
    @ApiParam({
        name: 'id',
        description: 'Device ID',
        example: 'cuid-device-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Location updated successfully',
        type: DeviceResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Device not found' })
    async updateLocation(
        @Param('id') id: string,
        @Body() dto: UpdateLocationDto,
        @Session() session: any,
    ): Promise<DeviceResponseDto> {
        return this.deviceService.updateLocation(id, dto, session.userId);
    }

    @Patch(':id/push-token')
    @ApiOperation({
        summary: 'Update push notification token',
        description:
            'Update the push notification token for a device. Used when the token is refreshed by the OS.',
    })
    @ApiParam({
        name: 'id',
        description: 'Device ID',
        example: 'cuid-device-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Push token updated successfully',
        type: DeviceResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Device not found' })
    async updatePushToken(
        @Param('id') id: string,
        @Body() body: { push_token: string },
        @Session() session: any,
    ): Promise<DeviceResponseDto> {
        return this.deviceService.updatePushToken(id, body.push_token, session.userId);
    }

    @Post(':id/saved-zones')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Create a saved zone',
        description:
            'Create a new saved zone for a device. Maximum 5 zones per device. Zones are used for high-priority notifications.',
    })
    @ApiParam({
        name: 'id',
        description: 'Device ID',
        example: 'cuid-device-123',
    })
    @ApiResponse({
        status: 201,
        description: 'Saved zone created successfully',
        type: SavedZoneResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Invalid input or max zones exceeded' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Device not found' })
    async createSavedZone(
        @Param('id') deviceId: string,
        @Body() dto: CreateSavedZoneDto,
        @Session() session: any,
    ): Promise<SavedZoneResponseDto> {
        return this.savedZoneService.create(deviceId, dto, session.userId);
    }

    @Get(':id/saved-zones')
    @ApiOperation({
        summary: 'Get saved zones for a device',
        description: 'Retrieve all saved zones for a device, ordered by priority.',
    })
    @ApiParam({
        name: 'id',
        description: 'Device ID',
        example: 'cuid-device-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Saved zones retrieved successfully',
        type: [SavedZoneResponseDto],
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Device not found' })
    async getSavedZones(
        @Param('id') deviceId: string,
        @Session() session: any,
    ): Promise<SavedZoneResponseDto[]> {
        return this.savedZoneService.findByDevice(deviceId, session.userId);
    }

    @Patch('saved-zones/:zoneId')
    @ApiOperation({
        summary: 'Update a saved zone',
        description: 'Update name, radius, priority, or active status of a saved zone.',
    })
    @ApiParam({
        name: 'zoneId',
        description: 'Saved zone ID',
        example: 'cuid-zone-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Saved zone updated successfully',
        type: SavedZoneResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - not zone owner' })
    @ApiResponse({ status: 404, description: 'Saved zone not found' })
    async updateSavedZone(
        @Param('zoneId') zoneId: string,
        @Body() dto: UpdateSavedZoneDto,
        @Session() session: any,
    ): Promise<SavedZoneResponseDto> {
        return this.savedZoneService.update(zoneId, dto, session.userId);
    }

    @Delete('saved-zones/:zoneId')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Delete a saved zone',
        description: 'Delete a saved zone. This action cannot be undone.',
    })
    @ApiParam({
        name: 'zoneId',
        description: 'Saved zone ID',
        example: 'cuid-zone-123',
    })
    @ApiResponse({
        status: 204,
        description: 'Saved zone deleted successfully',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - not zone owner' })
    @ApiResponse({ status: 404, description: 'Saved zone not found' })
    async deleteSavedZone(
        @Param('zoneId') zoneId: string,
        @Session() session: any,
    ): Promise<void> {
        await this.savedZoneService.delete(zoneId, session.userId);
    }
}

