import {
  buildWebAppUrl,
  getWebAppUrl,
  resetWebAppUrlWarning,
} from './web-app.config';

describe('web-app.config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.WEB_APP_URL;
    delete process.env.APP_URL;
    resetWebAppUrlWarning();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getWebAppUrl', () => {
    it('returns WEB_APP_URL with trailing slashes stripped', () => {
      process.env.WEB_APP_URL = 'http://localhost:5173/';
      expect(getWebAppUrl()).toBe('http://localhost:5173');
    });

    it('prefers WEB_APP_URL over APP_URL', () => {
      process.env.WEB_APP_URL = 'https://app.example';
      process.env.APP_URL = 'https://legacy.example';
      expect(getWebAppUrl()).toBe('https://app.example');
    });

    it('falls back to APP_URL', () => {
      process.env.APP_URL = 'https://legacy.example';
      expect(getWebAppUrl()).toBe('https://legacy.example');
    });

    it('falls back to the production default and warns once', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      expect(getWebAppUrl()).toBe('https://fifi-alert.com');
      expect(getWebAppUrl()).toBe('https://fifi-alert.com');
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });

  describe('buildWebAppUrl', () => {
    beforeEach(() => {
      process.env.WEB_APP_URL = 'http://localhost:5173';
    });

    it('joins the path', () => {
      expect(buildWebAppUrl('/alerts/1')).toBe('http://localhost:5173/alerts/1');
      expect(buildWebAppUrl('alerts/1')).toBe('http://localhost:5173/alerts/1');
    });

    it('encodes query params and skips empty values', () => {
      expect(
        buildWebAppUrl('/verify-email', {
          token: 'a b',
          callbackURL: 'fifi-alert://verify-email',
          skip: undefined,
        }),
      ).toBe(
        'http://localhost:5173/verify-email?token=a+b&callbackURL=fifi-alert%3A%2F%2Fverify-email',
      );
    });
  });
});
