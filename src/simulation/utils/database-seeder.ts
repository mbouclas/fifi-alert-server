import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma-lib/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;

/**
 * Database Seeder
 *
 * Seeds both shadow and main databases with initial data required for simulations.
 * This includes:
 * - Roles (User, Admin)
 * - Gates (user.profile.edit, user.profile.delete)
 *
 * Note: Since the API uses the main database, we need to seed both databases:
 * - Shadow database: for future direct database tests
 * - Main database: for API-based tests (current scenarios)
 */
@Injectable()
export class DatabaseSeeder implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseSeeder.name);
  private shadowPrisma: PrismaClient | null = null;
  private mainPrisma: PrismaClient | null = null;
  private shadowPool: pg.Pool | null = null;
  private mainPool: pg.Pool | null = null;
  private isCleanedUp = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initialize Prisma clients lazily when needed
   */
  private async initializeClients() {
    if (this.shadowPrisma && this.mainPrisma) {
      return; // Already initialized
    }

    const shadowDatabaseUrl = this.configService.get<string>(
      'SHADOW_DATABASE_URL',
    );
    const mainDatabaseUrl = this.configService.get<string>('DATABASE_URL');

    if (!shadowDatabaseUrl) {
      throw new Error(
        'SHADOW_DATABASE_URL is not defined in environment variables',
      );
    }

    if (!mainDatabaseUrl) {
      throw new Error('DATABASE_URL is not defined in environment variables');
    }

    // Create shadow database connection with timeout
    this.shadowPool = new Pool({
      connectionString: shadowDatabaseUrl,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 1000,
      max: 2, // Minimal pool size for seeding
    });
    const shadowAdapter = new PrismaPg(this.shadowPool);

    this.shadowPrisma = new PrismaClient({
      log: ['error'],
      adapter: shadowAdapter,
    });

    // Create main database connection with timeout
    this.mainPool = new Pool({
      connectionString: mainDatabaseUrl,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 1000,
      max: 2, // Minimal pool size for seeding
    });
    const mainAdapter = new PrismaPg(this.mainPool);

    this.mainPrisma = new PrismaClient({
      log: ['error'],
      adapter: mainAdapter,
    });
  }

  async onModuleDestroy() {
    // Clean up connections
    if (this.shadowPrisma) {
      await this.shadowPrisma.$disconnect();
    }
    if (this.mainPrisma) {
      await this.mainPrisma.$disconnect();
    }
    if (this.shadowPool) {
      await this.shadowPool.end();
    }
    if (this.mainPool) {
      await this.mainPool.end();
    }
  }

  /**
   * Seed both databases with roles and gates
   */
  async seed(): Promise<void> {
    try {
      // Initialize clients on first use
      await this.initializeClients();

      this.logger.log('Seeding shadow database...');
      await this.seedDatabase(this.shadowPrisma!, 'shadow');

      this.logger.log('Seeding main database...');
      await this.seedDatabase(this.mainPrisma!, 'main');

      this.logger.log('Database seeding completed successfully');
    } catch (error) {
      this.logger.error('Database seeding failed', error);
      throw error;
    }
    // Don't cleanup here - let onModuleDestroy handle it
  }

  /**
   * Clean up database connections
   */
  private async cleanup() {
    // Prevent multiple cleanup calls
    if (this.isCleanedUp) {
      return;
    }
    this.isCleanedUp = true;

    try {
      if (this.shadowPrisma) {
        await this.shadowPrisma.$disconnect();
      }
      if (this.mainPrisma) {
        await this.mainPrisma.$disconnect();
      }
      if (this.shadowPool) {
        await this.shadowPool.end();
      }
      if (this.mainPool) {
        await this.mainPool.end();
      }
    } catch (error) {
      this.logger.warn('Error during cleanup', error);
    }
  }

  async onModuleDestroy() {
    await this.cleanup();
  }

  /**
   * Seed a specific database with roles and gates
   */
  private async seedDatabase(
    prisma: PrismaClient,
    dbName: string,
  ): Promise<void> {
    // Seed Roles
    await this.seedRoles(prisma, dbName);

    // Seed Gates
    await this.seedGates(prisma, dbName);
  }

  /**
   * Seed roles: User and Admin
   */
  private async seedRoles(prisma: PrismaClient, dbName: string): Promise<void> {
    const roles = [
      {
        name: 'User',
        slug: 'user',
        level: 1,
        description: 'Standard user role with basic permissions',
        active: true,
      },
      {
        name: 'Admin',
        slug: 'admin',
        level: 10,
        description: 'Administrator role with elevated permissions',
        active: true,
      },
    ];

    for (const role of roles) {
      await prisma.role.upsert({
        where: { slug: role.slug },
        update: role,
        create: role,
      });
      this.logger.log(`✓ Seeded role in ${dbName} DB: ${role.name}`);
    }
  }

  /**
   * Seed gates: user.profile.edit and user.profile.delete
   */
  private async seedGates(prisma: PrismaClient, dbName: string): Promise<void> {
    const gates = [
      {
        name: 'User Profile Edit',
        slug: 'user.profile.edit',
        level: 0,
        active: true,
        provider: 'system',
      },
      {
        name: 'User Profile Delete',
        slug: 'user.profile.delete',
        level: 0,
        active: true,
        provider: 'system',
      },
    ];

    for (const gate of gates) {
      await prisma.gate.upsert({
        where: { slug: gate.slug },
        update: gate,
        create: gate,
      });
      this.logger.log(`✓ Seeded gate in ${dbName} DB: ${gate.slug}`);
    }
  }

  /**
   * Get Prisma client connected to main database (for API-related operations)
   */
  getMainPrismaClient(): PrismaClient {
    return this.mainPrisma;
  }

  /**
   * Get Prisma client connected to shadow database (for direct database operations)
   */
  getShadowPrismaClient(): PrismaClient {
    return this.shadowPrisma;
  }

  /**
   * @deprecated Use getMainPrismaClient() or getShadowPrismaClient() instead
   */
  getPrismaClient(): PrismaClient {
    return this.mainPrisma;
  }
}
