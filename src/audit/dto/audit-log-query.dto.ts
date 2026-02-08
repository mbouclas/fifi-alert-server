/**
 * Audit Log Query DTO
 *
 * Data transfer object for querying audit logs with filters and pagination.
 *
 * @module AuditLogQueryDto
 */

import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsIn,
  IsBoolean,
  IsString,
  IsDateString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Define enum values as constants to avoid Swagger circular dependency with Prisma enums
const AUDIT_EVENT_TYPES = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'ACCESS',
  'EXPORT',
  'IMPORT',
  'APPROVAL',
  'REJECTION',
  'SEND',
  'RECEIVE',
  'ACTIVATION',
  'DEACTIVATION',
  'ROTATION',
  'REVOCATION',
  'RESET',
  'FAILURE',
  'SUCCESS',
  'SYSTEM',
] as const;
const AUDIT_ENTITY_TYPES = [
  'USER',
  'ALERT',
  'SIGHTING',
  'DEVICE',
  'SAVED_ZONE',
  'NOTIFICATION',
  'SESSION',
  'ROLE',
  'GATE',
  'EMAIL',
  'LOCATION',
  'SYSTEM',
] as const;

export class AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50;

  @ApiPropertyOptional({
    enum: AUDIT_EVENT_TYPES,
    description: 'Filter by event type',
    example: 'CREATE',
  })
  @IsOptional()
  @IsIn(AUDIT_EVENT_TYPES)
  eventType?: string;

  @ApiPropertyOptional({
    enum: AUDIT_ENTITY_TYPES,
    description: 'Filter by entity type',
    example: 'ALERT',
  })
  @IsOptional()
  @IsIn(AUDIT_ENTITY_TYPES)
  entityType?: string;

  @ApiPropertyOptional({ description: 'Filter by entity ID', example: 123 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  entityId?: number;

  @ApiPropertyOptional({ description: 'Filter by user ID', example: 456 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional({
    description: 'Filter by actor ID',
    example: 'user_123',
  })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({
    description: 'Filter by success status',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  success?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by action (partial match)',
    example: 'login',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    description: 'Start date for filtering (ISO 8601)',
    example: '2026-02-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering (ISO 8601)',
    example: '2026-02-07T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
