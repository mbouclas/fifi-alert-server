/**
 * Domain event names emitted by the better-auth configuration in
 * `src/auth.ts`.
 *
 * `src/auth.ts` is a plain module (no Nest DI) and `UserService` imports it,
 * so the event names live here to avoid a circular import. `UserService`
 * listens to these via `@OnEvent` and sends the matching email template.
 */
export const AUTH_EVENT_NAMES = {
  /** Sign-up / resend: send the "verify your account" email. */
  ACCOUNT_VERIFICATION_EMAIL_REQUESTED: 'ACCOUNT_VERIFICATION_EMAIL_REQUESTED',
  /** `POST /auth/request-password-reset`: send the reset link. */
  PASSWORD_RESET_EMAIL_REQUESTED: 'PASSWORD_RESET_EMAIL_REQUESTED',
  /** Password changed by reset, by the user, or by an admin. */
  PASSWORD_UPDATED: 'PASSWORD_UPDATED',
  /** better-auth marked the user's email as verified. */
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  /** `POST /auth/change-email`: confirmation link sent to the CURRENT address. */
  EMAIL_CHANGE_CONFIRMATION_REQUESTED: 'EMAIL_CHANGE_CONFIRMATION_REQUESTED',
  /** `POST /auth/delete-account`: verification link sent before deletion. */
  ACCOUNT_DELETION_VERIFICATION_REQUESTED:
    'ACCOUNT_DELETION_VERIFICATION_REQUESTED',
  /** better-auth is about to delete the user row. */
  ACCOUNT_DELETION_STARTED: 'ACCOUNT_DELETION_STARTED',
  /** better-auth deleted the user row. */
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
} as const;

export type AuthEventName =
  (typeof AUTH_EVENT_NAMES)[keyof typeof AUTH_EVENT_NAMES];

/** Minimal user shape better-auth hands to its callbacks. */
export interface IAuthEventUser {
  id: string | number;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailVerified?: boolean;
  [key: string]: unknown;
}

export type PasswordUpdatedSource = 'reset' | 'change' | 'admin';

export interface IPasswordResetEmailRequestedPayload {
  user: IAuthEventUser;
  resetUrl: string;
  token: string;
  expiresInSeconds: number;
}

export interface IPasswordUpdatedPayload {
  userId: number;
  user?: IAuthEventUser;
  source: PasswordUpdatedSource;
}

export interface IEmailVerifiedPayload {
  user: IAuthEventUser;
}

export interface IEmailChangeConfirmationRequestedPayload {
  user: IAuthEventUser;
  newEmail: string;
  confirmUrl: string;
  token: string;
  expiresInSeconds: number;
}

export interface IAccountDeletionVerificationRequestedPayload {
  user: IAuthEventUser;
  deleteUrl: string;
  token: string;
  expiresInSeconds: number;
}

export interface IAccountDeletionPayload {
  user: IAuthEventUser;
}
