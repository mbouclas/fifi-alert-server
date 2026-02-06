import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from './shared/shared.module';
import { CommandsModule } from './commands/commands.module';
import { UserModule } from './user/user.module';
import { authConfig } from './config';

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
    CommandsModule,
  ],
})
export class CliModule {}
