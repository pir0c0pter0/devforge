import type { BotContext } from './telegram.types';
import { commandRegistry } from './commands/command.registry';
import { conversationHandler } from './conversation.handler';
import { telegramClaudeService } from './services/claude-cli.service';
import { conversationService } from './services';
import { createChildLogger } from '../utils/logger';

const logger = createChildLogger({ service: 'telegram-router' });

/**
 * Simple in-memory rate limiter for Telegram messages
 * Limits non-command messages per user
 */
class MessageRateLimiter {
  private requests: Map<number, number[]> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 10, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60_000).unref();
  }

  /**
   * Check if a user is rate limited
   * @param userId - Telegram user ID
   * @returns true if rate limited, false otherwise
   */
  isRateLimited(userId: number): boolean {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];

    // Filter requests within the window
    const recentRequests = userRequests.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    if (recentRequests.length >= this.maxRequests) {
      return true;
    }

    // Add current request and update
    recentRequests.push(now);
    this.requests.set(userId, recentRequests);

    return false;
  }

  /**
   * Get remaining requests for a user
   */
  getRemainingRequests(userId: number): number {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    const recentRequests = userRequests.filter(
      (timestamp) => now - timestamp < this.windowMs
    );
    return Math.max(0, this.maxRequests - recentRequests.length);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const userIds = Array.from(this.requests.keys());

    for (const userId of userIds) {
      const userRequests = this.requests.get(userId) || [];
      const recentRequests = userRequests.filter(
        (timestamp) => now - timestamp < this.windowMs
      );

      if (recentRequests.length === 0) {
        this.requests.delete(userId);
      } else {
        this.requests.set(userId, recentRequests);
      }
    }
  }
}

// Rate limiter: 10 messages per minute for conversation messages
const conversationRateLimiter = new MessageRateLimiter(10, 60_000);

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
    // Commands are not rate limited (they have their own controls)
    if (text.startsWith('/')) {
      await this.routeToCommand(ctx, text);
      return;
    }

    // 2. Rate limit check for non-command messages
    const userId = ctx.from?.id;
    if (userId && conversationRateLimiter.isRateLimited(userId)) {
      logger.warn({ userId }, 'User rate limited for conversation messages');
      await ctx.reply(
        '\u{26A0}\u{FE0F} Voce esta enviando mensagens muito rapido. ' +
        'Aguarde um momento antes de tentar novamente.\n\n' +
        '(Limite: 10 mensagens por minuto)'
      );
      return;
    }

    // 3. Try to have a conversation with Claude API (not container)
    // This applies to ALL non-command messages, regardless of container selection
    if (await this.tryRouteToClaudeConversation(ctx, text)) {
      return;
    }

    // 3. Fall back to natural language processing for help/suggestions
    await this.routeToConversation(ctx);
  }

  /**
   * Route message to Claude CLI for direct conversation
   * Uses the locally installed Claude Code CLI (already authenticated)
   * Returns true if message was handled
   */
  private async tryRouteToClaudeConversation(ctx: BotContext, text: string): Promise<boolean> {
    // Check if Claude CLI is available
    const cliAvailable = await telegramClaudeService.isAvailable();
    if (!cliAvailable) {
      logger.debug('Claude CLI not available, falling back to NLU');
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

    // Get user and chat info
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      logger.warn('Missing user or chat ID for conversation');
      return false;
    }

    // Get telegram message ID for tracking
    const telegramMessageId = ctx.message && 'message_id' in ctx.message
      ? ctx.message.message_id
      : undefined;

    try {
      // Check if user is in conversation mode (not container mode)
      const sessionMode = ctx.session?.mode || 'conversation';
      if (sessionMode !== 'conversation') {
        // In container mode, let the container handle messages
        logger.debug({ userId, mode: sessionMode }, 'User in container mode, skipping conversation');
        return false;
      }

      logger.info(
        {
          userId,
          chatId,
          messageLength: text.length,
          mode: sessionMode,
        },
        'Routing message to Claude CLI conversation'
      );

      // Show typing indicator
      await ctx.sendChatAction('typing');

      // 1. Get or create conversation (for history tracking)
      const conversation = await conversationService.getOrCreateConversation(
        userId,
        chatId,
        'conversation'
      );

      // 2. Save user message to history
      await conversationService.addMessage(
        conversation.id,
        'user',
        text,
        telegramMessageId
      );

      // 3. Call Claude CLI (it maintains its own session/context)
      const response = await telegramClaudeService.chat(userId, chatId, text);

      // 4. Save assistant response to history
      await conversationService.addMessage(
        conversation.id,
        'assistant',
        response.text
      );

      // 5. Update session with conversation ID
      if (ctx.session) {
        ctx.session.conversationId = conversation.id;
      }

      // Send response back to user (try Markdown, fallback to plain text)
      try {
        await ctx.reply(response.text, { parse_mode: 'Markdown' });
      } catch {
        // Markdown parsing failed, send as plain text
        await ctx.reply(response.text);
      }

      logger.info(
        {
          userId,
          conversationId: conversation.id,
          cost: response.cost,
          durationMs: response.durationMs,
        },
        'Claude CLI conversation completed'
      );

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error(
        {
          error: errorMessage,
          userId,
          chatId,
        },
        'Failed to route to Claude CLI conversation'
      );

      // Check for auth errors
      if (errorMessage.includes('not authenticated') || errorMessage.includes('credentials')) {
        await ctx.reply(
          '\u{26A0}\u{FE0F} Claude Code nao esta autenticado.\n\n' +
          'Acesse as Configuracoes do sistema web para fazer login no Claude.'
        );
        return true;
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
