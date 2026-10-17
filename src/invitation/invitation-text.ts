/**
 * Pure text helpers for invitation emails. No Nest, no I/O — unit-tested in
 * invitation-text.spec.ts.
 *
 * The web app renders the full subject/body in the recipient's language and
 * sends it to us as PLAIN TEXT with one `{inviteLink}` placeholder. We must
 * treat it as hostile: HTML-escape everything, reject tags on input, and only
 * then substitute the link. Nunjucks runs with `autoescape: false`
 * (shared/email/email.service.ts), so escaping here is the only line of defence.
 */

export const INVITE_LINK_PLACEHOLDER = '{inviteLink}';

/** Looks like an HTML/XML tag: `<a href>`, `</p>`, `<!--`, `<script`. */
const TAG_RE = /<[a-z!/?][^>]*>?/i;

/** Any C0/C1 control character except `\n` (`\r` is normalised away first). */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `\r\n` / `\r` → `\n`, trim outer whitespace. */
export function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

export function containsTag(value: string): boolean {
  return TAG_RE.test(value);
}

export function containsControlChars(value: string): boolean {
  return CONTROL_RE.test(value);
}

export function countPlaceholders(value: string): number {
  return value.split(INVITE_LINK_PLACEHOLDER).length - 1;
}

/**
 * Validate a plain-text field. Returns every failing rule so the 400 lists
 * them all (work order §3.1 "list every failing rule in message[]").
 */
export function plainTextErrors(
  field: 'subject' | 'body',
  value: string,
  min: number,
  max: number,
): string[] {
  const errors: string[] = [];
  if (value.length < min || value.length > max) {
    errors.push(`${field} must be ${min}-${max} characters`);
  }
  if (containsTag(value)) {
    errors.push(`${field} must be plain text (no HTML tags)`);
  }
  if (containsControlChars(value)) {
    errors.push(`${field} must not contain control characters`);
  }
  // Newlines are content in the body but header injection in the subject
  // (`Subject: x\nBcc: victim`). Nodemailer folds them today; do not rely on it.
  if (field === 'subject' && value.includes('\n')) {
    errors.push('subject must be a single line');
  }
  return errors;
}

/**
 * Render the ESCAPED body to HTML: blank-line-separated blocks become
 * paragraphs, single newlines become `<br>`, and the placeholder becomes an
 * anchor whose visible text is the bare URL (the web writes the body so the
 * link sits on its own line).
 *
 * @param body raw plain-text body (unescaped) containing exactly one placeholder
 * @param link absolute accept URL
 */
export function renderInvitationHtmlBody(body: string, link: string): string {
  const escapedLink = escapeHtml(link);
  const anchor = `<a href="${escapedLink}" style="color:#007bff;word-break:break-all;">${escapedLink}</a>`;

  return normalizeText(body)
    .split(/\n{2,}/)
    .map((block) => {
      const html = escapeHtml(block)
        .split('\n')
        .join('<br/>')
        .split(escapeHtml(INVITE_LINK_PLACEHOLDER))
        .join(anchor);
      return `<p style="margin:0 0 16px 0;">${html}</p>`;
    })
    .join('\n');
}

/** text/plain alternative: raw body with the link substituted. */
export function renderInvitationTextBody(body: string, link: string): string {
  return normalizeText(body).split(INVITE_LINK_PLACEHOLDER).join(link);
}
