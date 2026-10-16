import { DEFAULT_RP_NAME, getPasskeyConfig } from '../passkey.config';

describe('getPasskeyConfig', () => {
  it('is disabled when RP_ID or RP_ORIGINS is missing', () => {
    expect(getPasskeyConfig({}).enabled).toBe(false);
    expect(getPasskeyConfig({ RP_ID: 'localhost' }).enabled).toBe(false);
    expect(
      getPasskeyConfig({ RP_ORIGINS: 'http://localhost:4173' }).enabled,
    ).toBe(false);
  });

  it('splits, trims and strips trailing slashes from RP_ORIGINS', () => {
    const config = getPasskeyConfig({
      RP_ID: ' app.fifi-alert.com ',
      RP_ORIGINS:
        ' https://app.fifi-alert.com/ , https://192.168.50.26:4173 ,, ',
    });
    expect(config).toEqual({
      rpId: 'app.fifi-alert.com',
      rpName: DEFAULT_RP_NAME,
      origins: ['https://app.fifi-alert.com', 'https://192.168.50.26:4173'],
      enabled: true,
    });
  });

  it('uses RP_NAME when set', () => {
    expect(
      getPasskeyConfig({
        RP_ID: 'localhost',
        RP_NAME: ' My App ',
        RP_ORIGINS: 'http://localhost:4173',
      }).rpName,
    ).toBe('My App');
  });
});
