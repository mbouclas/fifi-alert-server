import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsPhoneNumber,
  Min,
  Max,
  MaxLength,
  ValidateNested,
  IsUrl,
  ArrayMaxSize,
  IsDecimal,
  IsInt,
} from 'class-validator';
import { PetSpecies } from '../../generated/prisma';

/**
 * Pet Details DTO
 * Contains information about the missing pet
 */
export class PetDetailsDto {
  @ApiProperty({ description: 'Pet name', example: 'Max' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    enum: PetSpecies,
    description: 'Species of pet',
    example: PetSpecies.DOG,
  })
  @IsEnum(PetSpecies)
  species: PetSpecies;

  @ApiPropertyOptional({
    description: 'Pet breed',
    example: 'Golden Retriever',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  breed?: string;

  @ApiProperty({
    description: 'Detailed description of the pet',
    example:
      'Friendly golden retriever, 3 years old. Wearing a blue collar with tags.',
  })
  @IsString()
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({
    description: 'Pet color',
    example: 'Golden',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @ApiPropertyOptional({
    description: 'Pet age in years',
    example: 3,
    minimum: 0,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  ageYears?: number;

  @ApiPropertyOptional({
    description: 'Array of photo URLs',
    type: [String],
    example: ['https://example.com/photo1.jpg'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  photos?: string[];
}

/**
 * Location Details DTO
 * Contains information about where the pet was last seen
 */
export class LocationDetailsDto {
  @ApiProperty({
    description: 'Latitude (-90 to 90)',
    example: 37.7749,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({
    description: 'Longitude (-180 to 180)',
    example: -122.4194,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon: number;

  @ApiPropertyOptional({
    description: 'Human-readable address',
    example: '123 Market St, San Francisco, CA 94102',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiProperty({
    description: 'When the pet was last seen (ISO 8601 format)',
    example: '2026-02-05T10:30:00Z',
  })
  @IsDateString()
  lastSeenTime: string;

  @ApiProperty({
    description: 'Alert radius in kilometers (1-50)',
    example: 5.0,
    minimum: 1,
    maximum: 50,
    default: 5.0,
  })
  @IsNumber()
  @Min(1)
  @Max(50)
  radiusKm: number = 5.0;
}

/**
 * Contact Details DTO
 * Contains contact information for the alert creator
 */
export class ContactDetailsDto {
  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+14155550101',
  })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Contact email address',
    example: 'owner@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Whether phone number should be publicly visible',
    example: false,
    default: false,
  })
  @IsBoolean()
  isPhonePublic: boolean = false;
}

/**
 * Reward Details DTO
 * Contains information about any reward offered
 */
export class RewardDetailsDto {
  @ApiProperty({
    description: 'Whether a reward is offered',
    example: true,
    default: false,
  })
  @IsBoolean()
  offered: boolean = false;

  @ApiPropertyOptional({
    description: 'Reward amount (USD)',
    example: 500.0,
    minimum: 0,
    maximum: 100000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  amount?: number;
}

/**
 * Create Alert DTO
 * Main DTO for creating a new missing pet alert
 */
export class CreateAlertDto {
  @ApiPropertyOptional({
    description: 'Optional reference to a registered pet in the system',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  petId?: number;

  @ApiProperty({
    description: 'Pet details',
    type: PetDetailsDto,
  })
  @ValidateNested()
  @Type(() => PetDetailsDto)
  pet: PetDetailsDto;

  @ApiProperty({
    description: 'Location details',
    type: LocationDetailsDto,
  })
  @ValidateNested()
  @Type(() => LocationDetailsDto)
  location: LocationDetailsDto;

  @ApiProperty({
    description: 'Contact details',
    type: ContactDetailsDto,
  })
  @ValidateNested()
  @Type(() => ContactDetailsDto)
  contact: ContactDetailsDto;

  @ApiPropertyOptional({
    description: 'Reward details',
    type: RewardDetailsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RewardDetailsDto)
  reward?: RewardDetailsDto;

  @ApiPropertyOptional({
    description: 'Additional notes about the alert',
    example: 'Max ran away during a walk when startled by fireworks.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
