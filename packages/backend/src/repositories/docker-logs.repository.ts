import { BaseRepository, BaseFilters } from './base.repository';

/**
 * Docker log database row type
 */
interface DockerLogRow {
  id: number;
  container_id: string;
  stream: 'stdout' | 'stderr';
  content: string;
  recorded_at: string;
}

/**
 * Docker log entity type
 */
export interface DockerLogEntity {
  readonly id: number;
  readonly containerId: string;
  readonly stream: 'stdout' | 'stderr';
  readonly content: string;
  readonly recordedAt: Date;
}

/**
 * Docker log creation DTO
 */
export interface CreateDockerLogDto {
  readonly containerId: string;
  readonly stream: 'stdout' | 'stderr';
  readonly content: string;
}

/**
 * Docker log query filters
 */
export interface DockerLogFilters extends BaseFilters {
  readonly containerId?: string;
  readonly stream?: 'stdout' | 'stderr';
  readonly since?: Date;
  readonly until?: Date;
}

/**
 * Log statistics type
 */
export interface DockerLogStats {
  readonly total: number;
  readonly byStream: {
    readonly stdout: number;
    readonly stderr: number;
  };
  readonly oldestLog?: Date;
  readonly newestLog?: Date;
}

/**
 * Configuration for log retention
 */
const CONFIG = {
  /** Default retention time in hours */
  RETENTION_HOURS: 24,
};

/**
 * Docker logs repository for database operations
 */
export class DockerLogsRepository extends BaseRepository<
  DockerLogEntity,
  CreateDockerLogDto,
  Partial<CreateDockerLogDto>,
  DockerLogFilters
> {
  constructor() {
    super('docker_logs');
  }

  /**
   * Convert database row to entity
   */
  private convertRowToEntity(row: DockerLogRow): DockerLogEntity {
    return {
      id: row.id,
      containerId: row.container_id,
      stream: row.stream,
      content: row.content,
      recordedAt: new Date(row.recorded_at),
    };
  }

  /**
   * Find all logs with optional filters
   */
  findAll(filters?: DockerLogFilters): readonly DockerLogEntity[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.containerId) {
      conditions.push('container_id = ?');
      params.push(filters.containerId);
    }

    if (filters?.stream) {
      conditions.push('stream = ?');
      params.push(filters.stream);
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

    const rows = this.db.prepare(sql).all(...params, ...limitParams) as DockerLogRow[];
    return rows.map((row) => this.convertRowToEntity(row));
  }

  /**
   * Find log by ID (accepts number id)
   */
  findById(id: string | number): DockerLogEntity | null {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(numericId) as DockerLogRow | undefined;

    return row ? this.convertRowToEntity(row) : null;
  }

  /**
   * Create a new log entry
   */
  create(data: CreateDockerLogDto): DockerLogEntity {
    const sql = `
      INSERT INTO ${this.tableName} (container_id, stream, content)
      VALUES (?, ?, ?)
    `;

    const result = this.db.prepare(sql).run(
      data.containerId,
      data.stream,
      data.content
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  /**
   * Create multiple log entries in a batch (more efficient for high-volume logging)
   */
  createBatch(logs: CreateDockerLogDto[]): number {
    if (logs.length === 0) return 0;

    const sql = `
      INSERT INTO ${this.tableName} (container_id, stream, content)
      VALUES (?, ?, ?)
    `;

    const stmt = this.db.prepare(sql);
    const insertMany = this.db.transaction((items: CreateDockerLogDto[]) => {
      for (const item of items) {
        stmt.run(
          item.containerId,
          item.stream,
          item.content
        );
      }
      return items.length;
    });

    return insertMany(logs);
  }

  /**
   * Update log entry - Not supported for Docker logs (immutable)
   * @throws Error always - Docker logs are immutable
   */
  update(_id: string, _data: Partial<CreateDockerLogDto>): DockerLogEntity | null {
    throw new Error('Docker logs are immutable and cannot be updated');
  }

  /**
   * Delete log entry
   */
  delete(id: string | number): boolean {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
      .run(numericId);
    return result.changes > 0;
  }

  /**
   * Find logs by container ID with optional filters
   */
  findByContainerId(
    containerId: string,
    filters?: Omit<DockerLogFilters, 'containerId'>
  ): readonly DockerLogEntity[] {
    return this.findAll({
      ...filters,
      containerId,
    });
  }

  /**
   * Find logs since a specific timestamp for a container
   */
  findSince(containerId: string, since: Date): readonly DockerLogEntity[] {
    return this.findAll({
      containerId,
      since,
      orderBy: 'recorded_at',
      orderDirection: 'ASC',
    });
  }

  /**
   * Delete logs older than specified hours (cleanup)
   */
  deleteOlderThan(hours: number = CONFIG.RETENTION_HOURS): number {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);

    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE recorded_at < ?`)
      .run(cutoffDate.toISOString());
    return result.changes;
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
   * Get log statistics for a container
   */
  getStats(containerId: string): DockerLogStats {
    const total = this.count({ containerId });

    const byStreamRows = this.db
      .prepare(`
        SELECT stream, COUNT(*) as count
        FROM ${this.tableName}
        WHERE container_id = ?
        GROUP BY stream
      `)
      .all(containerId) as Array<{ stream: 'stdout' | 'stderr'; count: number }>;

    const byStream = {
      stdout: 0,
      stderr: 0,
    };

    for (const row of byStreamRows) {
      byStream[row.stream] = row.count;
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
      byStream,
      oldestLog: timeRange?.oldest ? new Date(timeRange.oldest) : undefined,
      newestLog: timeRange?.newest ? new Date(timeRange.newest) : undefined,
    };
  }

  /**
   * Count logs with optional filters
   */
  count(filters?: Partial<DockerLogFilters>): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.containerId) {
      conditions.push('container_id = ?');
      params.push(filters.containerId);
    }

    if (filters?.stream) {
      conditions.push('stream = ?');
      params.push(filters.stream);
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

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).get(...params) as { count: number };

    return result.count;
  }

  /**
   * Get recent logs for a container (for initial load)
   */
  getRecentLogs(containerId: string, limit: number = 500): readonly DockerLogEntity[] {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE container_id = ?
      ORDER BY recorded_at DESC
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(containerId, limit) as DockerLogRow[];
    // Reverse to get chronological order
    return rows.reverse().map((row) => this.convertRowToEntity(row));
  }

  /**
   * Get logs for a container with pagination
   */
  getContainerLogs(
    containerId: string,
    options?: { limit?: number; offset?: number; since?: Date; stream?: 'stdout' | 'stderr' }
  ): { logs: readonly DockerLogEntity[]; total: number; hasMore: boolean } {
    const limit = options?.limit ?? 500;
    const offset = options?.offset ?? 0;

    const logs = this.findAll({
      containerId,
      since: options?.since,
      stream: options?.stream,
      limit,
      offset,
      orderBy: 'recorded_at',
      orderDirection: 'ASC',
    });

    const total = this.count({ containerId, since: options?.since, stream: options?.stream });

    return {
      logs,
      total,
      hasMore: offset + logs.length < total,
    };
  }
}

// Export singleton instance
export const dockerLogsRepository = new DockerLogsRepository();
