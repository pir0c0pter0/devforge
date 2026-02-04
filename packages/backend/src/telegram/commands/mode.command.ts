import { Markup } from 'telegraf';
import { BaseCommand, CommandCategory } from './base.command';
import type { BotContext } from '../telegram.types';
import { containerRepository } from '../../repositories/container.repository';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger({ service: 'telegram-mode-command' });

/**
 * Mode Command - View or switch the current mode (conversation/container)
 *
 * Shows:
 *   - Current mode with visual indicator
 *   - Selected container (if in container mode)
 *   - Inline keyboard to switch modes
 */
export class ModeCommand extends BaseCommand {
  readonly name = 'mode';
  readonly description = 'Ver ou trocar o modo atual';
  readonly usage = '/mode';
  readonly category: CommandCategory = 'general';
  override readonly examples = [
    '/mode',
  ] as const;

  override async execute(ctx: BotContext): Promise<void> {
    this.updateActivity(ctx);

    const session = ctx.session;
    if (!session) {
      await this.replyHtml(ctx, '<b>Erro:</b> Sessao nao encontrada.');
      return;
    }

    const currentMode = session.mode || 'conversation';
    let containerInfo = '';

    // Get container name if selected
    if (session.selectedContainerId) {
      const container = containerRepository.findById(session.selectedContainerId);
      if (container) {
        containerInfo = `\n<b>Container:</b> <code>${container.name}</code>`;
      } else {
        containerInfo = '\n<b>Container:</b> <i>Nao encontrado</i>';
      }
    }

    const modeEmoji = currentMode === 'conversation' ? '\u{1F4AC}' : '\u{1F433}';
    const modeName = currentMode === 'conversation' ? 'Conversa direta' : 'Container';

    logger.debug({ userId: session.userId, currentMode }, 'Showing mode info');

    const message = [
      `${modeEmoji} <b>Modo atual:</b> ${modeName}`,
      containerInfo,
      '',
      '<b>Modos disponiveis:</b>',
      '  \u{1F4AC} <b>Conversa</b> - Fale diretamente comigo',
      '  \u{1F433} <b>Container</b> - Envie comandos para um container Claude',
    ].filter(Boolean).join('\n');

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          currentMode === 'conversation' ? '\u{2705} Conversa' : '\u{1F4AC} Conversa',
          'mode_conversation'
        ),
        Markup.button.callback(
          currentMode === 'container' ? '\u{2705} Container' : '\u{1F433} Container',
          'mode_container'
        ),
      ],
    ]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...keyboard,
    });
  }
}

// Export singleton instance
export const modeCommand = new ModeCommand();
