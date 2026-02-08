import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating a new alert zone.
 * Alert zones are user-scoped geographic areas where users want to receive notifications.
 */
export class CreateAlertZoneDto {
  @ApiProperty({
    description: 'Name of the alert zone',
    example: 'Home',
    minLength: 1,
    maxLength: 50,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({
    description: 'Latitude of the zone center',
    example: 37.7749,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({
    description: 'Longitude of the zone center',
    example: -122.4194,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({
    description: 'Radius of the zone in meters',
    example: 500,
    minimum: 50,
    maximum: 5000,
  })
  @IsNumber()
  @Min(50)
  @Max(5000)
  radius_meters: number;

  @ApiPropertyOptional({
    description: 'Priority of the zone (higher = checked first)',
    example: 1,
    minimum: 0,
    maximum: 10,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({
    description: 'Whether the zone is active',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/**
 * DTO for updating an existing alert zone.
 * All fields are optional.
 */
export class UpdateAlertZoneDto {
  @ApiPropertyOptional({
    description: 'Name of the alert zone',
    example: 'Home',
    minLength: 1,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({
    description: 'Latitude of the zone center',
    example: 37.7749,
    minimum: -90,
    maximum: 90,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude of the zone center',
    example: -122.4194,
    minimum: -180,
    maximum: 180,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Radius of the zone in meters',
    example: 500,
    minimum: 50,
    maximum: 5000,
  })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(5000)
  radius_meters?: number;

  @ApiPropertyOptional({
    description: 'Priority of the zone (higher = checked first)',
    example: 1,
    minimum: 0,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({
    description: 'Whether the zone is active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/**
 * Response DTO for alert zone data.
 * Includes computed radius_km for UI display.
 */
export class AlertZoneResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the alert zone',
    example: 123,
  })
  id: number;

  @ApiProperty({
    description: 'Name of the alert zone',
    example: 'Home',
  })
  name: string;

  @ApiProperty({
    description: 'Latitude of the zone center',
    example: 37.7749,
  })
  latitude: number;

  @ApiProperty({
    description: 'Longitude of the zone center',
    example: -122.4194,
  })
  longitude: number;

  @ApiProperty({
    description: 'Radius of the zone in meters',
    example: 500,
  })
  radius_meters: number;

  @ApiProperty({
    description: 'Radius of the zone in kilometers (computed for UI)',
    example: 0.5,
  })
  radius_km: number;

  @ApiProperty({
    description: 'Whether the zone is active',
    example: true,
  })
  is_active: boolean;

  @ApiProperty({
    description: 'Priority of the zone',
    example: 1,
  })
  priority: number;

  @ApiProperty({
    description: 'Timestamp when the zone was created',
    example: '2026-02-08T10:30:00Z',
  })
  created_at: Date;

  @ApiProperty({
    description: 'Timestamp when the zone was last updated',
    example: '2026-02-08T10:30:00Z',
  })
  updated_at: Date;
}
