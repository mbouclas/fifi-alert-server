import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import {
  buildSocialProviders,
  decodeFacebookJwtSubject,
  mapFacebookProfile,
  mapGoogleProfile,
  verifyFacebookToken,
  verifyGoogleIdToken,
  type FetchLike,
  type IVerifierDeps,
} from './social-providers';
import { getSocialAuthConfig } from '@config/social-auth.config';

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

async function makeSigner(): Promise<{
  keys: KeyPair;
  deps: IVerifierDeps;
  sign: (
    claims: Record<string, unknown>,
    opts?: { expired?: boolean },
  ) => Promise<string>;
}> {
  const keys = await generateKeyPair('RS256');
  const publicJwk: JWK = { ...(await exportJWK(keys.publicKey)), kid: 'test' };
  // Mimic jose's remote JWKS: a function (protectedHeader) => key
  const getJwks = (() => () =>
    Promise.resolve(keys.publicKey)) as unknown as IVerifierDeps['getJwks'];
  const sign = async (
    claims: Record<string, unknown>,
    opts: { expired?: boolean } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
      .setIssuedAt()
      .setExpirationTime(opts.expired ? '-1h' : '1h')
      .sign(keys.privateKey);
  return { keys, deps: { getJwks }, sign };
}

describe('social-auth.config', () => {
  it('returns no providers when env is empty', () => {
    expect(getSocialAuthConfig({})).toEqual({});
  });

  it('builds the google allow-list from primary + extra client ids', () => {
    const cfg = getSocialAuthConfig({
      GOOGLE_CLIENT_ID: 'web',
      GOOGLE_CLIENT_SECRET: 's',
      GOOGLE_ALLOWED_CLIENT_IDS: ' ios , android,web ',
    });
    expect(cfg.google?.allowedClientIds).toEqual(['web', 'ios', 'android']);
    expect(cfg.facebook).toBeUndefined();
  });

  it('requires both facebook values', () => {
    expect(
      getSocialAuthConfig({ FACEBOOK_APP_ID: '1' }).facebook,
    ).toBeUndefined();
    expect(
      getSocialAuthConfig({ FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 'x' })
        .facebook,
    ).toEqual({ appId: '1', appSecret: 'x' });
  });
});

describe('verifyGoogleIdToken', () => {
  it('accepts a token whose aud is any allowed client id', async () => {
    const { deps, sign } = await makeSigner();
    const token = await sign({
      iss: 'https://accounts.google.com',
      aud: 'ios-client',
      sub: '1',
    });
    await expect(
      verifyGoogleIdToken(token, undefined, ['web-client', 'ios-client'], deps),
    ).resolves.toBe(true);
  });

  it('rejects a token for a client id outside the allow-list', async () => {
    const { deps, sign } = await makeSigner();
    const token = await sign({
      iss: 'accounts.google.com',
      aud: 'other',
      sub: '1',
    });
    await expect(
      verifyGoogleIdToken(token, undefined, ['web-client'], deps),
    ).resolves.toBe(false);
  });

  it('rejects wrong issuer, expired tokens and nonce mismatch', async () => {
    const { deps, sign } = await makeSigner();
    const wrongIss = await sign({
      iss: 'https://evil.example',
      aud: 'web',
      sub: '1',
    });
    const expired = await sign(
      { iss: 'https://accounts.google.com', aud: 'web', sub: '1' },
      { expired: true },
    );
    const withNonce = await sign({
      iss: 'https://accounts.google.com',
      aud: 'web',
      sub: '1',
      nonce: 'abc',
    });
    await expect(
      verifyGoogleIdToken(wrongIss, undefined, ['web'], deps),
    ).resolves.toBe(false);
    await expect(
      verifyGoogleIdToken(expired, undefined, ['web'], deps),
    ).resolves.toBe(false);
    await expect(
      verifyGoogleIdToken(withNonce, 'xyz', ['web'], deps),
    ).resolves.toBe(false);
    await expect(
      verifyGoogleIdToken(withNonce, 'abc', ['web'], deps),
    ).resolves.toBe(true);
  });

  it('rejects garbage and an empty allow-list', async () => {
    await expect(
      verifyGoogleIdToken('not-a-jwt', undefined, ['web']),
    ).resolves.toBe(false);
    await expect(verifyGoogleIdToken('a.b.c', undefined, [])).resolves.toBe(
      false,
    );
  });
});

describe('verifyFacebookToken', () => {
  const config = { appId: 'fb-app', appSecret: 'fb-secret' };

  it('verifies a Limited Login OIDC token against our app id', async () => {
    const { deps, sign } = await makeSigner();
    const good = await sign({
      iss: 'https://www.facebook.com',
      aud: 'fb-app',
      sub: '42',
    });
    const otherApp = await sign({
      iss: 'https://www.facebook.com',
      aud: 'someone-else',
      sub: '42',
    });
    await expect(
      verifyFacebookToken(good, undefined, config, deps),
    ).resolves.toBe(true);
    await expect(
      verifyFacebookToken(otherApp, undefined, config, deps),
    ).resolves.toBe(false);
    expect(decodeFacebookJwtSubject(good)).toBe('42');
  });

  it('validates a Graph access token through debug_token and requires our app_id', async () => {
    const calls: string[] = [];
    const makeFetch =
      (data: Record<string, unknown>, ok = true): FetchLike =>
      (url) => {
        calls.push(url);
        return Promise.resolve({ ok, json: () => Promise.resolve({ data }) });
      };

    await expect(
      verifyFacebookToken('EAAB-opaque-token', undefined, config, {
        fetch: makeFetch({ is_valid: true, app_id: 'fb-app', user_id: '42' }),
      }),
    ).resolves.toBe(true);
    expect(calls[0]).toContain('graph.facebook.com/debug_token');
    expect(calls[0]).toContain('input_token=EAAB-opaque-token');
    expect(calls[0]).toContain(encodeURIComponent('fb-app|fb-secret'));

    await expect(
      verifyFacebookToken('EAAB-opaque-token', undefined, config, {
        fetch: makeFetch({ is_valid: true, app_id: 'another-app' }),
      }),
    ).resolves.toBe(false);
    await expect(
      verifyFacebookToken('EAAB-opaque-token', undefined, config, {
        fetch: makeFetch({ is_valid: false, app_id: 'fb-app' }),
      }),
    ).resolves.toBe(false);
    await expect(
      verifyFacebookToken('EAAB-opaque-token', undefined, config, {
        fetch: makeFetch({ is_valid: true, app_id: 'fb-app' }, false),
      }),
    ).resolves.toBe(false);
    await expect(
      verifyFacebookToken('EAAB-opaque-token', undefined, config, {
        fetch: () => Promise.reject(new Error('network')),
      }),
    ).resolves.toBe(false);
  });
});

describe('profile mapping', () => {
  it('maps google given/family names with a fallback split', () => {
    expect(
      mapGoogleProfile({
        sub: '1',
        given_name: 'Ada',
        family_name: 'Lovelace',
      }),
    ).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(mapGoogleProfile({ sub: '1', name: 'Ada King Lovelace' })).toEqual({
      firstName: 'Ada',
      lastName: 'King Lovelace',
    });
  });

  it('marks facebook emails as verified and maps names', () => {
    expect(
      mapFacebookProfile({ id: '1', first_name: 'Ada', last_name: 'L' }),
    ).toEqual({
      firstName: 'Ada',
      lastName: 'L',
      emailVerified: true,
    });
  });
});

describe('buildSocialProviders', () => {
  it('returns undefined when nothing is configured', () => {
    expect(buildSocialProviders({})).toBeUndefined();
  });

  it('wires only configured providers with custom verifiers', () => {
    const providers = buildSocialProviders({
      facebook: { appId: 'fb', appSecret: 's' },
    }) as Record<string, Record<string, unknown>>;
    expect(Object.keys(providers)).toEqual(['facebook']);
    expect(providers.facebook.clientId).toBe('fb');
    expect(typeof providers.facebook.verifyIdToken).toBe('function');
    expect(providers.facebook.fields).toEqual(['first_name', 'last_name']);
  });
});
