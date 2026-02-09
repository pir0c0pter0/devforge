import type Database from 'better-sqlite3';
import { getDatabase, transaction } from '../database';

/**
 * Base filters for queries
 */
export interface BaseFilters {
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: string;
  readonly orderDirection?: 'ASC' | 'DESC';
}

/**
 * Pagination result
 */
export interface PaginatedResult<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

/**
 * Generic repository interface
 */
export interface Repository<T, CreateDto, UpdateDto, Filters extends BaseFilters = BaseFilters> {
  findAll(filters?: Filters): readonly T[];
  findById(id: string): T | null;
  create(data: CreateDto): T;
  update(id: string, data: UpdateDto): T | null;
  delete(id: string): boolean;
  count(filters?: Partial<Filters>): number;
}

/**
 * Base repository class with common functionality
 */
export abstract class BaseRepository<
  T,
  CreateDto,
  UpdateDto,
  Filters extends BaseFilters = BaseFilters
> implements Repository<T, CreateDto, UpdateDto, Filters>
{
  protected readonly tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  /**
   * Get database instance
   */
  protected get db(): Database.Database {
    return getDatabase();
  }

  /**
   * Execute in transaction
   */
  protected transaction<R>(fn: () => R): R {
    return transaction(fn);
  }

  /**
   * Build WHERE clause from filters
   */
  protected buildWhereClause(
    filters: Record<string, unknown>,
    excludeKeys: readonly string[] = ['limit', 'offset', 'orderBy', 'orderDirection']
  ): { clause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || excludeKeys.includes(key)) {
        continue;
      }

      if (value === null) {
        conditions.push(`${this.toSnakeCase(key)} IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => '?').join(', ');
        conditions.push(`${this.toSnakeCase(key)} IN (${placeholders})`);
        params.push(...value);
      } else {
        conditions.push(`${this.toSnakeCase(key)} = ?`);
        params.push(value);
      }
    }

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  /**
   * Allowed columns for ORDER BY (override in subclasses to extend)
   * SEC-M1: Whitelist prevents SQL injection via ORDER BY clause
   */
  protected readonly allowedOrderColumns: readonly string[] = [
    'id', 'created_at', 'updated_at', 'name', 'status'
  ];

  /**
   * Build ORDER BY clause with column whitelist validation
   */
  protected buildOrderClause(filters?: Filters): string {
    if (!filters?.orderBy) {
      return '';
    }
    const column = this.toSnakeCase(filters.orderBy);
    // SEC-M1: Validate column is in whitelist to prevent SQL injection
    if (!this.allowedOrderColumns.includes(column)) {
      return '';
    }
    const direction = filters.orderDirection === 'DESC' ? 'DESC' : 'ASC';
    return `ORDER BY ${column} ${direction}`;
  }

  /**
   * Build LIMIT/OFFSET clause
   */
  protected buildLimitClause(filters?: Filters): { clause: string; params: number[] } {
    const params: number[] = [];
    const parts: string[] = [];

    if (filters?.limit !== undefined) {
      parts.push('LIMIT ?');
      params.push(filters.limit);
    }

    if (filters?.offset !== undefined) {
      if (parts.length === 0) {
        parts.push('LIMIT -1'); // SQLite requires LIMIT before OFFSET
      }
      parts.push('OFFSET ?');
      params.push(filters.offset);
    }

    return {
      clause: parts.join(' '),
      params,
    };
  }

  /**
   * Convert camelCase to snake_case
   */
  protected toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  /**
   * Convert snake_case to camelCase
   */
  protected toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Convert database row to entity (snake_case to camelCase)
   */
  protected rowToEntity<E>(row: Record<string, unknown>): E {
    const entity: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const camelKey = this.toCamelCase(key);
      // Parse JSON fields
      if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try {
          entity[camelKey] = JSON.parse(value);
        } catch {
          entity[camelKey] = value;
        }
      } else if (
        key.endsWith('_at') &&
        typeof value === 'string'
      ) {
        // Convert date strings to Date objects
        entity[camelKey] = new Date(value);
      } else {
        entity[camelKey] = value;
      }
    }
    return entity as E;
  }

  /**
   * Convert entity to database row (camelCase to snake_case)
   */
  protected entityToRow(entity: Record<string, unknown>): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entity)) {
      const snakeKey = this.toSnakeCase(key);
      // Stringify objects for JSON storage
      if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        row[snakeKey] = JSON.stringify(value);
      } else if (value instanceof Date) {
        row[snakeKey] = value.toISOString();
      } else {
        row[snakeKey] = value;
      }
    }
    return row;
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  abstract findAll(filters?: Filters): readonly T[];
  abstract findById(id: string): T | null;
  abstract create(data: CreateDto): T;
  abstract update(id: string, data: UpdateDto): T | null;
  abstract delete(id: string): boolean;
  abstract count(filters?: Partial<Filters>): number;
}
