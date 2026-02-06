import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateGateDto {
    @ApiProperty({
        description: 'Unique name/key for the gate (e.g., "premium-features")',
        example: 'premium-features',
        minLength: 2,
        maxLength: 50,
    })
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    name: string;

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
