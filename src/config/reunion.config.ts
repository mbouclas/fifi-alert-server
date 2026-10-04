import { registerAs } from '@nestjs/config';

export const DEFAULT_REUNION_TTL_DAYS = 30;

/**
 * How long a public reunion snapshot (the "/thank-you/{tagId}" card) stays
 * readable after the alert is resolved.
 *
 * Reads `REUNION_TTL_DAYS` directly from the environment so it can be used
 * outside Nest DI. Falls back to the default when the value is missing or not
 * a positive integer.
 */
export function getReunionTtlDays(): number {
  const raw = process.env.REUNION_TTL_DAYS;
  const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_REUNION_TTL_DAYS;
}

export default registerAs('reunion', () => ({
  /** Days a reunion snapshot remains public after resolve. */
  ttlDays: getReunionTtlDays(),
}));
