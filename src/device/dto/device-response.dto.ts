import { ApiProperty } from '@nestjs/swagger';
import { DevicePlatform, LocationSource } from '@prisma/client';

/**
 * Location status information
 */
export class LocationStatusDto {
  @ApiProperty({
    description: 'Whether GPS location is available',
  })
  hasGps: boolean;

  @ApiProperty({
    description: 'GPS age in hours (if available)',
    required: false,
  })
  gpsAgeHours?: number;

  @ApiProperty({
    description: 'GPS freshness: fresh (<2h), stale (<24h), old (>24h)',
    enum: ['fresh', 'stale', 'old', 'none'],
  })
  gpsFreshness: 'fresh' | 'stale' | 'old' | 'none';

  @ApiProperty({
    description: 'Whether IP-based location is available',
  })
  hasIpLocation: boolean;

  @ApiProperty({
    description: 'Number of postal codes configured',
  })
  postalCodeCount: number;

  @ApiProperty({
    description: 'Number of saved zones configured',
  })
  savedZoneCount: number;

  @ApiProperty({
    description: 'Primary location source',
    enum: LocationSource,
  })
  primarySource: LocationSource;
}

/**
 * Response DTO for device data
 */
export class DeviceResponseDto {
  @ApiProperty({
    description: 'Unique device ID',
    example: 'cuid-device-123',
  })
  id: string;

  @ApiProperty({
    description: 'User ID who owns this device',
    example: 'cuid-user-123',
  })
  user_id: string;

  @ApiProperty({
    description: 'Device UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  device_uuid: string;

  @ApiProperty({
    description: 'Device platform',
    enum: DevicePlatform,
  })
  platform: DevicePlatform;

  @ApiProperty({
    description: 'Operating system version',
    example: '17.2',
  })
  os_version: string;

  @ApiProperty({
    description: 'App version',
    example: '1.0.5',
  })
  app_version: string;

  @ApiProperty({
    description: 'GPS latitude (if available)',
    required: false,
  })
  gps_latitude?: number | null;

  @ApiProperty({
    description: 'GPS longitude (if available)',
    required: false,
  })
  gps_longitude?: number | null;

  @ApiProperty({
    description: 'GPS accuracy in meters (if available)',
    required: false,
  })
  gps_accuracy?: number | null;

  @ApiProperty({
    description: 'When GPS was last updated',
    required: false,
  })
  gps_updated_at?: Date | null;

  @ApiProperty({
    description: 'IP address',
    required: false,
  })
  ip_address?: string | null;

  @ApiProperty({
    description: 'IP-based latitude',
    required: false,
  })
  ip_latitude?: number | null;

  @ApiProperty({
    description: 'IP-based longitude',
    required: false,
  })
  ip_longitude?: number | null;

  @ApiProperty({
    description: 'Postal/ZIP codes for geofencing',
    type: [String],
  })
  postal_codes: string[];

  @ApiProperty({
    description: 'Push notification token',
    required: false,
  })
  push_token?: string | null;

  @ApiProperty({
    description: 'When push token was last updated',
    required: false,
  })
  push_token_updated_at?: Date | null;

  @ApiProperty({
    description: 'When app was last opened',
  })
  last_app_open: Date;

  @ApiProperty({
    description: 'Location status information',
    type: LocationStatusDto,
  })
  location_status: LocationStatusDto;

  @ApiProperty({
    description: 'When device was registered',
  })
  created_at: Date;

  @ApiProperty({
    description: 'Last update timestamp',
  })
  updated_at: Date;
}
