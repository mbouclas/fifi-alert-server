import {
  SubCommand,
  CommandRunner,
  Option,
  InquirerService,
} from 'nest-commander';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UserService } from '../../../user/user.service';
import { PrismaService } from '@services/prisma.service';
import * as inquirer from 'inquirer';

/**
 * Options for converting a user to admin
 */
interface ConvertToAdminOptions {
  email?: string;
  role?: string;
}

/**
 * User with roles information
 */
interface UserWithRoles {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  roles?: Array<{
    role: {
      id: number;
      slug: string;
      name: string;
      level: number;
    };
  }>;
}

/**
 * Convert To Admin Subcommand
 *
 * Converts an existing regular user to an admin user by assigning
 * an admin-level role to their account.
 *
 * Usage:
 *   bun run cli admin convert [options]
 *
 * Options:
 *   -e, --email <email>  Email address of the user to convert
 *   -r, --role <role>    Role slug to assign (admin, su, etc.)
 *
 * Examples:
 *   bun run cli admin convert --email "john@example.com"
 *   bun run cli admin convert --email "john@example.com" --role su
 *   bun run cli admin convert  # Interactive mode
 */
@SubCommand({
  name: 'convert',
  description: 'Convert an existing user to admin',
})
@Injectable()
export class ConvertToAdminCommand extends CommandRunner {
  constructor(
    private readonly inquirerService: InquirerService,
    private readonly userService: UserService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async run(inputs: string[], options: ConvertToAdminOptions): Promise<void> {
    try {
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              Convert User to Admin                            ║
╚═══════════════════════════════════════════════════════════════╝
`);

      // Prompt for email if not provided
      const answers = await this.inquirerService.ask<ConvertToAdminOptions>(
        'admin-convert-questions',
        options,
      );

      const finalOptions: ConvertToAdminOptions = { ...options, ...answers };
      const email = finalOptions.email?.toLowerCase();

      // Find the user by email
      const user = (await this.userService.findOne({ email }, [
        'roles',
      ])) as UserWithRoles | null;

      if (!user) {
        throw new NotFoundException(`User with email "${email}" not found.`);
      }

      // Display user information for confirmation
      this.displayUserInfo(user);

      // Get the admin role to determine the minimum admin level
      const adminRole = await this.prisma.role.findFirst({
        where: { slug: 'admin', active: true },
      });

      if (!adminRole) {
        throw new NotFoundException(
          'Admin role not found. Please ensure a role with slug "admin" exists in the system.',
        );
      }

      // Query all roles at or above admin level (higher level number = higher privilege)
      const adminRoles = await this.prisma.role.findMany({
        where: {
          active: true,
          level: {
            gte: adminRole.level,
          },
        },
        orderBy: { level: 'desc' },
      });

      if (adminRoles.length === 0) {
        throw new NotFoundException(
          'No admin-level roles found in the system.',
        );
      }

      // Check if user already has any admin roles
      const existingAdminRoles = user.roles?.filter(
        (ur) => ur.role.level >= adminRole.level,
      );

      if (existingAdminRoles && existingAdminRoles.length > 0) {
        const roleNames = existingAdminRoles
          .map((ur) => ur.role.name)
          .join(', ');
        console.log(`\n⚠️  This user already has admin role(s): ${roleNames}`);

        const { continueAnyway } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continueAnyway',
            message: 'Do you want to add another admin role?',
            default: false,
          },
        ]);

        if (!continueAnyway) {
          console.log('\n❌ Operation cancelled.\n');
          return;
        }
      }

      // Select the role to assign
      let selectedRoleSlug = finalOptions.role;

      if (!selectedRoleSlug) {
        const roleChoices = adminRoles.map((role) => ({
          name: `${role.name} (level: ${role.level})${role.description ? ` - ${role.description}` : ''}`,
          value: role.slug,
        }));

        const { roleSlug } = await inquirer.prompt([
          {
            type: 'list',
            name: 'roleSlug',
            message: 'Select the admin role to assign:',
            choices: roleChoices,
          },
        ]);

        selectedRoleSlug = roleSlug;
      }

      // Verify the selected role exists and is valid
      const selectedRole = adminRoles.find((r) => r.slug === selectedRoleSlug);

      if (!selectedRole) {
        throw new BadRequestException(
          `Role "${selectedRoleSlug}" is not a valid admin role.`,
        );
      }

      // Check if user already has this specific role
      const alreadyHasRole = user.roles?.some(
        (ur) => ur.role.slug === selectedRoleSlug,
      );

      if (alreadyHasRole) {
        throw new BadRequestException(
          `User already has the "${selectedRole.name}" role.`,
        );
      }

      // Confirm the action
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Assign "${selectedRole.name}" role to ${user.firstName} ${user.lastName}?`,
          default: true,
        },
      ]);

      if (!confirm) {
        console.log('\n❌ Operation cancelled.\n');
        return;
      }

      // Add the role to the user using Prisma's relation update
      await this.userService.update({ id: user.id }, {
        roles: {
          create: {
            role_id: selectedRole.id,
          },
        },
      } as any);

      console.log(`
✅ User converted to admin successfully!

   User:  ${user.firstName} ${user.lastName}
   Email: ${user.email}
   Role:  ${selectedRole.name} (level: ${selectedRole.level})
`);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        console.error(`\n❌ Error: ${error.message}\n`);
      } else {
        console.error(
          `\n❌ Failed to convert user: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
        );
      }
      process.exit(1);
    }
  }

  /**
   * Displays user information for confirmation
   */
  private displayUserInfo(user: UserWithRoles): void {
    const currentRoles =
      user.roles?.map((ur) => ur.role.name).join(', ') || 'None';

    console.log(`
┌───────────────────────────────────────────────────────────────┐
│ User Information                                              │
├───────────────────────────────────────────────────────────────┤
│ Name:   ${(user.firstName + ' ' + user.lastName).padEnd(53)}│
│ Email:  ${user.email.padEnd(53)}│
│ Roles:  ${currentRoles.padEnd(53)}│
└───────────────────────────────────────────────────────────────┘
`);
  }

  /**
   * CLI option for email address
   */
  @Option({
    flags: '-e, --email <email>',
    description: 'Email address of the user to convert',
  })
  parseEmail(val: string): string {
    return val.trim().toLowerCase();
  }

  /**
   * CLI option for role slug
   */
  @Option({
    flags: '-r, --role <role>',
    description: 'Role slug to assign (e.g., admin, su)',
  })
  parseRole(val: string): string {
    return val.trim().toLowerCase();
  }
}
