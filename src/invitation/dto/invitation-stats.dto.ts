import { ApiProperty } from '@nestjs/swagger';

/** `GET /invitations/stats`: the caller's own conversion numbers. */
export class InvitationStatsDto {
  @ApiProperty({
    example: 12,
    description: 'All invitations ever sent by the caller (any status).',
  })
  sent: number;

  @ApiProperty({ example: 4 })
  accepted: number;

  @ApiProperty({
    example: 6,
    description: 'Still open (after the lazy expiry sweep).',
  })
  pending: number;
}
