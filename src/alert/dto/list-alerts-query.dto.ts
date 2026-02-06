import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsNumber, IsEnum, IsString, Min, Max } from 'class-validator';
import { PetSpecies, AlertStatus } from '../../generated/prisma';

/**
 * List Alerts Query DTO
 * Query parameters for geospatial alert search
 */
export class ListAlertsQueryDto {
    @ApiPropertyOptional({
        description: 'User latitude for proximity search',
        example: 37.7749,
        minimum: -90,
        maximum: 90
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(-90)
    @Max(90)
    lat?: number;

    @ApiPropertyOptional({
        description: 'User longitude for proximity search',
        example: -122.4194,
        minimum: -180,
        maximum: 180
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(-180)
    @Max(180)
    lon?: number;

    @ApiPropertyOptional({
        description: 'Search radius in kilometers',
        example: 10,
        minimum: 1,
        maximum: 100,
        default: 10
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(100)
    radiusKm?: number = 10;

    @ApiPropertyOptional({
        enum: PetSpecies,
        description: 'Filter by pet species',
        example: PetSpecies.DOG
    })
    @IsOptional()
    @IsEnum(PetSpecies)
    species?: PetSpecies;

    @ApiPropertyOptional({
        enum: AlertStatus,
        description: 'Filter by alert status',
        example: AlertStatus.ACTIVE
    })
    @IsOptional()
    @IsEnum(AlertStatus)
    status?: AlertStatus;

    @ApiPropertyOptional({
        description: 'Postal code for search',
        example: '94102'
    })
    @IsOptional()
    @IsString()
    postalCode?: string;

    @ApiPropertyOptional({
        description: 'Number of results to return',
        example: 20,
        minimum: 1,
        maximum: 100,
        default: 20
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    @ApiPropertyOptional({
        description: 'Number of results to skip',
        example: 0,
        minimum: 0,
        default: 0
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    offset?: number = 0;
}
