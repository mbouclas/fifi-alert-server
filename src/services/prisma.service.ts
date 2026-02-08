import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma-lib/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;

/**
 * PrismaService extends PrismaClient and manages database connections
 * within the NestJS application lifecycle.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: pg.Pool;

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      max: 10, // Maximum pool size
    });
    const adapter = new PrismaPg(pool);
    const log: Prisma.LogLevel[] =
      process.env.DEBUG === 'DEBUG'
        ? ['query', 'info', 'warn', 'error']
        : ['error'];

    super({
      log,
      adapter,
    });

    // Keep reference to pool for cleanup
    this.pool = pool;
  }

  /**
   * Connects to the database when the module is initialized.
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Disconnects from the database when the module is destroyed.
   */
  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end(); // Properly close the connection pool
  }
}
