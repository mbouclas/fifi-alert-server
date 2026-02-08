/**
 * Health Check Controller
 * Task 8.19
 *
 * Provides health check endpoint for monitoring
 * - Database connectivity
 * - Redis connectivity
 * - Disk space for uploads folder
 * - Email provider configuration and connectivity
 */

import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';
import { AllowAnonymous } from '../auth/decorators/allow-anonymous.decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @AllowAnonymous()
  @ApiOperation({
    summary: 'Health Check',
    description:
      'Returns health status of all system dependencies. Returns 200 if healthy, 503 if any issues.',
  })
  @ApiResponse({
    status: 200,
    description: 'System is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-02-05T22:55:00.000Z' },
        uptime: { type: 'number', example: 12345 },
        checks: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'healthy' },
                latency_ms: { type: 'number', example: 5 },
              },
            },
            redis: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'healthy' },
                latency_ms: { type: 'number', example: 2 },
              },
            },
            disk: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'healthy' },
                available_mb: { type: 'number', example: 50000 },
              },
            },
            email: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'healthy' },
                provider: { type: 'string', example: 'smtp' },
                configured: { type: 'boolean', example: true },
                latency_ms: { type: 'number', example: 150 },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'System is unhealthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        timestamp: { type: 'string', example: '2026-02-05T22:55:00.000Z' },
        uptime: { type: 'number', example: 12345 },
        checks: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'unhealthy' },
                error: { type: 'string', example: 'Connection timeout' },
              },
            },
          },
        },
      },
    },
  })
  async check(@Res() res: Response) {
    const healthReport = await this.healthService.checkHealth();

    const statusCode =
      healthReport.status === 'ok'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(statusCode).json(healthReport);
  }
}
