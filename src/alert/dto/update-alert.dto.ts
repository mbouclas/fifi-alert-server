import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsUrl,
  MaxLength,
  ArrayMaxSize,
  IsOptional,
} from 'class-validator';
import { PetDetailsDto, ContactDetailsDto } from './create-alert.dto';

/**
 * Update Alert DTO
 * Allows partial updates to pet description, photos, contact info, and notes only.
 * Location and radius cannot be changed after creation.
 */
export class UpdateAlertDto {
  @ApiPropertyOptional({
    description: 'Updated pet description',
    example:
      'Updated: Friendly golden retriever, responds to "Max". Now wearing a red collar.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  petDescription?: string;

  @ApiPropertyOptional({
    description: 'Additional photo URLs to append',
    type: [String],
    example: ['https://example.com/new-photo.jpg'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  petPhotos?: string[];

  @ApiPropertyOptional({
    description: 'Updated contact phone number',
    example: '+14155550202',
  })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'Updated contact email',
    example: 'newemail@example.com',
  })
  @IsOptional()
  @IsString()
  contactEmail?: string;

  @ApiPropertyOptional({
    description: 'Updated notes',
    example: 'Update: Max was spotted near Golden Gate Park.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
