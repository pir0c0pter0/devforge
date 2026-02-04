import { BaseRepository, BaseFilters } from './base.repository';

/**
 * Usage tracking database row type
 */
interface UsageRow {
  id: number;
  container_id: string;
  instruction_id: string | null;
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  session_id: string | null;
  recorded_at: string;
}

/**
 * Usage entity type
 */
export interface UsageEntity {
  readonly id: number;
  readonly containerId: string;
  readonly instructionId?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalCostUsd: number;
  readonly sessionId?: string;
  readonly recordedAt: Date;
}

/**
 * Usage creation DTO
 */
export interface CreateUsageDto {
  readonly containerId: string;
  readonly instructionId?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalCostUsd?: number;
  readonly sessionId?: string;
}

/**
 * Usage update DTO (not commonly used but included for interface compliance)
 */
export interface UpdateUsageDto {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalCostUsd?: number;
}

/**
 * Usage query filters
 */
export interface UsageFilters extends BaseFilters {
  readonly containerId?: string;
  readonly sessionId?: string;
  readonly fromDate?: Date;
  readonly toDate?: Date;
}

/**
 * Aggregated usage type
 */
export interface AggregatedUsage {
  readonly containerId: string;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalTokens: number;
  readonly totalCostUsd: number;
  readonly recordCount: number;
}

/**
 * Session slot configuration
 * Sessions reset every 5 hours with one reset at 12:00 (noon)
 * Slots: 02:00, 07:00, 12:00, 17:00, 22:00
 */
const SESSION_SLOT_HOURS = [2, 7, 12, 17, 22] as const;

/**
 * Format Date to SQLite-compatible string (YYYY-MM-DD HH:MM:SS)
 * SQLite stores datetimes in this format, not ISO 8601 with T and Z
 */
function toSqliteDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/**
 * Calculate the current session slot based on the current time
 * Returns the slot index (0-4) and the start hour
 */
function getCurrentSessionSlot(date: Date = new Date()): { slot: number; startHour: number; endHour: number } {
  const currentHour = date.getUTCHours();

  // Find which slot we're in
  for (let i = SESSION_SLOT_HOURS.length - 1; i >= 0; i--) {
    const slotHour = SESSION_SLOT_HOURS[i];
    if (slotHour !== undefined && currentHour >= slotHour) {
      const startHour = slotHour;
      const nextIndex = (i + 1) % SESSION_SLOT_HOURS.length;
      const endHour = SESSION_SLOT_HOURS[nextIndex] ?? SESSION_SLOT_HOURS[0] ?? 2;
      return { slot: i, startHour, endHour };
    }
  }

  // If before first slot, we're in the last slot of previous day
  const lastSlotHour = SESSION_SLOT_HOURS[SESSION_SLOT_HOURS.length - 1] ?? 22;
  const firstSlotHour = SESSION_SLOT_HOURS[0] ?? 2;
  return {
    slot: SESSION_SLOT_HOURS.length - 1,
    startHour: lastSlotHour,
    endHour: firstSlotHour,
  };
}

/**
 * Generate session ID for a container
 * Format: {containerId}-{date}-{slot}
 */
function generateSessionId(containerId: string, date: Date = new Date()): string {
  const { slot } = getCurrentSessionSlot(date);
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return `${containerId}-${dateStr}-${slot}`;
}

/**
 * Get session end time
 */
function getSessionEndTime(date: Date = new Date()): Date {
  const { startHour, slot } = getCurrentSessionSlot(date);
  const nextIndex = (slot + 1) % SESSION_SLOT_HOURS.length;
  const endHour = SESSION_SLOT_HOURS[nextIndex] ?? SESSION_SLOT_HOURS[0] ?? 2;

  const endDate = new Date(date);
  endDate.setUTCHours(endHour, 0, 0, 0);

  // If end hour is less than start hour, it's next day
  if (endHour <= startHour) {
    endDate.setUTCDate(endDate.getUTCDate() + 1);
  }

  return endDate;
}

/**
 * Usage repository for database operations
 */
export class UsageRepository extends BaseRepository<
  UsageEntity,
  CreateUsageDto,
  UpdateUsageDto,
  UsageFilters
> {
  constructor() {
    super('usage_tracking');
  }

  /**
   * Convert database row to entity
   */
  private rowToUsage(row: UsageRow): UsageEntity {
    return {
      id: row.id,
      containerId: row.container_id,
      instructionId: row.instruction_id ?? undefined,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalCostUsd: row.total_cost_usd,
      sessionId: row.session_id ?? undefined,
      recordedAt: new Date(row.recorded_at),
    };
  }

  /**
   * Find all usage records with optional filters
   */
  findAll(filters?: UsageFilters): readonly UsageEntity[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.containerId) {
      conditions.push('container_id = ?');
      params.push(filters.containerId);
    }

    if (filters?.sessionId) {
      conditions.push('session_id = ?');
      params.push(filters.sessionId);
    }

    if (filters?.fromDate) {
      conditions.push('recorded_at >= ?');
      params.push(toSqliteDateTime(filters.fromDate));
    }

    if (filters?.toDate) {
      conditions.push('recorded_at <= ?');
      params.push(toSqliteDateTime(filters.toDate));
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

    const rows = this.db.prepare(sql).all(...params, ...limitParams) as UsageRow[];
    return rows.map((row) => this.rowToUsage(row));
  }

  /**
   * Find usage by ID
   */
  findById(id: string): UsageEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(parseInt(id, 10)) as UsageRow | undefined;

    return row ? this.rowToUsage(row) : null;
  }

  /**
   * Create a new usage record
   */
  create(data: CreateUsageDto): UsageEntity {
    const sql = `
      INSERT INTO ${this.tableName} (
        container_id, instruction_id, input_tokens, output_tokens,
        total_cost_usd, session_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const result = this.db.prepare(sql).run(
      data.containerId,
      data.instructionId ?? null,
      data.inputTokens ?? 0,
      data.outputTokens ?? 0,
      data.totalCostUsd ?? 0,
      data.sessionId ?? null
    );

    return this.findById(result.lastInsertRowid.toString())!;
  }

  /**
   * Update usage record (not commonly used for usage tracking)
   */
  update(id: string, data: UpdateUsageDto): UsageEntity | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.inputTokens !== undefined) {
      updates.push('input_tokens = ?');
      params.push(data.inputTokens);
    }
    if (data.outputTokens !== undefined) {
      updates.push('output_tokens = ?');
      params.push(data.outputTokens);
    }
    if (data.totalCostUsd !== undefined) {
      updates.push('total_cost_usd = ?');
      params.push(data.totalCostUsd);
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
   * Delete usage record
   */
  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
      .run(parseInt(id, 10));
    return result.changes > 0;
  }

  /**
   * Delete all usage records for a container
   */
  deleteByContainerId(containerId: string): number {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE container_id = ?`)
      .run(containerId);
    return result.changes;
  }

  /**
   * Delete old usage records (cleanup)
   */
  deleteOld(olderThan: Date): number {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE recorded_at < ?`)
      .run(toSqliteDateTime(olderThan));
    return result.changes;
  }

  /**
   * Count usage records with optional filters
   */
  count(filters?: Partial<UsageFilters>): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.containerId) {
      conditions.push('container_id = ?');
      params.push(filters.containerId);
    }

    if (filters?.sessionId) {
      conditions.push('session_id = ?');
      params.push(filters.sessionId);
    }

    if (filters?.fromDate) {
      conditions.push('recorded_at >= ?');
      params.push(toSqliteDateTime(filters.fromDate));
    }

    if (filters?.toDate) {
      conditions.push('recorded_at <= ?');
      params.push(toSqliteDateTime(filters.toDate));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).get(...params) as { count: number };

    return result.count;
  }

  /**
   * Get aggregated usage for a container over a date range
   */
  getAggregated(
    containerId: string,
    options?: { fromDate?: Date; toDate?: Date }
  ): AggregatedUsage | null {
    const conditions: string[] = ['container_id = ?'];
    const params: unknown[] = [containerId];

    if (options?.fromDate) {
      conditions.push('recorded_at >= ?');
      params.push(toSqliteDateTime(options.fromDate));
    }

    if (options?.toDate) {
      conditions.push('recorded_at <= ?');
      params.push(toSqliteDateTime(options.toDate));
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const sql = `
      SELECT
        container_id,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(total_cost_usd) as total_cost_usd,
        COUNT(*) as record_count
      FROM ${this.tableName}
      ${whereClause}
      GROUP BY container_id
    `;

    const row = this.db.prepare(sql).get(...params) as {
      container_id: string;
      total_input_tokens: number | null;
      total_output_tokens: number | null;
      total_tokens: number | null;
      total_cost_usd: number | null;
      record_count: number;
    } | undefined;

    if (!row || row.record_count === 0) {
      return null;
    }

    return {
      containerId: row.container_id,
      totalInputTokens: row.total_input_tokens ?? 0,
      totalOutputTokens: row.total_output_tokens ?? 0,
      totalTokens: row.total_tokens ?? 0,
      totalCostUsd: row.total_cost_usd ?? 0,
      recordCount: row.record_count,
    };
  }

  /**
   * Get daily usage for a container on a specific date
   */
  getDaily(containerId: string, date: Date = new Date()): AggregatedUsage | null {
    // Get start and end of day in UTC
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    return this.getAggregated(containerId, { fromDate: startOfDay, toDate: endOfDay });
  }

  /**
   * Get weekly usage for a container (last 7 days)
   */
  getWeekly(containerId: string): AggregatedUsage | null {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    weekAgo.setUTCHours(0, 0, 0, 0);

    return this.getAggregated(containerId, { fromDate: weekAgo, toDate: now });
  }

  /**
   * Get usage for current session
   */
  getSession(containerId: string, sessionId?: string): AggregatedUsage | null {
    const currentSessionId = sessionId ?? generateSessionId(containerId);

    const sql = `
      SELECT
        container_id,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(total_cost_usd) as total_cost_usd,
        COUNT(*) as record_count
      FROM ${this.tableName}
      WHERE container_id = ? AND session_id = ?
      GROUP BY container_id
    `;

    const row = this.db.prepare(sql).get(containerId, currentSessionId) as {
      container_id: string;
      total_input_tokens: number | null;
      total_output_tokens: number | null;
      total_tokens: number | null;
      total_cost_usd: number | null;
      record_count: number;
    } | undefined;

    if (!row || row.record_count === 0) {
      return null;
    }

    return {
      containerId: row.container_id,
      totalInputTokens: row.total_input_tokens ?? 0,
      totalOutputTokens: row.total_output_tokens ?? 0,
      totalTokens: row.total_tokens ?? 0,
      totalCostUsd: row.total_cost_usd ?? 0,
      recordCount: row.record_count,
    };
  }

  /**
   * Get the current session ID for a container
   */
  getCurrentSessionId(containerId: string): string {
    return generateSessionId(containerId);
  }
}

// Export singleton instance
export const usageRepository = new UsageRepository();

// Export session utility functions for testing
export const sessionUtils = {
  generateSessionId,
  getSessionEndTime,
  getCurrentSessionSlot,
};
