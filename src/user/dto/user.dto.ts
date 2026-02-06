import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsArray,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating a new user
 */
export class CreateUserDto {
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
    description: "User's email address",
    example: 'john.doe@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: "User's password",
    example: 'securePassword123',
    minLength: 4,
  })
  @IsString()
  @MinLength(4)
  password: string;

  @ApiPropertyOptional({
    description: 'Array of role slugs to assign to the user',
    example: ['user', 'editor'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @ApiPropertyOptional({
    description: 'Profile image URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({
    description: 'Whether the email is pre-verified',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}

/**
 * DTO for updating a user
 */
export class UpdateUserDto {
  @ApiPropertyOptional({
    description: "User's first name",
    example: 'John',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    description: "User's last name",
    example: 'Doe',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    description: "User's display name",
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: "User's email address",
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Profile image URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({
    description: 'Whether the email is verified',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @ApiPropertyOptional({
    description: 'New password (will be hashed)',
    example: 'newSecurePassword123',
    minLength: 4,
  })
  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;
}

/**
 * DTO for querying users with pagination
 */
export class FindUsersQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of results to return',
    example: 10,
    default: 10,
  })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Number of results to skip',
    example: 0,
    default: 0,
  })
  @IsOptional()
  offset?: number;

  @ApiPropertyOptional({
    description: 'Relationships to include (comma-separated)',
    example: 'roles,sessions',
  })
  @IsOptional()
  @IsString()
  include?: string;

  @ApiPropertyOptional({
    description: 'Field to order results by',
    example: 'createdAt',
    default: 'id',
  })
  @IsOptional()
  @IsString()
  orderBy?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    example: 'desc',
    default: 'asc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsString()
  orderDir?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Filter by email (partial match)',
    example: '@example.com',
  })
  @IsOptional()
  @IsString()
  email?: string;
}
