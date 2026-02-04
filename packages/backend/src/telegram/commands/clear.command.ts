import { Markup } from 'telegraf';
import { BaseCommand, CommandCategory } from './base.command';
import type { BotContext } from '../telegram.types';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger({ service: 'telegram-clear-command' });

/**
 * Clear Command - Clears conversation history with confirmation
 *
 * Shows inline keyboard for confirmation before clearing.
 * Does not clear container selection, only conversation messages.
 */
export class ClearCommand extends BaseCommand {
  readonly name = 'clear';
  readonly description = 'Limpar historico da conversa atual';
  readonly usage = '/clear';
  readonly category: CommandCategory = 'general';
  override readonly examples = ['/clear'] as const;

  override async execute(ctx: BotContext, _args: string[]): Promise<void> {
    this.updateActivity(ctx);

    // Check if user has a conversation
    if (!ctx.session?.conversationId) {
      await ctx.reply('Nenhuma conversa ativa para limpar.');
      return;
    }

    logger.info(
      { userId: ctx.session.userId, conversationId: ctx.session.conversationId },
      'User requested conversation clear'
    );

    // Show confirmation with inline keyboard
    await ctx.reply(
      'Tem certeza que deseja limpar o historico desta conversa?\n\nIsso ira apagar todas as mensagens anteriores.',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Sim, limpar', 'clear_confirm'),
          Markup.button.callback('Cancelar', 'clear_cancel'),
        ],
      ])
    );
  }
}

// Export singleton instance
export const clearCommand = new ClearCommand();
