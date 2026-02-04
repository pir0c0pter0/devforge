import type { BotContext } from './telegram.types';
import { commandRegistry } from './commands/command.registry';
import { conversationHandler } from './conversation.handler';
import { anthropicService } from '../services/anthropic.service';
import { createChildLogger } from '../utils/logger';

const logger = createChildLogger({ service: 'telegram-router' });

/**
 * MessageRouter - Routes messages to appropriate handlers
 *
 * Decision flow:
 * 1. If message starts with /, route to CommandRegistry (includes /exec for queue)
 * 2. Try Claude API conversation for direct chat
 * 3. Fall back to ConversationHandler for NLU suggestions
 *
 * Note: /exec command sends instructions to container queue
 *       Regular messages go to Claude API for conversation
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

    // 2. Try to have a conversation with Claude API (not container)
    // This applies to ALL non-command messages, regardless of container selection
    if (await this.tryRouteToClaudeConversation(ctx, text)) {
      return;
    }

    // 3. Fall back to natural language processing for help/suggestions
    await this.routeToConversation(ctx);
  }

  /**
   * Route message to Claude API for direct conversation
   * Returns true if message was handled
   */
  private async tryRouteToClaudeConversation(ctx: BotContext, text: string): Promise<boolean> {
    // Check if Anthropic API is available
    if (!anthropicService.isAvailable()) {
      logger.debug('Anthropic API not available, falling back to NLU');
      return false;
    }

    // Skip very short messages or obvious NLU patterns
    if (text.length < 3) {
      return false;
    }

    // Skip messages that look like they want a command
    const commandPatterns = [
      /^(listar?|list|status|fila|queue|help|ajuda)$/i,
      /^(selecionar?|escolher?)\s/i,
    ];

    for (const pattern of commandPatterns) {
      if (pattern.test(text)) {
        return false; // Let NLU handle these
      }
    }

    try {
      logger.info(
        {
          userId: ctx.from?.id,
          messageLength: text.length,
          hasSelectedContainer: !!ctx.session?.selectedContainerId,
        },
        'Routing message to Claude API conversation'
      );

      // Show typing indicator
      await ctx.sendChatAction('typing');

      // Send to Claude API
      const response = await anthropicService.chat(text);

      // Send response back to user
      await ctx.reply(response.text, { parse_mode: 'Markdown' });

      logger.info(
        {
          userId: ctx.from?.id,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        },
        'Claude API conversation completed'
      );

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error({ error }, 'Failed to route to Claude API conversation');

      // Don't show API errors to user, fall back to NLU
      if (errorMessage.includes('ANTHROPIC_API_KEY')) {
        return false;
      }

      await ctx.reply(
        '\u{26A0}\u{FE0F} Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.'
      );
      return true;
    }
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
}

// Export singleton instance
export const messageRouter = new MessageRouter();
