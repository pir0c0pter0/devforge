import { BaseRepository, BaseFilters } from '../../repositories/base.repository';
import type { TelegramMessage, MessageRole } from '../telegram.types';

/**
 * Database row type for telegram_messages table
 */
interface MessageRow {
  id: string;
  conversation_id: string;
  telegram_message_id: number | null;
  role: string;
  content: string;
  token_count: number;
  metadata: string | null;
  created_at: string;
}

/**
 * DTO for creating a message
 */
export interface CreateMessageDto {
  readonly conversationId: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly telegramMessageId?: number;
  readonly tokenCount?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * DTO for updating a message
 */
export interface UpdateMessageDto {
  readonly content?: string;
  readonly tokenCount?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Query filters for messages
 */
export interface MessageFilters extends BaseFilters {
  readonly conversationId?: string;
  readonly role?: MessageRole;
  readonly since?: Date;
  readonly until?: Date;
}

/**
 * Configuration for message retention
 */
const CONFIG = {
  /** Default maximum messages to keep per conversation */
  DEFAULT_MAX_MESSAGES: 100,
  /** Maximum retention time in hours (7 days) */
  RETENTION_HOURS: 168,
};

/**
 * Repository for Telegram messages
 * Handles persistence of conversation messages for context management
 */
export class TelegramMessageRepository extends BaseRepository<
  TelegramMessage,
  CreateMessageDto,
  UpdateMessageDto,
  MessageFilters
> {
  constructor() {
    super('telegram_messages');
  }

  /**
   * Convert database row to entity
   */
  private convertRowToMessage(row: MessageRow): TelegramMessage {
    let metadata: Record<string, unknown> | undefined;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = undefined;
      }
    }

    return {
      id: row.id,
      conversationId: row.conversation_id,
      telegramMessageId: row.telegram_message_id || undefined,
      role: row.role as MessageRole,
      content: row.content,
      tokenCount: row.token_count,
      metadata,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Find all messages with optional filters
   */
  findAll(filters?: MessageFilters): readonly TelegramMessage[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.conversationId) {
      conditions.push('conversation_id = ?');
      params.push(filters.conversationId);
    }

    if (filters?.role) {
      conditions.push('role = ?');
      params.push(filters.role);
    }

    if (filters?.since) {
      conditions.push('created_at >= ?');
      params.push(filters.since.toISOString());
    }

    if (filters?.until) {
      conditions.push('created_at <= ?');
      params.push(filters.until.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = this.buildOrderClause(filters) || 'ORDER BY created_at ASC';
    const { clause: limitClause, params: limitParams } = this.buildLimitClause(filters);

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...params, ...limitParams) as MessageRow[];
    return rows.map((row) => this.convertRowToMessage(row));
  }

  /**
   * Find message by ID
   */
  findById(id: string): TelegramMessage | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id) as MessageRow | undefined;

    return row ? this.convertRowToMessage(row) : null;
  }

  /**
   * Find messages by conversation ID
   * Returns messages in chronological order (oldest first)
   */
  findByConversation(conversationId: string, limit?: number): readonly TelegramMessage[] {
    const filters: MessageFilters = {
      conversationId,
      orderBy: 'created_at',
      orderDirection: 'ASC',
      limit,
    };
    return this.findAll(filters);
  }

  /**
   * Find recent messages by conversation ID
   * Returns the N most recent messages in chronological order
   */
  findRecentByConversation(conversationId: string, limit: number): readonly TelegramMessage[] {
    // First get the most recent messages (DESC order)
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(conversationId, limit) as MessageRow[];
    // Reverse to get chronological order
    return rows.reverse().map((row) => this.convertRowToMessage(row));
  }

  /**
   * Create a new message
   */
  create(data: CreateMessageDto): TelegramMessage {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO ${this.tableName} (
        id, conversation_id, telegram_message_id, role, content, token_count, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.prepare(sql).run(
      id,
      data.conversationId,
      data.telegramMessageId || null,
      data.role,
      data.content,
      data.tokenCount || 0,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now
    );

    return this.findById(id)!;
  }

  /**
   * Create multiple messages in batch (more efficient)
   */
  createBatch(messages: CreateMessageDto[]): number {
    if (messages.length === 0) return 0;

    const sql = `
      INSERT INTO ${this.tableName} (
        id, conversation_id, telegram_message_id, role, content, token_count, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = this.db.prepare(sql);
    const insertMany = this.db.transaction((items: CreateMessageDto[]) => {
      for (const item of items) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        stmt.run(
          id,
          item.conversationId,
          item.telegramMessageId || null,
          item.role,
          item.content,
          item.tokenCount || 0,
          item.metadata ? JSON.stringify(item.metadata) : null,
          now
        );
      }
      return items.length;
    });

    return insertMany(messages);
  }

  /**
   * Update a message
   */
  update(id: string, data: UpdateMessageDto): TelegramMessage | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.content !== undefined) {
      updates.push('content = ?');
      params.push(data.content);
    }

    if (data.tokenCount !== undefined) {
      updates.push('token_count = ?');
      params.push(data.tokenCount);
    }

    if (data.metadata !== undefined) {
      updates.push('metadata = ?');
      params.push(JSON.stringify(data.metadata));
    }

    if (updates.length === 0) {
      return existing;
    }

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
   * Delete a message
   */
  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  /**
   * Delete all messages for a conversation
   */
  deleteByConversation(conversationId: string): number {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE conversation_id = ?`)
      .run(conversationId);
    return result.changes;
  }

  /**
   * Delete old messages (cleanup based on time)
   */
  deleteOldMessages(olderThanHours: number = CONFIG.RETENTION_HOURS): number {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE created_at < ?`)
      .run(cutoffDate.toISOString());
    return result.changes;
  }

  /**
   * Delete old messages keeping only the most recent N messages per conversation
   */
  trimConversation(conversationId: string, keepCount: number): number {
    // Get IDs of messages to keep (most recent)
    const keepIds = this.db
      .prepare(`
        SELECT id FROM ${this.tableName}
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(conversationId, keepCount) as Array<{ id: string }>;

    if (keepIds.length === 0) return 0;

    const keepIdSet = keepIds.map(r => r.id);
    const placeholders = keepIdSet.map(() => '?').join(', ');

    const result = this.db
      .prepare(`
        DELETE FROM ${this.tableName}
        WHERE conversation_id = ? AND id NOT IN (${placeholders})
      `)
      .run(conversationId, ...keepIdSet);

    return result.changes;
  }

  /**
   * Count messages with optional filters
   */
  count(filters?: Partial<MessageFilters>): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.conversationId) {
      conditions.push('conversation_id = ?');
      params.push(filters.conversationId);
    }

    if (filters?.role) {
      conditions.push('role = ?');
      params.push(filters.role);
    }

    if (filters?.since) {
      conditions.push('created_at >= ?');
      params.push(filters.since.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).get(...params) as { count: number };

    return result.count;
  }

  /**
   * Count messages by conversation ID
   */
  countByConversation(conversationId: string): number {
    return this.count({ conversationId });
  }

  /**
   * Get total token count for a conversation
   */
  getTotalTokens(conversationId: string): number {
    const sql = `
      SELECT COALESCE(SUM(token_count), 0) as total
      FROM ${this.tableName}
      WHERE conversation_id = ?
    `;

    const result = this.db.prepare(sql).get(conversationId) as { total: number };
    return result.total;
  }

  /**
   * Get conversation statistics
   */
  getConversationStats(conversationId: string): {
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    systemMessages: number;
    totalTokens: number;
    oldestMessage?: Date;
    newestMessage?: Date;
  } {
    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_count,
        SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as assistant_count,
        SUM(CASE WHEN role = 'system' THEN 1 ELSE 0 END) as system_count,
        COALESCE(SUM(token_count), 0) as total_tokens,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM ${this.tableName}
      WHERE conversation_id = ?
    `;

    const result = this.db.prepare(sql).get(conversationId) as {
      total: number;
      user_count: number;
      assistant_count: number;
      system_count: number;
      total_tokens: number;
      oldest: string | null;
      newest: string | null;
    };

    return {
      totalMessages: result.total || 0,
      userMessages: result.user_count || 0,
      assistantMessages: result.assistant_count || 0,
      systemMessages: result.system_count || 0,
      totalTokens: result.total_tokens || 0,
      oldestMessage: result.oldest ? new Date(result.oldest) : undefined,
      newestMessage: result.newest ? new Date(result.newest) : undefined,
    };
  }
}

// Export singleton instance
export const telegramMessageRepository = new TelegramMessageRepository();
