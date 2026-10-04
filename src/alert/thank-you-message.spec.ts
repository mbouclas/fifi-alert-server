import { sanitizeThankYouMessage } from './thank-you-message';

describe('sanitizeThankYouMessage', () => {
  it('strips HTML tags', () => {
    expect(sanitizeThankYouMessage('<b>Thanks</b>')).toBe('Thanks');
    expect(
      sanitizeThankYouMessage(
        '<script>alert(1)</script>Thank you <a href="x">all</a>',
      ),
    ).toBe('alert(1)Thank you all');
  });

  it('removes control characters but keeps text', () => {
    expect(sanitizeThankYouMessage('Th\u0000anks\u0007 all\u007F')).toBe(
      'Thanks all',
    );
  });

  it('collapses whitespace and trims', () => {
    expect(sanitizeThankYouMessage('  Thank\n\n you \t everyone  ')).toBe(
      'Thank you everyone',
    );
  });

  it('returns undefined for empty or non-string input', () => {
    expect(sanitizeThankYouMessage('')).toBeUndefined();
    expect(sanitizeThankYouMessage('   <br/>  ')).toBeUndefined();
    expect(sanitizeThankYouMessage(undefined)).toBeUndefined();
    expect(sanitizeThankYouMessage(null)).toBeUndefined();
    expect(sanitizeThankYouMessage(42)).toBeUndefined();
  });

  it('does not truncate long messages (length is enforced by validation)', () => {
    const long = 'a'.repeat(501);
    expect(sanitizeThankYouMessage(long)).toHaveLength(501);
  });
});
