import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { BaseRepository, BaseFilters, PaginatedResult } from './base.repository';

/**
 * User database row type
 */
interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

/**
 * User role type
 */
export type UserRole = 'admin' | 'user' | 'viewer';

/**
 * User entity type
 */
export interface UserEntity {
  readonly id: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastLoginAt?: Date;
}

/**
 * User entity without password (for API responses)
 */
export interface SafeUserEntity {
  readonly id: string;
  readonly username: string;
  readonly role: UserRole;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastLoginAt?: Date;
}

/**
 * User creation DTO
 */
export interface CreateUserDto {
  readonly username: string;
  readonly password: string;
  readonly role?: UserRole;
}

/**
 * User update DTO
 */
export interface UpdateUserDto {
  readonly username?: string;
  readonly password?: string;
  readonly role?: UserRole;
  readonly lastLoginAt?: Date;
}

/**
 * User query filters
 */
export interface UserFilters extends BaseFilters {
  readonly role?: UserRole;
  readonly username?: string;
}

/**
 * Hash a password with salt
 */
const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(salt + password)
    .digest('hex');
  return `${salt}:${hash}`;
};

/**
 * Verify a password against a hash
 */
const verifyPassword = (password: string, storedHash: string): boolean => {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) {
    return false;
  }

  const computedHash = createHash('sha256')
    .update(salt + password)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computedHash, 'hex'));
  } catch {
    return false;
  }
};

/**
 * User repository for database operations
 */
export class UserRepository extends BaseRepository<
  UserEntity,
  CreateUserDto,
  UpdateUserDto,
  UserFilters
> {
  constructor() {
    super('users');
  }

  /**
   * Convert database row to entity
   */
  private rowToUser(row: UserRow): UserEntity {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role as UserRole,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
    };
  }

  /**
   * Convert user entity to safe entity (without password)
   */
  toSafeUser(user: UserEntity): SafeUserEntity {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Find all users with optional filters
   */
  findAll(filters?: UserFilters): readonly UserEntity[] {
    const filterObj = filters ? { ...filters } : {};
    const { clause: whereClause, params: whereParams } = this.buildWhereClause(filterObj);
    const orderClause = this.buildOrderClause(filters) || 'ORDER BY created_at DESC';
    const { clause: limitClause, params: limitParams } = this.buildLimitClause(filters);

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...whereParams, ...limitParams) as UserRow[];
    return rows.map((row) => this.rowToUser(row));
  }

  /**
   * Find all users with pagination (returns safe users)
   */
  findAllPaginated(filters?: UserFilters): PaginatedResult<SafeUserEntity> {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const data = this.findAll({ ...filters, limit, offset }).map((user) =>
      this.toSafeUser(user)
    );
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
   * Find user by ID
   */
  findById(id: string): UserEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id) as UserRow | undefined;

    return row ? this.rowToUser(row) : null;
  }

  /**
   * Find user by username
   */
  findByUsername(username: string): UserEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE username = ?`)
      .get(username) as UserRow | undefined;

    return row ? this.rowToUser(row) : null;
  }

  /**
   * Create a new user
   */
  create(data: CreateUserDto): UserEntity {
    // Check if username already exists
    const existing = this.findByUsername(data.username);
    if (existing) {
      throw new Error(`Username '${data.username}' already exists`);
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const passwordHash = hashPassword(data.password);

    const sql = `
      INSERT INTO ${this.tableName} (
        id, username, password_hash, role, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    this.db.prepare(sql).run(id, data.username, passwordHash, data.role || 'user', now, now);

    return this.findById(id)!;
  }

  /**
   * Update a user
   */
  update(id: string, data: UpdateUserDto): UserEntity | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.username !== undefined) {
      // Check if new username is taken by another user
      const existingByUsername = this.findByUsername(data.username);
      if (existingByUsername && existingByUsername.id !== id) {
        throw new Error(`Username '${data.username}' already exists`);
      }
      updates.push('username = ?');
      params.push(data.username);
    }
    if (data.password !== undefined) {
      updates.push('password_hash = ?');
      params.push(hashPassword(data.password));
    }
    if (data.role !== undefined) {
      updates.push('role = ?');
      params.push(data.role);
    }
    if (data.lastLoginAt !== undefined) {
      updates.push('last_login_at = ?');
      params.push(data.lastLoginAt.toISOString());
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
   * Update last login time
   */
  updateLastLogin(id: string): UserEntity | null {
    return this.update(id, { lastLoginAt: new Date() });
  }

  /**
   * Change user password
   */
  changePassword(id: string, newPassword: string): boolean {
    const result = this.update(id, { password: newPassword });
    return result !== null;
  }

  /**
   * Verify user credentials
   */
  verifyCredentials(username: string, password: string): UserEntity | null {
    const user = this.findByUsername(username);
    if (!user) {
      return null;
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return null;
    }

    // Update last login
    this.updateLastLogin(user.id);

    return this.findById(user.id);
  }

  /**
   * Delete a user
   */
  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  /**
   * Delete user by username
   */
  deleteByUsername(username: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE username = ?`)
      .run(username);
    return result.changes > 0;
  }

  /**
   * Count users with optional filters
   */
  count(filters?: Partial<UserFilters>): number {
    const { clause: whereClause, params } = this.buildWhereClause(filters || {});

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).get(...params) as { count: number };

    return result.count;
  }

  /**
   * Check if username exists
   */
  usernameExists(username: string): boolean {
    const result = this.db
      .prepare(`SELECT 1 FROM ${this.tableName} WHERE username = ? LIMIT 1`)
      .get(username);
    return result !== undefined;
  }

  /**
   * Get user count by role
   */
  getCountByRole(): Record<UserRole, number> {
    const rows = this.db
      .prepare(`SELECT role, COUNT(*) as count FROM ${this.tableName} GROUP BY role`)
      .all() as Array<{ role: string; count: number }>;

    const result: Record<UserRole, number> = {
      admin: 0,
      user: 0,
      viewer: 0,
    };

    for (const row of rows) {
      result[row.role as UserRole] = row.count;
    }

    return result;
  }

  /**
   * Check if there are any admin users
   */
  hasAdminUsers(): boolean {
    const result = this.db
      .prepare(`SELECT 1 FROM ${this.tableName} WHERE role = 'admin' LIMIT 1`)
      .get();
    return result !== undefined;
  }

  /**
   * Create default admin user if no users exist
   */
  createDefaultAdminIfNeeded(): UserEntity | null {
    if (this.count() > 0) {
      return null;
    }

    const defaultPassword =
      process.env['DEFAULT_ADMIN_PASSWORD'] || 'admin-' + randomBytes(8).toString('hex');

    const admin = this.create({
      username: 'admin',
      password: defaultPassword,
      role: 'admin',
    });

    // Log the default password (only shown once)
    console.info(
      `[UserRepository] Created default admin user. Password: ${defaultPassword}`
    );

    return admin;
  }
}

// Export singleton instance
export const userRepository = new UserRepository();

// Export utility functions
export { hashPassword, verifyPassword };
