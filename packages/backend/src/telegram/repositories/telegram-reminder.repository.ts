import { BaseRepository, BaseFilters } from '../../repositories/base.repository';

/**
 * Reminder status types
 */
export type ReminderStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

/**
 * Recurring type options
 */
export type RecurringType = 'daily' | 'weekly' | 'monthly' | 'cron' | null;

/**
 * Telegram reminder entity
 */
export interface TelegramReminder {
  readonly id: string;
  readonly userId: number;
  readonly chatId: number;
  readonly text: string;
  readonly scheduledFor: Date;
  readonly timezone: string;
  readonly recurringType: RecurringType;
  readonly recurringValue: string | null;
  readonly jobId: string | null;
  readonly status: ReminderStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
}

/**
 * Database row type for telegram_reminders table
 */
interface ReminderRow {
  id: string;
  user_id: number;
  chat_id: number;
  text: string;
  scheduled_for: string;
  timezone: string;
  recurring_type: string | null;
  recurring_value: string | null;
  job_id: string | null;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

/**
 * DTO for creating a reminder
 */
export interface CreateReminderDto {
  readonly userId: number;
  readonly chatId: number;
  readonly text: string;
  readonly scheduledFor: Date;
  readonly timezone?: string;
  readonly recurringType?: RecurringType;
  readonly recurringValue?: string;
  readonly jobId?: string;
}

/**
 * DTO for updating a reminder
 */
export interface UpdateReminderDto {
  readonly text?: string;
  readonly scheduledFor?: Date;
  readonly recurringType?: RecurringType;
  readonly recurringValue?: string | null;
  readonly jobId?: string | null;
  readonly status?: ReminderStatus;
  readonly attempts?: number;
  readonly lastError?: string | null;
  readonly sentAt?: Date | null;
}

/**
 * Query filters for reminders
 */
export interface ReminderFilters extends BaseFilters {
  readonly userId?: number;
  readonly chatId?: number;
  readonly status?: ReminderStatus | readonly ReminderStatus[];
  readonly scheduledBefore?: Date;
  readonly scheduledAfter?: Date;
}

/**
 * Repository for Telegram reminders
 * Handles persistence of scheduled reminders for Telegram bot users
 */
export class TelegramReminderRepository extends BaseRepository<
  TelegramReminder,
  CreateReminderDto,
  UpdateReminderDto,
  ReminderFilters
> {
  constructor() {
    super('telegram_reminders');
  }

  /**
   * Convert database row to entity
   */
  private convertRowToReminder(row: ReminderRow): TelegramReminder {
    return {
      id: row.id,
      userId: row.user_id,
      chatId: row.chat_id,
      text: row.text,
      scheduledFor: new Date(row.scheduled_for),
      timezone: row.timezone || 'America/Sao_Paulo',
      recurringType: row.recurring_type as RecurringType,
      recurringValue: row.recurring_value,
      jobId: row.job_id,
      status: row.status as ReminderStatus,
      attempts: row.attempts || 0,
      lastError: row.last_error,
      createdAt: new Date(row.created_at),
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
    };
  }

  /**
   * Find all reminders with optional filters
   */
  findAll(filters?: ReminderFilters): readonly TelegramReminder[] {
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

    if (filters?.status !== undefined) {
      if (Array.isArray(filters.status)) {
        const placeholders = filters.status.map(() => '?').join(', ');
        conditions.push(`status IN (${placeholders})`);
        params.push(...filters.status);
      } else {
        conditions.push('status = ?');
        params.push(filters.status);
      }
    }

    if (filters?.scheduledBefore !== undefined) {
      conditions.push('scheduled_for <= ?');
      params.push(filters.scheduledBefore.toISOString());
    }

    if (filters?.scheduledAfter !== undefined) {
      conditions.push('scheduled_for >= ?');
      params.push(filters.scheduledAfter.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = this.buildOrderClause(filters) || 'ORDER BY scheduled_for ASC';
    const { clause: limitClause, params: limitParams } = this.buildLimitClause(filters);

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...params, ...limitParams) as ReminderRow[];
    return rows.map((row) => this.convertRowToReminder(row));
  }

  /**
   * Find reminder by ID
   */
  findById(id: string): TelegramReminder | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id) as ReminderRow | undefined;

    return row ? this.convertRowToReminder(row) : null;
  }

  /**
   * Find reminders by user ID
   */
  findByUserId(userId: number): readonly TelegramReminder[] {
    return this.findAll({ userId });
  }

  /**
   * Find pending reminders for a user
   */
  findPendingByUserId(userId: number): readonly TelegramReminder[] {
    return this.findAll({ userId, status: 'pending' });
  }

  /**
   * Find all pending reminders (for worker processing)
   */
  findPending(): readonly TelegramReminder[] {
    return this.findAll({ status: 'pending' });
  }

  /**
   * Find pending reminders that are due now or past due
   */
  findDue(): readonly TelegramReminder[] {
    return this.findAll({
      status: 'pending',
      scheduledBefore: new Date(),
    });
  }

  /**
   * Find reminder by job ID
   */
  findByJobId(jobId: string): TelegramReminder | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE job_id = ?`)
      .get(jobId) as ReminderRow | undefined;

    return row ? this.convertRowToReminder(row) : null;
  }

  /**
   * Create a new reminder
   */
  create(data: CreateReminderDto): TelegramReminder {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO ${this.tableName} (
        id, user_id, chat_id, text, scheduled_for, timezone,
        recurring_type, recurring_value, job_id, status, attempts,
        last_error, created_at, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.prepare(sql).run(
      id,
      data.userId,
      data.chatId,
      data.text,
      data.scheduledFor.toISOString(),
      data.timezone || 'America/Sao_Paulo',
      data.recurringType || null,
      data.recurringValue || null,
      data.jobId || null,
      'pending',
      0,
      null,
      now,
      null
    );

    return this.findById(id)!;
  }

  /**
   * Update a reminder
   */
  update(id: string, data: UpdateReminderDto): TelegramReminder | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.text !== undefined) {
      updates.push('text = ?');
      params.push(data.text);
    }

    if (data.scheduledFor !== undefined) {
      updates.push('scheduled_for = ?');
      params.push(data.scheduledFor.toISOString());
    }

    if (data.recurringType !== undefined) {
      updates.push('recurring_type = ?');
      params.push(data.recurringType);
    }

    if (data.recurringValue !== undefined) {
      updates.push('recurring_value = ?');
      params.push(data.recurringValue);
    }

    if (data.jobId !== undefined) {
      updates.push('job_id = ?');
      params.push(data.jobId);
    }

    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
    }

    if (data.attempts !== undefined) {
      updates.push('attempts = ?');
      params.push(data.attempts);
    }

    if (data.lastError !== undefined) {
      updates.push('last_error = ?');
      params.push(data.lastError);
    }

    if (data.sentAt !== undefined) {
      updates.push('sent_at = ?');
      params.push(data.sentAt ? data.sentAt.toISOString() : null);
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
   * Mark reminder as sent
   */
  markAsSent(id: string): TelegramReminder | null {
    return this.update(id, {
      status: 'sent',
      sentAt: new Date(),
    });
  }

  /**
   * Mark reminder as failed with error
   */
  markAsFailed(id: string, error: string): TelegramReminder | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    return this.update(id, {
      status: 'failed',
      lastError: error,
      attempts: existing.attempts + 1,
    });
  }

  /**
   * Increment attempt count
   */
  incrementAttempts(id: string): TelegramReminder | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    return this.update(id, {
      attempts: existing.attempts + 1,
    });
  }

  /**
   * Cancel a reminder
   */
  cancel(id: string): TelegramReminder | null {
    return this.update(id, { status: 'cancelled' });
  }

  /**
   * Delete a reminder
   */
  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  /**
   * Delete all reminders for a user
   */
  deleteByUserId(userId: number): number {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE user_id = ?`)
      .run(userId);
    return result.changes;
  }

  /**
   * Count reminders with optional filters
   */
  count(filters?: Partial<ReminderFilters>): number {
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

    if (filters?.status !== undefined) {
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
   * Get reminder statistics for a user
   */
  getUserStats(userId: number): {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    cancelled: number;
  } {
    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM ${this.tableName}
      WHERE user_id = ?
    `;

    const result = this.db.prepare(sql).get(userId) as {
      total: number;
      pending: number;
      sent: number;
      failed: number;
      cancelled: number;
    };

    return {
      total: result.total || 0,
      pending: result.pending || 0,
      sent: result.sent || 0,
      failed: result.failed || 0,
      cancelled: result.cancelled || 0,
    };
  }
}

// Export singleton instance
export const telegramReminderRepository = new TelegramReminderRepository();
