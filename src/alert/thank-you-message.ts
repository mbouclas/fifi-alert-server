/**
 * Public thank-you note sanitiser (BACKEND_WORK_ORDER_THANK_YOU.md §3.1/§3.4).
 *
 * The note is rendered as plain text by the web app, but other clients may
 * not escape it, so HTML tags and control characters are stripped server-side.
 * Whitespace is collapsed and trimmed. Returns `undefined` for non-strings and
 * for input that is empty after cleaning, so callers can treat "no message"
 * uniformly.
 */
export const THANK_YOU_MESSAGE_MAX_LENGTH = 500;

const HTML_TAG = /<[^>]*>/g;
// C0 controls except \t \n \r (which collapse as whitespace below) plus DEL.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const WHITESPACE = /\s+/g;

export function sanitizeThankYouMessage(input: unknown): string | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }

  const cleaned = input
    .replace(HTML_TAG, '')
    .replace(CONTROL_CHARS, '')
    .replace(WHITESPACE, ' ')
    .trim();

  return cleaned.length > 0 ? cleaned : undefined;
}
