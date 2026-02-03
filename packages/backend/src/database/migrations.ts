import type Database from 'better-sqlite3';
import { getDatabase, transaction } from './index';
import { ALL_TABLES, INDEXES, TRIGGERS } from './schema';
import { logger } from '../utils/logger';

/**
 * Migration metadata table for tracking applied migrations
 */
const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

/**
 * Migration definition
 */
interface Migration {
  readonly name: string;
  readonly up: (db: Database.Database) => void;
  readonly down?: (db: Database.Database) => void;
}

/**
 * Initial migration - creates all base tables
 */
const initialMigration: Migration = {
  name: '001_initial_schema',
  up: (db: Database.Database) => {
    // Create all tables
    for (const table of ALL_TABLES) {
      db.exec(table.sql);
      logger.debug({ table: table.name }, 'Created table');
    }

    // Create all indexes
    for (const index of INDEXES) {
      db.exec(index);
    }
    logger.debug({ count: INDEXES.length }, 'Created indexes');

    // Create all triggers
    for (const trigger of TRIGGERS) {
      db.exec(trigger);
    }
    logger.debug({ count: TRIGGERS.length }, 'Created triggers');
  },
  down: (db: Database.Database) => {
    // Drop tables in reverse order (respecting foreign keys)
    const tables = [...ALL_TABLES].reverse();
    for (const table of tables) {
      db.exec(`DROP TABLE IF EXISTS ${table.name}`);
    }
  },
};

/**
 * All migrations in order
 * Add new migrations here as the schema evolves
 */
const migrations: readonly Migration[] = [initialMigration];

/**
 * Check if a migration has been applied
 */
const isMigrationApplied = (db: Database.Database, name: string): boolean => {
  const result = db
    .prepare('SELECT COUNT(*) as count FROM _migrations WHERE name = ?')
    .get(name) as { count: number };
  return result.count > 0;
};

/**
 * Record that a migration has been applied
 */
const recordMigration = (db: Database.Database, name: string): void => {
  db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
};

/**
 * Get list of applied migrations
 */
export const getAppliedMigrations = (): readonly string[] => {
  const db = getDatabase();

  // Check if migrations table exists
  const tableExists = db
    .prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='_migrations'"
    )
    .get() as { count: number };

  if (tableExists.count === 0) {
    return [];
  }

  const rows = db
    .prepare('SELECT name FROM _migrations ORDER BY id')
    .all() as Array<{ name: string }>;

  return rows.map((row) => row.name);
};

/**
 * Get list of pending migrations
 */
export const getPendingMigrations = (): readonly string[] => {
  const applied = new Set(getAppliedMigrations());
  return migrations.filter((m) => !applied.has(m.name)).map((m) => m.name);
};

/**
 * Run all pending migrations
 * Returns the number of migrations applied
 */
export const runMigrations = (): number => {
  const db = getDatabase();
  let appliedCount = 0;

  // Ensure migrations table exists
  db.exec(MIGRATIONS_TABLE);

  // Run each pending migration in a transaction
  for (const migration of migrations) {
    if (isMigrationApplied(db, migration.name)) {
      logger.debug({ migration: migration.name }, 'Migration already applied, skipping');
      continue;
    }

    logger.info({ migration: migration.name }, 'Running migration');

    transaction(() => {
      migration.up(db);
      recordMigration(db, migration.name);
    });

    appliedCount++;
    logger.info({ migration: migration.name }, 'Migration completed');
  }

  if (appliedCount > 0) {
    logger.info({ count: appliedCount }, 'Migrations completed');
  } else {
    logger.debug('No pending migrations');
  }

  return appliedCount;
};

/**
 * Rollback the last applied migration
 * Returns true if a migration was rolled back
 */
export const rollbackLastMigration = (): boolean => {
  const db = getDatabase();
  const applied = getAppliedMigrations();

  if (applied.length === 0) {
    logger.warn('No migrations to rollback');
    return false;
  }

  const lastMigrationName = applied[applied.length - 1];
  const migration = migrations.find((m) => m.name === lastMigrationName);

  if (!migration) {
    logger.error({ migration: lastMigrationName }, 'Migration not found');
    throw new Error(`Migration not found: ${lastMigrationName}`);
  }

  if (!migration.down) {
    logger.error({ migration: lastMigrationName }, 'Migration does not support rollback');
    throw new Error(`Migration does not support rollback: ${lastMigrationName}`);
  }

  logger.info({ migration: lastMigrationName }, 'Rolling back migration');

  transaction(() => {
    migration.down!(db);
    db.prepare('DELETE FROM _migrations WHERE name = ?').run(lastMigrationName);
  });

  logger.info({ migration: lastMigrationName }, 'Migration rolled back');
  return true;
};

/**
 * Reset database - drops all tables and re-runs migrations
 * WARNING: This will delete all data!
 */
export const resetDatabase = (): void => {
  const db = getDatabase();

  logger.warn('Resetting database - all data will be lost!');

  // Get all table names
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    .all() as Array<{ name: string }>;

  // Disable foreign keys temporarily
  db.pragma('foreign_keys = OFF');

  // Drop all tables
  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table.name}`);
    logger.debug({ table: table.name }, 'Dropped table');
  }

  // Re-enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run all migrations
  runMigrations();

  logger.info('Database reset complete');
};

/**
 * Get database statistics
 */
export const getDatabaseStats = (): {
  readonly tables: ReadonlyArray<{ name: string; rowCount: number }>;
  readonly migrations: readonly string[];
  readonly size: number;
} => {
  const db = getDatabase();

  // Get table row counts
  const tableNames = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_%'"
    )
    .all() as Array<{ name: string }>;

  const tables = tableNames.map((table) => {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as {
      count: number;
    };
    return { name: table.name, rowCount: count.count };
  });

  // Get database file size
  const pageCountResult = db.pragma('page_count') as Array<{ page_count: number }>;
  const pageSizeResult = db.pragma('page_size') as Array<{ page_size: number }>;
  const size = (pageCountResult[0]?.page_count ?? 0) * (pageSizeResult[0]?.page_size ?? 0);

  return {
    tables,
    migrations: getAppliedMigrations(),
    size,
  };
};
