import { SubCommand, CommandRunner, Option, InquirerService } from 'nest-commander';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UserService } from '../../../user/user.service';

/**
 * Options for updating an admin user's password
 */
interface UpdatePasswordOptions {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

/**
 * Update Password Subcommand
 *
 * Updates the password of an existing admin user.
 * Uses inquirer for interactive input with password confirmation to prevent typos.
 *
 * Usage:
 *   bun run cli admin update-password [options]
 *
 * Options:
 *   -e, --email <email>       Email address of the user
 *   -p, --password <password> New password
 *
 * Examples:
 *   bun run cli admin update-password --email "john@example.com"
 *   bun run cli admin update-password  # Interactive mode
 */
@SubCommand({
  name: 'update-password',
  description: "Update an admin user's password",
})
@Injectable()
export class UpdatePasswordCommand extends CommandRunner {
  constructor(
    private readonly inquirerService: InquirerService,
    private readonly userService: UserService,
  ) {
    super();
  }

  async run(inputs: string[], options: UpdatePasswordOptions): Promise<void> {
    try {
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              Update Admin Password                            ║
╚═══════════════════════════════════════════════════════════════╝
`);

      // Prompt for missing options using inquirer
      const answers = await this.inquirerService.ask<UpdatePasswordOptions>(
        'admin-update-password-questions',
        options,
      );

      // Merge CLI options with inquirer answers
      const finalOptions: UpdatePasswordOptions = { ...options, ...answers };

      // Validate passwords match
      if (finalOptions.password !== finalOptions.confirmPassword) {
        throw new BadRequestException('Passwords do not match. Please try again.');
      }

      // Find the user by email
      const user = await this.userService.findOne(
        { email: finalOptions.email?.toLowerCase() },
        ['roles'],
      );

      if (!user) {
        throw new NotFoundException(
          `User with email "${finalOptions.email}" not found.`,
        );
      }

      // Update the user's password
      await this.userService.update(
        { id: user.id },
        { password: finalOptions.password } as any,
      );

      console.log(`
✅ Password updated successfully!

   User:  ${user.firstName} ${user.lastName}
   Email: ${user.email}
`);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        console.error(`\n❌ Error: ${error.message}\n`);
      } else {
        console.error(
          `\n❌ Failed to update password: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
        );
      }
      process.exit(1);
    }
  }

  /**
   * CLI option for email address
   */
  @Option({
    flags: '-e, --email <email>',
    description: 'Email address of the user',
  })
  parseEmail(val: string): string {
    return val.trim().toLowerCase();
  }

  /**
   * CLI option for new password
   * Note: Password via CLI is not recommended for security reasons
   */
  @Option({
    flags: '-p, --password <password>',
    description: 'New password (not recommended via CLI)',
  })
  parsePassword(val: string): string {
    return val;
  }
}
