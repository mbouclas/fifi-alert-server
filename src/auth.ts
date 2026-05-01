import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaSingleton } from '@services/prisma-singleton.service';
import { SharedModule } from '@shared/shared.module';

const prisma = PrismaSingleton.getInstance();

// Auth configuration constants - read from env with defaults
const AUTH_PASSWORD_MIN_LENGTH =
  parseInt(String(process.env.AUTH_PASSWORD_MIN_LENGTH), 10) || 4;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getEmailVerificationCallbackURL(): string {
  return (
    process.env.EMAIL_VERIFICATION_CALLBACK_URL ||
    process.env.MOBILE_EMAIL_VERIFICATION_URL ||
    'fifi-alert://verify-email'
  );
}

function getBetterAuthURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) {
    return stripTrailingSlash(process.env.BETTER_AUTH_URL);
  }

  const apiBaseUrl = process.env.API_BASE_URL || process.env.APP_URL;
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

export const auth = betterAuth({
  basePath: '/api/auth',
  baseURL: getBetterAuthURL(),
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  experimental: { joins: true },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: AUTH_PASSWORD_MIN_LENGTH,
  },
  emailVerification: {
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url, token }) => {
      SharedModule.eventEmitter?.emit('ACCOUNT_VERIFICATION_EMAIL_REQUESTED', {
        user,
        verificationUrl: url,
        token,
      });
    },
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
  },
  trustedOrigins: getTrustedOrigins(),
  hooks: {}, // Minimum required to use hooks
});
