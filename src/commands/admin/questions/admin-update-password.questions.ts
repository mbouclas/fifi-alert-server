import {
  QuestionSet,
  Question,
  ValidateFor,
} from 'nest-commander';
import { ConfigService } from '@nestjs/config';

/**
 * Question set for updating an admin user's password.
 *
 * This question set is used by the UpdatePasswordCommand to interactively
 * gather user input when CLI options are not provided.
 *
 * Questions:
 *   - email: Email address to find the user
 *   - password: New password with minimum length validation
 *   - confirmPassword: Confirm password to prevent typos
 */
@QuestionSet({ name: 'admin-update-password-questions' })
export class AdminUpdatePasswordQuestions {
  constructor(
    private readonly configService: ConfigService,
  ) {}

  /**
   * Prompts for the admin user's email address
   */
  @Question({
    type: 'input',
    name: 'email',
    message: 'Enter the email address of the user:',
  })
  parseEmail(val: string): string {
    return val.trim().toLowerCase();
  }

  /**
   * Validates the email format
   */
  @ValidateFor({ name: 'email' })
  validateEmail(val: string): boolean | string {
    const trimmed = val.trim();
    if (!trimmed) {
      return 'Email is required';
    }
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return 'Please enter a valid email address';
    }
    return true;
  }

  /**
   * Prompts for the new password
   */
  @Question({
    type: 'password',
    name: 'password',
    message: 'Enter the new password:',
  })
  parsePassword(val: string): string {
    return val;
  }

  /**
   * Validates password meets minimum requirements
   */
  @ValidateFor({ name: 'password' })
  validatePassword(val: string): boolean | string {
    if (!val) {
      return 'Password is required';
    }
    const minLength = this.configService.get<number>('auth.password.minLength', 4);
    if (val.length < minLength) {
      return `Password must be at least ${minLength} characters long`;
    }
    return true;
  }

  /**
   * Prompts for password confirmation
   */
  @Question({
    type: 'password',
    name: 'confirmPassword',
    message: 'Confirm the new password:',
  })
  parseConfirmPassword(val: string): string {
    return val;
  }

  /**
   * Validates that confirm password is not empty
   * Note: The actual match validation is done in the command
   * because we need access to the password value
   */
  @ValidateFor({ name: 'confirmPassword' })
  validateConfirmPassword(val: string): boolean | string {
    if (!val) {
      return 'Password confirmation is required';
    }
    return true;
  }
}
