import { SubCommand, CommandRunner, Option, InquirerService } from 'nest-commander';
import { Injectable, NotFoundException } from '@nestjs/common';
import { UserService } from '../../../user/user.service';
import { PrismaService } from '@services/prisma.service';

/**
 * Valid role options for admin creation
 */
type RoleOption = 'admin' | 'su';

/**
 * Options for creating a new admin user
 */
interface CreateAdminOptions {
  name?: string;
  email?: string;
  password?: string;
  role?: RoleOption;
}

/**
 * Parsed admin user data
 */
interface AdminUserData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: RoleOption;
}

/**
 * Create Admin Subcommand
 *
 * Creates a new admin user with the provided details.
 * If options are not provided via CLI flags, the user will be prompted
 * to enter them interactively.
 *
 * Usage:
 *   bun run cli admin create [options]
 *
 * Options:
 *   -n, --name <name>         Full name (first last)
 *   -e, --email <email>       Email address
 *   -p, --password <password> Password
 *   -r, --role <role>         Role (admin|su, default: admin)
 *
 * Examples:
 *   bun run cli admin create --name "John Doe" --email "john@example.com" --password "secret123"
 *   bun run cli admin create --name "Super User" --email "su@example.com" --password "secret123" --role su
 *   bun run cli admin create  # Interactive mode
 */
@SubCommand({
  name: 'create',
  description: 'Create a new admin user',
})
@Injectable()
export class CreateAdminCommand extends CommandRunner {
  constructor(
    private readonly inquirerService: InquirerService,
    private readonly userService: UserService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async run(inputs: string[], options: CreateAdminOptions): Promise<void> {
    try {
      // Prompt for missing options using inquirer
      const answers = await this.inquirerService.ask<CreateAdminOptions>(
        'admin-create-questions',
        options,
      );

      // Merge CLI options with inquirer answers
      const finalOptions: CreateAdminOptions = { ...options, ...answers };

      // Parse the full name into first and last name
      const nameParts = (finalOptions.name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const userData: AdminUserData = {
        firstName,
        lastName,
        email: finalOptions.email || '',
        password: finalOptions.password || '',
        role: finalOptions.role as RoleOption,
      };

      // Verify the role exists
      const role = await this.prisma.role.findFirst({
        where: { slug: userData.role },
      });

      if (!role) {
        throw new NotFoundException(
          `Role with slug "${userData.role}" not found. Please ensure the role exists in the system.`,
        );
      }

      // Create the admin user using UserService
      const createdUser = await this.userService.store({
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        password: userData.password,
        roles: [userData.role],
        emailVerified: true, // Admin users are pre-verified
      });

      // Display success message
      this.displaySuccess(userData, createdUser);
    } catch (error) {
      this.displayError(error);
      process.exit(1);
    }
  }

  /**
   * Displays success message after user creation
   */
  private displaySuccess(userData: AdminUserData, createdUser: any): void {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║            ✓ Admin User Created Successfully                  ║
╚═══════════════════════════════════════════════════════════════╝

User Details:
───────────────────────────────────────────────────────────────────
  ID:          ${createdUser?.id}
  First Name:  ${userData.firstName}
  Last Name:   ${userData.lastName}
  Email:       ${userData.email}
  Role:        ${userData.role}
  Verified:    Yes
───────────────────────────────────────────────────────────────────
`);
  }

  /**
   * Displays error message
   */
  private displayError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`
╔═══════════════════════════════════════════════════════════════╗
║            ✗ Failed to Create Admin User                      ║
╚═══════════════════════════════════════════════════════════════╝

Error: ${message}
`);
  }

  @Option({
    flags: '-n, --name <name>',
    description: 'Full name of the admin user (first last)',
  })
  parseName(val: string): string {
    return val;
  }

  @Option({
    flags: '-e, --email <email>',
    description: 'Email address of the admin user',
  })
  parseEmail(val: string): string {
    return val;
  }

  @Option({
    flags: '-p, --password <password>',
    description: 'Password for the admin user',
  })
  parsePassword(val: string): string {
    return val;
  }

  @Option({
    flags: '-r, --role <role>',
    description: 'Role to assign (admin|su)',
    choices: ['admin', 'su'],
  })
  parseRole(val: string): RoleOption {
    return val as RoleOption;
  }
}
