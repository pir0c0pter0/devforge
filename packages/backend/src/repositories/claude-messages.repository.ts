import { BaseRepository, BaseFilters } from './base.repository';

/**
 * Message type - matches frontend ClaudeMessageType
 */
export type ClaudeMessageType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error';

/**
 * Claude message database row type
 */
interface ClaudeMessageRow {
  id: string;
  container_id: string;
  type: ClaudeMessageType;
  content: string;
  tool_name: string | null;
  tool_input: string | null;
  created_at: string;
}

/**
 * Claude message entity type
 */
export interface ClaudeMessageEntity {
  readonly id: string;
  readonly containerId: string;
  readonly type: ClaudeMessageType;
  readonly content: string;
  readonly toolName?: string;
  readonly toolInput?: unknown;
  readonly timestamp: Date;
}

/**
 * Claude message creation DTO
 */
export interface CreateClaudeMessageDto {
  readonly id: string;
  readonly containerId: string;
  readonly type: ClaudeMessageType;
  readonly content: string;
  readonly toolName?: string;
  readonly toolInput?: unknown;
  readonly timestamp?: Date;
}

/**
 * Claude message query filters
 */
export interface ClaudeMessageFilters extends BaseFilters {
  readonly containerId?: string;
  readonly type?: ClaudeMessageType;
  readonly since?: Date;
  readonly until?: Date;
}

/**
 * Configuration for message retention
 */
const CONFIG = {
  /** Maximum messages per container */
  MAX_MESSAGES_PER_CONTAINER: 1000,
  /** Retention time in hours */
  RETENTION_HOURS: 168, // 7 days
};

/**
 * Claude messages repository for database operations
 */
export class ClaudeMessagesRepository extends BaseRepository<
  ClaudeMessageEntity,
  CreateClaudeMessageDto,
  Partial<CreateClaudeMessageDto>,
  ClaudeMessageFilters
> {
  constructor() {
    super('claude_messages');
  }

  /**
   * Convert database row to entity
   */
  private convertRowToEntity(row: ClaudeMessageRow): ClaudeMessageEntity {
    let toolInput: unknown | undefined;
    if (row.tool_input) {
      try {
        toolInput = JSON.parse(row.tool_input);
      } catch {
        toolInput = undefined;
      }
    }

    return {
      id: row.id,
      containerId: row.container_id,
      type: row.type,
      content: row.content,
      toolName: row.tool_name || undefined,
      toolInput,
      timestamp: new Date(row.created_at),
    };
  }

  /**
   * Find all messages with optional filters
   */
  findAll(filters?: ClaudeMessageFilters): readonly ClaudeMessageEntity[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.containerId) {
      conditions.push('container_id = ?');
      params.push(filters.containerId);
    }

    if (filters?.type) {
      conditions.push('type = ?');
      params.push(filters.type);
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

    const rows = this.db.prepare(sql).all(...params, ...limitParams) as ClaudeMessageRow[];
    return rows.map((row) => this.convertRowToEntity(row));
  }

  /**
   * Find message by ID
   */
  findById(id: string): ClaudeMessageEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id) as ClaudeMessageRow | undefined;

    return row ? this.convertRowToEntity(row) : null;
  }

  /**
   * Create a new message
   */
  create(data: CreateClaudeMessageDto): ClaudeMessageEntity {
    const sql = `
      INSERT INTO ${this.tableName} (id, container_id, type, content, tool_name, tool_input, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const timestamp = data.timestamp || new Date();

    this.db.prepare(sql).run(
      data.id,
      data.containerId,
      data.type,
      data.content,
      data.toolName || null,
      data.toolInput ? JSON.stringify(data.toolInput) : null,
      timestamp.toISOString()
    );

    return this.findById(data.id)!;
  }

  /**
   * Create multiple messages in a batch (more efficient)
   */
  createBatch(entries: CreateClaudeMessageDto[]): number {
    if (entries.length === 0) return 0;

    const sql = `
      INSERT OR IGNORE INTO ${this.tableName} (id, container_id, type, content, tool_name, tool_input, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = this.db.prepare(sql);
    const insertMany = this.db.transaction((items: CreateClaudeMessageDto[]) => {
      for (const item of items) {
        const timestamp = item.timestamp || new Date();
        stmt.run(
          item.id,
          item.containerId,
          item.type,
          item.content,
          item.toolName || null,
          item.toolInput ? JSON.stringify(item.toolInput) : null,
          timestamp.toISOString()
        );
      }
      return items.length;
    });

    return insertMany(entries);
  }

  /**
   * Update message (not commonly used)
   */
  update(id: string, data: Partial<CreateClaudeMessageDto>): ClaudeMessageEntity | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.content !== undefined) {
      updates.push('content = ?');
      params.push(data.content);
    }

    if (updates.length === 0) return existing;

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
   * Delete message
   */
  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  /**
   * Delete all messages for a container
   */
  deleteByContainerId(containerId: string): number {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE container_id = ?`)
      .run(containerId);
    return result.changes;
  }

  /**
   * Delete old messages (cleanup based on time)
   */
  deleteOld(olderThanHours: number = CONFIG.RETENTION_HOURS): number {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE created_at < ?`)
      .run(cutoffDate.toISOString());
    return result.changes;
  }

  /**
   * Enforce max messages per container (keep only most recent)
   */
  enforceMaxMessagesPerContainer(containerId: string, maxMessages: number = CONFIG.MAX_MESSAGES_PER_CONTAINER): number {
    // Get IDs of messages to keep (most recent)
    const keepIds = this.db
      .prepare(`
        SELECT id FROM ${this.tableName}
        WHERE container_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(containerId, maxMessages) as Array<{ id: string }>;

    if (keepIds.length === 0) return 0;

    const keepIdSet = keepIds.map(r => r.id);
    const placeholders = keepIdSet.map(() => '?').join(', ');

    const result = this.db
      .prepare(`
        DELETE FROM ${this.tableName}
        WHERE container_id = ? AND id NOT IN (${placeholders})
      `)
      .run(containerId, ...keepIdSet);

    return result.changes;
  }

  /**
   * Count messages with optional filters
   */
  count(filters?: Partial<ClaudeMessageFilters>): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.containerId) {
      conditions.push('container_id = ?');
      params.push(filters.containerId);
    }

    if (filters?.type) {
      conditions.push('type = ?');
      params.push(filters.type);
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
   * Get messages for a container with pagination
   */
  getContainerMessages(
    containerId: string,
    options?: { limit?: number; offset?: number; since?: Date }
  ): { messages: readonly ClaudeMessageEntity[]; total: number; hasMore: boolean } {
    const limit = options?.limit ?? 500;
    const offset = options?.offset ?? 0;

    const messages = this.findAll({
      containerId,
      since: options?.since,
      limit,
      offset,
      orderBy: 'created_at',
      orderDirection: 'ASC',
    });

    const total = this.count({ containerId, since: options?.since });

    return {
      messages,
      total,
      hasMore: offset + messages.length < total,
    };
  }

  /**
   * Get recent messages for a container (for initial load)
   */
  getRecentMessages(containerId: string, limit: number = 500): readonly ClaudeMessageEntity[] {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE container_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(containerId, limit) as ClaudeMessageRow[];
    // Reverse to get chronological order
    return rows.reverse().map((row) => this.convertRowToEntity(row));
  }
}

// Export singleton instance
export const claudeMessagesRepository = new ClaudeMessagesRepository();
