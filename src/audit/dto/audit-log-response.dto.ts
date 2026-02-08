/**
 * Audit Log Response DTOs
 *
 * Data transfer objects for audit log API responses.
 *
 * @module AuditLogResponseDto
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

/**
 * User summary included in audit log responses
 */
export class AuditUserDto {
  @ApiProperty({ description: 'User ID', example: 123 })
  id: number;

  @ApiProperty({ description: 'User email', example: 'user@example.com' })
  email: string;

  @ApiProperty({ description: 'User name', example: 'John Doe' })
  name: string;
}

/**
 * Single audit log entry response
 */
export class AuditLogResponseDto {
  @ApiProperty({ description: 'Audit log ID', example: 1 })
  id: number;

  @ApiProperty({
    enum: AUDIT_EVENT_TYPES,
    description: 'Event type',
    example: 'CREATE',
  })
  eventType: string;

  @ApiProperty({ description: 'Action description', example: 'alert_created' })
  action: string;

  @ApiPropertyOptional({
    enum: AUDIT_ENTITY_TYPES,
    description: 'Entity type',
    example: 'ALERT',
    nullable: true,
  })
  entityType?: string | null;

  @ApiPropertyOptional({ description: 'Entity ID', example: 456 })
  entityId?: number;

  @ApiPropertyOptional({
    description: 'Human-readable description',
    example: 'Alert created for missing dog',
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'User ID who was affected',
    example: 123,
  })
  userId?: number;

  @ApiPropertyOptional({
    description: 'Actor ID who performed action',
    example: 'user_123',
  })
  actorId?: string;

  @ApiPropertyOptional({ description: 'Actor type', example: 'user' })
  actorType?: string;

  @ApiPropertyOptional({
    description: 'Previous state',
    example: { status: 'DRAFT' },
  })
  oldValues?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'New state',
    example: { status: 'ACTIVE' },
  })
  newValues?: Record<string, any>;

  @ApiPropertyOptional({ description: 'IP address', example: '192.168.1.1' })
  ipAddress?: string;

  @ApiPropertyOptional({ description: 'User agent string' })
  userAgent?: string;

  @ApiPropertyOptional({ description: 'Session ID', example: 'sess_123abc' })
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Request ID', example: 'req_456def' })
  requestId?: string;

  @ApiProperty({ description: 'Operation success status', example: true })
  success: boolean;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  errorMessage?: string;

  @ApiPropertyOptional({ description: 'Error stack trace if failed' })
  errorStack?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { confidence: 'HIGH' },
  })
  metadata?: Record<string, any>;

  @ApiProperty({
    description: 'Event timestamp',
    example: '2026-02-07T10:30:00Z',
  })
  timestamp: Date;

  @ApiProperty({
    description: 'Record creation timestamp',
    example: '2026-02-07T10:30:00Z',
  })
  createdAt: Date;

  @ApiPropertyOptional({
    type: () => AuditUserDto,
    description: 'User who was affected',
  })
  user?: AuditUserDto;
}

/**
 * Paginated audit logs response
 */
export class AuditLogListResponseDto {
  @ApiProperty({
    type: [AuditLogResponseDto],
    description: 'List of audit log entries',
  })
  data: AuditLogResponseDto[];

  @ApiProperty({ description: 'Total number of records', example: 150 })
  total: number;

  @ApiProperty({ description: 'Current page', example: 1 })
  page: number;

  @ApiProperty({ description: 'Items per page', example: 50 })
  limit: number;

  @ApiProperty({ description: 'Total pages', example: 3 })
  totalPages: number;
}

/**
 * Audit statistics response
 */
export class AuditStatisticsResponseDto {
  @ApiProperty({ description: 'Total number of events', example: 1500 })
  totalEvents: number;

  @ApiProperty({
    description: 'Events grouped by type',
    example: { CREATE: 500, UPDATE: 400, DELETE: 100 },
  })
  eventsByType: Record<string, number>;

  @ApiProperty({
    description: 'Events grouped by entity',
    example: { ALERT: 600, USER: 400, DEVICE: 300 },
  })
  eventsByEntity: Record<string, number>;

  @ApiProperty({ description: 'Failure rate percentage', example: 2.5 })
  failureRate: number;

  @ApiProperty({
    description: 'Top users by activity',
    example: [
      { userId: 123, count: 50 },
      { userId: 456, count: 30 },
    ],
  })
  topUsers: Array<{ userId: number; count: number }>;
}
