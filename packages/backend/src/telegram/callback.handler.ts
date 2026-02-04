import { Markup } from 'telegraf';
import type { BotContext } from './telegram.types';
import { containerRepository } from '../repositories/container.repository';
import { getQueueStatus, pauseQueue, resumeQueue, clearQueue } from '../services/claude-queue.service';
import { handleSelectCallback } from './commands/select.command';
import { listCommand } from './commands/list.command';
import { createChildLogger } from '../utils/logger';

const logger = createChildLogger({ service: 'telegram-callback' });

/**
 * Status emoji mapping for container states
 */
const STATUS_EMOJI: Readonly<Record<string, string>> = {
  running: '\u{1F7E2}', // Green circle
  stopped: '\u{1F534}', // Red circle
  creating: '\u{1F7E1}', // Yellow circle
  error: '\u{274C}', // Red X
  paused: '\u{23F8}\u{FE0F}', // Pause button
  restarting: '\u{1F504}', // Arrows
  exited: '\u{1F534}', // Red circle
};

/**
 * CallbackHandler - Handles inline keyboard button callbacks
 *
 * Callback data format: action:param1:param2
 * Examples:
 *   - select:container-123 -> Select container
 *   - queue_pause:container-123 -> Pause queue
 *   - confirm:stop:container-123 -> Confirm stop action
 *   - cancel -> Cancel current action
 */
export class CallbackHandler {
  /**
   * Handle callback query from inline keyboard
   *
   * @param ctx - Bot context with callback data
   */
  async handle(ctx: BotContext): Promise<void> {
    const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;

    if (!data) {
      logger.warn({ userId: ctx.from?.id }, 'Callback query without data');
      await ctx.answerCbQuery('\u{26A0} Dados inválidos');
      return;
    }

    // Parse callback data
    const [action, ...params] = data.split(':');

    logger.info(
      {
        userId: ctx.from?.id,
        action,
        params,
      },
      'Processing callback'
    );

    // Update session activity
    if (ctx.session) {
      ctx.session.lastActivity = new Date();
    }

    try {
      const param0 = params[0] ?? '';

      switch (action) {
        case 'select':
          await this.handleSelect(ctx, param0);
          break;

        case 'status':
          await this.handleStatus(ctx, param0);
          break;

        case 'queue':
          await this.handleQueue(ctx, param0);
          break;

        case 'queue_pause':
          await this.handleQueuePause(ctx, param0);
          break;

        case 'queue_resume':
          await this.handleQueueResume(ctx, param0);
          break;

        case 'queue_clear':
          await this.handleQueueClear(ctx, param0);
          break;

        case 'confirm':
          await this.handleConfirm(ctx, params);
          break;

        case 'cancel':
          await this.handleCancel(ctx);
          break;

        case 'clear_selection':
          await this.handleClearSelection(ctx);
          break;

        case 'refresh':
          await this.handleRefresh(ctx, param0);
          break;

        default:
          logger.warn({ action, params }, 'Unknown callback action');
          await ctx.answerCbQuery('\u{2753} Ação desconhecida');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error({ error, action, params }, 'Callback handler error');
      await ctx.answerCbQuery(`\u{26A0} Erro: ${errorMessage}`.slice(0, 200));
    }
  }

  /**
   * Handle container selection from inline button
   */
  private async handleSelect(ctx: BotContext, containerId: string): Promise<void> {
    if (!containerId) {
      await ctx.answerCbQuery('\u{26A0} ID do container inválido');
      return;
    }

    await handleSelectCallback(ctx, containerId);
  }

  /**
   * Handle status request
   */
  private async handleStatus(ctx: BotContext, containerId: string): Promise<void> {
    if (!containerId) {
      await ctx.answerCbQuery('\u{26A0} Container não especificado');
      return;
    }

    const container = containerRepository.findById(containerId);
    if (!container) {
      await ctx.answerCbQuery('\u{26A0} Container não encontrado');
      return;
    }

    const statusEmoji = STATUS_EMOJI[container.status] || '\u{2753}';

    // Quick status via answerCbQuery
    await ctx.answerCbQuery(`${statusEmoji} ${container.name}: ${container.status}`);

    // Detailed status via new message
    const uptime = container.startedAt
      ? this.formatDuration(Date.now() - container.startedAt.getTime())
      : 'N/A';

    const message = [
      `\u{1F4CA} *Status: ${this.escapeMarkdown(container.name)}*`,
      '',
      `*Status:* ${statusEmoji} ${this.escapeMarkdown(container.status)}`,
      `*Modo:* ${container.mode === 'autonomous' ? '\u{1F916} Autônomo' : '\u{1F4AC} Interativo'}`,
      `*Template:* ${this.escapeMarkdown(container.template)}`,
      '',
      '*Recursos:*',
      `  \u{2022} CPU: ${container.cpuLimit} cores`,
      `  \u{2022} RAM: ${Math.round(container.memoryLimit / 1024)}GB`,
      `  \u{2022} Disco: ${Math.round(container.diskLimit / 1024)}GB`,
      '',
      container.status === 'running'
        ? `*Uptime:* ${this.escapeMarkdown(uptime)}`
        : '_Container parado_',
    ].join('\n');

    try {
      await ctx.editMessageText(message, { parse_mode: 'MarkdownV2' });
    } catch {
      // If edit fails, send new message
      await ctx.reply(message, { parse_mode: 'MarkdownV2' });
    }
  }

  /**
   * Handle queue status request
   */
  private async handleQueue(ctx: BotContext, containerId: string): Promise<void> {
    if (!containerId) {
      await ctx.answerCbQuery('\u{26A0} Container não especificado');
      return;
    }

    const container = containerRepository.findById(containerId);
    if (!container) {
      await ctx.answerCbQuery('\u{26A0} Container não encontrado');
      return;
    }

    try {
      const status = await getQueueStatus(containerId);

      await ctx.answerCbQuery(
        `\u{1F4CB} Fila: ${status.waiting} pendente(s), ${status.active} ativo(s)`
      );

      const message = [
        `\u{1F4CB} *Fila: ${this.escapeMarkdown(container.name)}*`,
        '',
        `*Pendentes:* ${status.waiting}`,
        `*Ativos:* ${status.active}`,
        `*Concluídos:* ${status.completed}`,
        `*Falhas:* ${status.failed}`,
        `*Atrasados:* ${status.delayed}`,
        '',
        `*Status:* ${status.isPaused ? '\u{23F8} Pausada' : '\u{25B6} Ativa'}`,
      ].join('\n');

      const keyboard = [
        [
          status.isPaused
            ? Markup.button.callback('\u{25B6} Resumir', `queue_resume:${containerId}`)
            : Markup.button.callback('\u{23F8} Pausar', `queue_pause:${containerId}`),
        ],
        [
          Markup.button.callback('\u{1F5D1} Limpar fila', `confirm:queue_clear:${containerId}`),
        ],
        [
          Markup.button.callback('\u{1F504} Atualizar', `queue:${containerId}`),
        ],
      ];

      try {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(keyboard),
        });
      } catch {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(keyboard),
        });
      }
    } catch (error) {
      await ctx.answerCbQuery('\u{26A0} Erro ao obter status da fila');
    }
  }

  /**
   * Handle queue pause request
   */
  private async handleQueuePause(ctx: BotContext, containerId: string): Promise<void> {
    if (!containerId) {
      await ctx.answerCbQuery('\u{26A0} Container não especificado');
      return;
    }

    try {
      await pauseQueue(containerId);
      await ctx.answerCbQuery('\u{23F8} Fila pausada');

      // Refresh queue view
      await this.handleQueue(ctx, containerId);
    } catch (error) {
      await ctx.answerCbQuery('\u{26A0} Erro ao pausar fila');
    }
  }

  /**
   * Handle queue resume request
   */
  private async handleQueueResume(ctx: BotContext, containerId: string): Promise<void> {
    if (!containerId) {
      await ctx.answerCbQuery('\u{26A0} Container não especificado');
      return;
    }

    try {
      await resumeQueue(containerId);
      await ctx.answerCbQuery('\u{25B6} Fila retomada');

      // Refresh queue view
      await this.handleQueue(ctx, containerId);
    } catch (error) {
      await ctx.answerCbQuery('\u{26A0} Erro ao retomar fila');
    }
  }

  /**
   * Handle queue clear request
   */
  private async handleQueueClear(ctx: BotContext, containerId: string): Promise<void> {
    if (!containerId) {
      await ctx.answerCbQuery('\u{26A0} Container não especificado');
      return;
    }

    try {
      const removed = await clearQueue(containerId);
      await ctx.answerCbQuery(`\u{1F5D1} ${removed} job(s) removido(s)`);

      // Refresh queue view
      await this.handleQueue(ctx, containerId);
    } catch (error) {
      await ctx.answerCbQuery('\u{26A0} Erro ao limpar fila');
    }
  }

  /**
   * Handle confirmation dialogs
   */
  private async handleConfirm(ctx: BotContext, params: string[]): Promise<void> {
    const [action, containerId] = params;

    if (!action || !containerId) {
      await ctx.answerCbQuery('\u{26A0} Parâmetros inválidos');
      return;
    }

    const container = containerRepository.findById(containerId);
    if (!container) {
      await ctx.answerCbQuery('\u{26A0} Container não encontrado');
      return;
    }

    // Show confirmation dialog
    const confirmMessages: Record<string, string> = {
      stop: `\u{1F6D1} *Confirmar parada*\n\nDeseja parar o container *${this.escapeMarkdown(container.name)}*?`,
      start: `\u{25B6}\u{FE0F} *Confirmar início*\n\nDeseja iniciar o container *${this.escapeMarkdown(container.name)}*?`,
      restart: `\u{1F504} *Confirmar reinício*\n\nDeseja reiniciar o container *${this.escapeMarkdown(container.name)}*?`,
      queue_clear: `\u{1F5D1} *Confirmar limpeza*\n\nDeseja limpar a fila de *${this.escapeMarkdown(container.name)}*?\n\n_Todos os jobs pendentes serão removidos\\._`,
    };

    const message = confirmMessages[action] || `\u{2753} Confirmar ${action}?`;

    const keyboard = [
      [
        Markup.button.callback('\u{2705} Confirmar', `execute:${action}:${containerId}`),
        Markup.button.callback('\u{274C} Cancelar', 'cancel'),
      ],
    ];

    await ctx.answerCbQuery();

    try {
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(keyboard),
      });
    } catch {
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(keyboard),
      });
    }
  }

  /**
   * Handle cancel action
   */
  private async handleCancel(ctx: BotContext): Promise<void> {
    await ctx.answerCbQuery('\u{274C} Ação cancelada');

    try {
      await ctx.editMessageText('_Ação cancelada\\._', { parse_mode: 'MarkdownV2' });
    } catch {
      // Message might be too old to edit
    }
  }

  /**
   * Handle clear selection
   */
  private async handleClearSelection(ctx: BotContext): Promise<void> {
    if (ctx.session) {
      ctx.session.selectedContainerId = undefined;
    }

    await ctx.answerCbQuery('\u{2705} Seleção limpa');

    try {
      await ctx.editMessageText(
        '*Seleção limpa*\n\n_Use /list para ver seus containers_',
        { parse_mode: 'MarkdownV2' }
      );
    } catch {
      // Message might be too old to edit
    }
  }

  /**
   * Handle refresh requests
   */
  private async handleRefresh(ctx: BotContext, target: string): Promise<void> {
    await ctx.answerCbQuery('\u{1F504} Atualizando...');

    switch (target) {
      case 'list':
        // Execute list command to refresh container list
        await listCommand.execute(ctx, []);
        break;

      default:
        await ctx.answerCbQuery('\u{2753} Alvo desconhecido');
    }
  }

  /**
   * Escape special characters for MarkdownV2
   */
  private escapeMarkdown(text: string): string {
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    let escaped = text;
    for (const char of specialChars) {
      escaped = escaped.split(char).join(`\\${char}`);
    }
    return escaped;
  }

  /**
   * Format duration in milliseconds to human readable string
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

// Export singleton instance
export const callbackHandler = new CallbackHandler();
