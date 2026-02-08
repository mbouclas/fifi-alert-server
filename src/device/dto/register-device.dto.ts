import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  ValidateNested,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DevicePlatform, LocationSource } from '@prisma/client';

/**
 * GPS location data
 */
export class GpsLocationDto {
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
    description: 'GPS accuracy in meters',
    example: 15.5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;
}

/**
 * Location information for device registration
 */
export class DeviceLocationDto {
  @ApiProperty({
    description: 'GPS location data (if available)',
    type: GpsLocationDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GpsLocationDto)
  gps?: GpsLocationDto;

  @ApiProperty({
    description: 'IP address for geolocation fallback',
    example: '192.168.1.100',
    required: false,
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiProperty({
    description: 'Postal/ZIP codes for geofencing (up to 5)',
    example: ['94102', '94103'],
    required: false,
    maxItems: 5,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  postalCodes?: string[];
}

/**
 * DTO for device registration
 */
export class RegisterDeviceDto {
  @ApiProperty({
    description: 'Unique device identifier (UUID format recommended)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  device_uuid: string;

  @ApiProperty({
    description: 'Device platform',
    enum: DevicePlatform,
    example: DevicePlatform.IOS,
  })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @ApiProperty({
    description: 'Operating system version',
    example: '17.2',
  })
  @IsString()
  @IsNotEmpty()
  os_version: string;

  @ApiProperty({
    description: 'App version',
    example: '1.0.5',
  })
  @IsString()
  @IsNotEmpty()
  app_version: string;

  @ApiProperty({
    description: 'Push notification token (FCM for Android, APNs for iOS)',
    example: 'ePEzOxMfT0KP...',
    required: false,
  })
  @IsOptional()
  @IsString()
  push_token?: string;

  @ApiProperty({
    description: 'Location information',
    type: DeviceLocationDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceLocationDto)
  location?: DeviceLocationDto;
}
