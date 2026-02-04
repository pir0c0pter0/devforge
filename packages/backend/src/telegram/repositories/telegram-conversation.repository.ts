import { BaseRepository, BaseFilters } from '../../repositories/base.repository';
import type { TelegramConversation, ConversationMode } from '../telegram.types';

/**
 * Database row type for telegram_conversations table
 */
interface ConversationRow {
  id: string;
  user_id: number;
  chat_id: number;
  mode: string;
  container_id: string | null;
  session_id: string | null;
  context_tokens: number;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

/**
 * DTO for creating a conversation
 */
export interface CreateConversationDto {
  readonly userId: number;
  readonly chatId: number;
  readonly mode?: ConversationMode;
  readonly containerId?: string;
  readonly sessionId?: string;
}

/**
 * DTO for updating a conversation
 */
export interface UpdateConversationDto {
  readonly mode?: ConversationMode;
  readonly containerId?: string | null;
  readonly sessionId?: string | null;
  readonly contextTokens?: number;
  readonly lastMessageAt?: Date;
}

/**
 * Query filters for conversations
 */
export interface ConversationFilters extends BaseFilters {
  readonly userId?: number;
  readonly chatId?: number;
  readonly mode?: ConversationMode;
  readonly containerId?: string;
}

/**
 * Repository for Telegram conversations
 * Handles persistence of conversation metadata for Telegram bot users
 */
export class TelegramConversationRepository extends BaseRepository<
  TelegramConversation,
  CreateConversationDto,
  UpdateConversationDto,
  ConversationFilters
> {
  constructor() {
    super('telegram_conversations');
  }

  /**
   * Convert database row to entity
   */
  private convertRowToConversation(row: ConversationRow): TelegramConversation {
    return {
      id: row.id,
      userId: row.user_id,
      chatId: row.chat_id,
      mode: row.mode as ConversationMode,
      containerId: row.container_id || undefined,
      sessionId: row.session_id || undefined,
      contextTokens: row.context_tokens,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : undefined,
    };
  }

  /**
   * Find all conversations with optional filters
   */
  findAll(filters?: ConversationFilters): readonly TelegramConversation[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.userId !== undefined) {
      conditions.push('user_id = ?');
      params.push(filters.userId);
    }

    if (filters?.chatId !== undefined) {
      conditions.push('chat_id = ?');
      params.push(filters.chatId);
    }

    if (filters?.mode) {
      conditions.push('mode = ?');
      params.push(filters.mode);
    }

    if (filters?.containerId) {
      conditions.push('container_id = ?');
      params.push(filters.containerId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = this.buildOrderClause(filters) || 'ORDER BY last_message_at DESC NULLS LAST, created_at DESC';
    const { clause: limitClause, params: limitParams } = this.buildLimitClause(filters);

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...params, ...limitParams) as ConversationRow[];
    return rows.map((row) => this.convertRowToConversation(row));
  }

  /**
   * Find conversation by ID
   */
  findById(id: string): TelegramConversation | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id) as ConversationRow | undefined;

    return row ? this.convertRowToConversation(row) : null;
  }

  /**
   * Find conversation by user and chat ID
   * This is the primary lookup method for finding existing conversations
   */
  findByUserAndChat(userId: number, chatId: number): TelegramConversation | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE user_id = ? AND chat_id = ?`)
      .get(userId, chatId) as ConversationRow | undefined;

    return row ? this.convertRowToConversation(row) : null;
  }

  /**
   * Find conversations by user ID
   */
  findByUserId(userId: number): readonly TelegramConversation[] {
    return this.findAll({ userId });
  }

  /**
   * Find conversations by container ID
   */
  findByContainerId(containerId: string): readonly TelegramConversation[] {
    return this.findAll({ containerId });
  }

  /**
   * Create a new conversation
   */
  create(data: CreateConversationDto): TelegramConversation {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO ${this.tableName} (
        id, user_id, chat_id, mode, container_id, session_id, context_tokens,
        created_at, updated_at, last_message_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `;

    this.db.prepare(sql).run(
      id,
      data.userId,
      data.chatId,
      data.mode || 'conversation',
      data.containerId || null,
      data.sessionId || null,
      0,
      now,
      now
    );

    return this.findById(id)!;
  }

  /**
   * Update a conversation
   */
  update(id: string, data: UpdateConversationDto): TelegramConversation | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.mode !== undefined) {
      updates.push('mode = ?');
      params.push(data.mode);
    }

    if (data.containerId !== undefined) {
      updates.push('container_id = ?');
      params.push(data.containerId);
    }

    if (data.sessionId !== undefined) {
      updates.push('session_id = ?');
      params.push(data.sessionId);
    }

    if (data.contextTokens !== undefined) {
      updates.push('context_tokens = ?');
      params.push(data.contextTokens);
    }

    if (data.lastMessageAt !== undefined) {
      updates.push('last_message_at = ?');
      params.push(data.lastMessageAt.toISOString());
    }

    if (updates.length === 0) {
      return existing;
    }

    // updated_at is handled by trigger, but we add it for safety
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    const sql = `
      UPDATE ${this.tableName}
      SET ${updates.join(', ')}
      WHERE id = ?
    `;

    this.db.prepare(sql).run(...params);
    return this.findById(id);
  }

  /**
   * Update last message timestamp
   */
  updateLastMessage(id: string): TelegramConversation | null {
    return this.update(id, { lastMessageAt: new Date() });
  }

  /**
   * Update context token count
   */
  updateContextTokens(id: string, tokens: number): TelegramConversation | null {
    return this.update(id, { contextTokens: tokens });
  }

  /**
   * Delete a conversation
   */
  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  /**
   * Delete conversations by user ID
   */
  deleteByUserId(userId: number): number {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE user_id = ?`)
      .run(userId);
    return result.changes;
  }

  /**
   * Count conversations with optional filters
   */
  count(filters?: Partial<ConversationFilters>): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.userId !== undefined) {
      conditions.push('user_id = ?');
      params.push(filters.userId);
    }

    if (filters?.chatId !== undefined) {
      conditions.push('chat_id = ?');
      params.push(filters.chatId);
    }

    if (filters?.mode) {
      conditions.push('mode = ?');
      params.push(filters.mode);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).get(...params) as { count: number };

    return result.count;
  }

  /**
   * Get conversation statistics for a user
   */
  getUserStats(userId: number): {
    totalConversations: number;
    conversationMode: number;
    containerMode: number;
    totalContextTokens: number;
  } {
    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN mode = 'conversation' THEN 1 ELSE 0 END) as conversation_mode,
        SUM(CASE WHEN mode = 'container' THEN 1 ELSE 0 END) as container_mode,
        SUM(context_tokens) as total_tokens
      FROM ${this.tableName}
      WHERE user_id = ?
    `;

    const result = this.db.prepare(sql).get(userId) as {
      total: number;
      conversation_mode: number;
      container_mode: number;
      total_tokens: number;
    };

    return {
      totalConversations: result.total || 0,
      conversationMode: result.conversation_mode || 0,
      containerMode: result.container_mode || 0,
      totalContextTokens: result.total_tokens || 0,
    };
  }
}

// Export singleton instance
export const telegramConversationRepository = new TelegramConversationRepository();
