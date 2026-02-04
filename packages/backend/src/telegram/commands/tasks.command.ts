import { Markup } from 'telegraf';
import { BaseCommand, CommandCategory } from './base.command';
import type { BotContext } from '../telegram.types';
import { reminderService } from '../services/reminder.service';
import { formatDateTime } from '../utils/time-parser';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger({ service: 'tasks-command' });

/**
 * Tasks Command - List pending reminders
 *
 * Usage:
 *   /tasks - List all pending reminders
 *   /tasks all - List all reminders (including completed)
 *
 * Shows reminders with inline buttons to cancel each one.
 */
export class TasksCommand extends BaseCommand {
  readonly name = 'tasks';
  readonly description = 'Listar lembretes pendentes';
  readonly usage = '/tasks [all]';
  readonly category: CommandCategory = 'general';
  override readonly examples = ['/tasks', '/tasks all'] as const;

  override async execute(ctx: BotContext, args: string[]): Promise<void> {
    this.updateActivity(ctx);

    const userId = ctx.from?.id;

    if (!userId) {
      await this.reply(ctx, '\u{26A0}\u{FE0F} Erro: Não foi possível identificar o usuário\\.');
      return;
    }

    const showAll = args[0]?.toLowerCase() === 'all';

    try {
      const reminders = showAll
        ? reminderService.getUserReminders(userId)
        : reminderService.getPendingReminders(userId);

      if (reminders.length === 0) {
        const message = showAll
          ? '\u{1F4CB} Você não tem lembretes\\.\n\nUse `/remind <tempo> <mensagem>` para criar um\\.'
          : '\u{1F4CB} Você não tem lembretes pendentes\\.\n\nUse `/remind <tempo> <mensagem>` para criar um\\.';
        await this.reply(ctx, message);
        return;
      }

      // Build message with reminders
      let message = showAll
        ? `\u{1F4CB} *Todos os lembretes \\(${reminders.length}\\)*\n\n`
        : `\u{1F4CB} *Lembretes pendentes \\(${reminders.length}\\)*\n\n`;

      const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

      for (const reminder of reminders.slice(0, 10)) {
        const formattedTime = formatDateTime(reminder.scheduledFor, reminder.timezone);
        const statusEmoji = this.getStatusEmoji(reminder.status);
        const truncatedText = reminder.text.slice(0, 50) + (reminder.text.length > 50 ? '...' : '');

        message += `${statusEmoji} *${this.escapeMarkdown(formattedTime)}*\n`;
        message += `   _"${this.escapeMarkdown(truncatedText)}"_\n`;

        if (reminder.recurringType) {
          const recurringText = {
            daily: '\u{1F501} Diário',
            weekly: '\u{1F501} Semanal',
            monthly: '\u{1F501} Mensal',
            cron: '\u{1F501} Cron',
          }[reminder.recurringType] || '';
          message += `   ${recurringText}\n`;
        }

        message += `   _ID: \`${reminder.id.slice(0, 8)}\`_\n\n`;

        // Add cancel button for pending reminders
        if (reminder.status === 'pending') {
          buttons.push([
            Markup.button.callback(
              `\u{274C} Cancelar "${truncatedText.slice(0, 20)}..."`,
              `cancel_reminder:${reminder.id}`
            ),
          ]);
        }
      }

      if (reminders.length > 10) {
        message += `_\\.\\.\\. e mais ${reminders.length - 10} lembretes_\n`;
      }

      // Add refresh button
      buttons.push([
        Markup.button.callback('\u{1F504} Atualizar', 'refresh_tasks'),
      ]);

      logger.info({
        userId,
        reminderCount: reminders.length,
        showAll,
      }, 'Tasks listed');

      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(buttons),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error({ error: errorMessage, userId }, 'Failed to list tasks');
      await this.reply(ctx, `\u{26A0}\u{FE0F} *Erro ao listar lembretes*\n\n${this.escapeMarkdown(errorMessage)}`);
    }
  }

  /**
   * Get status emoji
   */
  private getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      pending: '\u{23F3}',      // Hourglass
      sent: '\u{2705}',         // Check mark
      failed: '\u{274C}',       // Red X
      cancelled: '\u{1F6AB}',   // No entry
    };
    return emojis[status] || '\u{2753}';
  }
}

// Export singleton instance
export const tasksCommand = new TasksCommand();
