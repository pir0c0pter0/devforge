import type { BaseCommand, CommandCategory } from './base.command';

/**
 * Command info for help generation
 */
export interface CommandInfo {
  readonly name: string;
  readonly description: string;
  readonly usage: string;
  readonly category: CommandCategory;
  readonly examples?: readonly string[];
}

/**
 * Grouped commands by category
 */
export interface GroupedCommands {
  readonly general: readonly CommandInfo[];
  readonly containers: readonly CommandInfo[];
  readonly instructions: readonly CommandInfo[];
}

/**
 * Command Registry - Singleton pattern for auto-discovery of commands
 * Manages registration and retrieval of all bot commands
 */
class CommandRegistryImpl {
  private readonly commands: Map<string, BaseCommand> = new Map();
  private static instance: CommandRegistryImpl | null = null;

  /**
   * Get singleton instance
   */
  static getInstance(): CommandRegistryImpl {
    if (!CommandRegistryImpl.instance) {
      CommandRegistryImpl.instance = new CommandRegistryImpl();
    }
    return CommandRegistryImpl.instance;
  }

  /**
   * Register a command
   * @param command - Command instance to register
   * @throws Error if command with same name already registered
   */
  register(command: BaseCommand): void {
    const name = command.name.toLowerCase();

    if (this.commands.has(name)) {
      throw new Error(`Command '${name}' is already registered`);
    }

    this.commands.set(name, command);
  }

  /**
   * Get a command by name
   * @param name - Command name (without leading /)
   * @returns Command instance or undefined
   */
  get(name: string): BaseCommand | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /**
   * Get all registered commands
   * @returns Array of all command instances
   */
  getAll(): readonly BaseCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get commands grouped by category
   * @returns Grouped commands object
   */
  getGrouped(): GroupedCommands {
    const commands = this.getAll();

    return {
      general: commands
        .filter((cmd) => cmd.category === 'general')
        .map((cmd) => this.toCommandInfo(cmd)),
      containers: commands
        .filter((cmd) => cmd.category === 'containers')
        .map((cmd) => this.toCommandInfo(cmd)),
      instructions: commands
        .filter((cmd) => cmd.category === 'instructions')
        .map((cmd) => this.toCommandInfo(cmd)),
    };
  }

  /**
   * Generate help text for all commands
   * @returns Formatted help message in MarkdownV2
   */
  getHelp(): string {
    const grouped = this.getGrouped();
    const lines: string[] = [];

    lines.push('*Comandos Disponíveis*');
    lines.push('');

    // General commands
    if (grouped.general.length > 0) {
      lines.push('*Geral*');
      for (const cmd of grouped.general) {
        lines.push(`/${this.escape(cmd.name)} \\- ${this.escape(cmd.description)}`);
      }
      lines.push('');
    }

    // Container commands
    if (grouped.containers.length > 0) {
      lines.push('*Containers*');
      for (const cmd of grouped.containers) {
        lines.push(`/${this.escape(cmd.name)} \\- ${this.escape(cmd.description)}`);
      }
      lines.push('');
    }

    // Instruction commands
    if (grouped.instructions.length > 0) {
      lines.push('*Instruções*');
      for (const cmd of grouped.instructions) {
        lines.push(`/${this.escape(cmd.name)} \\- ${this.escape(cmd.description)}`);
      }
      lines.push('');
    }

    lines.push('_Use /help \\<comando\\> para ver detalhes_');

    return lines.join('\n');
  }

  /**
   * Generate detailed help for a specific command
   * @param commandName - Command name to get help for
   * @returns Formatted help message or null if command not found
   */
  getCommandHelp(commandName: string): string | null {
    const command = this.get(commandName);

    if (!command) {
      return null;
    }

    const lines: string[] = [];

    lines.push(`*Comando:* /${this.escape(command.name)}`);
    lines.push('');
    lines.push(`*Descrição:* ${this.escape(command.description)}`);
    lines.push('');
    lines.push(`*Uso:* \`${this.escape(command.usage)}\``);

    if (command.examples && command.examples.length > 0) {
      lines.push('');
      lines.push('*Exemplos:*');
      for (const example of command.examples) {
        lines.push(`  \`${this.escape(example)}\``);
      }
    }

    return lines.join('\n');
  }

  /**
   * Check if a command exists
   * @param name - Command name to check
   * @returns True if command is registered
   */
  has(name: string): boolean {
    return this.commands.has(name.toLowerCase());
  }

  /**
   * Get total number of registered commands
   */
  get size(): number {
    return this.commands.size;
  }

  /**
   * Clear all registered commands (for testing)
   */
  clear(): void {
    this.commands.clear();
  }

  /**
   * Convert command to info object
   */
  private toCommandInfo(command: BaseCommand): CommandInfo {
    return {
      name: command.name,
      description: command.description,
      usage: command.usage,
      category: command.category,
      examples: command.examples,
    };
  }

  /**
   * Escape special characters for MarkdownV2
   */
  private escape(text: string): string {
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];

    let escaped = text;
    for (const char of specialChars) {
      escaped = escaped.split(char).join(`\\${char}`);
    }

    return escaped;
  }
}

/**
 * Singleton instance export
 */
export const commandRegistry = CommandRegistryImpl.getInstance();

/**
 * Decorator-style function for registering commands
 * Can be used to auto-register commands on import
 * @param command - Command instance to register
 */
export function registerCommand(command: BaseCommand): void {
  commandRegistry.register(command);
}
