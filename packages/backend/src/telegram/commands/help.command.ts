import { BaseCommand, CommandCategory } from './base.command';
import { commandRegistry } from './command.registry';
import type { BotContext } from '../telegram.types';

/**
 * Help Command - Lists all available commands or shows detailed help for a specific command
 *
 * Usage:
 *   /help - Lists all commands grouped by category
 *   /help <command> - Shows detailed help for specific command
 */
export class HelpCommand extends BaseCommand {
  readonly name = 'help';
  readonly description = 'Lista todos os comandos disponíveis';
  readonly usage = '/help [comando]';
  readonly category: CommandCategory = 'general';
  override readonly examples = ['/help', '/help list', '/help select'] as const;

  override async execute(ctx: BotContext, args: string[]): Promise<void> {
    this.updateActivity(ctx);

    // If a specific command is requested
    if (args.length > 0) {
      const commandName = args[0]?.toLowerCase().replace(/^\//, '') ?? '';
      const commandHelp = commandRegistry.getCommandHelp(commandName);

      if (commandHelp) {
        await this.reply(ctx, commandHelp);
      } else {
        const escapedName = this.escapeMarkdown(commandName);
        await this.reply(
          ctx,
          `Comando */${escapedName}* não encontrado\\.\n\nUse /help para ver todos os comandos\\.`
        );
      }
      return;
    }

    // Show full help with all commands grouped
    const helpText = commandRegistry.getHelp();
    await this.reply(ctx, helpText);
  }
}

/**
 * Start Command - Welcome message and quick start guide
 */
export class StartCommand extends BaseCommand {
  readonly name = 'start';
  readonly description = 'Mensagem de boas-vindas e guia rápido';
  readonly usage = '/start';
  readonly category: CommandCategory = 'general';

  override async execute(ctx: BotContext, _args: string[]): Promise<void> {
    this.updateActivity(ctx);

    const firstName = ctx.from?.first_name || 'usuário';
    const escapedName = this.escapeMarkdown(firstName);

    const welcomeMessage = `
*Olá, ${escapedName}\\!*

Bem\\-vindo ao *DevForge Bot*\\. Este bot permite gerenciar seus containers Docker com Claude Code diretamente pelo Telegram\\.

*Primeiros Passos:*
1\\. Use /list para ver seus containers
2\\. Use /select para selecionar um container
3\\. Envie instruções para o Claude

*Comandos Úteis:*
• /help \\- Ver todos os comandos
• /list \\- Listar containers
• /select \\- Selecionar container
• /status \\- Ver status do container

_Dica: Selecione um container primeiro para enviar instruções_
`.trim();

    await this.reply(ctx, welcomeMessage);
  }
}

// Export singleton instances
export const helpCommand = new HelpCommand();
export const startCommand = new StartCommand();
