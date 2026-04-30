import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum PetTypeOrderBy {
    ID = 'id',
    NAME = 'name',
    SLUG = 'slug',
    ORDER = 'order',
    CREATED_AT = 'created_at',
    UPDATED_AT = 'updated_at',
}

export enum SortDirection {
    ASC = 'asc',
    DESC = 'desc',
}

/**
 * Query parameters for listing pet types.
 */
export class ListPetTypesQueryDto {
    @ApiPropertyOptional({
        description: 'Field used to order pet types',
        enum: PetTypeOrderBy,
        default: PetTypeOrderBy.ORDER,
    })
    @IsOptional()
    @IsEnum(PetTypeOrderBy, {
        message: 'Order by must be a supported pet type field',
    })
    orderBy?: PetTypeOrderBy = PetTypeOrderBy.ORDER;

    @ApiPropertyOptional({
        description: 'Sort direction for pet types',
        enum: SortDirection,
        default: SortDirection.ASC,
    })
    @IsOptional()
    @IsEnum(SortDirection, { message: 'Order direction must be asc or desc' })
    orderDir?: SortDirection = SortDirection.ASC;
}
