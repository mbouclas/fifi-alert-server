import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertStatus, PetSpecies } from '../../generated/prisma';

/**
 * Alert Response DTO
 * Response format for alert data returned from API
 */
export class AlertResponseDto {
  @ApiProperty({ description: 'Alert ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Creator user ID', example: 42 })
  creatorId: number;

  @ApiPropertyOptional({
    description: 'Associated pet ID (if linked to registered pet)',
    example: 5,
  })
  petId?: number;

  // Pet Details
  @ApiProperty({ description: 'Pet name', example: 'Max' })
  petName: string;

  @ApiProperty({
    enum: PetSpecies,
    description: 'Pet species',
    example: PetSpecies.DOG,
  })
  petSpecies: PetSpecies;

  @ApiPropertyOptional({
    description: 'Pet breed',
    example: 'Golden Retriever',
  })
  petBreed?: string;

  @ApiProperty({ description: 'Pet description' })
  petDescription: string;

  @ApiPropertyOptional({ description: 'Pet color', example: 'Golden' })
  petColor?: string;

  @ApiPropertyOptional({ description: 'Pet age in years', example: 3 })
  petAgeYears?: number;

  @ApiProperty({ description: 'Pet photo URLs', type: [String] })
  petPhotos: string[];

  // Location Details
  @ApiProperty({ description: 'Last seen latitude', example: 37.7749 })
  lastSeenLat: number;

  @ApiProperty({ description: 'Last seen longitude', example: -122.4194 })
  lastSeenLon: number;

  @ApiPropertyOptional({
    description: 'Last seen address',
    example: '123 Market St, San Francisco, CA 94102',
  })
  locationAddress?: string;

  @ApiProperty({ description: 'Alert radius in kilometers', example: 5.0 })
  alertRadiusKm: number;

  // Lifecycle
  @ApiProperty({
    enum: AlertStatus,
    description: 'Alert status',
    example: AlertStatus.ACTIVE,
  })
  status: AlertStatus;

  @ApiProperty({
    description: 'When pet was last seen',
    example: '2026-02-05T10:30:00Z',
  })
  timeLastSeen: Date;

  @ApiProperty({
    description: 'When alert was created',
    example: '2026-02-05T10:35:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When alert was last updated',
    example: '2026-02-05T10:35:00Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'When alert expires',
    example: '2026-02-12T10:35:00Z',
  })
  expiresAt: Date;

  @ApiPropertyOptional({ description: 'When alert was resolved' })
  resolvedAt?: Date;

  @ApiProperty({
    description: 'Number of times alert has been renewed',
    example: 0,
  })
  renewalCount: number;

  // Contact (conditional based on permissions)
  @ApiPropertyOptional({
    description: 'Contact phone (if public or requester is creator)',
  })
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'Contact email (if requester is creator)',
  })
  contactEmail?: string;

  @ApiProperty({
    description: 'Whether phone is publicly visible',
    example: false,
  })
  isPhonePublic: boolean;

  // Metadata
  @ApiProperty({ description: 'Affected postal codes', type: [String] })
  affectedPostalCodes: string[];

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes?: string;

  @ApiProperty({ description: 'Whether reward is offered', example: true })
  rewardOffered: boolean;

  @ApiPropertyOptional({ description: 'Reward amount (USD)', example: 500.0 })
  rewardAmount?: number;

  // Distance (included in search results)
  @ApiPropertyOptional({
    description: 'Distance from search location (km)',
    example: 2.5,
  })
  distanceKm?: number;

  // Counts
  @ApiPropertyOptional({
    description: 'Number of sightings reported',
    example: 3,
  })
  sightingCount?: number;

  @ApiPropertyOptional({
    description: 'Estimated number of devices that will receive notification',
    example: 1250,
  })
  estimatedReach?: number;
}
