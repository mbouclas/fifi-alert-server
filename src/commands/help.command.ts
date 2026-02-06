import { Command, CommandRunner, Help } from 'nest-commander';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';

/**
 * Metadata key used by nest-commander for @Command() decorator
 */
const COMMAND_META_KEY = 'CommandBuilder:Command:Meta';

/**
 * Interface representing command metadata from @Command() decorator
 */
interface CommandMetadata {
  name: string;
  description?: string;
  arguments?: string;
  aliases?: string[];
}

/**
 * Interface for displaying command information
 */
interface CommandInfo {
  name: string;
  description: string;
  arguments?: string;
  aliases?: string[];
}

/**
 * Default Help Command
 *
 * This command displays all available CLI commands when no command is provided.
 * It runs automatically when the CLI is invoked without arguments:
 *   bun run cli
 *
 * It can also be invoked explicitly:
 *   bun run cli help
 */
@Command({
  name: 'help',
  description: 'Display available commands and usage information',
  options: { isDefault: true },
})
@Injectable()
export class HelpCommand extends CommandRunner implements OnModuleInit {
  private commands: CommandInfo[] = [];

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
  ) {
    super();
  }

  /**
   * Discovers all registered commands on module initialization
   */
  onModuleInit(): void {
    this.discoverCommands();
  }

  /**
   * Discovers all classes decorated with @Command() and extracts their metadata
   */
  private discoverCommands(): void {
    const providers = this.discoveryService.getProviders();

    this.commands = providers
      .filter((wrapper): wrapper is typeof wrapper & { metatype: NonNullable<typeof wrapper.metatype> } => {
        if (!wrapper.metatype) return false;
        const metadata = this.reflector.get<CommandMetadata>(
          COMMAND_META_KEY,
          wrapper.metatype,
        );
        return !!metadata;
      })
      .map((wrapper) => {
        const metadata = this.reflector.get<CommandMetadata>(
          COMMAND_META_KEY,
          wrapper.metatype,
        );
        return {
          name: metadata.name,
          description: metadata.description || 'No description available',
          arguments: metadata.arguments,
          aliases: metadata.aliases,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async run(): Promise<void> {
    this.printHelp();
  }

  @Help('before')
  beforeHelp(): string {
    return `
╔═══════════════════════════════════════════════════════════════╗
║           Comment Classifier Server CLI                       ║
╚═══════════════════════════════════════════════════════════════╝
`;
  }

  @Help('after')
  afterHelp(): string {
    const commandList = this.formatCommandList();
    return `
Available Commands:
───────────────────────────────────────────────────────────────────
${commandList}
Usage:
  bun run cli <command> [options]

For more information on a specific command, run:
  bun run cli <command> --help
`;
  }

  /**
   * Formats the list of commands for display
   */
  private formatCommandList(): string {
    if (this.commands.length === 0) {
      return '  No commands registered.\n';
    }

    const maxNameLength = Math.max(
      ...this.commands.map((cmd) => {
        const nameWithArgs = cmd.arguments
          ? `${cmd.name} ${cmd.arguments}`
          : cmd.name;
        return nameWithArgs.length;
      }),
    );

    return this.commands
      .map((cmd) => {
        const nameWithArgs = cmd.arguments
          ? `${cmd.name} ${cmd.arguments}`
          : cmd.name;
        const padding = ' '.repeat(maxNameLength - nameWithArgs.length + 2);
        const aliasStr =
          cmd.aliases && cmd.aliases.length > 0
            ? ` (aliases: ${cmd.aliases.join(', ')})`
            : '';
        return `  ${nameWithArgs}${padding}${cmd.description}${aliasStr}`;
      })
      .join('\n');
  }

  private printHelp(): void {
    console.log(this.beforeHelp());
    console.log(this.afterHelp());
  }
}
