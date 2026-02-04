import { BaseCommand, CommandCategory } from './base.command';
import type { BotContext } from '../telegram.types';
import { reminderService } from '../services/reminder.service';
import { parseTime, formatDateTime, parseRecurringType } from '../utils/time-parser';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger({ service: 'remind-command' });

/**
 * Remind Command - Schedule reminders
 *
 * Usage:
 *   /remind <time> <message>
 *
 * Time formats:
 *   - Relative: 10m, 2h, 1d, 30min, 2 hours
 *   - Absolute: 15:30, 09:00
 *   - Date+time: tomorrow 9:00, 2024-01-15 14:00
 *
 * Options:
 *   --daily, --weekly, --monthly for recurring reminders
 *
 * Examples:
 *   /remind 10m Verificar build
 *   /remind 2h Reuniao
 *   /remind 15:30 Almoco
 *   /remind tomorrow 9:00 Standup
 *   /remind 10m Backup --daily
 */
export class RemindCommand extends BaseCommand {
  readonly name = 'remind';
  readonly description = 'Agendar um lembrete';
  readonly usage = '/remind <tempo> <mensagem> [--daily|--weekly|--monthly]';
  readonly category: CommandCategory = 'general';
  override readonly examples = [
    '/remind 10m Verificar build',
    '/remind 2h Reuniao',
    '/remind 15:30 Almoco',
    '/remind tomorrow 9:00 Standup',
    '/remind 30m Backup --daily',
  ] as const;

  override async execute(ctx: BotContext, args: string[]): Promise<void> {
    this.updateActivity(ctx);

    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      await this.reply(ctx, '\u{26A0}\u{FE0F} Erro: Não foi possível identificar o usuário\\.');
      return;
    }

    if (args.length < 2) {
      await this.showUsage(ctx);
      return;
    }

    // Parse recurring option
    const lastArg = args[args.length - 1] ?? '';
    let recurringType: 'daily' | 'weekly' | 'monthly' | null = null;

    if (lastArg.startsWith('--')) {
      const recurringInput = lastArg.replace(/^--/, '');
      recurringType = parseRecurringType(recurringInput);
      args = args.slice(0, -1); // Remove recurring option from args
    }

    // Find where the message starts
    // Try different combinations of time parts
    let message = '';
    let parsedTime = null;

    // Try "tomorrow 9:00" format first (2 words for time)
    if (args.length >= 3) {
      const firstArg = args[0] ?? '';
      const secondArg = args[1] ?? '';
      const twoWordTime = `${firstArg} ${secondArg}`;
      const parsed = parseTime(twoWordTime);
      if (parsed) {
        message = args.slice(2).join(' ');
        parsedTime = parsed;
      }
    }

    // Try single word time format
    if (!parsedTime && args.length >= 2) {
      const firstArg = args[0] ?? '';
      const parsed = parseTime(firstArg);
      if (parsed) {
        message = args.slice(1).join(' ');
        parsedTime = parsed;
      }
    }

    // Validate parsed time
    if (!parsedTime) {
      await this.reply(
        ctx,
        `\u{274C} *Formato de tempo inválido*\n\n` +
        `Use um dos formatos:\n` +
        `\u{2022} Relativo: \`10m\`, \`2h\`, \`1d\`\n` +
        `\u{2022} Absoluto: \`15:30\`, \`09:00\`\n` +
        `\u{2022} Data: \`tomorrow 9:00\`\n\n` +
        `Exemplo: \`/remind 30m Verificar email\``
      );
      return;
    }

    // Validate message
    if (!message.trim()) {
      await this.reply(ctx, '\u{274C} *Mensagem é obrigatória*\n\nExemplo: `/remind 30m Verificar email`');
      return;
    }

    // Validate message length
    if (message.length > 500) {
      await this.reply(ctx, '\u{274C} *Mensagem muito longa*\n\nO máximo é 500 caracteres\\.');
      return;
    }

    // Validate scheduled time is in the future
    if (parsedTime.date.getTime() <= Date.now()) {
      await this.reply(ctx, '\u{274C} *O horário deve ser no futuro*');
      return;
    }

    try {
      // Schedule the reminder
      const reminder = await reminderService.scheduleReminder(userId, chatId, {
        text: message.trim(),
        scheduledFor: parsedTime.date,
        timezone: 'America/Sao_Paulo',
        recurringType: recurringType || undefined,
      });

      // Format response
      const formattedTime = formatDateTime(parsedTime.date, 'America/Sao_Paulo');
      const escapedTime = this.escapeMarkdown(formattedTime);
      const escapedMessage = this.escapeMarkdown(message.trim().slice(0, 100));
      const truncated = message.length > 100 ? '\\.\\.\\.' : '';

      let response = `\u{2705} *Lembrete agendado\\!*\n\n`;
      response += `\u{23F0} *Horário:* ${escapedTime}\n`;
      response += `\u{1F4DD} *Mensagem:* _"${escapedMessage}${truncated}"_\n`;

      if (recurringType) {
        const recurringText = {
          daily: 'Diário',
          weekly: 'Semanal',
          monthly: 'Mensal',
        }[recurringType];
        response += `\u{1F501} *Repetição:* ${recurringText}\n`;
      }

      response += `\n_ID: \`${reminder.id.slice(0, 8)}\`_`;

      logger.info({
        userId,
        chatId,
        reminderId: reminder.id,
        scheduledFor: parsedTime.date.toISOString(),
        recurring: recurringType,
      }, 'Reminder created via command');

      await this.reply(ctx, response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error({ error: errorMessage, userId }, 'Failed to create reminder');
      await this.reply(ctx, `\u{26A0}\u{FE0F} *Erro ao criar lembrete*\n\n${this.escapeMarkdown(errorMessage)}`);
    }
  }

  /**
   * Show usage help
   */
  private async showUsage(ctx: BotContext): Promise<void> {
    const usage = `
\u{23F0} *Comando /remind*

*Uso:* \`/remind <tempo> <mensagem>\`

*Formatos de tempo:*
\u{2022} \`10m\`, \`30min\` \\- minutos
\u{2022} \`2h\`, \`2 hours\` \\- horas
\u{2022} \`1d\` \\- dias
\u{2022} \`15:30\` \\- horário específico
\u{2022} \`tomorrow 9:00\` \\- amanhã

*Repetição \\(opcional\\):*
\u{2022} \`\\-\\-daily\` \\- diário
\u{2022} \`\\-\\-weekly\` \\- semanal
\u{2022} \`\\-\\-monthly\` \\- mensal

*Exemplos:*
\`/remind 10m Verificar build\`
\`/remind 2h Reuniao\`
\`/remind 15:30 Almoco\`
\`/remind 30m Backup \\-\\-daily\`

Use /tasks para ver seus lembretes\\.
`.trim();

    await this.reply(ctx, usage);
  }
}

// Export singleton instance
export const remindCommand = new RemindCommand();
