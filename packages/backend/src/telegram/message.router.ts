import type { BotContext } from './telegram.types';
import { commandRegistry } from './commands/command.registry';
import { conversationHandler } from './conversation.handler';
import { containerRepository } from '../repositories/container.repository';
import { queueInstruction } from '../services/claude-queue.service';
import { createChildLogger } from '../utils/logger';

const logger = createChildLogger({ service: 'telegram-router' });

/**
 * MessageRouter - Routes messages to appropriate handlers
 *
 * Decision flow:
 * 1. If message starts with /, route to CommandRegistry
 * 2. If user has container selected and message looks like instruction, queue it
 * 3. Otherwise, route to ConversationHandler for NLU
 */
export class MessageRouter {
  /**
   * Route incoming message to appropriate handler
   *
   * @param ctx - Bot context with session data
   */
  async route(ctx: BotContext): Promise<void> {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text?.trim() : undefined;

    if (!text) {
      logger.debug({ userId: ctx.from?.id }, 'Empty message received');
      return;
    }

    // Update session activity
    if (ctx.session) {
      ctx.session.lastActivity = new Date();
    }

    logger.debug(
      {
        userId: ctx.from?.id,
        text: text.length > 50 ? text.slice(0, 50) + '...' : text,
        hasSelectedContainer: !!ctx.session?.selectedContainerId,
      },
      'Routing message'
    );

    // 1. Explicit command (starts with /)
    if (text.startsWith('/')) {
      await this.routeToCommand(ctx, text);
      return;
    }

    // 2. Check if user wants to send instruction to Claude
    if (await this.tryRouteToClaudeInstruction(ctx, text)) {
      return;
    }

    // 3. Natural language processing
    await this.routeToConversation(ctx);
  }

  /**
   * Route explicit command to CommandRegistry
   */
  private async routeToCommand(ctx: BotContext, text: string): Promise<void> {
    // Parse command and arguments
    // Format: /command@botname arg1 arg2 or /command arg1 arg2
    const match = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/);

    if (!match) {
      logger.warn({ text }, 'Invalid command format');
      await ctx.reply('\u{2753} Comando inválido. Use /help para ver os comandos disponíveis.');
      return;
    }

    const [, commandName, argsString] = match;
    const args = argsString ? argsString.split(/\s+/).filter(Boolean) : [];

    logger.info(
      {
        userId: ctx.from?.id,
        command: commandName,
        argsCount: args.length,
      },
      'Processing command'
    );

    // Find command in registry (commandName is always defined after the regex match)
    const command = commandRegistry.get((commandName ?? '').toLowerCase());

    if (command) {
      try {
        await command.execute(ctx, args);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        logger.error({ error, command: commandName }, 'Command execution failed');
        await ctx.reply(`\u{26A0}\u{FE0F} Erro ao executar comando: ${errorMessage}`);
      }
    } else {
      // Unknown command
      logger.warn({ command: commandName }, 'Unknown command');
      await ctx.reply(
        `\u{2753} Comando desconhecido: /${commandName}\n\nUse /help para ver comandos disponíveis.`
      );
    }
  }

  /**
   * Try to route message as Claude instruction
   * Returns true if message was handled as instruction
   */
  private async tryRouteToClaudeInstruction(ctx: BotContext, text: string): Promise<boolean> {
    const containerId = ctx.session?.selectedContainerId;

    // No container selected
    if (!containerId) {
      return false;
    }

    // Get container details
    const container = containerRepository.findById(containerId);

    if (!container) {
      // Container no longer exists - clear selection
      if (ctx.session) {
        ctx.session.selectedContainerId = undefined;
      }
      await ctx.reply(
        '\u{26A0}\u{FE0F} O container selecionado não existe mais.\nUse /list para ver os containers disponíveis.'
      );
      return true;
    }

    // Container must be running
    if (container.status !== 'running') {
      await ctx.reply(
        `\u{26A0}\u{FE0F} O container *${this.escapeMarkdown(container.name)}* não está rodando.\n\n` +
          `Status atual: ${container.status}\n` +
          `Acesse o painel web para iniciar o container.`,
        { parse_mode: 'MarkdownV2' }
      );
      return true;
    }

    // Check if message looks like an instruction
    // Simple heuristic: messages longer than 5 chars that don't match common NLU patterns
    if (!this.looksLikeInstruction(text)) {
      return false;
    }

    // Queue the instruction
    await this.queueInstructionToClaudeWrapper(ctx, container.id, container.name, container.mode, text);
    return true;
  }

  /**
   * Check if text looks like a Claude instruction vs natural language query
   */
  private looksLikeInstruction(text: string): boolean {
    // Too short to be an instruction
    if (text.length < 5) {
      return false;
    }

    // Common natural language queries that should go to NLU
    const nluPatterns = [
      /^(oi|ol[aá]|e\s+a[ií]|tudo\s+bem|como\s+vai)/i,
      /^(ajuda|help)$/i,
      /^(status|fila|queue)$/i,
      /^(listar?|mostrar?|ver)\s*(containers?)?$/i,
      /^(o\s+que|quais?|como)\s+/i,
    ];

    for (const pattern of nluPatterns) {
      if (pattern.test(text)) {
        return false;
      }
    }

    // Looks like an instruction
    return true;
  }

  /**
   * Queue instruction to Claude and notify user
   */
  private async queueInstructionToClaudeWrapper(
    ctx: BotContext,
    containerId: string,
    containerName: string,
    mode: string,
    instruction: string
  ): Promise<void> {
    try {
      logger.info(
        {
          userId: ctx.from?.id,
          containerId,
          containerName,
          mode,
          instructionLength: instruction.length,
        },
        'Queueing instruction from Telegram'
      );

      // Queue the instruction
      const jobInfo = await queueInstruction(
        containerId,
        instruction,
        mode as 'interactive' | 'autonomous'
      );

      // Send confirmation
      const modeEmoji = mode === 'autonomous' ? '\u{1F916}' : '\u{1F4AC}';
      const truncatedInstruction = instruction.length > 100
        ? instruction.slice(0, 100) + '...'
        : instruction;

      const confirmMessage = [
        `\u{1F4E4} *Instrução enviada\\!* ${modeEmoji}`,
        '',
        `*Container:* ${this.escapeMarkdown(containerName)}`,
        `*Modo:* ${mode === 'autonomous' ? 'Autônomo' : 'Interativo'}`,
        `*Job ID:* \`${jobInfo.id}\``,
        '',
        `_"${this.escapeMarkdown(truncatedInstruction)}"_`,
        '',
        jobInfo.position > 0
          ? `\u{1F4CB} Posição na fila: ${jobInfo.position + 1}`
          : '\u{26A1} Executando agora\\.\\.\\.',
        '',
        '_Você receberá o resultado quando o Claude terminar\\._',
      ].join('\n');

      await ctx.reply(confirmMessage, { parse_mode: 'MarkdownV2' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error({ error, containerId, instruction: instruction.slice(0, 50) }, 'Failed to queue instruction');

      await ctx.reply(
        `\u{26A0}\u{FE0F} Erro ao enviar instrução:\n${errorMessage}\n\n` +
          'Tente novamente ou verifique se o container está funcionando.'
      );
    }
  }

  /**
   * Route to conversation handler for NLU
   */
  private async routeToConversation(ctx: BotContext): Promise<void> {
    try {
      await conversationHandler.handle(ctx);
    } catch (error) {
      logger.error({ error }, 'Conversation handler failed');
      await ctx.reply('\u{2753} Desculpe, não consegui processar sua mensagem. Use /help para ver os comandos disponíveis.');
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
}

// Export singleton instance
export const messageRouter = new MessageRouter();
