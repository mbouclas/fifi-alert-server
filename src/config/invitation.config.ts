/**
 * "Invite a friend" configuration (BACKEND_WORK_ORDER_INVITATIONS.md §3.0).
 *
 * Read from env at boot (plain function, same style as passkey.config.ts) so
 * the effective values can be logged and the parsing unit-tested without
 * booting Nest.
 *
 *   INVITE_BASE_URL                 web app origin; accept link =
 *                                   `${INVITE_BASE_URL}/accept-invite?token=<raw>`.
 *                                   Unset → every /invitations endpoint answers 503.
 *   INVITE_TTL_DAYS                 pending → expired after this (default 30)
 *   INVITE_DAILY_LIMIT              sends + resends per sender, rolling 24 h (default 20)
 *   INVITE_RESEND_COOLDOWN_MINUTES  per invitation (default 60)
 *   INVITE_FROM                     From header; falls back to MAIL_NOTIFICATIONS_FROM
 *   INVITE_GLOBAL_HOURLY_LIMIT      sends across ALL senders per rolling hour
 *                                   (default 500, 0 disables) — a compromised
 *                                   account can still send phishing-looking mail
 *                                   under our domain, this caps the damage.
 */
export interface IInvitationConfig {
  baseUrl: string;
  ttlDays: number;
  dailyLimit: number;
  resendCooldownMinutes: number;
  from: string;
  globalHourlyLimit: number;
  /** true when INVITE_BASE_URL is set */
  enabled: boolean;
}

export const INVITE_DEFAULTS = {
  ttlDays: 30,
  dailyLimit: 20,
  resendCooldownMinutes: 60,
  globalHourlyLimit: 500,
} as const;

function positiveInt(
  value: string | undefined,
  fallback: number,
  allowZero = false,
): number {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return fallback;
  if (n === 0 && !allowZero) return fallback;
  return n;
}

export function getInvitationConfig(
  env: NodeJS.ProcessEnv = process.env,
): IInvitationConfig {
  const baseUrl = (env.INVITE_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const from =
    (env.INVITE_FROM ?? '').trim() ||
    (env.MAIL_NOTIFICATIONS_FROM ?? '').trim();

  return {
    baseUrl,
    ttlDays: positiveInt(env.INVITE_TTL_DAYS, INVITE_DEFAULTS.ttlDays),
    dailyLimit: positiveInt(env.INVITE_DAILY_LIMIT, INVITE_DEFAULTS.dailyLimit),
    resendCooldownMinutes: positiveInt(
      env.INVITE_RESEND_COOLDOWN_MINUTES,
      INVITE_DEFAULTS.resendCooldownMinutes,
      true,
    ),
    from,
    globalHourlyLimit: positiveInt(
      env.INVITE_GLOBAL_HOURLY_LIMIT,
      INVITE_DEFAULTS.globalHourlyLimit,
      true,
    ),
    enabled: baseUrl.length > 0,
  };
}

export function buildInviteAcceptUrl(
  baseUrl: string,
  rawToken: string,
): string {
  return `${baseUrl}/accept-invite?token=${encodeURIComponent(rawToken)}`;
}
