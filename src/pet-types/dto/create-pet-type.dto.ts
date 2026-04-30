import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

/**
 * DTO for creating a pet type.
 */
export class CreatePetTypeDto {
  @ApiProperty({
    description: 'Display name for the pet type',
    example: 'Dog',
  })
  @IsString({ message: 'Name must be a string' })
  @Length(1, 100, { message: 'Name must be between 1 and 100 characters' })
  name: string;

  @ApiProperty({
    description: 'URL-friendly slug for the pet type',
    example: 'dog',
  })
  @IsString({ message: 'Slug must be a string' })
  @Length(1, 100, { message: 'Slug must be between 1 and 100 characters' })
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @ApiPropertyOptional({
    description: 'Manual display order for the pet type',
    example: 10,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Order must be an integer' })
  @Min(0, { message: 'Order must be greater than or equal to 0' })
  order?: number;
}
