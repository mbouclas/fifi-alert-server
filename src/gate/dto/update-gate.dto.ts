import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class UpdateGateDto {
    @ApiPropertyOptional({
        description: 'Unique name/key for the gate',
        example: 'premium-features',
        minLength: 2,
        maxLength: 50,
    })
    @IsString()
    @IsOptional()
    @MinLength(2)
    @MaxLength(50)
    name?: string;

    @ApiPropertyOptional({
        description: 'Human-readable description of what this gate controls',
        example: 'Access to premium features',
        maxLength: 255,
    })
    @IsString()
    @IsOptional()
    @MaxLength(255)
    description?: string;
}
