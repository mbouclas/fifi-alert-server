import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from './shared/shared.module.js';
import { CommandsModule } from './commands/commands.module.js';
import { UserModule } from './user/user.module.js';
import { SimulationModule } from './simulation/simulation.module.js';
import { authConfig } from './config/index.js';

/**
 * CLI Application Module
 *
 * This module is used exclusively for CLI commands.
 * It includes all necessary modules for command execution,
 * including the CommandsModule which requires InquirerService
 * from nest-commander.
 *
 * This is separate from AppModule to prevent InquirerService
 * dependency issues when running the web server.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig],
      cache: true,
    }),
    SharedModule,
    UserModule,
    SimulationModule,
    CommandsModule,
  ],
})
export class CliModule {}
