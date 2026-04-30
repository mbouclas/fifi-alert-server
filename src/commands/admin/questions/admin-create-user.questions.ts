import { QuestionSet, Question, ValidateFor } from 'nest-commander';
import { ConfigService } from '@nestjs/config';

/**
 * Question set for creating a new system user.
 *
 * This question set is used by the CreateUserCommand to interactively
 * gather user input when CLI options are not provided.
 *
 * Questions:
 *   - firstName: User's first name
 *   - lastName: User's last name
 *   - email: Email address with validation
 *   - role: Role slug (e.g., 'admin', 'user', 'moderator')
 *   - password: Password (optional - auto-generates if empty)
 */
@QuestionSet({ name: 'admin-create-user-questions' })
export class AdminCreateUserQuestions {
    constructor(private readonly configService: ConfigService) { }

    /**
     * Prompts for the user's first name
     */
    @Question({
        type: 'input',
        name: 'firstName',
        message: 'Enter the first name:',
    })
    parseFirstName(val: string): string {
        return val.trim();
    }

    /**
     * Validates that first name is not empty
     */
    @ValidateFor({ name: 'firstName' })
    validateFirstName(val: string): boolean | string {
        const trimmed = val.trim();
        if (!trimmed) {
            return 'First name is required';
        }
        if (trimmed.length > 100) {
            return 'First name must be 100 characters or less';
        }
        return true;
    }

    /**
     * Prompts for the user's last name
     */
    @Question({
        type: 'input',
        name: 'lastName',
        message: 'Enter the last name:',
    })
    parseLastName(val: string): string {
        return val.trim();
    }

    /**
     * Validates that last name is not empty
     */
    @ValidateFor({ name: 'lastName' })
    validateLastName(val: string): boolean | string {
        const trimmed = val.trim();
        if (!trimmed) {
            return 'Last name is required';
        }
        if (trimmed.length > 100) {
            return 'Last name must be 100 characters or less';
        }
        return true;
    }

    /**
     * Prompts for the user's email address
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
     * Prompts for the role slug
     */
    @Question({
        type: 'input',
        name: 'role',
        message: 'Enter the role slug (e.g., admin, user, moderator):',
    })
    parseRole(val: string): string {
        return val.trim().toLowerCase();
    }

    /**
     * Validates role slug format
     */
    @ValidateFor({ name: 'role' })
    validateRole(val: string): boolean | string {
        const trimmed = val.trim();
        if (!trimmed) {
            return 'Role slug is required';
        }
        // Validate slug format (lowercase, hyphens, underscores, numbers)
        const slugRegex = /^[a-z0-9_-]+$/;
        if (!slugRegex.test(trimmed)) {
            return 'Role slug must contain only lowercase letters, numbers, hyphens, and underscores';
        }
        return true;
    }

    /**
     * Prompts for the password (optional - will auto-generate if empty)
     */
    @Question({
        type: 'password',
        name: 'password',
        message: 'Enter password (leave empty to auto-generate):',
    })
    parsePassword(val: string): string {
        return val;
    }

    /**
     * Validates password (optional - empty is allowed for auto-generation)
     */
    @ValidateFor({ name: 'password' })
    validatePassword(val: string): boolean | string {
        // Empty is allowed - will trigger auto-generation
        if (!val || val.trim() === '') {
            return true;
        }
        const minLength = this.configService.get<number>(
            'AUTH_PASSWORD_MIN_LENGTH',
            4,
        );
        if (val.length < minLength) {
            return `Password must be at least ${minLength} characters long`;
        }
        return true;
    }
}
