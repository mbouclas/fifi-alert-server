import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Empty string after trim → undefined (optional fields). */
const trimOrUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t.length === 0 ? undefined : t;
};

/**
 * `POST /invitations` body (work order §3.1).
 *
 * The web app renders the complete, localised subject and body and sends them
 * here as plain text. The body must contain the literal `{inviteLink}` exactly
 * once; the API replaces it with the accept URL. Plain-text (no tags, no
 * control characters) and the placeholder rule are enforced in the service so
 * every failing rule is listed in one 400.
 */
export class CreateInvitationDto {
  @ApiProperty({
    description:
      'Recipient address. Stored lower-cased; the original casing is used for the To: header.',
    example: 'nikos@example.test',
    maxLength: 254,
  })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  recipientEmail: string;

  @ApiPropertyOptional({
    description: 'Recipient display name (max 120 after trim).',
    example: 'Nikos',
    maxLength: 120,
  })
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @ApiPropertyOptional({
    description:
      "The sender's raw personal message (max 1000 after trim). Audit copy only; it is already embedded in `body`.",
    example: 'Έλα κι εσύ!',
    maxLength: 1000,
  })
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiProperty({
    description:
      'Language of the email (ISO 639-1, must be an active language, see GET /languages). Localises the layout chrome; the subject/body are already localised by the client.',
    example: 'el',
    minLength: 2,
    maxLength: 5,
  })
  @Transform(trim)
  @IsString()
  @Length(2, 5)
  locale: string;

  @ApiProperty({
    description:
      'Email subject, plain text, 1-200 characters after trim. Rejected if it contains HTML tags or control characters.',
    example: 'Ο/Η Maria Papa σας προσκαλεί στο FiFi Alert',
    minLength: 1,
    maxLength: 200,
  })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  subject: string;

  @ApiProperty({
    description:
      'Email body, plain text, 1-4000 characters after trim. Must contain the literal `{inviteLink}` exactly once (ideally on its own line). Newlines become line breaks; blank lines become paragraphs. Rejected if it contains HTML tags or control characters other than newlines.',
    example:
      'Γεια σας Nikos,\n\nΟ/Η Maria Papa (maria@example.test) πιστεύει ότι θα σας αρέσει το FiFi Alert.\n\nΔημιουργήστε δωρεάν λογαριασμό εδώ:\n{inviteLink}\n\nΗ ομάδα του FiFi Alert',
    minLength: 1,
    maxLength: 4000,
  })
  @Transform(trim)
  @IsString()
  @Length(1, 4000)
  body: string;
}
