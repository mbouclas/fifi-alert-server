import type { Invitation } from '@prisma-lib/client';
import type {
  InvitationAcceptedViaValue,
  InvitationDto,
  InvitationPreviewDto,
  InvitationStatusValue,
} from './dto';

/**
 * Explicit field list: the DTO must never leak subject/body/message,
 * token_hash or converted_user_id (work order §3.1).
 */
export function toInvitationDto(row: Invitation): InvitationDto {
  return {
    id: String(row.id),
    recipientEmail: row.recipientEmail,
    recipientName: row.recipientName ?? null,
    locale: row.locale,
    status: row.status.toLowerCase() as InvitationStatusValue,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    acceptedVia: row.acceptedVia
      ? (row.acceptedVia.toLowerCase() as InvitationAcceptedViaValue)
      : null,
  };
}

export interface ISenderNameSource {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}

/** "First Last", falling back to the display name, then to a generic label. */
export function senderDisplayName(sender: ISenderNameSource): string {
  const full = [sender.firstName, sender.lastName]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return full || (sender.name ?? '').trim() || 'A FiFi Alert user';
}

export function toInvitationPreviewDto(
  row: Invitation,
  sender: ISenderNameSource,
): InvitationPreviewDto {
  return {
    valid: true,
    recipientEmail: row.recipientEmail,
    recipientName: row.recipientName ?? null,
    locale: row.locale,
    senderName: senderDisplayName(sender),
  };
}
