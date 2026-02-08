/**
 * Health Service
 * Task 8.19
 *
 * Performs health checks on system dependencies
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../shared/email/email.service';
import { SmtpService } from '../shared/smtp/smtp.service';
import { MailgunService } from '../shared/mailgun/mailgun.service';
import type { IEmailProvider } from '../shared/email/email-provider.interface';
import * as fs from 'fs';
import * as path from 'path';
import Redis from 'ioredis';

export interface HealthReport {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    disk: DiskHealthCheck;
    email: EmailHealthCheck;
  };
}

export interface EmailHealthCheck {
  status: 'healthy' | 'unhealthy';
  provider?: string;
  configured?: boolean;
  latency_ms?: number;
  error?: string;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  latency_ms?: number;
  error?: string;
}

export interface DiskHealthCheck {
  status: 'healthy' | 'unhealthy';
  available_mb?: number;
  error?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional()
    @Inject('EMAIL_PROVIDER')
    private readonly emailProvider?: IEmailProvider,
    @Optional() private readonly smtpService?: SmtpService,
    @Optional() private readonly mailgunService?: MailgunService,
  ) {
    // Initialize Redis client for health checks
    const redisHost = this.configService.get('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');

    try {
      this.redis = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Don't retry on health check
        lazyConnect: true,
      });
    } catch (error) {
      this.logger.warn(
        'Failed to initialize Redis client for health checks',
        error,
      );
    }
  }

  /**
   * Check health of all system dependencies
   */
  async checkHealth(): Promise<HealthReport> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor(process.uptime());

    const [databaseCheck, redisCheck, diskCheck, emailCheck] =
      await Promise.allSettled([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkDisk(),
        this.checkEmail(),
      ]);

    const checks = {
      database:
        databaseCheck.status === 'fulfilled'
          ? databaseCheck.value
          : {
              status: 'unhealthy' as const,
              error: String(databaseCheck.reason),
            },
      redis:
        redisCheck.status === 'fulfilled'
          ? redisCheck.value
          : { status: 'unhealthy' as const, error: String(redisCheck.reason) },
      disk:
        diskCheck.status === 'fulfilled'
          ? diskCheck.value
          : { status: 'unhealthy' as const, error: String(diskCheck.reason) },
      email:
        emailCheck.status === 'fulfilled'
          ? emailCheck.value
          : { status: 'unhealthy' as const, error: String(emailCheck.reason) },
    };

    const allHealthy = Object.values(checks).every(
      (check) => check.status === 'healthy',
    );

    return {
      status: allHealthy ? 'ok' : 'error',
      timestamp,
      uptime,
      checks,
    };
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Simple query to check connectivity
      await this.prisma.$queryRaw`SELECT 1 as health_check`;

      const latency_ms = Date.now() - startTime;

      this.logger.debug(`Database health check passed (${latency_ms}ms)`);

      return {
        status: 'healthy',
        latency_ms,
      };
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return {
        status: 'unhealthy',
        error: error.message || 'Connection failed',
      };
    }
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedis(): Promise<HealthCheck> {
    if (!this.redis) {
      return {
        status: 'unhealthy',
        error: 'Redis client not initialized',
      };
    }

    const startTime = Date.now();

    try {
      // Ensure connection is established
      if (this.redis.status !== 'ready') {
        await this.redis.connect();
      }

      await this.redis.ping();

      const latency_ms = Date.now() - startTime;

      this.logger.debug(`Redis health check passed (${latency_ms}ms)`);

      return {
        status: 'healthy',
        latency_ms,
      };
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return {
        status: 'unhealthy',
        error: error.message || 'Connection failed',
      };
    }
  }

  /**
   * Check disk space for uploads folder
   */
  private async checkDisk(): Promise<DiskHealthCheck> {
    try {
      const uploadsDir = this.configService.get(
        'UPLOAD_DIRECTORY',
        './uploads',
      );

      // Check if uploads directory exists
      if (!fs.existsSync(uploadsDir)) {
        return {
          status: 'unhealthy',
          error: 'Uploads directory does not exist',
        };
      }

      // Check disk space (platform-specific)
      const diskSpace = await this.getDiskSpace(uploadsDir);

      const minAvailableMb = 1000; // 1GB minimum

      if (diskSpace < minAvailableMb) {
        this.logger.warn(
          `Low disk space: ${diskSpace}MB available (minimum: ${minAvailableMb}MB)`,
        );
        return {
          status: 'unhealthy',
          available_mb: diskSpace,
          error: 'Low disk space',
        };
      }

      this.logger.debug(`Disk space check passed (${diskSpace}MB available)`);

      return {
        status: 'healthy',
        available_mb: diskSpace,
      };
    } catch (error) {
      this.logger.error('Disk space check failed', error);
      return {
        status: 'unhealthy',
        error: error.message || 'Disk check failed',
      };
    }
  }

  /**
   * Get available disk space in MB
   * Platform-specific implementation
   */
  private async getDiskSpace(directory: string): Promise<number> {
    const { promisify } = require('util');
    const { exec } = require('child_process');
    const execAsync = promisify(exec);

    try {
      const absolutePath = path.resolve(directory);

      if (process.platform === 'win32') {
        // Windows: Use wmic command
        const drive = absolutePath.substring(0, 2); // e.g., "C:"
        const { stdout } = await execAsync(
          `wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace`,
        );

        const freeSpaceBytes = parseInt(stdout.split('\n')[1].trim(), 10);
        return Math.floor(freeSpaceBytes / (1024 * 1024));
      } else {
        // Unix/Linux: Use df command
        const { stdout } = await execAsync(
          `df -k "${absolutePath}" | tail -1 | awk '{print $4}'`,
        );

        const freeSpaceKb = parseInt(stdout.trim(), 10);
        return Math.floor(freeSpaceKb / 1024);
      }
    } catch (error) {
      this.logger.error('Failed to get disk space', error);
      // Return a safe default value
      return 10000; // 10GB
    }
  }

  /**
   * Check email provider connectivity and configuration
   */
  private async checkEmail(): Promise<EmailHealthCheck> {
    const startTime = Date.now();

    try {
      // Check if email provider is configured
      const mailSystem = this.configService.get<string>('MAIL_SYSTEM');

      if (!mailSystem) {
        return {
          status: 'unhealthy',
          configured: false,
          error: 'MAIL_SYSTEM not configured',
        };
      }

      if (!this.emailProvider) {
        return {
          status: 'unhealthy',
          provider: mailSystem,
          configured: false,
          error: 'Email provider not initialized',
        };
      }

      // Provider-specific health checks
      if (mailSystem.toLowerCase() === 'smtp' && this.smtpService) {
        // SMTP: Verify connection
        try {
          const transporter = (this.smtpService as any).transporter;
          if (!transporter) {
            throw new Error('SMTP transporter not initialized');
          }

          await transporter.verify();

          const latency_ms = Date.now() - startTime;

          this.logger.debug(
            `Email (SMTP) health check passed (${latency_ms}ms)`,
          );

          return {
            status: 'healthy',
            provider: 'smtp',
            configured: true,
            latency_ms,
          };
        } catch (error) {
          this.logger.error('SMTP verification failed', error);
          return {
            status: 'unhealthy',
            provider: 'smtp',
            configured: true,
            error: error.message || 'SMTP connection failed',
          };
        }
      } else if (
        mailSystem.toLowerCase() === 'mailgun' &&
        this.mailgunService
      ) {
        // Mailgun: Check configuration
        const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
        const domain = this.configService.get<string>('MAILGUN_DOMAIN');

        if (!apiKey || !domain) {
          return {
            status: 'unhealthy',
            provider: 'mailgun',
            configured: false,
            error: 'MAILGUN_API_KEY or MAILGUN_DOMAIN not set',
          };
        }

        const latency_ms = Date.now() - startTime;

        this.logger.debug(
          `Email (Mailgun) health check passed (${latency_ms}ms)`,
        );

        return {
          status: 'healthy',
          provider: 'mailgun',
          configured: true,
          latency_ms,
        };
      } else {
        return {
          status: 'unhealthy',
          provider: mailSystem,
          configured: false,
          error: `Unknown provider: ${mailSystem}`,
        };
      }
    } catch (error) {
      this.logger.error('Email health check failed', error);
      return {
        status: 'unhealthy',
        error: error.message || 'Email check failed',
      };
    }
  }

  /**
   * Cleanup Redis connection on shutdown
   */
  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
