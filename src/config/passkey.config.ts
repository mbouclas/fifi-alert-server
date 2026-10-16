/**
 * WebAuthn relying-party configuration.
 *
 * Read from env at boot (plain function, same style as social-auth.config.ts)
 * so the effective values can be logged and the parsing unit-tested without
 * booting Nest.
 *
 *   RP_ID       host the web app is served from, no scheme / port
 *               (prod: app.fifi-alert.com, dev: localhost or 192.168.50.26)
 *   RP_NAME     label shown by the authenticator UI
 *   RP_ORIGINS  comma-separated list of allowed origins, scheme + host [+ port]
 *               (dev: http://localhost:4173,https://localhost:4173)
 *
 * A wrong RP_ID fails silently in the browser (SecurityError), hence the boot
 * log in PasskeyService.
 */
export interface IPasskeyConfig {
  rpId: string;
  rpName: string;
  origins: string[];
  /** true when RP_ID and at least one origin are set */
  enabled: boolean;
}

export const DEFAULT_RP_NAME = 'FiFi Alert';

function splitList(value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getPasskeyConfig(
  env: NodeJS.ProcessEnv = process.env,
): IPasskeyConfig {
  const rpId = env.RP_ID?.trim() ?? '';
  const rpName = env.RP_NAME?.trim() || DEFAULT_RP_NAME;
  const origins = splitList(env.RP_ORIGINS).map((o) => o.replace(/\/+$/, ''));

  return {
    rpId,
    rpName,
    origins,
    enabled: rpId.length > 0 && origins.length > 0,
  };
}
