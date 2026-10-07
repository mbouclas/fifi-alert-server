import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaSingleton } from '@services/prisma-singleton.service';
import { SharedModule } from '@shared/shared.module';
import { getSocialAuthConfig } from '@config/social-auth.config';
import { buildSocialProviders } from './auth/social/social-providers';
import {
  buildWebDeleteAccountUrl,
  buildWebResetPasswordUrl,
  buildWebVerificationUrl,
  getEmailVerificationCallbackURL,
} from './auth/auth-links';
import {
  AUTH_EVENT_NAMES,
  type IAccountDeletionPayload,
  type IAccountDeletionVerificationRequestedPayload,
  type IEmailChangeConfirmationRequestedPayload,
  type IEmailVerifiedPayload,
  type IPasswordResetEmailRequestedPayload,
  type IPasswordUpdatedPayload,
} from './auth/auth-events';

const prisma = PrismaSingleton.getInstance();
const logger = new Logger('BetterAuth');

// Auth configuration constants - read from env with defaults
const AUTH_PASSWORD_MIN_LENGTH =
  parseInt(String(process.env.AUTH_PASSWORD_MIN_LENGTH), 10) || 4;

/** Seconds a password-reset token stays valid (better-auth default: 1 hour). */
export const AUTH_PASSWORD_RESET_TOKEN_EXPIRES_IN =
  parseInt(String(process.env.AUTH_PASSWORD_RESET_TOKEN_EXPIRES_IN), 10) ||
  60 * 60;

/** Seconds an email-verification / email-change token stays valid. */
export const AUTH_EMAIL_VERIFICATION_EXPIRES_IN =
  parseInt(String(process.env.AUTH_EMAIL_VERIFICATION_EXPIRES_IN), 10) ||
  60 * 60 * 24;

/** Seconds an account-deletion token stays valid (better-auth default: 24h). */
export const AUTH_DELETE_ACCOUNT_TOKEN_EXPIRES_IN =
  parseInt(String(process.env.AUTH_DELETE_ACCOUNT_TOKEN_EXPIRES_IN), 10) ||
  60 * 60 * 24;

/**
 * better-auth's own rate limiter guards the raw `/api/auth/*` routes (the
 * Nest controller routes under `/auth/*` use `@Throttle` instead). Defaults to
 * on in production, off elsewhere; override with AUTH_RATE_LIMIT_ENABLED.
 */
function isBetterAuthRateLimitEnabled(): boolean {
  const raw = process.env.AUTH_RATE_LIMIT_ENABLED;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

// Re-exported so existing imports (`from '../auth'`) keep working.
export {
  getEmailVerificationCallbackURL,
  buildWebVerificationUrl,
  buildWebResetPasswordUrl,
  buildWebDeleteAccountUrl,
};

function getBetterAuthURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) {
    return stripTrailingSlash(process.env.BETTER_AUTH_URL);
  }

  const apiBaseUrl = process.env.API_BASE_URL;
  return apiBaseUrl ? `${stripTrailingSlash(apiBaseUrl)}/api/auth` : undefined;
}

function getTrustedOrigins(): string[] {
  const configuredOrigins = [
    process.env.ALLOWED_ORIGIN,
    process.env.ALLOWED_ORIGINS,
    process.env.EMAIL_VERIFICATION_CALLBACK_URL,
    process.env.MOBILE_EMAIL_VERIFICATION_URL,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return configuredOrigins.length > 0 ? configuredOrigins : ['*'];
}

/**
 * Emit a domain event for `UserService` to pick up. All email sending happens
 * in the listener, never here, so a mail outage can't break the auth flow and
 * timing stays constant (no email enumeration through response latency).
 */
function emit<T>(event: string, payload: T): Promise<void> {
  const emitter = SharedModule.eventEmitter;
  if (!emitter) {
    logger.warn(`Event emitter not ready; dropping ${event}`);
    return Promise.resolve();
  }
  emitter.emit(event, payload);
  // better-auth expects a Promise from every hook.
  return Promise.resolve();
}

const socialAuthConfig = getSocialAuthConfig();
const socialProviders = buildSocialProviders(socialAuthConfig);
logger.log(
  `Social providers enabled: ${
    socialProviders ? Object.keys(socialProviders).join(', ') : 'none'
  }`,
);

export const auth = betterAuth({
  basePath: '/api/auth',
  baseURL: getBetterAuthURL(),
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  experimental: { joins: true },
  // Google / Facebook. Clients obtain the provider token themselves (web JS
  // SDKs, native SDKs) and POST it to `/auth/social`; we never run the
  // redirect flow, so no callback URL is registered for this server.
  ...(socialProviders ? { socialProviders: socialProviders as any } : {}),
  account: {
    accountLinking: {
      enabled: true,
      // A social sign-in whose email matches an existing (credentials) user
      // attaches to that user instead of failing with `account_not_linked`.
      // Google reports email_verified; Facebook does not, hence "trusted".
      trustedProviders: ['google', 'facebook'],
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: AUTH_PASSWORD_MIN_LENGTH,
    resetPasswordTokenExpiresIn: AUTH_PASSWORD_RESET_TOKEN_EXPIRES_IN,
    // Runs for `POST /auth/request-password-reset`. better-auth only calls it
    // when the email exists; the controller returns the same message either way.
    sendResetPassword: ({ user, url, token }) =>
      emit<IPasswordResetEmailRequestedPayload>(
        AUTH_EVENT_NAMES.PASSWORD_RESET_EMAIL_REQUESTED,
        {
          user,
          resetUrl: buildWebResetPasswordUrl(url, token),
          token,
          expiresInSeconds: AUTH_PASSWORD_RESET_TOKEN_EXPIRES_IN,
        },
      ),
    // Runs after `POST /auth/reset-password` wrote the new hash.
    onPasswordReset: ({ user }) =>
      emit<IPasswordUpdatedPayload>(AUTH_EVENT_NAMES.PASSWORD_UPDATED, {
        userId: Number(user.id),
        user,
        source: 'reset',
      }),
    // Drops better-auth cookie sessions. Our JWT access/refresh rows are
    // revoked separately by AuthController.resetPassword via TokenService.
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    expiresIn: AUTH_EMAIL_VERIFICATION_EXPIRES_IN,
    sendVerificationEmail: ({ user, url, token }) =>
      emit(AUTH_EVENT_NAMES.ACCOUNT_VERIFICATION_EMAIL_REQUESTED, {
        user,
        verificationUrl: buildWebVerificationUrl(url, token),
        token,
      }),
    // The welcome email already goes out at sign-up (UserService.store), so
    // verification only records the audit trail.
    afterEmailVerification: (user) =>
      emit<IEmailVerifiedPayload>(AUTH_EVENT_NAMES.EMAIL_VERIFIED, { user }),
    // `onEmailVerification` (the BEFORE hook) is intentionally unset: nothing
    // needs to veto a verification. `autoSignInAfterVerification` stays off
    // because clients authenticate with our JWTs, not better-auth cookies.
  },
  advanced: {
    database: {
      // Use "serial" for autoincrement integer IDs - Better Auth will convert between string and numeric types
      generateId: 'serial',
    },
  },
  user: {
    // Map firstName and lastName as additional fields
    additionalFields: {
      firstName: {
        type: 'string',
        required: false,
        defaultValue: '',
        fieldName: 'firstName',
      },
      lastName: {
        type: 'string',
        required: false,
        defaultValue: '',
        fieldName: 'lastName',
      },
    },
    changeEmail: {
      enabled: true,
      // Step 1 of 2: the CURRENT address must approve the change. better-auth
      // then emails the NEW address through `sendVerificationEmail` above.
      // Both links resolve through `GET /api/auth/verify-email`.
      sendChangeEmailConfirmation: ({ user, newEmail, url, token }) =>
        emit<IEmailChangeConfirmationRequestedPayload>(
          AUTH_EVENT_NAMES.EMAIL_CHANGE_CONFIRMATION_REQUESTED,
          {
            user,
            newEmail,
            confirmUrl: buildWebVerificationUrl(url, token),
            token,
            expiresInSeconds: AUTH_EMAIL_VERIFICATION_EXPIRES_IN,
          },
        ),
      // Unverified users cannot side-step verification by changing address.
      updateEmailWithoutVerification: false,
    },
    deleteUser: {
      enabled: true,
      deleteTokenExpiresIn: AUTH_DELETE_ACCOUNT_TOKEN_EXPIRES_IN,
      sendDeleteAccountVerification: ({ user, token }) =>
        emit<IAccountDeletionVerificationRequestedPayload>(
          AUTH_EVENT_NAMES.ACCOUNT_DELETION_VERIFICATION_REQUESTED,
          {
            user,
            deleteUrl: buildWebDeleteAccountUrl(token),
            token,
            expiresInSeconds: AUTH_DELETE_ACCOUNT_TOKEN_EXPIRES_IN,
          },
        ),
      beforeDelete: (user) =>
        emit<IAccountDeletionPayload>(
          AUTH_EVENT_NAMES.ACCOUNT_DELETION_STARTED,
          { user },
        ),
      // Prisma cascades remove sessions, accounts, pets, alerts, etc.
      afterDelete: (user) =>
        emit<IAccountDeletionPayload>(AUTH_EVENT_NAMES.ACCOUNT_DELETED, {
          user,
        }),
    },
  },
  trustedOrigins: getTrustedOrigins(),
  rateLimit: {
    enabled: isBetterAuthRateLimitEnabled(),
    // Memory storage is per process; multi-instance deployments should switch
    // to `storage: 'database'` (needs a rateLimit table in the Prisma schema).
    storage: 'memory',
    window: 60,
    max: 100,
    customRules: {
      '/request-password-reset': { window: 60 * 60, max: 3 },
      '/forget-password': { window: 60 * 60, max: 3 },
      '/send-verification-email': { window: 60 * 60, max: 5 },
      '/change-email': { window: 60 * 60, max: 3 },
      '/delete-user': { window: 60 * 60, max: 3 },
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-in/social': { window: 60, max: 10 },
      '/sign-up/email': { window: 60 * 60, max: 3 },
    },
  },
  onAPIError: {
    // Let the caller (usually AuthController) turn the APIError into an HTTP
    // response; we only want the server-side trace.
    throw: true,
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`better-auth API error: ${message}`);
    },
  },
  // Request-level `hooks.before/after` are intentionally empty. Every client
  // reaches better-auth through AuthController, which already emits the
  // login/logout/signup audit events; a `hooks.after` on `/sign-in/email`
  // would double-count them. Keep the key so plugins can extend it.
  hooks: {},
});
