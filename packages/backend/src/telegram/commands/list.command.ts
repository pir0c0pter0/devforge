import { BaseCommand, CommandCategory } from './base.command';
import { containerRepository, type ContainerEntity } from '../../repositories/container.repository';
import type { BotContext } from '../telegram.types';
import { Markup } from 'telegraf';

/**
 * Status emoji mapping for container states
 */
const STATUS_EMOJI: Readonly<Record<string, string>> = {
  running: '🟢',
  stopped: '🔴',
  creating: '🟡',
  error: '❌',
  paused: '⏸️',
  restarting: '🔄',
  removing: '🗑️',
  exited: '🔴',
  dead: '💀',
};

/**
 * Mode emoji mapping
 */
const MODE_EMOJI: Readonly<Record<string, string>> = {
  interactive: '💬',
  autonomous: '🤖',
};

/**
 * Template emoji mapping
 */
const TEMPLATE_EMOJI: Readonly<Record<string, string>> = {
  claude: '🧠',
  vscode: '💻',
  both: '🔧',
};

/**
 * List Command - Lists all containers for the user
 *
 * Displays containers with:
 * - Name and status (with emoji indicators)
 * - Mode (interactive/autonomous)
 * - Resource limits
 * - Inline keyboard for quick selection
 */
export class ListCommand extends BaseCommand {
  readonly name = 'list';
  readonly description = 'Lista todos os containers';
  readonly usage = '/list';
  readonly category: CommandCategory = 'containers';
  override readonly examples = ['/list'] as const;

  override async execute(ctx: BotContext, _args: string[]): Promise<void> {
    this.updateActivity(ctx);

    try {
      // Fetch all containers from repository
      const containers = containerRepository.findAll();

      if (containers.length === 0) {
        await this.reply(
          ctx,
          '*Nenhum container encontrado*\n\n_Crie um container pelo painel web para começar\\._'
        );
        return;
      }

      // Build container list message
      const message = this.buildContainerListMessage(containers);

      // Build inline keyboard for quick selection
      const keyboard = this.buildSelectionKeyboard(containers);

      // Send message with keyboard
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(keyboard),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';

      await this.reply(
        ctx,
        `*Erro ao listar containers*\n\n_${this.escapeMarkdown(errorMessage)}_`
      );
    }
  }

  /**
   * Build formatted message with container list
   */
  private buildContainerListMessage(containers: readonly ContainerEntity[]): string {
    const lines: string[] = [];

    lines.push(`*Containers \\(${containers.length}\\)*`);
    lines.push('');

    // Group by status for better organization
    const running = containers.filter((c) => c.status === 'running');
    const stopped = containers.filter((c) => c.status === 'stopped' || c.status === 'exited');
    const other = containers.filter(
      (c) => c.status !== 'running' && c.status !== 'stopped' && c.status !== 'exited'
    );

    // Running containers first
    if (running.length > 0) {
      for (const container of running) {
        lines.push(this.formatContainerLine(container));
      }
    }

    // Then stopped
    if (stopped.length > 0) {
      for (const container of stopped) {
        lines.push(this.formatContainerLine(container));
      }
    }

    // Finally other states
    if (other.length > 0) {
      for (const container of other) {
        lines.push(this.formatContainerLine(container));
      }
    }

    lines.push('');
    lines.push('_Clique em um container para selecioná\\-lo_');

    return lines.join('\n');
  }

  /**
   * Format a single container line
   */
  private formatContainerLine(container: ContainerEntity): string {
    const statusEmoji = STATUS_EMOJI[container.status] || '❓';
    const modeEmoji = MODE_EMOJI[container.mode] || '';
    const templateEmoji = TEMPLATE_EMOJI[container.template] || '';

    const name = this.escapeMarkdown(container.name);
    const status = this.escapeMarkdown(container.status);

    // Format resources
    const cpu = `${container.cpuLimit} CPU`;
    const memory = `${Math.round(container.memoryLimit / 1024)}GB RAM`;
    const disk = `${Math.round(container.diskLimit / 1024)}GB`;

    return `${statusEmoji} *${name}* ${modeEmoji}${templateEmoji}\n   └ ${this.escapeMarkdown(status)} \\| ${this.escapeMarkdown(cpu)} \\| ${this.escapeMarkdown(memory)} \\| ${this.escapeMarkdown(disk)}`;
  }

  /**
   * Build inline keyboard with container selection buttons
   */
  private buildSelectionKeyboard(
    containers: readonly ContainerEntity[]
  ): Array<Array<ReturnType<typeof Markup.button.callback>>> {
    const keyboard: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];

    // Create buttons in rows of 2
    for (let i = 0; i < containers.length; i += 2) {
      const row: Array<ReturnType<typeof Markup.button.callback>> = [];

      // First button in row
      const container1 = containers[i];
      if (container1) {
        const status1 = STATUS_EMOJI[container1.status] ?? '❓';
        const name1 = container1.name;
        const id1 = container1.id;
        row.push(
          Markup.button.callback(
            `${status1} ${name1}`,
            `select:${id1}`
          )
        );
      }

      // Second button in row (if exists)
      if (i + 1 < containers.length) {
        const container2 = containers[i + 1];
        if (container2) {
          const status2 = STATUS_EMOJI[container2.status] ?? '❓';
          const name2 = container2.name;
          const id2 = container2.id;
          row.push(
            Markup.button.callback(
              `${status2} ${name2}`,
              `select:${id2}`
            )
          );
        }
      }

      keyboard.push(row);
    }

    // Add refresh button at the end
    keyboard.push([Markup.button.callback('🔄 Atualizar', 'refresh:list')]);

    return keyboard;
  }
}

// Export singleton instance
export const listCommand = new ListCommand();
