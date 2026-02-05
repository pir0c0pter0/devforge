import { BaseRepository, BaseFilters } from './base.repository';
import type { ClaudeLogType } from '@devforge/shared';

/**
 * Claude log database row type
 */
interface ClaudeLogRow {
  id: number;
  container_id: string;
  type: ClaudeLogType;
  content: string;
  metadata: string | null;
  recorded_at: string;
}

/**
 * Claude log entity type
 */
export interface ClaudeLogEntity {
  readonly id: number;
  readonly containerId: string;
  readonly type: ClaudeLogType;
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
  readonly recordedAt: Date;
}

/**
 * Claude log creation DTO
 */
export interface CreateClaudeLogDto {
  readonly containerId: string;
  readonly type: ClaudeLogType;
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Claude log query filters
 */
export interface ClaudeLogFilters extends BaseFilters {
  readonly containerId?: string;
  readonly type?: ClaudeLogType;
  readonly types?: ClaudeLogType[];
  readonly since?: Date;
  readonly until?: Date;
}

/**
 * Configuration for log retention
 */
const CONFIG = {
  /** Maximum logs per container (for cleanup) */
  MAX_LOGS_PER_CONTAINER: 5000,
  /** Retention time in hours */
  RETENTION_HOURS: 24,
};

/**
 * Claude logs repository for database operations
 */
export class ClaudeLogsRepository extends BaseRepository<
  ClaudeLogEntity,
  CreateClaudeLogDto,
  Partial<CreateClaudeLogDto>,
  ClaudeLogFilters
> {
  constructor() {
    super('claude_logs');
  }

  /**
   * Convert database row to entity
   */
  private convertRowToEntity(row: ClaudeLogRow): ClaudeLogEntity {
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
      containerId: row.container_id,
      type: row.type,
      content: row.content,
      metadata,
      recordedAt: new Date(row.recorded_at),
    };
  }

  /**
   * Find all logs with optional filters
   */
  findAll(filters?: ClaudeLogFilters): readonly ClaudeLogEntity[] {
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

    if (filters?.types && filters.types.length > 0) {
      const placeholders = filters.types.map(() => '?').join(', ');
      conditions.push(`type IN (${placeholders})`);
      params.push(...filters.types);
    }

    if (filters?.since) {
      conditions.push('recorded_at >= ?');
      params.push(filters.since.toISOString());
    }

    if (filters?.until) {
      conditions.push('recorded_at <= ?');
      params.push(filters.until.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = this.buildOrderClause(filters) || 'ORDER BY recorded_at ASC';
    const { clause: limitClause, params: limitParams } = this.buildLimitClause(filters);

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...params, ...limitParams) as ClaudeLogRow[];
    return rows.map((row) => this.convertRowToEntity(row));
  }

  /**
   * Find log by ID
   */
  findById(id: string): ClaudeLogEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(parseInt(id, 10)) as ClaudeLogRow | undefined;

    return row ? this.convertRowToEntity(row) : null;
  }

  /**
   * Create a new log entry
   */
  create(data: CreateClaudeLogDto): ClaudeLogEntity {
    const sql = `
      INSERT INTO ${this.tableName} (container_id, type, content, metadata)
      VALUES (?, ?, ?, ?)
    `;

    const result = this.db.prepare(sql).run(
      data.containerId,
      data.type,
      data.content,
      data.metadata ? JSON.stringify(data.metadata) : null
    );

    return this.findById(result.lastInsertRowid.toString())!;
  }

  /**
   * Create multiple log entries in a batch (more efficient)
   */
  createBatch(entries: CreateClaudeLogDto[]): number {
    if (entries.length === 0) return 0;

    const sql = `
      INSERT INTO ${this.tableName} (container_id, type, content, metadata)
      VALUES (?, ?, ?, ?)
    `;

    const stmt = this.db.prepare(sql);
    const insertMany = this.db.transaction((items: CreateClaudeLogDto[]) => {
      for (const item of items) {
        stmt.run(
          item.containerId,
          item.type,
          item.content,
          item.metadata ? JSON.stringify(item.metadata) : null
        );
      }
      return items.length;
    });

    return insertMany(entries);
  }

  /**
   * Update log entry (not commonly used)
   */
  update(id: string, data: Partial<CreateClaudeLogDto>): ClaudeLogEntity | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.content !== undefined) {
      updates.push('content = ?');
      params.push(data.content);
    }
    if (data.metadata !== undefined) {
      updates.push('metadata = ?');
      params.push(JSON.stringify(data.metadata));
    }

    if (updates.length === 0) return existing;

    params.push(parseInt(id, 10));

    const sql = `
      UPDATE ${this.tableName}
      SET ${updates.join(', ')}
      WHERE id = ?
    `;

    this.db.prepare(sql).run(...params);
    return this.findById(id);
  }

  /**
   * Delete log entry
   */
  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
      .run(parseInt(id, 10));
    return result.changes > 0;
  }

  /**
   * Delete all logs for a container
   */
  deleteByContainerId(containerId: string): number {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE container_id = ?`)
      .run(containerId);
    return result.changes;
  }

  /**
   * Delete old logs (cleanup based on time)
   */
  deleteOld(olderThanHours: number = CONFIG.RETENTION_HOURS): number {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE recorded_at < ?`)
      .run(cutoffDate.toISOString());
    return result.changes;
  }

  /**
   * Enforce max logs per container (keep only most recent)
   */
  enforceMaxLogsPerContainer(containerId: string, maxLogs: number = CONFIG.MAX_LOGS_PER_CONTAINER): number {
    // Get IDs of logs to keep (most recent)
    const keepIds = this.db
      .prepare(`
        SELECT id FROM ${this.tableName}
        WHERE container_id = ?
        ORDER BY recorded_at DESC
        LIMIT ?
      `)
      .all(containerId, maxLogs) as Array<{ id: number }>;

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
   * Count logs with optional filters
   */
  count(filters?: Partial<ClaudeLogFilters>): number {
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
      conditions.push('recorded_at >= ?');
      params.push(filters.since.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).get(...params) as { count: number };

    return result.count;
  }

  /**
   * Get logs for a container with pagination
   */
  getContainerLogs(
    containerId: string,
    options?: { limit?: number; offset?: number; since?: Date; types?: ClaudeLogType[] }
  ): { logs: readonly ClaudeLogEntity[]; total: number; hasMore: boolean } {
    const limit = options?.limit ?? 500;
    const offset = options?.offset ?? 0;

    const logs = this.findAll({
      containerId,
      since: options?.since,
      types: options?.types,
      limit,
      offset,
      orderBy: 'recorded_at',
      orderDirection: 'ASC',
    });

    const total = this.count({ containerId, since: options?.since });

    return {
      logs,
      total,
      hasMore: offset + logs.length < total,
    };
  }

  /**
   * Get recent logs for a container (for initial load)
   */
  getRecentLogs(containerId: string, limit: number = 500): readonly ClaudeLogEntity[] {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE container_id = ?
      ORDER BY recorded_at DESC
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(containerId, limit) as ClaudeLogRow[];
    // Reverse to get chronological order
    return rows.reverse().map((row) => this.convertRowToEntity(row));
  }

  /**
   * Get log statistics for a container
   */
  getStats(containerId: string): {
    total: number;
    byType: Record<ClaudeLogType, number>;
    oldestLog?: Date;
    newestLog?: Date;
  } {
    const total = this.count({ containerId });

    const byTypeRows = this.db
      .prepare(`
        SELECT type, COUNT(*) as count
        FROM ${this.tableName}
        WHERE container_id = ?
        GROUP BY type
      `)
      .all(containerId) as Array<{ type: ClaudeLogType; count: number }>;

    const byType: Record<ClaudeLogType, number> = {
      stdin: 0,
      stdout: 0,
      stderr: 0,
      system: 0,
    };

    for (const row of byTypeRows) {
      byType[row.type] = row.count;
    }

    const timeRange = this.db
      .prepare(`
        SELECT
          MIN(recorded_at) as oldest,
          MAX(recorded_at) as newest
        FROM ${this.tableName}
        WHERE container_id = ?
      `)
      .get(containerId) as { oldest: string | null; newest: string | null } | undefined;

    return {
      total,
      byType,
      oldestLog: timeRange?.oldest ? new Date(timeRange.oldest) : undefined,
      newestLog: timeRange?.newest ? new Date(timeRange.newest) : undefined,
    };
  }
}

// Export singleton instance
export const claudeLogsRepository = new ClaudeLogsRepository();
