import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const INVITATIONS_DEFAULT_LIMIT = 50;
export const INVITATIONS_MAX_LIMIT = 100;

export class ListInvitationsQueryDto {
  @ApiPropertyOptional({
    default: INVITATIONS_DEFAULT_LIMIT,
    maximum: INVITATIONS_MAX_LIMIT,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INVITATIONS_MAX_LIMIT)
  limit?: number = INVITATIONS_DEFAULT_LIMIT;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
