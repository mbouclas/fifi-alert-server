import {
  containsControlChars,
  containsTag,
  countPlaceholders,
  escapeHtml,
  normalizeText,
  plainTextErrors,
  renderInvitationHtmlBody,
  renderInvitationTextBody,
} from './invitation-text';
import {
  buildInviteAcceptUrl,
  getInvitationConfig,
  INVITE_DEFAULTS,
} from '../config/invitation.config';
import {
  hashInviteToken,
  isPlausibleInviteToken,
  mintInviteToken,
} from './invitation-token';
import { senderDisplayName } from './invitation.mapper';

describe('invitation-text', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });

  it('normalises CRLF and trims', () => {
    expect(normalizeText('  a\r\nb\rc\n ')).toBe('a\nb\nc');
  });

  it.each([
    ['<a href="https://x">', true],
    ['</p>', true],
    ['<!-- c -->', true],
    ['<script', true],
    ['1 < 2 and 3 > 2', false],
    ['«Έλα κι εσύ!»', false],
  ])('containsTag(%p) = %p', (input, expected) => {
    expect(containsTag(input)).toBe(expected);
  });

  it('rejects control characters but allows newline', () => {
    expect(containsControlChars('a\nb')).toBe(false);
    expect(containsControlChars('a\tb')).toBe(true);
    expect(containsControlChars('a\u0000b')).toBe(true);
    expect(containsControlChars('a\u0085b')).toBe(true);
  });

  it('counts placeholders', () => {
    expect(countPlaceholders('no link')).toBe(0);
    expect(countPlaceholders('x {inviteLink} y')).toBe(1);
    expect(countPlaceholders('{inviteLink}{inviteLink}')).toBe(2);
  });

  it('lists every failing plain-text rule', () => {
    expect(
      plainTextErrors('subject', 'x'.repeat(201) + '<b>\t', 1, 200),
    ).toEqual([
      'subject must be 1-200 characters',
      'subject must be plain text (no HTML tags)',
      'subject must not contain control characters',
    ]);
    expect(plainTextErrors('body', 'fine', 1, 4000)).toEqual([]);
  });

  it('rejects a newline in the subject (header injection) but not in the body', () => {
    expect(
      plainTextErrors(
        'subject',
        'Probe\nBcc: victim@example.test\nX-Injected: yes',
        1,
        200,
      ),
    ).toEqual(['subject must be a single line']);
    // CRLF is normalised to LF before validation, so it is caught too.
    expect(plainTextErrors('subject', normalizeText('a\r\nb'), 1, 200)).toEqual(
      ['subject must be a single line'],
    );
    expect(plainTextErrors('body', 'line one\nline two', 1, 4000)).toEqual([]);
  });

  it('renders paragraphs, line breaks and the link anchor with visible URL', () => {
    const link = 'https://app.example/accept-invite?token=abc&x=1';
    const html = renderInvitationHtmlBody(
      'Hi <Nikos>,\n\nSign up here:\n{inviteLink}\n\nBye',
      link,
    );
    expect(html).toContain(
      '<p style="margin:0 0 16px 0;">Hi &lt;Nikos&gt;,</p>',
    );
    expect(html).toContain(
      'Sign up here:<br/><a href="https://app.example/accept-invite?token=abc&amp;x=1"',
    );
    expect(html).toContain(
      '>https://app.example/accept-invite?token=abc&amp;x=1</a>',
    );
    expect(html).not.toContain('{inviteLink}');
    expect(html.match(/<p /g)).toHaveLength(3);
  });

  it('renders the text alternative with the raw link', () => {
    expect(
      renderInvitationTextBody('Go: {inviteLink}\r\n', 'https://x/y'),
    ).toBe('Go: https://x/y');
  });
});

describe('invitation-token', () => {
  it('mints base64url tokens of 32 bytes and hashes to sha256 hex', () => {
    const t = mintInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashInviteToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(mintInviteToken()).not.toBe(t);
  });

  it('accepts only plausible client tokens', () => {
    expect(isPlausibleInviteToken(mintInviteToken())).toBe(true);
    expect(isPlausibleInviteToken('')).toBe(false);
    expect(isPlausibleInviteToken(42)).toBe(false);
    expect(isPlausibleInviteToken('a'.repeat(257))).toBe(false);
    expect(isPlausibleInviteToken('has space')).toBe(false);
  });
});

describe('invitation.config', () => {
  it('is disabled without INVITE_BASE_URL and applies defaults', () => {
    const c = getInvitationConfig({} as NodeJS.ProcessEnv);
    expect(c.enabled).toBe(false);
    expect(c.ttlDays).toBe(INVITE_DEFAULTS.ttlDays);
    expect(c.dailyLimit).toBe(INVITE_DEFAULTS.dailyLimit);
    expect(c.resendCooldownMinutes).toBe(INVITE_DEFAULTS.resendCooldownMinutes);
    expect(c.globalHourlyLimit).toBe(INVITE_DEFAULTS.globalHourlyLimit);
  });

  it('parses env, strips trailing slashes, allows 0 for the optional caps', () => {
    const c = getInvitationConfig({
      INVITE_BASE_URL: 'https://app.fifi-alert.com/',
      INVITE_TTL_DAYS: '7',
      INVITE_DAILY_LIMIT: '0',
      INVITE_RESEND_COOLDOWN_MINUTES: '0',
      INVITE_GLOBAL_HOURLY_LIMIT: '0',
      INVITE_FROM: 'FiFi <no-reply@x>',
    } as NodeJS.ProcessEnv);
    expect(c.enabled).toBe(true);
    expect(c.baseUrl).toBe('https://app.fifi-alert.com');
    expect(c.ttlDays).toBe(7);
    expect(c.dailyLimit).toBe(INVITE_DEFAULTS.dailyLimit); // 0 is not a valid daily limit
    expect(c.resendCooldownMinutes).toBe(0);
    expect(c.globalHourlyLimit).toBe(0);
    expect(c.from).toBe('FiFi <no-reply@x>');
    expect(buildInviteAcceptUrl(c.baseUrl, 'a+b')).toBe(
      'https://app.fifi-alert.com/accept-invite?token=a%2Bb',
    );
  });

  it('falls back to MAIL_NOTIFICATIONS_FROM', () => {
    expect(
      getInvitationConfig({
        MAIL_NOTIFICATIONS_FROM: 'x@y',
      } as NodeJS.ProcessEnv).from,
    ).toBe('x@y');
  });
});

describe('senderDisplayName', () => {
  it('prefers first + last, then name, then a generic label', () => {
    expect(senderDisplayName({ firstName: 'Maria', lastName: 'Papa' })).toBe(
      'Maria Papa',
    );
    expect(senderDisplayName({ firstName: '', lastName: '', name: 'mp' })).toBe(
      'mp',
    );
    expect(senderDisplayName({})).toBe('A FiFi Alert user');
  });
});
