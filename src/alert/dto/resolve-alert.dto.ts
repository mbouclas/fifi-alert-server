import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsBoolean, MaxLength } from 'class-validator';

/**
 * Alert Resolution Outcome Enum
 */
export enum AlertOutcome {
    FOUND_SAFE = 'FOUND_SAFE',
    FOUND_INJURED = 'FOUND_INJURED',
    FOUND_DECEASED = 'FOUND_DECEASED',
    RETURNED_HOME = 'RETURNED_HOME',
    FALSE_ALARM = 'FALSE_ALARM',
    OTHER = 'OTHER',
}

/**
 * Resolve Alert DTO
 * Used when marking an alert as resolved
 */
export class ResolveAlertDto {
    @ApiProperty({
        enum: AlertOutcome,
        description: 'Outcome of the alert',
        example: AlertOutcome.FOUND_SAFE
    })
    @IsEnum(AlertOutcome)
    outcome: AlertOutcome;

    @ApiPropertyOptional({
        description: 'Additional notes about the resolution',
        example: 'Found Max safe at a nearby park. Thank you to everyone who helped!'
    })
    @IsString()
    @MaxLength(2000)
    notes?: string;

    @ApiProperty({
        description: 'Whether to share this success story publicly',
        example: true,
        default: false
    })
    @IsBoolean()
    shareSuccessStory: boolean = false;
}
