import { createChildLogger } from '../../utils/logger';
import {
  telegramConversationRepository,
  telegramMessageRepository,
} from '../repositories';
import type {
  TelegramConversation,
  TelegramMessage,
  ConversationMode,
  MessageRole,
} from '../telegram.types';
import { contextManager, type BuiltContext } from './context.manager';

const logger = createChildLogger({ service: 'telegram-conversation-service' });

/**
 * ConversationService - Manages Telegram conversation persistence and context
 *
 * Responsibilities:
 * - Create/retrieve conversations for users
 * - Store and manage conversation messages
 * - Handle mode switching (conversation <-> container)
 * - Coordinate with ContextManager for token limits
 */
export class ConversationService {
  /**
   * Get or create a conversation for a user/chat pair
   * This is the primary entry point for conversation management
   */
  async getOrCreateConversation(
    userId: number,
    chatId: number,
    mode: ConversationMode = 'conversation'
  ): Promise<TelegramConversation> {
    // Try to find existing conversation
    const existing = telegramConversationRepository.findByUserAndChat(userId, chatId);

    if (existing) {
      logger.debug(
        { userId, chatId, conversationId: existing.id, mode: existing.mode },
        'Found existing conversation'
      );
      return existing;
    }

    // Create new conversation
    const conversation = telegramConversationRepository.create({
      userId,
      chatId,
      mode,
    });

    logger.info(
      { userId, chatId, conversationId: conversation.id, mode },
      'Created new conversation'
    );

    return conversation;
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(conversationId: string): Promise<TelegramConversation | null> {
    return telegramConversationRepository.findById(conversationId);
  }

  /**
   * Add a message to a conversation
   * Automatically estimates tokens and updates conversation metadata
   */
  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    telegramMessageId?: number
  ): Promise<TelegramMessage> {
    // Estimate tokens for this message
    const { tokens: tokenCount } = contextManager.estimateTokens(content);

    // Create the message
    const message = telegramMessageRepository.create({
      conversationId,
      role,
      content,
      telegramMessageId,
      tokenCount,
    });

    // Update conversation's last message timestamp
    telegramConversationRepository.updateLastMessage(conversationId);

    // Update total context tokens
    const totalTokens = telegramMessageRepository.getTotalTokens(conversationId);
    telegramConversationRepository.updateContextTokens(conversationId, totalTokens);

    logger.debug(
      {
        conversationId,
        messageId: message.id,
        role,
        tokenCount,
        totalTokens,
      },
      'Added message to conversation'
    );

    return message;
  }

  /**
   * Add a system message (instructions, context, etc.)
   */
  async addSystemMessage(conversationId: string, content: string): Promise<TelegramMessage> {
    return this.addMessage(conversationId, 'system', content);
  }

  /**
   * Add a user message
   */
  async addUserMessage(
    conversationId: string,
    content: string,
    telegramMessageId?: number
  ): Promise<TelegramMessage> {
    return this.addMessage(conversationId, 'user', content, telegramMessageId);
  }

  /**
   * Add an assistant message
   */
  async addAssistantMessage(conversationId: string, content: string): Promise<TelegramMessage> {
    return this.addMessage(conversationId, 'assistant', content);
  }

  /**
   * Get conversation history
   * Returns messages in chronological order, optionally limited
   */
  async getHistory(conversationId: string, limit?: number): Promise<readonly TelegramMessage[]> {
    if (limit) {
      return telegramMessageRepository.findRecentByConversation(conversationId, limit);
    }
    return telegramMessageRepository.findByConversation(conversationId);
  }

  /**
   * Get conversation history formatted for Claude API
   * Applies context window management
   */
  async getContextForClaude(conversationId: string): Promise<BuiltContext> {
    const allMessages = await this.getHistory(conversationId);
    return contextManager.buildContext(allMessages);
  }

  /**
   * Clear conversation history (delete all messages)
   */
  async clearHistory(conversationId: string): Promise<number> {
    const count = telegramMessageRepository.deleteByConversation(conversationId);

    // Reset context token count
    telegramConversationRepository.updateContextTokens(conversationId, 0);

    logger.info({ conversationId, deletedCount: count }, 'Cleared conversation history');

    return count;
  }

  /**
   * Switch conversation mode
   * When switching to container mode, can associate a container
   */
  async switchMode(
    conversationId: string,
    mode: ConversationMode,
    containerId?: string
  ): Promise<TelegramConversation | null> {
    const updates: { mode: ConversationMode; containerId?: string | null } = { mode };

    if (mode === 'container' && containerId) {
      updates.containerId = containerId;
    } else if (mode === 'conversation') {
      // Clear container association when switching to conversation mode
      updates.containerId = null;
    }

    const updated = telegramConversationRepository.update(conversationId, updates);

    if (updated) {
      logger.info(
        { conversationId, mode, containerId: containerId || null },
        'Switched conversation mode'
      );
    }

    return updated;
  }

  /**
   * Set the container for a conversation
   */
  async setContainer(
    conversationId: string,
    containerId: string
  ): Promise<TelegramConversation | null> {
    const updated = telegramConversationRepository.update(conversationId, {
      containerId,
      mode: 'container',
    });

    if (updated) {
      logger.info({ conversationId, containerId }, 'Set container for conversation');
    }

    return updated;
  }

  /**
   * Clear the container association
   */
  async clearContainer(conversationId: string): Promise<TelegramConversation | null> {
    const updated = telegramConversationRepository.update(conversationId, {
      containerId: null,
      mode: 'conversation',
    });

    if (updated) {
      logger.info({ conversationId }, 'Cleared container from conversation');
    }

    return updated;
  }

  /**
   * Set Claude session ID for context continuity
   */
  async setSessionId(
    conversationId: string,
    sessionId: string
  ): Promise<TelegramConversation | null> {
    return telegramConversationRepository.update(conversationId, { sessionId });
  }

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    // Messages are deleted via CASCADE in database
    const deleted = telegramConversationRepository.delete(conversationId);

    if (deleted) {
      logger.info({ conversationId }, 'Deleted conversation');
    }

    return deleted;
  }

  /**
   * Get conversation statistics
   */
  async getStats(conversationId: string): Promise<{
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    systemMessages: number;
    totalTokens: number;
    oldestMessage?: Date;
    newestMessage?: Date;
  }> {
    return telegramMessageRepository.getConversationStats(conversationId);
  }

  /**
   * Trim old messages to keep conversation within limits
   * Keeps the most recent N messages
   */
  async trimHistory(conversationId: string, keepCount: number): Promise<number> {
    const trimmed = telegramMessageRepository.trimConversation(conversationId, keepCount);

    // Update token count
    const totalTokens = telegramMessageRepository.getTotalTokens(conversationId);
    telegramConversationRepository.updateContextTokens(conversationId, totalTokens);

    if (trimmed > 0) {
      logger.info(
        { conversationId, trimmedCount: trimmed, keptCount: keepCount },
        'Trimmed conversation history'
      );
    }

    return trimmed;
  }

  /**
   * Cleanup old conversations and messages
   * Should be called periodically
   */
  async cleanup(): Promise<{ deletedMessages: number }> {
    const deletedMessages = telegramMessageRepository.deleteOldMessages();

    logger.info({ deletedMessages }, 'Completed conversation cleanup');

    return { deletedMessages };
  }
}

// Export singleton instance
export const conversationService = new ConversationService();
