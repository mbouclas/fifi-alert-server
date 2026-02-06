import { ApiProperty } from '@nestjs/swagger';
import {
    IsNotEmpty,
    IsString,
    IsNumber,
    IsBoolean,
    IsOptional,
    Min,
    Max,
    MaxLength,
    MinLength,
} from 'class-validator';

/**
 * DTO for creating a saved zone
 */
export class CreateSavedZoneDto {
    @ApiProperty({
        description: 'Zone name',
        example: 'Home',
        minLength: 1,
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @MaxLength(50)
    name: string;

    @ApiProperty({
        description: 'Latitude of zone center',
        example: 37.7749,
        minimum: -90,
        maximum: 90,
    })
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude: number;

    @ApiProperty({
        description: 'Longitude of zone center',
        example: -122.4194,
        minimum: -180,
        maximum: 180,
    })
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude: number;

    @ApiProperty({
        description: 'Radius in kilometers',
        example: 2.5,
        minimum: 1,
        maximum: 20,
    })
    @IsNumber()
    @Min(1)
    @Max(20)
    radius_km: number;

    @ApiProperty({
        description: 'Zone priority (higher = higher priority notifications)',
        example: 1,
        default: 1,
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(10)
    priority?: number;

    @ApiProperty({
        description: 'Whether zone is active',
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}

/**
 * DTO for updating a saved zone
 */
export class UpdateSavedZoneDto {
    @ApiProperty({
        description: 'Zone name',
        example: 'Home',
        required: false,
        minLength: 1,
        maxLength: 50,
    })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(50)
    name?: string;

    @ApiProperty({
        description: 'Radius in kilometers',
        example: 2.5,
        required: false,
        minimum: 1,
        maximum: 20,
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(20)
    radius_km?: number;

    @ApiProperty({
        description: 'Zone priority',
        required: false,
        minimum: 1,
        maximum: 10,
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(10)
    priority?: number;

    @ApiProperty({
        description: 'Whether zone is active',
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}

/**
 * Response DTO for saved zone data
 */
export class SavedZoneResponseDto {
    @ApiProperty({
        description: 'Unique zone ID',
        example: 'cuid-zone-123',
    })
    id: string;

    @ApiProperty({
        description: 'Device ID',
        example: 'cuid-device-123',
    })
    device_id: string;

    @ApiProperty({
        description: 'Zone name',
        example: 'Home',
    })
    name: string;

    @ApiProperty({
        description: 'Latitude of zone center',
        example: 37.7749,
    })
    latitude: number;

    @ApiProperty({
        description: 'Longitude of zone center',
        example: -122.4194,
    })
    longitude: number;

    @ApiProperty({
        description: 'Radius in kilometers',
        example: 2.5,
    })
    radius_km: number;

    @ApiProperty({
        description: 'Zone priority',
        example: 1,
    })
    priority: number;

    @ApiProperty({
        description: 'Whether zone is active',
    })
    is_active: boolean;

    @ApiProperty({
        description: 'When zone was created',
    })
    created_at: Date;

    @ApiProperty({
        description: 'Last update timestamp',
    })
    updated_at: Date;
}
