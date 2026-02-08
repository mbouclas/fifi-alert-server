/**
 * Audit Log Controller
 *
 * REST API endpoints for querying and retrieving audit logs.
 * All endpoints are admin-only and require proper authentication.
 *
 * @module AuditLogController
 */

import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import {
  AuditLogListResponseDto,
  AuditLogResponseDto,
  AuditStatisticsResponseDto,
} from './dto/audit-log-response.dto';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { Roles } from '../auth/decorators/roles.decorator';

// Define entity types constant to avoid Swagger circular dependency
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

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('api/audit-log')
@UseGuards(BearerTokenGuard)
@Roles('admin')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({
    summary: 'Get audit logs',
    description:
      'Retrieve paginated audit logs with optional filters. Admin only.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Audit logs retrieved successfully',
    type: AuditLogListResponseDto,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin access required',
  })
  async getAuditLogs(@Query() query: AuditLogQueryDto): Promise<any> {
    const { page = 1, limit = 50, startDate, endDate, ...filters } = query;

    const result = await this.auditLogService.getAuditLogs({
      page,
      limit,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      ...filters,
    });

    const totalPages = Math.ceil(result.total / result.limit);

    return {
      ...result,
      totalPages,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get audit log by ID',
    description: 'Retrieve a single audit log entry by ID. Admin only.',
  })
  @ApiParam({ name: 'id', description: 'Audit log ID', type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Audit log retrieved successfully',
    type: AuditLogResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Audit log not found',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin access required',
  })
  async getAuditLogById(@Param('id', ParseIntPipe) id: number): Promise<any> {
    const auditLog = await this.auditLogService.findOne(id);

    if (!auditLog) {
      throw new NotFoundException(`Audit log with ID ${id} not found`);
    }

    return auditLog;
  }

  @Get('entity/:entityType/:entityId')
  @ApiOperation({
    summary: 'Get entity audit trail',
    description: 'Retrieve audit trail for a specific entity. Admin only.',
  })
  @ApiParam({
    name: 'entityType',
    enum: AUDIT_ENTITY_TYPES,
    description: 'Entity type',
  })
  @ApiParam({ name: 'entityId', description: 'Entity ID', type: Number })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of records (default: 100)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Entity audit trail retrieved successfully',
    type: [AuditLogResponseDto],
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin access required',
  })
  async getEntityAuditTrail(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseIntPipe) entityId: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<any> {
    return this.auditLogService.getEntityAuditTrail(
      entityType as any,
      entityId,
      {
        limit: limit || 100,
      },
    );
  }

  @Get('user/:userId/activity')
  @ApiOperation({
    summary: 'Get user activity',
    description: 'Retrieve activity logs for a specific user. Admin only.',
  })
  @ApiParam({ name: 'userId', description: 'User ID', type: Number })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of records (default: 100)',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (ISO 8601)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (ISO 8601)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User activity retrieved successfully',
    type: [AuditLogResponseDto],
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin access required',
  })
  async getUserActivity(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    return this.auditLogService.getUserActivity(userId, {
      limit: limit || 100,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('events/security')
  @ApiOperation({
    summary: 'Get security events',
    description:
      'Retrieve security-related events (logins, logouts, failures). Admin only.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of records (default: 100)',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (ISO 8601)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (ISO 8601)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Security events retrieved successfully',
    type: [AuditLogResponseDto],
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin access required',
  })
  async getSecurityEvents(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    return this.auditLogService.getSecurityEvents({
      limit: limit || 100,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('events/failed')
  @ApiOperation({
    summary: 'Get failed operations',
    description: 'Retrieve all failed operations for debugging. Admin only.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of records (default: 100)',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (ISO 8601)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (ISO 8601)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Failed operations retrieved successfully',
    type: [AuditLogResponseDto],
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin access required',
  })
  async getFailedOperations(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    return this.auditLogService.getFailedOperations({
      limit: limit || 100,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('reports/statistics')
  @ApiOperation({
    summary: 'Get audit statistics',
    description: 'Get aggregated statistics for a date range. Admin only.',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    type: String,
    description: 'Start date (ISO 8601)',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    type: String,
    description: 'End date (ISO 8601)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statistics retrieved successfully',
    type: AuditStatisticsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid date range',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin access required',
  })
  async getStatistics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<AuditStatisticsResponseDto> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    return this.auditLogService.getAuditStatistics(start, end);
  }
}
