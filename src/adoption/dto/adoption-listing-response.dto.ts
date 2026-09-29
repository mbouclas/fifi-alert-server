import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdoptionStatus } from '@prisma-lib/client';
import { PetResponseDto } from '../../pet/dto/pet-response.dto';

/**
 * Minimal public view of the listing owner. No contact details are exposed
 * because listings can be read without a logged-in user.
 */
export class AdoptionOwnerDto {
  @ApiProperty({ description: 'Owner user ID', example: 123 })
  id: number;

  @ApiPropertyOptional({ description: 'Owner display name', example: 'Maria' })
  name?: string;
}

export class AdoptionListingResponseDto {
  @ApiProperty({ description: 'Listing ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Linked pet ID', example: 42 })
  petId: number;

  @ApiProperty({
    description: 'Listing status',
    enum: AdoptionStatus,
    enumName: 'AdoptionStatus',
    example: 'AVAILABLE',
  })
  status: AdoptionStatus;

  @ApiProperty({ description: 'Latitude', example: 35.1856 })
  lat: number;

  @ApiProperty({ description: 'Longitude', example: 33.3823 })
  lon: number;

  @ApiPropertyOptional({
    description: 'Human-readable address or area',
    example: 'Nicosia, Cyprus',
  })
  locationAddress?: string;

  @ApiPropertyOptional({
    description: 'Description of the pet and adoption conditions',
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'When the pet was marked as adopted',
    example: '2026-10-01T12:00:00.000Z',
  })
  adoptedAt?: Date;

  @ApiPropertyOptional({
    description:
      'Distance from the requested lat/lon in km. Only present on radius searches.',
    example: 3.2,
  })
  distanceKm?: number;

  @ApiProperty({
    description:
      'The pet offered for adoption. petType.name is localised via lang / Accept-Language.',
    type: PetResponseDto,
  })
  pet: PetResponseDto;

  @ApiProperty({ description: 'Listing owner', type: AdoptionOwnerDto })
  owner: AdoptionOwnerDto;

  @ApiProperty({ description: 'Creation timestamp' })
  created_at: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updated_at: Date;
}

export class PaginatedAdoptionListingsResponseDto {
  @ApiProperty({ type: [AdoptionListingResponseDto] })
  data: AdoptionListingResponseDto[];

  @ApiProperty({
    description: 'Total listings matching the filters',
    example: 57,
  })
  total: number;

  @ApiProperty({ description: 'Page size used', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Offset used', example: 0 })
  offset: number;
}
