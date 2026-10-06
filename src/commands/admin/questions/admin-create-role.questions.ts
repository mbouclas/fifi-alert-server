import { QuestionSet, Question, ValidateFor } from 'nest-commander';
import { slugifyRoleName } from '../subcommands/roles/create-role.command';

/**
 * Question set for creating a new role.
 *
 * Used by CreateRoleCommand to gather any options not passed as CLI flags.
 */
@QuestionSet({ name: 'admin-create-role-questions' })
export class AdminCreateRoleQuestions {
  @Question({
    type: 'input',
    name: 'name',
    message: 'Enter the role name:',
  })
  parseName(val: string): string {
    return val.trim();
  }

  @ValidateFor({ name: 'name' })
  validateName(val: string): boolean | string {
    const trimmed = val.trim();
    if (!trimmed) return 'Role name is required';
    if (trimmed.length > 100) return 'Role name must be 100 characters or less';
    return true;
  }

  @Question({
    type: 'input',
    name: 'slug',
    message: 'Enter the role slug (leave empty to derive from name):',
  })
  parseSlug(val: string): string {
    return slugifyRoleName(val);
  }

  @Question({
    type: 'input',
    name: 'level',
    message: 'Enter the role level (integer, default 0):',
    default: '0',
  })
  parseLevel(val: string): number {
    const n = Number.parseInt(String(val), 10);
    return Number.isNaN(n) ? 0 : n;
  }

  @ValidateFor({ name: 'level' })
  validateLevel(val: string): boolean | string {
    if (String(val).trim() === '') return true;
    return /^-?\d+$/.test(String(val).trim()) || 'Level must be an integer';
  }

  @Question({
    type: 'input',
    name: 'description',
    message: 'Enter a description (optional):',
    default: '',
  })
  parseDescription(val: string): string {
    return val.trim();
  }
}
