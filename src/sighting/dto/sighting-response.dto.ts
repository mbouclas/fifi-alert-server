import { ApiProperty } from '@nestjs/swagger';
import { NotificationConfidence } from '../../generated/prisma';
import { getMaxSightingPhotos } from '../../config/sighting.config';

/**
 * Response DTO for sighting data
 */
export class SightingResponseDto {
  @ApiProperty({
    description: 'Unique sighting ID',
    example: 101,
  })
  id: number;

  @ApiProperty({
    description: 'Alert ID this sighting is for',
    example: 42,
  })
  alert_id: number;

  @ApiProperty({
    description: 'User ID of the person who reported the sighting',
    example: 7,
  })
  reported_by: number;

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
    required: false,
  })
  address: string | null;

  @ApiProperty({
    description:
      'First photo URL, kept for older clients. Always equals photos[0], or null when the sighting has no photos.',
    example: 'https://storage.fifi-alert.com/sightings/101/photo123.jpg',
    required: false,
    nullable: true,
  })
  photo: string | null;

  @ApiProperty({
    description:
      'Public CDN URLs of all photos attached to the sighting, in upload order. Empty when none. Capped at MAX_SIGHTING_PHOTOS.',
    type: [String],
    maxItems: getMaxSightingPhotos(),
    example: ['https://storage.fifi-alert.com/sightings/101/photo123.jpg'],
  })
  photos: string[];

  @ApiProperty({
    description: 'Additional notes from the reporter',
    required: false,
  })
  notes: string | null;

  @ApiProperty({
    description: 'Confidence level of the sighting',
    enum: NotificationConfidence,
    required: false,
  })
  confidence: string | null;

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
