import { Command, CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { CreateAdminCommand } from './subcommands/create-admin.command';
import { CreateUserCommand } from './subcommands/create-user.command';
import { UpdatePasswordCommand } from './subcommands/update-password.command';
import { ConvertToAdminCommand } from './subcommands/convert-to-admin.command';
import { ListAdminsCommand } from './subcommands/list-admins.command';

/**
 * Admin Command
 *
 * Main command for administrative tasks related to user management.
 * Provides subcommands for:
 * - Creating a new admin user
 * - Updating an admin user's password
 * - Converting an existing user to admin
 *
 * Usage:
 *   bun run cli admin <subcommand> [options]
 *
 * Examples:
 *   bun run cli admin create --name "John Doe" --email "john@example.com" --password "secret123"
 *   bun run cli admin create (interactive mode)
 *   bun run cli admin update-password
 *   bun run cli admin convert
 */
@Command({
  name: 'admin',
  description: 'Administrative commands for user management',
  subCommands: [
    CreateAdminCommand,
    CreateUserCommand,
    UpdatePasswordCommand,
    ConvertToAdminCommand,
    ListAdminsCommand,
  ],
})
@Injectable()
export class AdminCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    Admin Management                           ║
╚═══════════════════════════════════════════════════════════════╝

Available subcommands:
  create-user      Create a new system user with a specific role
  create           Create a new admin user
  update-password  Update an admin user's password
  convert          Convert an existing user to admin
  list             List all system administrators

Usage:
  bun run cli admin <subcommand> [options]

For more information on a specific subcommand, run:
  bun run cli admin <subcommand> --help
`);
  }
}
