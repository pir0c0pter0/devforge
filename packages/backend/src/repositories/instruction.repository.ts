import { v4 as uuidv4 } from 'uuid';
import { BaseRepository, BaseFilters, PaginatedResult } from './base.repository';
import type { InstructionStatus, InstructionPriority } from '../models/instruction.model';

/**
 * Instruction database row type
 */
interface InstructionRow {
  id: string;
  container_id: string;
  content: string;
  status: string;
  priority: number;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
  completed_at: string | null;
  result: string | null;
  metadata: string | null;
  retry_count: number;
  max_retries: number;
  timeout: number | null;
}

/**
 * Instruction result type
 */
export interface InstructionResult {
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly error?: string;
  readonly output?: string;
}

/**
 * Instruction entity type
 */
export interface InstructionEntity {
  readonly id: string;
  readonly containerId: string;
  readonly content: string;
  readonly status: InstructionStatus;
  readonly priority: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly executedAt?: Date;
  readonly completedAt?: Date;
  readonly result?: InstructionResult;
  readonly metadata?: Record<string, unknown>;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly timeout?: number;
}

/**
 * Instruction creation DTO
 */
export interface CreateInstructionDto {
  readonly containerId: string;
  readonly content: string;
  readonly priority?: number;
  readonly metadata?: Record<string, unknown>;
  readonly maxRetries?: number;
  readonly timeout?: number;
}

/**
 * Instruction update DTO
 */
export interface UpdateInstructionDto {
  readonly status?: InstructionStatus;
  readonly priority?: number;
  readonly executedAt?: Date;
  readonly completedAt?: Date;
  readonly result?: InstructionResult;
  readonly metadata?: Record<string, unknown>;
  readonly retryCount?: number;
}

/**
 * Instruction query filters
 */
export interface InstructionFilters extends BaseFilters {
  readonly containerId?: string;
  readonly status?: InstructionStatus | readonly InstructionStatus[];
  readonly priority?: number;
  readonly minPriority?: number;
}

/**
 * Priority value mapping
 */
const PRIORITY_MAP: Record<InstructionPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

/**
 * Instruction repository for database operations
 */
export class InstructionRepository extends BaseRepository<
  InstructionEntity,
  CreateInstructionDto,
  UpdateInstructionDto,
  InstructionFilters
> {
  constructor() {
    super('instructions');
  }

  /**
   * Convert database row to entity
   */
  private rowToInstruction(row: InstructionRow): InstructionEntity {
    return {
      id: row.id,
      containerId: row.container_id,
      content: row.content,
      status: row.status as InstructionStatus,
      priority: row.priority,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      result: row.result ? JSON.parse(row.result) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      timeout: row.timeout || undefined,
    };
  }

  /**
   * Find all instructions with optional filters
   */
  findAll(filters?: InstructionFilters): readonly InstructionEntity[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.containerId) {
      conditions.push('container_id = ?');
      params.push(filters.containerId);
    }

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        const placeholders = filters.status.map(() => '?').join(', ');
        conditions.push(`status IN (${placeholders})`);
        params.push(...filters.status);
      } else {
        conditions.push('status = ?');
        params.push(filters.status);
      }
    }

    if (filters?.priority !== undefined) {
      conditions.push('priority = ?');
      params.push(filters.priority);
    }

    if (filters?.minPriority !== undefined) {
      conditions.push('priority >= ?');
      params.push(filters.minPriority);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause =
      this.buildOrderClause(filters) || 'ORDER BY priority DESC, created_at ASC';
    const { clause: limitClause, params: limitParams } = this.buildLimitClause(filters);

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...params, ...limitParams) as InstructionRow[];
    return rows.map((row) => this.rowToInstruction(row));
  }

  /**
   * Find all instructions with pagination
   */
  findAllPaginated(filters?: InstructionFilters): PaginatedResult<InstructionEntity> {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const data = this.findAll({ ...filters, limit, offset });
    const total = this.count(filters);

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    };
  }

  /**
   * Find instruction by ID
   */
  findById(id: string): InstructionEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id) as InstructionRow | undefined;

    return row ? this.rowToInstruction(row) : null;
  }

  /**
   * Find instructions by container ID
   */
  findByContainerId(containerId: string): readonly InstructionEntity[] {
    return this.findAll({ containerId });
  }

  /**
   * Find pending instructions for a container (ordered by priority)
   */
  findPending(containerId: string, limit?: number): readonly InstructionEntity[] {
    return this.findAll({
      containerId,
      status: 'pending',
      orderBy: 'priority',
      orderDirection: 'DESC',
      limit,
    });
  }

  /**
   * Get next instruction to execute (highest priority pending instruction)
   */
  getNext(containerId: string): InstructionEntity | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM ${this.tableName}
        WHERE container_id = ? AND status = 'pending'
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      `
      )
      .get(containerId) as InstructionRow | undefined;

    return row ? this.rowToInstruction(row) : null;
  }

  /**
   * Create a new instruction
   */
  create(data: CreateInstructionDto): InstructionEntity {
    const id = uuidv4();
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO ${this.tableName} (
        id, container_id, content, status, priority,
        metadata, max_retries, timeout, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
    `;

    this.db.prepare(sql).run(
      id,
      data.containerId,
      data.content,
      data.priority ?? PRIORITY_MAP.normal,
      data.metadata ? JSON.stringify(data.metadata) : null,
      data.maxRetries ?? 3,
      data.timeout || null,
      now,
      now
    );

    return this.findById(id)!;
  }

  /**
   * Create multiple instructions at once
   */
  createMany(instructions: readonly CreateInstructionDto[]): readonly InstructionEntity[] {
    return this.transaction(() => {
      return instructions.map((data) => this.create(data));
    });
  }

  /**
   * Update an instruction
   */
  update(id: string, data: UpdateInstructionDto): InstructionEntity | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
    }
    if (data.priority !== undefined) {
      updates.push('priority = ?');
      params.push(data.priority);
    }
    if (data.executedAt !== undefined) {
      updates.push('executed_at = ?');
      params.push(data.executedAt.toISOString());
    }
    if (data.completedAt !== undefined) {
      updates.push('completed_at = ?');
      params.push(data.completedAt.toISOString());
    }
    if (data.result !== undefined) {
      updates.push('result = ?');
      params.push(JSON.stringify(data.result));
    }
    if (data.metadata !== undefined) {
      updates.push('metadata = ?');
      params.push(JSON.stringify(data.metadata));
    }
    if (data.retryCount !== undefined) {
      updates.push('retry_count = ?');
      params.push(data.retryCount);
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
   * Mark instruction as running
   */
  markRunning(id: string): InstructionEntity | null {
    return this.update(id, {
      status: 'running',
      executedAt: new Date(),
    });
  }

  /**
   * Mark instruction as completed
   */
  markCompleted(id: string, result?: InstructionResult): InstructionEntity | null {
    return this.update(id, {
      status: 'completed',
      completedAt: new Date(),
      result,
    });
  }

  /**
   * Mark instruction as failed
   */
  markFailed(id: string, error: string): InstructionEntity | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const newRetryCount = existing.retryCount + 1;
    const shouldRetry = newRetryCount < existing.maxRetries;

    return this.update(id, {
      status: shouldRetry ? 'pending' : 'failed',
      completedAt: shouldRetry ? undefined : new Date(),
      retryCount: newRetryCount,
      result: { error },
    });
  }

  /**
   * Cancel an instruction
   */
  cancel(id: string): InstructionEntity | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    // Can only cancel pending or running instructions
    if (existing.status !== 'pending' && existing.status !== 'running') {
      return null;
    }

    return this.update(id, {
      status: 'cancelled',
      completedAt: new Date(),
    });
  }

  /**
   * Delete an instruction
   */
  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  /**
   * Delete all instructions for a container
   */
  deleteByContainerId(containerId: string): number {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE container_id = ?`)
      .run(containerId);
    return result.changes;
  }

  /**
   * Delete completed/failed instructions older than a date
   */
  deleteOld(olderThan: Date): number {
    const result = this.db
      .prepare(
        `
        DELETE FROM ${this.tableName}
        WHERE status IN ('completed', 'failed', 'cancelled')
        AND created_at < ?
      `
      )
      .run(olderThan.toISOString());
    return result.changes;
  }

  /**
   * Count instructions with optional filters
   */
  count(filters?: Partial<InstructionFilters>): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.containerId) {
      conditions.push('container_id = ?');
      params.push(filters.containerId);
    }

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        const placeholders = filters.status.map(() => '?').join(', ');
        conditions.push(`status IN (${placeholders})`);
        params.push(...filters.status);
      } else {
        conditions.push('status = ?');
        params.push(filters.status);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).get(...params) as { count: number };

    return result.count;
  }

  /**
   * Get queue statistics for a container
   */
  getQueueStats(containerId: string): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
  } {
    const rows = this.db
      .prepare(
        `
        SELECT status, COUNT(*) as count
        FROM ${this.tableName}
        WHERE container_id = ?
        GROUP BY status
      `
      )
      .all(containerId) as Array<{ status: string; count: number }>;

    const stats = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      total: 0,
    };

    for (const row of rows) {
      const status = row.status as keyof typeof stats;
      if (status in stats) {
        stats[status] = row.count;
      }
      stats.total += row.count;
    }

    return stats;
  }
}

// Export singleton instance
export const instructionRepository = new InstructionRepository();

// Export priority map for use elsewhere
export { PRIORITY_MAP };
