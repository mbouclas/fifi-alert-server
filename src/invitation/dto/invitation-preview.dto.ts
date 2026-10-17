import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * `GET /invitations/accept/{token}`: what the accept page needs to prefill
 * the signup form. Exactly these five fields; nothing else about the sender.
 */
export class InvitationPreviewDto {
  @ApiProperty({ example: true, enum: [true] })
  valid: true;

  @ApiProperty({ example: 'nikos@example.test' })
  recipientEmail: string;

  @ApiPropertyOptional({ example: 'Nikos', nullable: true, type: String })
  recipientName: string | null;

  @ApiProperty({ example: 'el' })
  locale: string;

  @ApiProperty({
    example: 'Maria Papa',
    description:
      "Sender's first + last name (falls back to their display name).",
  })
  senderName: string;
}
