import { BaseCommand, CommandCategory } from './base.command';
import { containerRepository, type ContainerEntity, type UpdateContainerDto } from '../../repositories/container.repository';
import type { BotContext } from '../telegram.types';
import { conversationService } from '../services';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger({ service: 'telegram-select-command' });

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
 * Select Command - Selects a container as the active context
 *
 * Supports selection by:
 * - Full container ID
 * - Partial container ID (minimum 4 characters)
 * - Container name (exact or partial match)
 *
 * Once selected, instructions can be sent directly to the container.
 */
export class SelectCommand extends BaseCommand {
  readonly name = 'select';
  readonly description = 'Seleciona um container ativo';
  readonly usage = '/select <id|nome>';
  readonly category: CommandCategory = 'containers';
  override readonly examples = [
    '/select my-container',
    '/select abc123',
    '/select dev',
  ] as const;

  override async execute(ctx: BotContext, args: string[]): Promise<void> {
    this.updateActivity(ctx);

    // Check if argument provided
    if (args.length === 0) {
      await this.showUsageError(ctx);
      return;
    }

    const query = args.join(' ').trim();

    try {
      // Find container by ID or name
      const container = await this.findContainer(query);

      if (!container) {
        await this.showNotFoundError(ctx, query);
        return;
      }

      // Update session with selected container and switch to container mode
      this.setSelectedContainer(ctx, container.id);
      if (ctx.session) {
        ctx.session.mode = 'container';

        // Update conversation service if conversation exists
        if (ctx.session.conversationId) {
          try {
            await conversationService.switchMode(ctx.session.conversationId, 'container', container.id);
          } catch (error) {
            logger.warn({ error, conversationId: ctx.session.conversationId }, 'Failed to update conversation mode');
          }
        }
      }

      // Update container's owner Telegram ID for notifications
      const userId = ctx.from?.id;
      if (userId && container.ownerTelegramId !== userId) {
        const updateData: UpdateContainerDto = { ownerTelegramId: userId };
        containerRepository.update(container.id, updateData);
      }

      // Show confirmation with container details
      await this.showSelectionConfirmation(ctx, container);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';

      await this.reply(
        ctx,
        `*Erro ao selecionar container*\n\n_${this.escapeMarkdown(errorMessage)}_`
      );
    }
  }

  /**
   * Find container by ID or name
   * Supports partial matching for convenience
   */
  private async findContainer(query: string): Promise<ContainerEntity | null> {
    const lowerQuery = query.toLowerCase();

    // First, try exact ID match
    const byId = containerRepository.findById(query);
    if (byId) {
      return byId;
    }

    // Then, try exact name match
    const byName = containerRepository.findByName(query);
    if (byName) {
      return byName;
    }

    // Try partial ID match (minimum 4 characters)
    if (query.length >= 4) {
      const allContainers = containerRepository.findAll();

      // Find by partial ID
      const byPartialId = allContainers.find(
        (c) => c.id.toLowerCase().startsWith(lowerQuery)
      );
      if (byPartialId) {
        return byPartialId;
      }

      // Find by partial name (case-insensitive)
      const byPartialName = allContainers.find(
        (c) => c.name.toLowerCase().includes(lowerQuery)
      );
      if (byPartialName) {
        return byPartialName;
      }
    }

    return null;
  }

  /**
   * Show usage error when no argument provided
   */
  private async showUsageError(ctx: BotContext): Promise<void> {
    const currentSelection = this.getSelectedContainer(ctx);
    let message = `*Uso:* \`/select <id|nome>\`

*Exemplos:*
  \`/select my\\-container\`
  \`/select abc123\`
  \`/select dev\`

_Use /list para ver os containers disponíveis_`;

    if (currentSelection) {
      const container = containerRepository.findById(currentSelection);
      if (container) {
        const escapedName = this.escapeMarkdown(container.name);
        message += `\n\n*Container atual:* ${escapedName}`;
      }
    }

    await this.reply(ctx, message);
  }

  /**
   * Show error when container not found
   */
  private async showNotFoundError(ctx: BotContext, query: string): Promise<void> {
    const escapedQuery = this.escapeMarkdown(query);

    // Get suggestions from available containers
    const containers = containerRepository.findAll();
    let suggestions = '';

    if (containers.length > 0) {
      const suggestionList = containers
        .slice(0, 5)
        .map((c) => `  • ${this.escapeMarkdown(c.name)}`)
        .join('\n');

      suggestions = `\n\n*Containers disponíveis:*\n${suggestionList}`;

      if (containers.length > 5) {
        suggestions += `\n  _\\.\\.\\. e mais ${containers.length - 5}_`;
      }
    }

    await this.reply(
      ctx,
      `*Container não encontrado:* \`${escapedQuery}\`

_Verifique o ID ou nome e tente novamente_
_Use /list para ver todos os containers_${suggestions}`
    );
  }

  /**
   * Show confirmation message with container details
   */
  private async showSelectionConfirmation(
    ctx: BotContext,
    container: ContainerEntity
  ): Promise<void> {
    const statusEmoji = STATUS_EMOJI[container.status] || '❓';
    const modeEmoji = MODE_EMOJI[container.mode] || '';

    const name = this.escapeMarkdown(container.name);
    const status = this.escapeMarkdown(container.status);
    const mode = container.mode === 'interactive' ? 'Interativo' : 'Autônomo';
    const template = this.escapeMarkdown(container.template);

    // Format resources
    const cpu = `${container.cpuLimit} cores`;
    const memory = `${Math.round(container.memoryLimit / 1024)} GB`;
    const disk = `${Math.round(container.diskLimit / 1024)} GB`;

    // Format dates
    const createdAt = container.createdAt.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const message = `*Container selecionado\\!* ${statusEmoji}

*Nome:* ${name}
*Status:* ${status}
*Modo:* ${modeEmoji} ${this.escapeMarkdown(mode)}
*Template:* ${template}

*Recursos:*
  • CPU: ${this.escapeMarkdown(cpu)}
  • Memória: ${this.escapeMarkdown(memory)}
  • Disco: ${this.escapeMarkdown(disk)}

*Criado em:* ${this.escapeMarkdown(createdAt)}

${this.getNextStepHint(container)}`;

    await this.reply(ctx, message);
  }

  /**
   * Get contextual hint for next step based on container state
   */
  private getNextStepHint(container: ContainerEntity): string {
    switch (container.status) {
      case 'running':
        return '_Envie uma mensagem para instruir o Claude_';
      case 'stopped':
      case 'exited':
        return '_Use /start para iniciar o container_';
      case 'creating':
        return '_Aguarde a criação do container\\.\\.\\._';
      case 'error':
        return '_Container com erro\\. Verifique os logs\\._';
      default:
        return '_Use /status para ver detalhes_';
    }
  }
}

/**
 * Callback handler for inline button selection
 * Called when user clicks container button from /list
 */
export async function handleSelectCallback(
  ctx: BotContext,
  containerId: string
): Promise<void> {
  const selectCommand = new SelectCommand();

  // Find the container
  const container = containerRepository.findById(containerId);

  if (!container) {
    await ctx.answerCbQuery('Container não encontrado');
    return;
  }

  // Update session and switch to container mode
  if (ctx.session) {
    ctx.session.selectedContainerId = containerId;
    ctx.session.lastActivity = new Date();
    ctx.session.mode = 'container';

    // Update conversation service if conversation exists
    if (ctx.session.conversationId) {
      try {
        await conversationService.switchMode(ctx.session.conversationId, 'container', containerId);
      } catch (error) {
        logger.warn({ error, conversationId: ctx.session.conversationId }, 'Failed to update conversation mode');
      }
    }
  }

  // Update container's owner Telegram ID for notifications
  const userId = ctx.from?.id;
  if (userId && container.ownerTelegramId !== userId) {
    const updateData: UpdateContainerDto = { ownerTelegramId: userId };
    containerRepository.update(containerId, updateData);
  }

  // Answer the callback to remove loading state
  await ctx.answerCbQuery(`✓ ${container.name} selecionado`);

  // Edit the message to show selection or send new message
  try {
    const statusEmoji = STATUS_EMOJI[container.status] || '❓';
    const escapedName = selectCommand['escapeMarkdown'](container.name);
    const status = selectCommand['escapeMarkdown'](container.status);

    const shortMessage = `*Selecionado:* ${statusEmoji} ${escapedName}\n*Status:* ${status}\n\n_Envie uma mensagem para instruir o Claude_`;

    // Try to edit the message, if that fails send a new one
    await ctx.editMessageText(shortMessage, {
      parse_mode: 'MarkdownV2',
    });
  } catch (error) {
    // If editing fails (message too old, etc), just acknowledge
  }
}

// Export singleton instance
export const selectCommand = new SelectCommand();
