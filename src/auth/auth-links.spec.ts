import { resetWebAppUrlWarning } from '@config/web-app.config';
import {
  buildWebDeleteAccountUrl,
  buildWebResetPasswordUrl,
  buildWebVerificationUrl,
  extractCallbackURL,
  getEmailVerificationCallbackURL,
} from './auth-links';

describe('auth-links', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.WEB_APP_URL = 'http://localhost:5173';
    delete process.env.APP_URL;
    delete process.env.EMAIL_VERIFICATION_CALLBACK_URL;
    delete process.env.MOBILE_EMAIL_VERIFICATION_URL;
    resetWebAppUrlWarning();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('extractCallbackURL', () => {
    it('reads callbackURL from a better-auth URL', () => {
      expect(
        extractCallbackURL(
          'http://api/api/auth/verify-email?token=t&callbackURL=fifi-alert%3A%2F%2Fverify-email',
        ),
      ).toBe('fifi-alert://verify-email');
    });

    it('returns null for junk input', () => {
      expect(extractCallbackURL('not a url')).toBeNull();
    });
  });

  describe('buildWebVerificationUrl', () => {
    it('links to the web app and keeps the callbackURL', () => {
      const url = buildWebVerificationUrl(
        'http://api/api/auth/verify-email?token=abc&callbackURL=https%3A%2F%2Fapp%2Fdone',
        'abc',
      );
      expect(url).toBe(
        'http://localhost:5173/verify-email?token=abc&callbackURL=https%3A%2F%2Fapp%2Fdone',
      );
    });

    it('falls back to the mobile deep link when no callbackURL is present', () => {
      const url = buildWebVerificationUrl(
        'http://api/api/auth/verify-email?token=abc',
        'abc',
      );
      expect(url).toBe(
        'http://localhost:5173/verify-email?token=abc&callbackURL=fifi-alert%3A%2F%2Fverify-email',
      );
    });
  });

  describe('buildWebResetPasswordUrl', () => {
    it('appends the token to an absolute redirectTo', () => {
      const url = buildWebResetPasswordUrl(
        'http://api/api/auth/reset-password/tok123?callbackURL=http%3A%2F%2Flocalhost%3A5173%2Freset-password',
        'tok123',
      );
      expect(url).toBe('http://localhost:5173/reset-password?token=tok123');
    });

    it('keeps existing query params on redirectTo', () => {
      const url = buildWebResetPasswordUrl(
        'http://api/api/auth/reset-password/tok?callbackURL=https%3A%2F%2Fapp%2Freset%3Flang%3Del',
        'tok',
      );
      expect(url).toBe('https://app/reset?lang=el&token=tok');
    });

    it('treats a relative redirectTo as a web-app path', () => {
      const url = buildWebResetPasswordUrl(
        'http://api/api/auth/reset-password/tok?callbackURL=%2Fcustom-reset',
        'tok',
      );
      expect(url).toBe('http://localhost:5173/custom-reset?token=tok');
    });

    it('falls back to /reset-password when there is no redirectTo', () => {
      const url = buildWebResetPasswordUrl(
        'http://api/api/auth/reset-password/tok?callbackURL=',
        'tok',
      );
      expect(url).toBe('http://localhost:5173/reset-password?token=tok');
    });

    it('URL-encodes the token', () => {
      const url = buildWebResetPasswordUrl('junk', 'a b&c');
      expect(url).toBe('http://localhost:5173/reset-password?token=a+b%26c');
    });
  });

  describe('buildWebDeleteAccountUrl', () => {
    it('links to the confirm-delete-account page', () => {
      expect(buildWebDeleteAccountUrl('del')).toBe(
        'http://localhost:5173/confirm-delete-account?token=del',
      );
    });
  });

  describe('getEmailVerificationCallbackURL', () => {
    it('prefers EMAIL_VERIFICATION_CALLBACK_URL', () => {
      process.env.EMAIL_VERIFICATION_CALLBACK_URL = 'https://web/verified';
      process.env.MOBILE_EMAIL_VERIFICATION_URL = 'app://x';
      expect(getEmailVerificationCallbackURL()).toBe('https://web/verified');
    });

    it('defaults to the mobile deep link', () => {
      expect(getEmailVerificationCallbackURL()).toBe(
        'fifi-alert://verify-email',
      );
    });
  });
});
