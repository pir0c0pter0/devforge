import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { BaseRepository, BaseFilters } from './base.repository';

/**
 * Session database row type
 */
interface SessionRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
  last_activity_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

/**
 * Session entity type
 */
export interface SessionEntity {
  readonly id: string;
  readonly userId: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly lastActivityAt: Date;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Session creation DTO
 */
export interface CreateSessionDto {
  readonly userId: string;
  readonly expiresIn?: number; // milliseconds, default 24 hours
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Session update DTO
 */
export interface UpdateSessionDto {
  readonly expiresAt?: Date;
  readonly lastActivityAt?: Date;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Session query filters
 */
export interface SessionFilters extends BaseFilters {
  readonly userId?: string;
  readonly expired?: boolean;
  readonly active?: boolean;
}

/**
 * Default session duration: 24 hours
 */
const DEFAULT_SESSION_DURATION = 24 * 60 * 60 * 1000;

/**
 * Generate a secure random token
 */
const generateToken = (): string => {
  return randomBytes(32).toString('hex');
};

/**
 * Session repository for database operations
 */
export class SessionRepository extends BaseRepository<
  SessionEntity,
  CreateSessionDto,
  UpdateSessionDto,
  SessionFilters
> {
  constructor() {
    super('sessions');
  }

  /**
   * Convert database row to entity
   */
  private rowToSession(row: SessionRow): SessionEntity {
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
      lastActivityAt: new Date(row.last_activity_at),
      ipAddress: row.ip_address || undefined,
      userAgent: row.user_agent || undefined,
    };
  }

  /**
   * Check if a session is expired
   */
  isExpired(session: SessionEntity): boolean {
    return session.expiresAt < new Date();
  }

  /**
   * Find all sessions with optional filters
   */
  findAll(filters?: SessionFilters): readonly SessionEntity[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.userId) {
      conditions.push('user_id = ?');
      params.push(filters.userId);
    }

    if (filters?.expired === true) {
      conditions.push('expires_at < datetime("now")');
    } else if (filters?.expired === false || filters?.active === true) {
      conditions.push('expires_at >= datetime("now")');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = this.buildOrderClause(filters) || 'ORDER BY created_at DESC';
    const { clause: limitClause, params: limitParams } = this.buildLimitClause(filters);

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...params, ...limitParams) as SessionRow[];
    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Find session by ID
   */
  findById(id: string): SessionEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id) as SessionRow | undefined;

    return row ? this.rowToSession(row) : null;
  }

  /**
   * Find session by token
   */
  findByToken(token: string): SessionEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE token = ?`)
      .get(token) as SessionRow | undefined;

    return row ? this.rowToSession(row) : null;
  }

  /**
   * Find valid (non-expired) session by token
   */
  findValidByToken(token: string): SessionEntity | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM ${this.tableName}
        WHERE token = ? AND expires_at >= datetime('now')
      `
      )
      .get(token) as SessionRow | undefined;

    return row ? this.rowToSession(row) : null;
  }

  /**
   * Find active sessions for a user
   */
  findActiveByUserId(userId: string): readonly SessionEntity[] {
    return this.findAll({ userId, active: true });
  }

  /**
   * Create a new session
   */
  create(data: CreateSessionDto): SessionEntity {
    const id = uuidv4();
    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (data.expiresIn || DEFAULT_SESSION_DURATION));

    const sql = `
      INSERT INTO ${this.tableName} (
        id, user_id, token, expires_at, created_at, last_activity_at,
        ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.prepare(sql).run(
      id,
      data.userId,
      token,
      expiresAt.toISOString(),
      now.toISOString(),
      now.toISOString(),
      data.ipAddress || null,
      data.userAgent || null
    );

    return this.findById(id)!;
  }

  /**
   * Update a session
   */
  update(id: string, data: UpdateSessionDto): SessionEntity | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.expiresAt !== undefined) {
      updates.push('expires_at = ?');
      params.push(data.expiresAt.toISOString());
    }
    if (data.lastActivityAt !== undefined) {
      updates.push('last_activity_at = ?');
      params.push(data.lastActivityAt.toISOString());
    }
    if (data.ipAddress !== undefined) {
      updates.push('ip_address = ?');
      params.push(data.ipAddress);
    }
    if (data.userAgent !== undefined) {
      updates.push('user_agent = ?');
      params.push(data.userAgent);
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
   * Refresh session (update last activity and optionally extend expiration)
   */
  refresh(id: string, extendExpiration?: boolean): SessionEntity | null {
    const session = this.findById(id);
    if (!session || this.isExpired(session)) {
      return null;
    }

    const updates: UpdateSessionDto = extendExpiration
      ? {
          lastActivityAt: new Date(),
          expiresAt: new Date(Date.now() + DEFAULT_SESSION_DURATION),
        }
      : {
          lastActivityAt: new Date(),
        };

    return this.update(id, updates);
  }

  /**
   * Refresh session by token
   */
  refreshByToken(token: string, extendExpiration?: boolean): SessionEntity | null {
    const session = this.findValidByToken(token);
    if (!session) {
      return null;
    }

    return this.refresh(session.id, extendExpiration);
  }

  /**
   * Invalidate (delete) a session
   */
  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  /**
   * Invalidate session by token
   */
  deleteByToken(token: string): boolean {
    const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE token = ?`).run(token);
    return result.changes > 0;
  }

  /**
   * Invalidate all sessions for a user
   */
  deleteByUserId(userId: string): number {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE user_id = ?`)
      .run(userId);
    return result.changes;
  }

  /**
   * Delete expired sessions (cleanup)
   */
  deleteExpired(): number {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE expires_at < datetime('now')`)
      .run();
    return result.changes;
  }

  /**
   * Count sessions with optional filters
   */
  count(filters?: Partial<SessionFilters>): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.userId) {
      conditions.push('user_id = ?');
      params.push(filters.userId);
    }

    if (filters?.expired === true) {
      conditions.push('expires_at < datetime("now")');
    } else if (filters?.expired === false || filters?.active === true) {
      conditions.push('expires_at >= datetime("now")');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).get(...params) as { count: number };

    return result.count;
  }

  /**
   * Count active sessions for a user
   */
  countActiveByUserId(userId: string): number {
    return this.count({ userId, active: true });
  }

  /**
   * Validate a session token
   * Returns the session if valid, null if invalid or expired
   */
  validateToken(token: string): SessionEntity | null {
    const session = this.findValidByToken(token);
    if (!session) {
      return null;
    }

    // Update last activity
    this.update(session.id, { lastActivityAt: new Date() });

    return session;
  }

  /**
   * Get session statistics
   */
  getStats(): {
    total: number;
    active: number;
    expired: number;
    byUser: readonly { userId: string; count: number }[];
  } {
    const total = this.count();
    const active = this.count({ active: true });
    const expired = total - active;

    const byUserRows = this.db
      .prepare(
        `
        SELECT user_id, COUNT(*) as count
        FROM ${this.tableName}
        WHERE expires_at >= datetime('now')
        GROUP BY user_id
        ORDER BY count DESC
      `
      )
      .all() as Array<{ user_id: string; count: number }>;

    const byUser = byUserRows.map((row) => ({
      userId: row.user_id,
      count: row.count,
    }));

    return { total, active, expired, byUser };
  }
}

// Export singleton instance
export const sessionRepository = new SessionRepository();

// Export token generator for external use
export { generateToken };
