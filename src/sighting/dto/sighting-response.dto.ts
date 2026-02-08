import { ApiProperty } from '@nestjs/swagger';
import { NotificationConfidence } from '@prisma/client';

/**
 * Response DTO for sighting data
 */
export class SightingResponseDto {
  @ApiProperty({
    description: 'Unique sighting ID',
    example: 'cuid-sighting-123',
  })
  id: string;

  @ApiProperty({
    description: 'Alert ID this sighting is for',
    example: 'cuid-alert-123',
  })
  alert_id: string;

  @ApiProperty({
    description: 'User ID of the person who reported the sighting',
    example: 'cuid-user-123',
  })
  reported_by: string;

  @ApiProperty({
    description: 'Latitude in decimal degrees',
    example: 37.7749,
  })
  latitude: number;

  @ApiProperty({
    description: 'Longitude in decimal degrees',
    example: -122.4194,
  })
  longitude: number;

  @ApiProperty({
    description: 'Human-readable address',
    example: '123 Main St, San Francisco, CA',
  })
  address: string;

  @ApiProperty({
    description: 'URL to uploaded photo (optional)',
    example: 'https://storage.fifi-alert.com/sightings/photo123.jpg',
    required: false,
  })
  photo: string | null;

  @ApiProperty({
    description: 'Additional notes from the reporter',
    required: false,
  })
  notes: string | null;

  @ApiProperty({
    description: 'Confidence level of the sighting',
    enum: NotificationConfidence,
  })
  confidence: NotificationConfidence;

  @ApiProperty({
    description: 'When the sighting occurred',
    example: '2026-02-05T14:30:00Z',
  })
  sighting_time: Date;

  @ApiProperty({
    description: 'Direction the pet was heading',
    required: false,
  })
  direction: string | null;

  @ApiProperty({
    description: 'Whether this sighting was dismissed by the alert creator',
  })
  dismissed: boolean;

  @ApiProperty({
    description: 'When the sighting was dismissed',
    required: false,
  })
  dismissed_at: Date | null;

  @ApiProperty({
    description: 'Reason for dismissing the sighting',
    required: false,
  })
  dismissed_reason: string | null;

  @ApiProperty({
    description: 'When the sighting was reported',
    example: '2026-02-05T14:35:00Z',
  })
  created_at: Date;

  @ApiProperty({
    description: 'Last update timestamp',
  })
  updated_at: Date;
}
