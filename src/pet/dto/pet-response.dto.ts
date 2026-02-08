import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, Size } from '@prisma-lib/client';

export class PetTypeResponseDto {
  @ApiProperty({
    description: 'Pet type ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Pet type name',
    example: 'Dog',
  })
  name: string;

  @ApiProperty({
    description: 'Pet type slug',
    example: 'dog',
  })
  slug: string;
}

export class PetResponseDto {
  @ApiProperty({
    description: 'Pet ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Unique pet tag ID (9 characters)',
    example: 'PET7K9X2A',
  })
  tagId: string;

  @ApiProperty({
    description: 'User ID who owns the pet',
    example: 123,
  })
  userId: number;

  @ApiProperty({
    description: 'Pet type ID',
    example: 1,
  })
  petTypeId: number;

  @ApiProperty({
    description: 'Pet type details',
    type: PetTypeResponseDto,
  })
  petType: PetTypeResponseDto;

  @ApiProperty({
    description: 'Name of the pet',
    example: 'Buddy',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Gender of the pet',
    enum: Gender,
    example: 'MALE',
  })
  gender?: Gender;

  @ApiPropertyOptional({
    description: 'Array of photo URLs',
    type: [String],
    example: ['https://example.com/photo1.jpg'],
  })
  photos?: string[];

  @ApiPropertyOptional({
    description: 'Size of the pet',
    enum: Size,
    example: 'MEDIUM',
  })
  size?: Size;

  @ApiProperty({
    description: 'Whether the pet is currently missing',
    example: false,
  })
  isMissing: boolean;

  @ApiPropertyOptional({
    description: 'Birthday of the pet',
    example: '2020-05-15T00:00:00.000Z',
  })
  birthday?: Date;

  @ApiProperty({
    description: 'Date when pet was registered',
    example: '2024-01-01T00:00:00.000Z',
  })
  created_at: Date;

  @ApiProperty({
    description: 'Date when pet was last updated',
    example: '2024-01-15T00:00:00.000Z',
  })
  updated_at: Date;
}
