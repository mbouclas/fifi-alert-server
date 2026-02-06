import {
  QuestionSet,
  Question,
  ValidateFor,
} from 'nest-commander';

/**
 * Question set for converting a user to admin.
 *
 * This question set is used by the ConvertToAdminCommand to interactively
 * gather user input when CLI options are not provided.
 *
 * Questions:
 *   - email: Email address to find the user
 *
 * Note: The role selection is handled dynamically in the command
 * based on the available admin roles in the database.
 */
@QuestionSet({ name: 'admin-convert-questions' })
export class AdminConvertQuestions {
  /**
   * Prompts for the user's email address
   */
  @Question({
    type: 'input',
    name: 'email',
    message: 'Enter the email address of the user to convert:',
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
}
