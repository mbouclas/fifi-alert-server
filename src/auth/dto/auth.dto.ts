import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  IsUrl,
  IsIn,
} from 'class-validator';

/**
 * DTO for user login
 */
export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'securePassword123',
    minLength: 4,
  })
  @IsString()
  @MinLength(4)
  password: string;
}

/**
 * DTO for user signup
 */
export class SignupDto {
  @ApiProperty({
    description: "User's first name",
    example: 'John',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({
    description: "User's last name",
    example: 'Doe',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'securePassword123',
    minLength: 4,
  })
  @IsString()
  @MinLength(4)
  password: string;

  @ApiPropertyOptional({
    description: 'Profile image URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  image?: string;

  @ApiPropertyOptional({
    description:
      'Optional URL carried as `callbackURL` on the verification link in the signup email. ' +
      'Defaults to the mobile deep link (`fifi-alert://verify-email`). ' +
      'Must be an allowed origin. The web app can use it to hand off to the mobile app after verifying.',
    example: 'fifi-alert://verify-email',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  callbackURL?: string;
}

/**
 * DTO for requesting password reset
 */
export class RequestPasswordResetDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description:
      'Web app page that receives the reset token, e.g. `{WEB_APP_URL}/reset-password`. ' +
      'The page then calls POST /auth/reset-password with the token.',
    example: 'http://localhost:5173/reset-password',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  redirectTo?: string;
}

/**
 * DTO for resetting password with token
 */
export class ResetPasswordDto {
  @ApiProperty({
    description: 'New password',
    example: 'newSecurePassword123',
    minLength: 4,
  })
  @IsString()
  @MinLength(4)
  newPassword: string;

  @ApiProperty({
    description: 'Password reset token from email',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  token: string;
}

/**
 * DTO for requesting an email address change (authenticated user)
 */
export class ChangeEmailDto {
  @ApiProperty({
    description:
      'The new email address. A confirmation link is sent to the CURRENT address first; ' +
      'once approved, a verification link is sent to the new address.',
    example: 'new.address@example.com',
  })
  @IsEmail()
  newEmail: string;

  @ApiPropertyOptional({
    description:
      'Where the web app should land after the change is confirmed. Defaults to the mobile deep link.',
    example: 'fifi-alert://verify-email',
  })
  @IsOptional()
  @IsString()
  callbackURL?: string;
}

/**
 * DTO for requesting account deletion (authenticated user)
 */
export class DeleteAccountRequestDto {
  @ApiPropertyOptional({
    description:
      'Where the web app should land after deletion completes. Defaults to the web app root.',
    example: 'https://fifi-alert.com/goodbye',
  })
  @IsOptional()
  @IsString()
  callbackURL?: string;
}

/**
 * DTO for confirming account deletion with the emailed token
 */
export class DeleteAccountConfirmDto {
  @ApiProperty({
    description: 'Deletion token from the verification email',
    example: 'k3j4h5g6f7d8s9a0b1c2d3e4f5g6h7i8',
  })
  @IsString()
  token: string;
}

/**
 * DTO for updating password (authenticated user)
 */
export class UpdatePasswordDto {
  @ApiProperty({
    description: 'Current password',
    example: 'currentPassword123',
    minLength: 4,
  })
  @IsString()
  @MinLength(4)
  currentPassword: string;

  @ApiProperty({
    description: 'New password',
    example: 'newSecurePassword123',
    minLength: 4,
  })
  @IsString()
  @MinLength(4)
  newPassword: string;

  @ApiPropertyOptional({
    description: 'Whether to revoke other sessions after password change',
    example: true,
    default: false,
  })
  @IsOptional()
  revokeOtherSessions?: boolean;
}

/**
 * DTO for refreshing tokens
 */
export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token issued at login or by the previous refresh',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  refreshToken: string;
}

/**
 * Response DTO for token refresh. The presented refresh token is revoked and
 * a NEW refresh token is returned; clients must persist both new tokens.
 */
export class RefreshResponseDto {
  @ApiProperty({
    description: 'New JWT access token for API requests',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Access token expiration date (ISO 8601)',
    example: '2026-02-04T12:15:00.000Z',
  })
  expiresAt: string;

  @ApiProperty({
    description:
      'New JWT refresh token. The one sent in the request is now revoked.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Refresh token expiration date (ISO 8601)',
    example: '2026-03-06T12:00:00.000Z',
  })
  refreshExpiresAt: string;
}

/**
 * DTO for logout. The access token comes from the Authorization header; the
 * refresh token is optional but should be sent so it is revoked too.
 */
export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Refresh token to revoke alongside the access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

/**
 * Response DTO for logout-all
 */
export class LogoutAllResponseDto {
  @ApiProperty({ example: 'All sessions revoked' })
  message: string;

  @ApiProperty({
    description: 'Number of access/refresh tokens revoked',
    example: 4,
  })
  revokedCount: number;
}

/**
 * Response DTO for authentication operations
 */
export class AuthResponseDto {
  @ApiProperty({
    description: 'Response message',
    example: 'Operation successful',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'User object (if applicable)',
  })
  user?: {
    id: string;
    email: string;
    name?: string;
  };

  /**
   * @deprecated Always undefined since the auth hardening release. The
   * better-auth session cookie token is no longer exposed to clients; use
   * `accessToken` / `refreshToken`. Kept for one release so client typings
   * keep compiling. Will be removed.
   */
  @ApiPropertyOptional({
    description:
      'DEPRECATED. Always absent. Use accessToken / refreshToken instead.',
    deprecated: true,
  })
  session?: {
    token: string;
    expiresAt?: string;
  };

  @ApiPropertyOptional({
    description: 'JWT access token for API requests',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken?: string;

  @ApiPropertyOptional({
    description: 'JWT refresh token for obtaining new access tokens',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken?: string;

  @ApiPropertyOptional({
    description: 'Access token expiration date',
    example: '2026-02-04T12:00:00.000Z',
  })
  expiresAt?: string;

  @ApiPropertyOptional({
    description: 'Refresh token expiration date',
    example: '2026-03-06T12:00:00.000Z',
  })
  refreshExpiresAt?: string;
}

/**
 * Role DTO for user relationships
 */
export class RoleDto {
  @ApiProperty({ description: 'Role ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Role name', example: 'Admin' })
  name: string;

  @ApiProperty({ description: 'Role slug', example: 'admin' })
  slug: string;

  @ApiProperty({ description: 'Role level', example: 10 })
  level: number;
}

/**
 * UserRole DTO for user relationships
 */
export class UserRoleDto {
  @ApiProperty({ description: 'UserRole ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Role details', type: RoleDto })
  role: RoleDto;
}

/**
 * Gate DTO for feature flags
 */
export class GateDto {
  @ApiProperty({ description: 'Gate ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Gate name', example: 'Premium Features' })
  name: string;

  @ApiProperty({ description: 'Gate slug', example: 'premium-features' })
  slug: string;

  @ApiProperty({ description: 'Whether gate is active', example: true })
  active: boolean;
}

/**
 * UserGate DTO for user relationships
 */
export class UserGateDto {
  @ApiProperty({ description: 'UserGate ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Gate details', type: GateDto })
  gate: GateDto;
}

/**
 * Response DTO for /auth/me endpoint
 */
export class MeResponseDto {
  @ApiProperty({ description: 'User ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'User full name', example: 'John Doe' })
  name: string;

  @ApiProperty({ description: 'User first name', example: 'John' })
  firstName: string;

  @ApiProperty({ description: 'User last name', example: 'Doe' })
  lastName: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  email: string;

  @ApiProperty({ description: 'Whether email is verified', example: true })
  emailVerified: boolean;

  @ApiPropertyOptional({
    description: 'Profile image URL',
    example: 'https://example.com/avatar.jpg',
  })
  image?: string;

  @ApiProperty({
    description: 'Account creation date',
    example: '2025-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update date',
    example: '2025-01-01T00:00:00.000Z',
  })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'User settings', example: {} })
  settings?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'User metadata', example: {} })
  meta?: Record<string, unknown>;

  @ApiProperty({ description: 'User roles', type: [UserRoleDto] })
  roles: UserRoleDto[];

  @ApiProperty({
    description: 'User gates (feature flags)',
    type: [UserGateDto],
  })
  gates: UserGateDto[];
}

/**
 * DTO for social login (Google / Facebook).
 *
 * The client obtains the provider token itself (Google Identity Services,
 * Facebook JS SDK, native mobile SDKs) and sends it here for verification.
 */
export class SocialLoginDto {
  @ApiProperty({
    description: 'Social provider id',
    enum: ['google', 'facebook'],
    example: 'google',
  })
  @IsString()
  @IsIn(['google', 'facebook'])
  provider: 'google' | 'facebook';

  @ApiProperty({
    description:
      'Provider token. Google: the ID token (JWT) from any platform. ' +
      'Facebook iOS Limited Login: the OIDC ID token (JWT). ' +
      'Facebook web / Android: the Graph access token (also send it as accessToken).',
    example: 'eyJhbGciOiJSUzI1NiIs...',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(8192)
  token: string;

  @ApiPropertyOptional({
    description:
      'Provider access token. Required for Facebook when `token` is a Graph access token ' +
      '(send the same value in both fields). Optional for Google.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  accessToken?: string;

  @ApiPropertyOptional({
    description:
      'Nonce the client passed to the provider SDK, when one was used. Verified against the token.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  nonce?: string;
}
