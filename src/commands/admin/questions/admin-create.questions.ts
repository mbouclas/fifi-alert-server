import {
  QuestionSet,
  Question,
  ValidateFor,
} from 'nest-commander';
import { ConfigService } from '@nestjs/config';

/**
 * Question set for creating a new admin user.
 *
 * This question set is used by the CreateAdminCommand to interactively
 * gather user input when CLI options are not provided.
 *
 * Questions:
 *   - name: Full name (first last)
 *   - email: Email address with validation
 *   - password: Password with minimum length validation
 *   - role: Role selection (admin|su)
 */
@QuestionSet({ name: 'admin-create-questions' })
export class AdminCreateQuestions {
  constructor(
    private readonly configService: ConfigService,
  ) {}

  /**
   * Prompts for the admin user's full name
   */
  @Question({
    type: 'input',
    name: 'name',
    message: 'Enter the full name (first last):',
  })
  parseName(val: string): string {
    return val.trim();
  }

  /**
   * Validates that the name contains at least two parts (first and last name)
   */
  @ValidateFor({ name: 'name' })
  validateName(val: string): boolean | string {
    const trimmed = val.trim();
    if (!trimmed) {
      return 'Name is required';
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      return 'Please enter both first and last name separated by a space';
    }
    return true;
  }

  /**
   * Prompts for the admin user's email address
   */
  @Question({
    type: 'input',
    name: 'email',
    message: 'Enter the email address:',
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
   * Prompts for the admin user's password
   */
  @Question({
    type: 'password',
    name: 'password',
    message: 'Enter the password:',
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
   * Prompts for the role to assign to the admin user
   */
  @Question({
    type: 'list',
    name: 'role',
    message: 'Select the role to assign:',
    choices: [
      { name: 'Admin', value: 'admin' },
      { name: 'Super User', value: 'su' },
    ],
    default: 'admin',
  })
  parseRole(val: string): string {
    return val;
  }
}
