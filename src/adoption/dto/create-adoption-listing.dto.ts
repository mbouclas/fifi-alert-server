import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CreatePetDto } from '../../pet/dto/create-pet.dto';

/**
 * Body for creating an adoption listing.
 *
 * Contains the same pet fields as creating a personal pet (minus `isMissing`)
 * plus the listing's location and description. A new Pet row is created and
 * linked to the listing.
 */
export class CreateAdoptionListingDto extends OmitType(CreatePetDto, [
  'isMissing',
] as const) {
  @ApiProperty({
    description: 'Latitude where the pet is available for adoption',
    example: 35.1856,
    minimum: -90,
    maximum: 90,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({
    description: 'Longitude where the pet is available for adoption',
    example: 33.3823,
    minimum: -180,
    maximum: 180,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon: number;

  @ApiPropertyOptional({
    description: 'Human-readable address or area shown to adopters',
    example: 'Nicosia, Cyprus',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  locationAddress?: string;

  @ApiPropertyOptional({
    description: 'Free-text description of the pet and adoption conditions',
    example: 'Friendly 2-year-old, vaccinated and neutered. Good with kids.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
