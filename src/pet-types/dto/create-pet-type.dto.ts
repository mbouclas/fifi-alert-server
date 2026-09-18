import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { IsTranslations } from '../../i18n/validators/is-translations.validator';

/**
 * DTO for creating a pet type.
 */
export class CreatePetTypeDto {
  @ApiProperty({
    description:
      'Display names keyed by language code. Must include the default language; keys must be active languages.',
    example: { el: 'Σκύλος', en: 'Dog' },
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsTranslations({ maxLength: 100 })
  translations: Record<string, string>;

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
