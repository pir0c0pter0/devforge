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
 * Migration 002 - Add usage_tracking table
 */
const usageTrackingMigration: Migration = {
  name: '002_usage_tracking',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        container_id TEXT NOT NULL,
        instruction_id TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        session_id TEXT,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
      )
    `);
    logger.debug('Created usage_tracking table');

    // Create indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_usage_tracking_container_id ON usage_tracking(container_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_usage_tracking_session_id ON usage_tracking(session_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_usage_tracking_recorded_at ON usage_tracking(recorded_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_usage_tracking_container_recorded ON usage_tracking(container_id, recorded_at DESC)');
    logger.debug('Created usage_tracking indexes');
  },
  down: (db: Database.Database) => {
    db.exec('DROP TABLE IF EXISTS usage_tracking');
  },
};

/**
 * Migration 003 - Add claude_logs table for persistent log storage
 */
const claudeLogsMigration: Migration = {
  name: '003_claude_logs',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS claude_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        container_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('stdin', 'stdout', 'stderr', 'system')),
        content TEXT NOT NULL,
        metadata JSON,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
      )
    `);
    logger.debug('Created claude_logs table');

    // Create indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_claude_logs_container_id ON claude_logs(container_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_claude_logs_type ON claude_logs(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_claude_logs_recorded_at ON claude_logs(recorded_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_claude_logs_container_recorded ON claude_logs(container_id, recorded_at DESC)');
    logger.debug('Created claude_logs indexes');
  },
  down: (db: Database.Database) => {
    db.exec('DROP TABLE IF EXISTS claude_logs');
  },
};

/**
 * Migration 004 - Add owner_telegram_id column to containers
 * Allows containers to track which Telegram user owns them for notifications
 */
const ownerTelegramIdMigration: Migration = {
  name: '004_owner_telegram_id',
  up: (db: Database.Database) => {
    // Check if column already exists
    const columns = db.prepare("PRAGMA table_info(containers)").all() as Array<{ name: string }>;
    const hasColumn = columns.some(c => c.name === 'owner_telegram_id');

    if (!hasColumn) {
      db.exec('ALTER TABLE containers ADD COLUMN owner_telegram_id INTEGER');
      logger.debug('Added owner_telegram_id column to containers');
    } else {
      logger.debug('owner_telegram_id column already exists');
    }
  },
  down: (_db: Database.Database) => {
    // SQLite doesn't support DROP COLUMN easily, would need table recreation
    logger.warn('Rollback not supported for owner_telegram_id migration');
  },
};

/**
 * Migration 005 - Add Telegram conversation system tables
 * Stores conversation history, messages, and scheduled reminders for Telegram bot
 */
const telegramConversationsMigration: Migration = {
  name: '005_telegram_conversations',
  up: (db: Database.Database) => {
    // Create telegram_conversations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_conversations (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL,
        mode TEXT NOT NULL DEFAULT 'conversation' CHECK (mode IN ('conversation', 'container')),
        container_id TEXT,
        session_id TEXT,
        context_tokens INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_message_at DATETIME,
        FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE SET NULL
      )
    `);
    logger.debug('Created telegram_conversations table');

    // Create telegram_messages table
    db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        telegram_message_id INTEGER,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        token_count INTEGER DEFAULT 0,
        metadata JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES telegram_conversations(id) ON DELETE CASCADE
      )
    `);
    logger.debug('Created telegram_messages table');

    // Create telegram_reminders table
    db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_reminders (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        scheduled_for DATETIME NOT NULL,
        timezone TEXT DEFAULT 'America/Sao_Paulo',
        recurring_type TEXT CHECK (recurring_type IN (NULL, 'daily', 'weekly', 'monthly', 'cron')),
        recurring_value TEXT,
        job_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME
      )
    `);
    logger.debug('Created telegram_reminders table');

    // Create indexes for telegram_conversations
    db.exec('CREATE INDEX IF NOT EXISTS idx_telegram_conversations_user_id ON telegram_conversations(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_telegram_conversations_chat_id ON telegram_conversations(chat_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_telegram_conversations_user_mode ON telegram_conversations(user_id, mode)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_telegram_conversations_last_message_at ON telegram_conversations(last_message_at)');
    logger.debug('Created telegram_conversations indexes');

    // Create indexes for telegram_messages
    db.exec('CREATE INDEX IF NOT EXISTS idx_telegram_messages_conversation_created ON telegram_messages(conversation_id, created_at ASC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_telegram_messages_created_at ON telegram_messages(created_at)');
    logger.debug('Created telegram_messages indexes');

    // Create indexes for telegram_reminders
    db.exec('CREATE INDEX IF NOT EXISTS idx_telegram_reminders_user_id ON telegram_reminders(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_telegram_reminders_scheduled_status ON telegram_reminders(scheduled_for, status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_telegram_reminders_job_id ON telegram_reminders(job_id)');
    logger.debug('Created telegram_reminders indexes');

    // Create trigger for auto-updating updated_at
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trigger_telegram_conversations_updated_at
      AFTER UPDATE ON telegram_conversations
      BEGIN
        UPDATE telegram_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
    logger.debug('Created telegram_conversations trigger');
  },
  down: (db: Database.Database) => {
    db.exec('DROP TABLE IF EXISTS telegram_messages');
    db.exec('DROP TABLE IF EXISTS telegram_reminders');
    db.exec('DROP TABLE IF EXISTS telegram_conversations');
  },
};

/**
 * Migration 006 - Add docker_logs table for container stdout/stderr logs
 * Stores Docker container logs with 24-hour retention
 */
const dockerLogsMigration: Migration = {
  name: '006_docker_logs',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS docker_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        container_id TEXT NOT NULL,
        stream TEXT NOT NULL CHECK (stream IN ('stdout', 'stderr')),
        content TEXT NOT NULL,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
      )
    `);
    logger.debug('Created docker_logs table');

    // Create indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_docker_logs_container_id ON docker_logs(container_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_docker_logs_stream ON docker_logs(stream)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_docker_logs_recorded_at ON docker_logs(recorded_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_docker_logs_container_recorded ON docker_logs(container_id, recorded_at DESC)');
    logger.debug('Created docker_logs indexes');
  },
  down: (db: Database.Database) => {
    db.exec('DROP TABLE IF EXISTS docker_logs');
  },
};

/**
 * All migrations in order
 * Add new migrations here as the schema evolves
 */
const migrations: readonly Migration[] = [initialMigration, usageTrackingMigration, claudeLogsMigration, ownerTelegramIdMigration, telegramConversationsMigration, dockerLogsMigration];

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
