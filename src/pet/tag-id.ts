/**
 * Collar tag identifier format.
 *
 * Single source of truth for generating and validating `pet.tag_id`.
 * Uppercase letters and digits without look-alikes (0/O, 1/I).
 */
export const TAG_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const TAG_ID_LENGTH = 9;
export const TAG_ID_REGEX = new RegExp(
  `^[${TAG_ID_ALPHABET}]{${TAG_ID_LENGTH}}$`,
);

/** Normalise user input (trim + uppercase) and test it against the tag format. */
export function normalizeTagId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return TAG_ID_REGEX.test(normalized) ? normalized : null;
}
