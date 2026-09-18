import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for pet type responses.
 *
 * `name` is returned in the resolved request language (`?lang=` ->
 * `Accept-Language` -> default). `lang` reports which language was actually
 * used, which may differ from the request when a translation is missing.
 */
export class PetTypeResponseDto {
  @ApiProperty({
    description: 'Pet type ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Display name for the pet type in the resolved language',
    example: 'Σκύλος',
  })
  name: string;

  @ApiProperty({
    description: 'Language code the `name` is in',
    example: 'el',
  })
  lang: string;

  @ApiProperty({
    description: 'URL-friendly slug for the pet type (language independent)',
    example: 'dog',
  })
  slug: string;

  @ApiProperty({
    description: 'Manual display order for the pet type',
    example: 10,
  })
  order: number;

  @ApiPropertyOptional({
    description:
      'All translations keyed by language code. Only present for administrators.',
    example: { el: 'Σκύλος', en: 'Dog' },
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  translations?: Record<string, string>;

  @ApiProperty({
    description: 'Created timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  created_at: Date;

  @ApiProperty({
    description: 'Last updated timestamp',
    example: '2024-01-15T00:00:00.000Z',
  })
  updated_at: Date;
}
