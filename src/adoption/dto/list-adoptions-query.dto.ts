import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Gender, Size } from '@prisma-lib/client';

/**
 * Query parameters for browsing available adoption listings.
 * `lat` and `lon` must be supplied together to enable radius filtering.
 */
export class ListAdoptionsQueryDto {
  @ApiPropertyOptional({
    description: 'Latitude for proximity search (requires lon)',
    example: 35.1856,
    minimum: -90,
    maximum: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({
    description: 'Longitude for proximity search (requires lat)',
    example: 33.3823,
    minimum: -180,
    maximum: 180,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon?: number;

  @ApiPropertyOptional({
    description: 'Search radius in km (ignored without lat/lon)',
    example: 10,
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  radiusKm?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter by pet type ID (from /pet-types)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  petTypeId?: number;

  @ApiPropertyOptional({
    description: 'Filter by gender',
    enum: Gender,
    enumName: 'Gender',
    example: 'MALE',
  })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({
    description: 'Filter by size',
    enum: Size,
    enumName: 'Size',
    example: 'MEDIUM',
  })
  @IsOptional()
  @IsEnum(Size)
  size?: Size;

  @ApiPropertyOptional({
    description:
      'Minimum age in months (computed from birthday; pets without a birthday are excluded)',
    example: 6,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minAgeMonths?: number;

  @ApiPropertyOptional({
    description:
      'Maximum age in months (computed from birthday; pets without a birthday are excluded)',
    example: 60,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxAgeMonths?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of results',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Number of results to skip',
    example: 0,
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
