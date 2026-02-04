import { createChildLogger } from '../../utils/logger';
import type { TelegramMessage } from '../telegram.types';

const logger = createChildLogger({ service: 'context-manager' });

/**
 * Message format for Anthropic API
 */
export interface ConversationMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/**
 * Configuration for context window management
 */
const CONFIG = {
  /** Maximum tokens for context window (Claude Sonnet) */
  MAX_CONTEXT_TOKENS: 8000,
  /** Reserve tokens for the response */
  RESPONSE_RESERVE_TOKENS: 1024,
  /** Approximate tokens per character (conservative estimate) */
  TOKENS_PER_CHAR: 0.25,
  /** Maximum messages to include in context */
  MAX_MESSAGES: 50,
  /** Minimum messages to always include (most recent) */
  MIN_MESSAGES: 4,
};

/**
 * Built context for API call
 */
export interface BuiltContext {
  /** Messages formatted for Anthropic API */
  readonly messages: readonly ConversationMessage[];
  /** Total tokens in context */
  readonly totalTokens: number;
  /** Number of messages included */
  readonly messageCount: number;
  /** Whether context was truncated */
  readonly wasTruncated: boolean;
}

/**
 * Token estimation result
 */
interface TokenEstimate {
  readonly tokens: number;
  readonly confident: boolean;
}

/**
 * ContextManager - Manages conversation context for API calls
 *
 * Implements a sliding window approach to manage conversation history:
 * - Estimates token counts for messages
 * - Truncates old messages to fit within context window
 * - Ensures alternating user/assistant pattern for API
 */
class ContextManager {
  private readonly maxTokens: number;
  private readonly responseReserve: number;

  constructor() {
    this.maxTokens = CONFIG.MAX_CONTEXT_TOKENS;
    this.responseReserve = CONFIG.RESPONSE_RESERVE_TOKENS;
  }

  /**
   * Estimate token count for a text string
   * Uses a conservative estimate (overestimates slightly)
   */
  estimateTokens(text: string): TokenEstimate {
    // Simple estimation: approximately 4 characters per token for English
    // Portuguese tends to have slightly more characters per token
    const estimate = Math.ceil(text.length * CONFIG.TOKENS_PER_CHAR);
    return {
      tokens: estimate,
      confident: false, // Would need tiktoken for confidence
    };
  }

  /**
   * Build context from conversation history
   *
   * @param history - Array of messages from database
   * @param currentMessage - The current user message to add
   * @returns Built context ready for API call
   */
  buildContext(
    history: readonly TelegramMessage[],
    currentMessage?: string
  ): BuiltContext {
    // Filter out system messages and convert to API format
    const relevantMessages = history
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        tokens: msg.tokenCount || this.estimateTokens(msg.content).tokens,
      }));

    // Add current message if provided
    if (currentMessage) {
      relevantMessages.push({
        role: 'user' as const,
        content: currentMessage,
        tokens: this.estimateTokens(currentMessage).tokens,
      });
    }

    // Calculate available tokens
    const availableTokens = this.maxTokens - this.responseReserve;

    // Build context with sliding window
    const result = this.applySlidingWindow(relevantMessages, availableTokens);

    logger.debug(
      {
        originalCount: relevantMessages.length,
        includedCount: result.messages.length,
        totalTokens: result.totalTokens,
        wasTruncated: result.wasTruncated,
      },
      'Context built'
    );

    return result;
  }

  /**
   * Apply sliding window to fit messages within token limit
   *
   * Strategy:
   * 1. Always include the most recent messages (MIN_MESSAGES)
   * 2. Add older messages until we hit the token limit
   * 3. Ensure the first message is from 'user' for API compatibility
   */
  private applySlidingWindow(
    messages: Array<{ role: 'user' | 'assistant'; content: string; tokens: number }>,
    maxTokens: number
  ): BuiltContext {
    if (messages.length === 0) {
      return {
        messages: [],
        totalTokens: 0,
        messageCount: 0,
        wasTruncated: false,
      };
    }

    // Start from the end (most recent) and work backwards
    const includedMessages: ConversationMessage[] = [];
    let totalTokens = 0;
    let startIndex = messages.length - 1;

    // First pass: include as many messages as fit within token limit
    while (startIndex >= 0) {
      const msg = messages[startIndex];
      if (!msg) {
        startIndex--;
        continue;
      }
      const newTotal = totalTokens + msg.tokens;

      // Check if adding this message would exceed the limit
      // But always include at least MIN_MESSAGES if possible
      if (newTotal > maxTokens && includedMessages.length >= CONFIG.MIN_MESSAGES) {
        break;
      }

      // Check if we've hit the max message limit
      if (includedMessages.length >= CONFIG.MAX_MESSAGES) {
        break;
      }

      includedMessages.unshift({
        role: msg.role,
        content: msg.content,
      });
      totalTokens = newTotal;
      startIndex--;
    }

    // Second pass: ensure the conversation starts with a user message
    const firstMsg = includedMessages[0];
    while (includedMessages.length > 0 && firstMsg && firstMsg.role !== 'user') {
      const removed = includedMessages.shift();
      if (removed) {
        totalTokens -= this.estimateTokens(removed.content).tokens;
      }
    }

    // Third pass: ensure alternating user/assistant pattern
    const validatedMessages = this.ensureAlternatingPattern(includedMessages);

    // Recalculate tokens after validation
    totalTokens = validatedMessages.reduce(
      (sum, msg) => sum + this.estimateTokens(msg.content).tokens,
      0
    );

    return {
      messages: validatedMessages,
      totalTokens,
      messageCount: validatedMessages.length,
      wasTruncated: startIndex >= 0 || messages.length > validatedMessages.length,
    };
  }

  /**
   * Ensure messages follow the alternating user/assistant pattern
   * Required by Anthropic API
   */
  private ensureAlternatingPattern(
    messages: ConversationMessage[]
  ): ConversationMessage[] {
    if (messages.length === 0) return [];

    const result: ConversationMessage[] = [];
    let lastRole: 'user' | 'assistant' | null = null;

    for (const msg of messages) {
      // Skip if same role as previous (merge or skip)
      if (msg.role === lastRole) {
        // Merge with previous message if same role
        const prevIndex = result.length - 1;
        const prev = result[prevIndex];
        if (prev) {
          result[prevIndex] = {
            role: prev.role,
            content: `${prev.content}\n\n${msg.content}`,
          };
        }
        continue;
      }

      result.push(msg);
      lastRole = msg.role;
    }

    // Ensure we start with user
    const firstResult = result[0];
    if (result.length > 0 && firstResult && firstResult.role !== 'user') {
      result.shift();
    }

    return result;
  }

  /**
   * Calculate total tokens in a conversation
   */
  calculateTotalTokens(messages: readonly TelegramMessage[]): number {
    return messages.reduce(
      (sum, msg) => sum + (msg.tokenCount || this.estimateTokens(msg.content).tokens),
      0
    );
  }

  /**
   * Check if adding a message would exceed context limit
   */
  wouldExceedLimit(
    currentTokens: number,
    newMessageTokens: number
  ): boolean {
    const availableTokens = this.maxTokens - this.responseReserve;
    return currentTokens + newMessageTokens > availableTokens;
  }

  /**
   * Get configuration values
   */
  getConfig(): Readonly<typeof CONFIG> {
    return { ...CONFIG };
  }
}

// Export singleton instance
export const contextManager = new ContextManager();
