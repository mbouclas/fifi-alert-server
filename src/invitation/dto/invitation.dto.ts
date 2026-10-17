import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const INVITATION_STATUSES = [
  'pending',
  'accepted',
  'expired',
  'revoked',
] as const;
export type InvitationStatusValue = (typeof INVITATION_STATUSES)[number];

export const INVITATION_ACCEPTED_VIA = ['token', 'email'] as const;
export type InvitationAcceptedViaValue =
  (typeof INVITATION_ACCEPTED_VIA)[number];

/**
 * An invitation as seen by its sender. Never includes the subject, body,
 * personal message, token or the converted user's id.
 */
export class InvitationDto {
  @ApiProperty({ example: '1042', description: 'Invitation id (string).' })
  id: string;

  @ApiProperty({ example: 'nikos@example.test' })
  recipientEmail: string;

  @ApiPropertyOptional({ example: 'Nikos', nullable: true, type: String })
  recipientName: string | null;

  @ApiProperty({ example: 'el' })
  locale: string;

  @ApiProperty({ enum: INVITATION_STATUSES, example: 'pending' })
  status: InvitationStatusValue;

  @ApiProperty({ format: 'date-time', example: '2026-10-17T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-10-17T10:00:00.000Z',
    description: 'Last (re)send time.',
  })
  sentAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-16T10:00:00.000Z' })
  expiresAt: string;

  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    type: String,
    example: null,
  })
  acceptedAt: string | null;

  @ApiPropertyOptional({
    enum: INVITATION_ACCEPTED_VIA,
    nullable: true,
    type: String,
    example: null,
    description:
      '`token` when the recipient signed up through the link; `email` when an account with the invited address was verified without the link.',
  })
  acceptedVia: InvitationAcceptedViaValue | null;
}
