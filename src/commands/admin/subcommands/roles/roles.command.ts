import { SubCommand, CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { ListRolesCommand } from './list-roles.command';
import { CreateRoleCommand } from './create-role.command';

/**
 * Roles Subcommand group
 *
 * Usage:
 *   bun run cli admin roles list [--all]
 *   bun run cli admin roles create [options]
 */
@SubCommand({
  name: 'roles',
  description: 'Manage roles (list, create)',
  subCommands: [ListRolesCommand, CreateRoleCommand],
})
@Injectable()
export class RolesCommand extends CommandRunner {
  run(): Promise<void> {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                     Role Management                           ║
╚═══════════════════════════════════════════════════════════════╝

Available subcommands:
  list      List roles (add --all to include inactive)
  create    Create a new role

Usage:
  bun run cli admin roles <subcommand> [options]

For more information on a specific subcommand, run:
  bun run cli admin roles <subcommand> --help
`);
    return Promise.resolve();
  }
}
