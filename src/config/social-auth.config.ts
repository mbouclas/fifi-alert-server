/**
 * Social login (Google / Facebook) configuration.
 *
 * Plain functions instead of `registerAs` because `src/auth.ts` builds the
 * better-auth instance at module load, before Nest's ConfigModule exists.
 *
 * A provider is only enabled when its credentials are present, so local
 * environments without console keys keep booting.
 */

export interface IGoogleSocialConfig {
  /** Primary (web) OAuth client ID. Used by better-auth for the code flow. */
  clientId: string;
  clientSecret: string;
  /**
   * Every client ID whose ID tokens we accept: web, iOS, Android. Google
   * issues one per platform inside the same Cloud project. Always contains
   * `clientId`.
   */
  allowedClientIds: string[];
}

export interface IFacebookSocialConfig {
  appId: string;
  appSecret: string;
}

export interface ISocialAuthConfig {
  google?: IGoogleSocialConfig;
  facebook?: IFacebookSocialConfig;
}

export type SocialProviderId = 'google' | 'facebook';

export const SOCIAL_PROVIDER_IDS: readonly SocialProviderId[] = [
  'google',
  'facebook',
] as const;

function splitList(value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getSocialAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): ISocialAuthConfig {
  const config: ISocialAuthConfig = {};

  const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (googleClientId && googleClientSecret) {
    const allowed = new Set<string>([
      googleClientId,
      ...splitList(env.GOOGLE_ALLOWED_CLIENT_IDS),
    ]);
    config.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      allowedClientIds: Array.from(allowed),
    };
  }

  const facebookAppId = env.FACEBOOK_APP_ID?.trim();
  const facebookAppSecret = env.FACEBOOK_APP_SECRET?.trim();
  if (facebookAppId && facebookAppSecret) {
    config.facebook = { appId: facebookAppId, appSecret: facebookAppSecret };
  }

  return config;
}

export function isSocialProviderConfigured(
  provider: SocialProviderId,
  config: ISocialAuthConfig = getSocialAuthConfig(),
): boolean {
  return Boolean(config[provider]);
}
