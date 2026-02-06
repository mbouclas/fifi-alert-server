import { SubCommand, CommandRunner } from 'nest-commander';
import { Injectable, NotFoundException } from '@nestjs/common';
import { UserService } from '../../../user/user.service';
import { PrismaService } from '@services/prisma.service';

/**
 * List Admins Subcommand
 *
 * Lists all system administrators by querying users with roles
 * at or below the admin role level.
 *
 * Usage:
 *   bun run cli admin list
 *
 * Examples:
 *   bun run cli admin list
 */
@SubCommand({
  name: 'list',
  description: 'List all system administrators',
})
@Injectable()
export class ListAdminsCommand extends CommandRunner {
  constructor(
    private readonly userService: UserService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async run(): Promise<void> {
    try {
      // Get the admin role to determine the max level
      const adminRole = await this.prisma.role.findFirst({
        where: { slug: 'admin' },
      });

      if (!adminRole) {
        throw new NotFoundException(
          'Admin role not found. Please ensure a role with slug "admin" exists in the system.',
        );
      }

      // Query users with role level <= admin level
   
      const result = await this.userService.findMany(
        {},
        100, // Get up to 100 admins
        0,
        ['roles'],
        'firstName',
        'asc',
        undefined,// no maxLevel
        adminRole.level
      );

      this.displayAdminList(result.data, result.meta.count);
    } catch (error) {
      if (error instanceof NotFoundException) {
        console.error(`\n❌ Error: ${error.message}\n`);
      } else {
        console.error(
          `\n❌ Failed to list administrators: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
        );
      }
      process.exit(1);
    }
  }

  /**
   * Displays the list of administrators in a formatted table
   */
  private displayAdminList(users: any[], totalCount: number): void {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                  System Administrators                        ║
╚═══════════════════════════════════════════════════════════════╝
`);

    if (users.length === 0) {
      console.log('  No administrators found.\n');
      return;
    }

    // Calculate column widths for alignment
    const maxFirstName = Math.max(
      10,
      ...users.map((u) => (u.firstName || '').length),
    );
    const maxLastName = Math.max(
      9,
      ...users.map((u) => (u.lastName || '').length),
    );
    const maxEmail = Math.max(5, ...users.map((u) => (u.email || '').length));
    const maxId = Math.max(2, ...users.map((u) => (u.id ? u.id.toString().length : 0)));

    // Print header
    const header = ` ${'ID'.padEnd(maxId)}  ${'First Name'.padEnd(maxFirstName)}  ${'Last Name'.padEnd(maxLastName)}  ${'Email'.padEnd(maxEmail)}`;
    const separator = ` ${'─'.repeat(maxId)}  ${'─'.repeat(maxFirstName)}  ${'─'.repeat(maxLastName)}  ${'─'.repeat(maxEmail)}`;

    console.log(header);
    console.log(separator);

    // Print each admin
    for (const user of users) {
      const id = (user.id ? user.id.toString() : '').padEnd(maxId);
      const firstName = (user.firstName || '').padEnd(maxFirstName);
      const lastName = (user.lastName || '').padEnd(maxLastName);
      const email = (user.email || '').padEnd(maxEmail);

      console.log(` ${id}  ${firstName}  ${lastName}  ${email}`);
    }

    console.log(separator);
    console.log(`\n  Total: ${totalCount} administrator(s)\n`);
  }
}
