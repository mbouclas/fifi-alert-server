import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@services/prisma.service';

interface ListRolesOptions {
  all?: boolean;
}

/**
 * List Roles Subcommand
 *
 * Lists roles in the system, ordered by level then name.
 *
 * Usage:
 *   bun run cli admin roles list [--all]
 *
 * Options:
 *   -a, --all   Include inactive roles
 */
@SubCommand({
  name: 'list',
  description: 'List roles',
})
@Injectable()
export class ListRolesCommand extends CommandRunner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async run(_inputs: string[], options: ListRolesOptions): Promise<void> {
    try {
      const roles = await this.prisma.role.findMany({
        where: options.all ? {} : { active: true },
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { users: true } } },
      });

      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                          Roles                                ║
╚═══════════════════════════════════════════════════════════════╝
`);

      if (roles.length === 0) {
        console.log('  No roles found.\n');
        return;
      }

      const rows = roles.map((r) => ({
        id: String(r.id),
        slug: r.slug,
        name: r.name,
        level: String(r.level),
        active: r.active ? 'yes' : 'no',
        users: String(r._count.users),
        description: r.description ?? '',
      }));

      const width = (key: keyof (typeof rows)[number], min: number) =>
        Math.max(min, ...rows.map((r) => r[key].length));

      const w = {
        id: width('id', 2),
        slug: width('slug', 4),
        name: width('name', 4),
        level: width('level', 5),
        active: width('active', 6),
        users: width('users', 5),
      };

      const line = (c: Record<keyof typeof w, string>, desc: string) =>
        ` ${c.id.padEnd(w.id)}  ${c.slug.padEnd(w.slug)}  ${c.name.padEnd(w.name)}  ${c.level.padStart(w.level)}  ${c.active.padEnd(w.active)}  ${c.users.padStart(w.users)}  ${desc}`;

      console.log(
        line(
          {
            id: 'ID',
            slug: 'Slug',
            name: 'Name',
            level: 'Level',
            active: 'Active',
            users: 'Users',
          },
          'Description',
        ),
      );
      console.log(
        line(
          {
            id: '─'.repeat(w.id),
            slug: '─'.repeat(w.slug),
            name: '─'.repeat(w.name),
            level: '─'.repeat(w.level),
            active: '─'.repeat(w.active),
            users: '─'.repeat(w.users),
          },
          '───────────',
        ),
      );
      for (const r of rows) {
        console.log(line(r, r.description));
      }

      const note = options.all
        ? ''
        : ' (active only, use --all to include inactive)';
      console.log(`\n  Total: ${roles.length} role(s)${note}\n`);
    } catch (error) {
      console.error(
        `\n❌ Failed to list roles: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
      );
      process.exit(1);
    }
  }

  @Option({
    flags: '-a, --all',
    description: 'Include inactive roles',
  })
  parseAll(): boolean {
    return true;
  }
}
