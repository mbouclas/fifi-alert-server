import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  IsUrl,
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
    description: 'Callback URL after signup',
    example: 'https://example.com/welcome',
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
    description: 'URL to redirect to for password reset',
    example: 'https://example.com/reset-password',
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

  @ApiPropertyOptional({
    description: 'Session object (if applicable)',
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

  @ApiProperty({ description: 'User email address', example: 'john.doe@example.com' })
  email: string;

  @ApiProperty({ description: 'Whether email is verified', example: true })
  emailVerified: boolean;

  @ApiPropertyOptional({ description: 'Profile image URL', example: 'https://example.com/avatar.jpg' })
  image?: string;

  @ApiProperty({ description: 'Account creation date', example: '2025-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date', example: '2025-01-01T00:00:00.000Z' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'User settings', example: {} })
  settings?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'User metadata', example: {} })
  meta?: Record<string, unknown>;

  @ApiProperty({ description: 'User roles', type: [UserRoleDto] })
  roles: UserRoleDto[];

  @ApiProperty({ description: 'User gates (feature flags)', type: [UserGateDto] })
  gates: UserGateDto[];
}
