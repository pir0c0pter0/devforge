import { BaseCommand, CommandCategory } from './base.command';
import type { BotContext } from '../telegram.types';
import { conversationService } from '../services';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger({ service: 'telegram-exit-command' });

/**
 * Exit Command - Exit current mode and return to conversation mode
 *
 * When in container mode:
 *   - Clears the selected container
 *   - Switches to conversation mode
 *   - Updates conversation service
 *
 * When already in conversation mode:
 *   - Shows available commands menu
 */
export class ExitCommand extends BaseCommand {
  readonly name = 'exit';
  readonly description = 'Sair do modo atual e voltar ao menu';
  readonly usage = '/exit';
  readonly category: CommandCategory = 'general';
  override readonly examples = [
    '/exit',
  ] as const;

  override async execute(ctx: BotContext): Promise<void> {
    this.updateActivity(ctx);

    const session = ctx.session;
    if (!session) {
      await this.replyHtml(ctx, '<b>Erro:</b> Sessao nao encontrada.');
      return;
    }

    const previousContainer = session.selectedContainerId;

    // If in container mode, exit to conversation mode
    if (session.mode === 'container') {
      session.mode = 'conversation';
      session.selectedContainerId = undefined;

      // Update conversation if exists
      if (session.conversationId) {
        try {
          await conversationService.switchMode(session.conversationId, 'conversation');
        } catch (error) {
          logger.warn({ error, conversationId: session.conversationId }, 'Failed to update conversation mode');
        }
      }

      logger.info({ userId: session.userId, previousContainer }, 'Exited container mode');

      await this.replyHtml(
        ctx,
        '<b>Saiu do modo container.</b>\n\n' +
        'Agora voce esta no modo conversa.\n' +
        'Converse diretamente comigo ou use /select para escolher outro container.'
      );
      return;
    }

    // If already in conversation mode, just show menu
    await this.replyHtml(
      ctx,
      '<b>Voce esta no modo conversa.</b>\n\n' +
      '<b>Comandos disponiveis:</b>\n' +
      '  /select - Selecionar um container\n' +
      '  /list - Listar containers\n' +
        '  /clear - Limpar historico\n' +
        '  /help - Ver todos os comandos'
    );
  }
}

// Export singleton instance
export const exitCommand = new ExitCommand();
