import {
  SubCommand,
  CommandRunner,
  Option,
  InquirerService,
} from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@services/prisma.service';

/**
 * Options for creating a new role
 */
export interface CreateRoleOptions {
  name?: string;
  slug?: string;
  level?: number;
  description?: string;
  inactive?: boolean;
}

export function slugifyRoleName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Create Role Subcommand
 *
 * Creates a new role. Missing options are prompted interactively.
 *
 * Usage:
 *   bun run cli admin roles create [options]
 *
 * Options:
 *   -n, --name <name>               Display name (required)
 *   -s, --slug <slug>               Slug (defaults to slugified name)
 *   -l, --level <level>             Numeric level (default 0)
 *   -d, --description <description> Description
 *   --inactive                      Create the role as inactive
 *
 * Examples:
 *   bun run cli admin roles create --name "Moderator" --slug moderator --level 5
 *   bun run cli admin roles create   # interactive mode (prompts when --name is omitted)
 */
@SubCommand({
  name: 'create',
  description: 'Create a new role',
})
@Injectable()
export class CreateRoleCommand extends CommandRunner {
  constructor(
    private readonly inquirerService: InquirerService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async run(_inputs: string[], options: CreateRoleOptions): Promise<void> {
    try {
      console.log('\n🔧 Creating a new role...\n');

      // Interactive mode only when no name is given on the command line.
      // With --name, slug/level/description fall back to sensible defaults
      // so the command works in non-TTY contexts (scripts, CI, ssh).
      const answers = options.name
        ? {}
        : await this.inquirerService.ask<CreateRoleOptions>(
            'admin-create-role-questions',
            options,
          );
      const final: CreateRoleOptions = { ...options, ...answers };

      const name = (final.name ?? '').trim();
      const slug = slugifyRoleName(final.slug || name);
      const level = Number.isFinite(final.level) ? Number(final.level) : 0;
      const description = (final.description ?? '').trim();

      if (!name) {
        throw new Error('Role name is required');
      }
      if (!slug) {
        throw new Error('Role slug is required');
      }

      const existing = await this.prisma.role.findFirst({
        where: { OR: [{ slug }, { name }] },
      });
      if (existing) {
        const field =
          existing.slug === slug ? `slug "${slug}"` : `name "${name}"`;
        throw new Error(
          `A role with ${field} already exists (id ${existing.id})`,
        );
      }

      const role = await this.prisma.role.create({
        data: {
          name,
          slug,
          level,
          description,
          active: !final.inactive,
        },
      });

      console.log(`
✅ Role created

  ID:          ${role.id}
  Name:        ${role.name}
  Slug:        ${role.slug}
  Level:       ${role.level}
  Active:      ${role.active ? 'yes' : 'no'}
  Description: ${role.description || '(none)'}
`);
    } catch (error) {
      console.error(
        `\n❌ Failed to create role: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
      );
      process.exit(1);
    }
  }

  @Option({ flags: '-n, --name <name>', description: 'Role display name' })
  parseName(val: string): string {
    return val.trim();
  }

  @Option({
    flags: '-s, --slug <slug>',
    description: 'Role slug (defaults to slugified name)',
  })
  parseSlug(val: string): string {
    return slugifyRoleName(val);
  }

  @Option({
    flags: '-l, --level <level>',
    description: 'Numeric role level (default 0)',
  })
  parseLevel(val: string): number {
    const n = Number.parseInt(val, 10);
    if (Number.isNaN(n)) {
      throw new Error(`Invalid level "${val}": must be an integer`);
    }
    return n;
  }

  @Option({
    flags: '-d, --description <description>',
    description: 'Role description',
  })
  parseDescription(val: string): string {
    return val.trim();
  }

  @Option({ flags: '--inactive', description: 'Create the role as inactive' })
  parseInactive(): boolean {
    return true;
  }
}
