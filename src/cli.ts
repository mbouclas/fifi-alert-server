// IMPORTANT: Load environment variables FIRST before any other imports
import './env-loader';

import { CommandFactory } from 'nest-commander';
import { CliModule } from './cli.module';
import { Logger } from '@nestjs/common';

/**
 * CLI Entry Point
 *
 * This file bootstraps the NestJS application in CLI mode using nest-commander.
 * It uses CliModule instead of AppModule to avoid InquirerService dependency
 * issues when running the web server.
 *
 * Usage:
 *   npm run cli <command> [options]
 */
async function bootstrap() {
  const logger = new Logger('CLI');

  try {
    await CommandFactory.run(CliModule, {
      logger: ['error'],
      errorHandler: (error) => {
        logger.error('Command execution failed', error.message);
        process.exit(1);
      },
      usePlugins: true,
    });

    // Exit successfully after command completion
    // Small delay to ensure async cleanup completes
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.exit(0);
  } catch (error) {
    logger.error('Failed to bootstrap CLI', error.message);
    process.exit(1);
  }
}

bootstrap();
