import { ApiProperty } from '@nestjs/swagger';
import {
    IsNotEmpty,
    IsNumber,
    IsString,
    IsOptional,
    IsEnum,
    IsDateString,
    ValidateNested,
    Min,
    Max,
    IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationConfidence } from '@prisma/client';

/**
 * Location details for a sighting
 */
export class SightingLocationDto {
    @ApiProperty({
        description: 'Latitude in decimal degrees',
        example: 37.7749,
        minimum: -90,
        maximum: 90,
    })
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude: number;

    @ApiProperty({
        description: 'Longitude in decimal degrees',
        example: -122.4194,
        minimum: -180,
        maximum: 180,
    })
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude: number;

    @ApiProperty({
        description: 'Human-readable address',
        example: '123 Main St, San Francisco, CA',
    })
    @IsString()
    @IsNotEmpty()
    address: string;
}

/**
 * DTO for creating a sighting report
 */
export class CreateSightingDto {
    @ApiProperty({
        description: 'Alert ID this sighting is for',
        example: 'cuid-abc-123',
    })
    @IsString()
    @IsNotEmpty()
    alert_id: string;

    @ApiProperty({
        description: 'Location where the pet was sighted',
        type: SightingLocationDto,
    })
    @ValidateNested()
    @Type(() => SightingLocationDto)
    location: SightingLocationDto;

    @ApiProperty({
        description: 'URL to uploaded photo (optional)',
        example: 'https://storage.fifi-alert.com/sightings/photo123.jpg',
        required: false,
    })
    @IsOptional()
    @IsUrl()
    photo?: string;

    @ApiProperty({
        description: 'Additional notes from the reporter',
        example: 'Saw a golden retriever matching the description near the park',
        required: false,
    })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiProperty({
        description: 'Confidence level of the sighting',
        enum: NotificationConfidence,
        default: NotificationConfidence.MEDIUM,
    })
    @IsEnum(NotificationConfidence)
    confidence: NotificationConfidence;

    @ApiProperty({
        description: 'When the sighting occurred (ISO 8601)',
        example: '2026-02-05T14:30:00Z',
    })
    @IsDateString()
    sighting_time: string;

    @ApiProperty({
        description: 'Direction the pet was heading (optional)',
        example: 'Heading north towards Golden Gate Park',
        required: false,
    })
    @IsOptional()
    @IsString()
    direction?: string;
}
