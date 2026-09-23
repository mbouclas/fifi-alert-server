import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Cancel Alert DTO
 * Used when the creator withdraws an alert (posted by mistake, no longer relevant)
 */
export class CancelAlertDto {
  @ApiPropertyOptional({
    description: 'Why the alert is being cancelled',
    example: 'Posted by mistake',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
