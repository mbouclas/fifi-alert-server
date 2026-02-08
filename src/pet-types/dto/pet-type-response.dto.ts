import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for pet type responses.
 */
export class PetTypeResponseDto {
  @ApiProperty({
    description: 'Pet type ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Display name for the pet type',
    example: 'Dog',
  })
  name: string;

  @ApiProperty({
    description: 'URL-friendly slug for the pet type',
    example: 'dog',
  })
  slug: string;

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
