import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsUrl,
  IsDate,
  Length,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, Size } from '@prisma-lib/client';

export class CreatePetDto {
  @ApiProperty({
    description: 'Pet type ID (from /pet-types)',
    example: 1,
  })
  @IsInt({ message: 'Pet type ID must be an integer' })
  @Min(1, { message: 'Pet type ID must be greater than 0' })
  petTypeId: number;

  @ApiProperty({
    description: 'Name of the pet',
    example: 'Buddy',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @Length(1, 100, { message: 'Name must be between 1 and 100 characters' })
  name: string;

  @ApiPropertyOptional({
    description: 'Gender of the pet',
    enum: Gender,
    example: 'MALE',
  })
  @IsOptional()
  @IsEnum(Gender, { message: 'Gender must be either MALE or FEMALE' })
  gender?: Gender;

  @ApiPropertyOptional({
    description: 'Array of photo URLs',
    type: [String],
    example: [
      'https://example.com/photo1.jpg',
      'https://example.com/photo2.jpg',
    ],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true, message: 'Each photo must be a valid URL' })
  photos?: string[];

  @ApiPropertyOptional({
    description: 'Size of the pet',
    enum: Size,
    example: 'MEDIUM',
  })
  @IsOptional()
  @IsEnum(Size, { message: 'Size must be SMALL, MEDIUM, or LARGE' })
  size?: Size;

  @ApiPropertyOptional({
    description: 'Birthday of the pet',
    example: '2020-05-15T00:00:00.000Z',
  })
  @IsOptional()
  @IsDate({ message: 'Birthday must be a valid date' })
  @Type(() => Date)
  birthday?: Date;

  @ApiPropertyOptional({
    description: 'Whether the pet is currently missing',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isMissing?: boolean;
}
