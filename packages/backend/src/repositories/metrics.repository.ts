import { BaseRepository, BaseFilters } from './base.repository';

/**
 * Metrics database row type
 */
interface MetricsRow {
  id: number;
  container_id: string;
  cpu_percent: number | null;
  memory_usage: number | null;
  memory_limit: number | null;
  disk_usage: number | null;
  network_rx_bytes: number | null;
  network_tx_bytes: number | null;
  active_agents: string | null;
  recorded_at: string;
}

/**
 * Active agent type
 */
export interface ActiveAgent {
  readonly pid: number;
  readonly command: string;
  readonly cpu: number;
  readonly memory: number;
}

/**
 * Metrics entity type
 */
export interface MetricsEntity {
  readonly id: number;
  readonly containerId: string;
  readonly cpuPercent?: number;
  readonly memoryUsage?: number;
  readonly memoryLimit?: number;
  readonly diskUsage?: number;
  readonly networkRxBytes?: number;
  readonly networkTxBytes?: number;
  readonly activeAgents: readonly ActiveAgent[];
  readonly recordedAt: Date;
}

/**
 * Metrics creation DTO
 */
export interface CreateMetricsDto {
  readonly containerId: string;
  readonly cpuPercent?: number;
  readonly memoryUsage?: number;
  readonly memoryLimit?: number;
  readonly diskUsage?: number;
  readonly networkRxBytes?: number;
  readonly networkTxBytes?: number;
  readonly activeAgents?: readonly ActiveAgent[];
}

/**
 * Metrics update DTO (not commonly used but included for interface compliance)
 */
export interface UpdateMetricsDto {
  readonly cpuPercent?: number;
  readonly memoryUsage?: number;
  readonly memoryLimit?: number;
  readonly diskUsage?: number;
  readonly networkRxBytes?: number;
  readonly networkTxBytes?: number;
  readonly activeAgents?: readonly ActiveAgent[];
}

/**
 * Metrics query filters
 */
export interface MetricsFilters extends BaseFilters {
  readonly containerId?: string;
  readonly fromDate?: Date;
  readonly toDate?: Date;
}

/**
 * Aggregated metrics type
 */
export interface AggregatedMetrics {
  readonly containerId: string;
  readonly avgCpuPercent: number;
  readonly maxCpuPercent: number;
  readonly avgMemoryUsage: number;
  readonly maxMemoryUsage: number;
  readonly avgDiskUsage: number;
  readonly maxDiskUsage: number;
  readonly totalNetworkRx: number;
  readonly totalNetworkTx: number;
  readonly sampleCount: number;
}

/**
 * Metrics repository for database operations
 */
export class MetricsRepository extends BaseRepository<
  MetricsEntity,
  CreateMetricsDto,
  UpdateMetricsDto,
  MetricsFilters
> {
  constructor() {
    super('metrics');
  }

  /**
   * Convert database row to entity
   */
  private rowToMetrics(row: MetricsRow): MetricsEntity {
    return {
      id: row.id,
      containerId: row.container_id,
      cpuPercent: row.cpu_percent ?? undefined,
      memoryUsage: row.memory_usage ?? undefined,
      memoryLimit: row.memory_limit ?? undefined,
      diskUsage: row.disk_usage ?? undefined,
      networkRxBytes: row.network_rx_bytes ?? undefined,
      networkTxBytes: row.network_tx_bytes ?? undefined,
      activeAgents: row.active_agents ? JSON.parse(row.active_agents) : [],
      recordedAt: new Date(row.recorded_at),
    };
  }

  /**
   * Find all metrics with optional filters
   */
  findAll(filters?: MetricsFilters): readonly MetricsEntity[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.containerId) {
      conditions.push('container_id = ?');
      params.push(filters.containerId);
    }

    if (filters?.fromDate) {
      conditions.push('recorded_at >= ?');
      // Convert to SQLite-compatible format (YYYY-MM-DD HH:MM:SS)
      params.push(filters.fromDate.toISOString().replace('T', ' ').slice(0, 19));
    }

    if (filters?.toDate) {
      conditions.push('recorded_at <= ?');
      // Convert to SQLite-compatible format (YYYY-MM-DD HH:MM:SS)
      params.push(filters.toDate.toISOString().replace('T', ' ').slice(0, 19));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = this.buildOrderClause(filters) || 'ORDER BY recorded_at DESC';
    const { clause: limitClause, params: limitParams } = this.buildLimitClause(filters);

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...params, ...limitParams) as MetricsRow[];
    return rows.map((row) => this.rowToMetrics(row));
  }

  /**
   * Find metrics by ID (auto-generated integer ID)
   */
  findById(id: string): MetricsEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(parseInt(id, 10)) as MetricsRow | undefined;

    return row ? this.rowToMetrics(row) : null;
  }

  /**
   * Find latest metrics for a container
   */
  findLatest(containerId: string): MetricsEntity | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM ${this.tableName}
        WHERE container_id = ?
        ORDER BY recorded_at DESC
        LIMIT 1
      `
      )
      .get(containerId) as MetricsRow | undefined;

    return row ? this.rowToMetrics(row) : null;
  }

  /**
   * Find metrics history for a container
   */
  findHistory(
    containerId: string,
    options?: { fromDate?: Date; toDate?: Date; limit?: number }
  ): readonly MetricsEntity[] {
    return this.findAll({
      containerId,
      fromDate: options?.fromDate,
      toDate: options?.toDate,
      limit: options?.limit,
      orderBy: 'recorded_at',
      orderDirection: 'DESC',
    });
  }

  /**
   * Create a new metrics record
   */
  create(data: CreateMetricsDto): MetricsEntity {
    const sql = `
      INSERT INTO ${this.tableName} (
        container_id, cpu_percent, memory_usage, memory_limit,
        disk_usage, network_rx_bytes, network_tx_bytes, active_agents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = this.db.prepare(sql).run(
      data.containerId,
      data.cpuPercent ?? null,
      data.memoryUsage ?? null,
      data.memoryLimit ?? null,
      data.diskUsage ?? null,
      data.networkRxBytes ?? null,
      data.networkTxBytes ?? null,
      data.activeAgents ? JSON.stringify(data.activeAgents) : '[]'
    );

    return this.findById(result.lastInsertRowid.toString())!;
  }

  /**
   * Update metrics record (not commonly used for metrics)
   */
  update(id: string, data: UpdateMetricsDto): MetricsEntity | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.cpuPercent !== undefined) {
      updates.push('cpu_percent = ?');
      params.push(data.cpuPercent);
    }
    if (data.memoryUsage !== undefined) {
      updates.push('memory_usage = ?');
      params.push(data.memoryUsage);
    }
    if (data.memoryLimit !== undefined) {
      updates.push('memory_limit = ?');
      params.push(data.memoryLimit);
    }
    if (data.diskUsage !== undefined) {
      updates.push('disk_usage = ?');
      params.push(data.diskUsage);
    }
    if (data.networkRxBytes !== undefined) {
      updates.push('network_rx_bytes = ?');
      params.push(data.networkRxBytes);
    }
    if (data.networkTxBytes !== undefined) {
      updates.push('network_tx_bytes = ?');
      params.push(data.networkTxBytes);
    }
    if (data.activeAgents !== undefined) {
      updates.push('active_agents = ?');
      params.push(JSON.stringify(data.activeAgents));
    }

    if (updates.length === 0) {
      return existing;
    }

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
   * Delete metrics record
   */
  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
      .run(parseInt(id, 10));
    return result.changes > 0;
  }

  /**
   * Delete all metrics for a container
   */
  deleteByContainerId(containerId: string): number {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE container_id = ?`)
      .run(containerId);
    return result.changes;
  }

  /**
   * Delete old metrics records
   */
  deleteOld(olderThan: Date): number {
    // Convert to SQLite-compatible format (YYYY-MM-DD HH:MM:SS)
    const olderThanStr = olderThan.toISOString().replace('T', ' ').slice(0, 19);
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE recorded_at < ?`)
      .run(olderThanStr);
    return result.changes;
  }

  /**
   * Count metrics with optional filters
   */
  count(filters?: Partial<MetricsFilters>): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.containerId) {
      conditions.push('container_id = ?');
      params.push(filters.containerId);
    }

    if (filters?.fromDate) {
      conditions.push('recorded_at >= ?');
      // Convert to SQLite-compatible format (YYYY-MM-DD HH:MM:SS)
      params.push(filters.fromDate.toISOString().replace('T', ' ').slice(0, 19));
    }

    if (filters?.toDate) {
      conditions.push('recorded_at <= ?');
      // Convert to SQLite-compatible format (YYYY-MM-DD HH:MM:SS)
      params.push(filters.toDate.toISOString().replace('T', ' ').slice(0, 19));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).get(...params) as { count: number };

    return result.count;
  }

  /**
   * Get aggregated metrics for a container
   */
  getAggregated(
    containerId: string,
    options?: { fromDate?: Date; toDate?: Date }
  ): AggregatedMetrics | null {
    const conditions: string[] = ['container_id = ?'];
    const params: unknown[] = [containerId];

    if (options?.fromDate) {
      conditions.push('recorded_at >= ?');
      // Convert to SQLite-compatible format (YYYY-MM-DD HH:MM:SS)
      params.push(options.fromDate.toISOString().replace('T', ' ').slice(0, 19));
    }

    if (options?.toDate) {
      conditions.push('recorded_at <= ?');
      // Convert to SQLite-compatible format (YYYY-MM-DD HH:MM:SS)
      params.push(options.toDate.toISOString().replace('T', ' ').slice(0, 19));
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const sql = `
      SELECT
        container_id,
        AVG(cpu_percent) as avg_cpu_percent,
        MAX(cpu_percent) as max_cpu_percent,
        AVG(memory_usage) as avg_memory_usage,
        MAX(memory_usage) as max_memory_usage,
        AVG(disk_usage) as avg_disk_usage,
        MAX(disk_usage) as max_disk_usage,
        SUM(network_rx_bytes) as total_network_rx,
        SUM(network_tx_bytes) as total_network_tx,
        COUNT(*) as sample_count
      FROM ${this.tableName}
      ${whereClause}
      GROUP BY container_id
    `;

    const row = this.db.prepare(sql).get(...params) as {
      container_id: string;
      avg_cpu_percent: number | null;
      max_cpu_percent: number | null;
      avg_memory_usage: number | null;
      max_memory_usage: number | null;
      avg_disk_usage: number | null;
      max_disk_usage: number | null;
      total_network_rx: number | null;
      total_network_tx: number | null;
      sample_count: number;
    } | undefined;

    if (!row || row.sample_count === 0) {
      return null;
    }

    return {
      containerId: row.container_id,
      avgCpuPercent: row.avg_cpu_percent ?? 0,
      maxCpuPercent: row.max_cpu_percent ?? 0,
      avgMemoryUsage: row.avg_memory_usage ?? 0,
      maxMemoryUsage: row.max_memory_usage ?? 0,
      avgDiskUsage: row.avg_disk_usage ?? 0,
      maxDiskUsage: row.max_disk_usage ?? 0,
      totalNetworkRx: row.total_network_rx ?? 0,
      totalNetworkTx: row.total_network_tx ?? 0,
      sampleCount: row.sample_count,
    };
  }

  /**
   * Get time-series data for charting
   */
  getTimeSeries(
    containerId: string,
    options?: {
      fromDate?: Date;
      toDate?: Date;
      intervalMinutes?: number;
      limit?: number;
    }
  ): readonly {
    timestamp: Date;
    cpuPercent: number;
    memoryUsage: number;
    diskUsage: number;
  }[] {
    const conditions: string[] = ['container_id = ?'];
    const params: unknown[] = [containerId];

    if (options?.fromDate) {
      conditions.push('recorded_at >= ?');
      // Convert to SQLite-compatible format (YYYY-MM-DD HH:MM:SS)
      params.push(options.fromDate.toISOString().replace('T', ' ').slice(0, 19));
    }

    if (options?.toDate) {
      conditions.push('recorded_at <= ?');
      // Convert to SQLite-compatible format (YYYY-MM-DD HH:MM:SS)
      params.push(options.toDate.toISOString().replace('T', ' ').slice(0, 19));
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : '';

    // Group by time interval if specified
    const intervalSeconds = (options?.intervalMinutes || 1) * 60;

    const sql = `
      SELECT
        datetime((strftime('%s', recorded_at) / ${intervalSeconds}) * ${intervalSeconds}, 'unixepoch') as timestamp,
        AVG(cpu_percent) as cpu_percent,
        AVG(memory_usage) as memory_usage,
        AVG(disk_usage) as disk_usage
      FROM ${this.tableName}
      ${whereClause}
      GROUP BY datetime((strftime('%s', recorded_at) / ${intervalSeconds}) * ${intervalSeconds}, 'unixepoch')
      ORDER BY timestamp DESC
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...params) as Array<{
      timestamp: string;
      cpu_percent: number | null;
      memory_usage: number | null;
      disk_usage: number | null;
    }>;

    return rows.map((row) => ({
      timestamp: new Date(row.timestamp),
      cpuPercent: row.cpu_percent ?? 0,
      memoryUsage: row.memory_usage ?? 0,
      diskUsage: row.disk_usage ?? 0,
    }));
  }

  /**
   * Get metrics history for charts (5-hour history by default)
   * Returns data points in chronological order (oldest first)
   */
  getHistory(
    containerId: string,
    hours: number = 5
  ): readonly MetricsHistoryPoint[] {
    const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    // Convert to SQLite-compatible format (YYYY-MM-DD HH:MM:SS)
    // SQLite CURRENT_TIMESTAMP uses this format, not ISO 8601
    const fromDateStr = fromDate.toISOString().replace('T', ' ').slice(0, 19);

    const sql = `
      SELECT
        recorded_at as timestamp,
        cpu_percent,
        memory_usage,
        memory_limit,
        disk_usage
      FROM ${this.tableName}
      WHERE container_id = ?
        AND recorded_at >= ?
      ORDER BY recorded_at ASC
    `;

    const rows = this.db.prepare(sql).all(containerId, fromDateStr) as Array<{
      timestamp: string;
      cpu_percent: number | null;
      memory_usage: number | null;
      memory_limit: number | null;
      disk_usage: number | null;
    }>;

    return rows.map((row) => {
      // Calculate memory percentage
      const memoryUsage = row.memory_usage ?? 0;
      const memoryLimit = row.memory_limit ?? 1;
      const memoryPercentage = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

      // Disk usage is stored in MB, convert to GB for display
      const diskUsageGB = (row.disk_usage ?? 0) / 1024;

      return {
        timestamp: row.timestamp,
        cpu: Number((row.cpu_percent ?? 0).toFixed(2)),
        memory: Number(memoryPercentage.toFixed(2)),
        disk: Number(diskUsageGB.toFixed(3)),
      };
    });
  }

  /**
   * Cleanup old metrics records (older than specified hours)
   * Returns the number of deleted records
   */
  cleanupOldMetrics(olderThanHours: number = 6): number {
    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    return this.deleteOld(cutoffDate);
  }
}

/**
 * Metrics history point for charts
 */
export interface MetricsHistoryPoint {
  readonly timestamp: string;
  readonly cpu: number;      // percentage (0-100)
  readonly memory: number;   // percentage (0-100)
  readonly disk: number;     // GB used
}

// Export singleton instance
export const metricsRepository = new MetricsRepository();
