import type { BotContext } from '../telegram.types';

/**
 * Command category for grouping in help
 */
export type CommandCategory = 'general' | 'containers' | 'instructions';

/**
 * Abstract base class for all Telegram commands
 * Provides common functionality like message sending, argument parsing, etc.
 */
export abstract class BaseCommand {
  /** Command name (without the leading /) */
  abstract readonly name: string;

  /** Short description shown in /help */
  abstract readonly description: string;

  /** Usage example with arguments */
  abstract readonly usage: string;

  /** Category for grouping in help menu */
  abstract readonly category: CommandCategory;

  /** Optional array of example usages */
  readonly examples?: readonly string[];

  /**
   * Execute the command
   * @param ctx - Telegraf context with session
   * @param args - Parsed command arguments
   */
  abstract execute(ctx: BotContext, args: string[]): Promise<void>;

  /**
   * Send a reply message with Markdown formatting
   * @param ctx - Telegraf context
   * @param message - Message text (supports MarkdownV2)
   * @param options - Optional message options
   */
  protected async reply(
    ctx: BotContext,
    message: string,
    options?: {
      parseMode?: 'MarkdownV2' | 'HTML';
      disableNotification?: boolean;
      replyToMessageId?: number;
    }
  ): Promise<void> {
    try {
      await ctx.reply(message, {
        parse_mode: options?.parseMode ?? 'MarkdownV2',
        disable_notification: options?.disableNotification,
        reply_parameters: options?.replyToMessageId ? { message_id: options.replyToMessageId } : undefined,
      });
    } catch {
      // Fallback to plain text if Markdown fails
      const plainMessage = this.stripMarkdown(message);
      await ctx.reply(plainMessage);
    }
  }

  /**
   * Send an HTML formatted message
   * @param ctx - Telegraf context
   * @param message - HTML formatted message
   */
  protected async replyHtml(ctx: BotContext, message: string): Promise<void> {
    try {
      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch {
      // Fallback to plain text if HTML fails
      const plainMessage = this.stripHtml(message);
      await ctx.reply(plainMessage);
    }
  }

  /**
   * Parse command arguments from message text
   * @param text - Full message text including command
   * @returns Array of arguments (excluding the command itself)
   */
  protected parseArgs(text: string | undefined): string[] {
    if (!text) {
      return [];
    }

    // Split by whitespace and remove the command itself
    const parts = text.trim().split(/\s+/);

    // Remove the command (first element starting with /)
    const firstPart = parts[0];
    if (parts.length > 0 && firstPart && firstPart.startsWith('/')) {
      parts.shift();
    }

    return parts;
  }

  /**
   * Get the currently selected container ID from session
   * @param ctx - Telegraf context with session
   * @returns Selected container ID or undefined
   */
  protected getSelectedContainer(ctx: BotContext): string | undefined {
    return ctx.session?.selectedContainerId;
  }

  /**
   * Set the selected container in session
   * @param ctx - Telegraf context with session
   * @param containerId - Container ID to select
   */
  protected setSelectedContainer(ctx: BotContext, containerId: string): void {
    if (ctx.session) {
      ctx.session.selectedContainerId = containerId;
      ctx.session.lastActivity = new Date();
    }
  }

  /**
   * Clear the selected container from session
   * @param ctx - Telegraf context with session
   */
  protected clearSelectedContainer(ctx: BotContext): void {
    if (ctx.session) {
      ctx.session.selectedContainerId = undefined;
    }
  }

  /**
   * Update session last activity timestamp
   * @param ctx - Telegraf context with session
   */
  protected updateActivity(ctx: BotContext): void {
    if (ctx.session) {
      ctx.session.lastActivity = new Date();
    }
  }

  /**
   * Escape special characters for MarkdownV2
   * @param text - Text to escape
   * @returns Escaped text safe for MarkdownV2
   */
  protected escapeMarkdown(text: string): string {
    // Characters that need escaping in MarkdownV2
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];

    let escaped = text;
    for (const char of specialChars) {
      escaped = escaped.split(char).join(`\\${char}`);
    }

    return escaped;
  }

  /**
   * Strip Markdown formatting from text
   * @param text - Text with Markdown
   * @returns Plain text
   */
  private stripMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/\\([_*\[\]()~`>#+=|{}.!-])/g, '$1');
  }

  /**
   * Strip HTML tags from text
   * @param text - Text with HTML
   * @returns Plain text
   */
  private stripHtml(text: string): string {
    return text.replace(/<[^>]*>/g, '');
  }

  /**
   * Format bytes to human readable string
   * @param bytes - Number of bytes
   * @returns Human readable string (e.g., "1.5 GB")
   */
  protected formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Format percentage with color indicator
   * @param percent - Percentage value (0-100)
   * @returns Formatted string with emoji indicator
   */
  protected formatPercentage(percent: number): string {
    const emoji = percent >= 90 ? '🔴' : percent >= 70 ? '🟡' : '🟢';
    return `${emoji} ${percent.toFixed(1)}%`;
  }
}
