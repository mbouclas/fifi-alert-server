import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsString,
  IsBoolean,
  IsOptional,
  Length,
  MaxLength,
} from 'class-validator';
import {
  sanitizeThankYouMessage,
  THANK_YOU_MESSAGE_MAX_LENGTH,
} from '../thank-you-message';

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

/** Outcomes that mean the pet is back with its owner (write a reunion snapshot). */
export const FOUND_OUTCOMES: ReadonlySet<AlertOutcome> = new Set([
  AlertOutcome.FOUND_SAFE,
  AlertOutcome.FOUND_INJURED,
  AlertOutcome.RETURNED_HOME,
]);

export function isFoundOutcome(outcome: AlertOutcome): boolean {
  return FOUND_OUTCOMES.has(outcome);
}

/**
 * Resolve Alert DTO
 * Used when marking an alert as resolved
 */
export class ResolveAlertDto {
  @ApiProperty({
    enum: AlertOutcome,
    description: 'Outcome of the alert',
    example: AlertOutcome.FOUND_SAFE,
  })
  @IsEnum(AlertOutcome)
  outcome: AlertOutcome;

  @ApiPropertyOptional({
    description: 'Additional notes about the resolution (owner-private)',
    example:
      'Found Max safe at a nearby park. Thank you to everyone who helped!',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({
    description:
      'Whether to share this success story publicly. When true and the outcome is a found outcome, ' +
      'every helper (notified users and sighting reporters) receives a "pet is home" push.',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  shareSuccessStory: boolean = false;

  @ApiPropertyOptional({
    description:
      'Public thank-you note shown on the /thank-you/{tagId} page and in the helper push. ' +
      'HTML and control characters are stripped and whitespace collapsed before validation. ' +
      'Only stored when the outcome is FOUND_SAFE, FOUND_INJURED or RETURNED_HOME.',
    minLength: 1,
    maxLength: THANK_YOU_MESSAGE_MAX_LENGTH,
    example:
      'Thank you everyone who looked for Bella! She was found safe in the park.',
  })
  @Transform(({ value }) => sanitizeThankYouMessage(value))
  @IsOptional()
  @IsString()
  @Length(1, THANK_YOU_MESSAGE_MAX_LENGTH)
  thankYouMessage?: string;
}
