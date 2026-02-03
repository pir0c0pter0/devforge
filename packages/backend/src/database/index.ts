import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger';

/**
 * Database configuration
 */
interface DatabaseConfig {
  readonly dbPath: string;
  readonly verbose: boolean;
}

/**
 * Get default database path
 * Uses ~/.local/share/claude-docker-web/claude-docker.db
 */
const getDefaultDbPath = (): string => {
  const dataDir = join(homedir(), '.local', 'share', 'claude-docker-web');
  return join(dataDir, 'claude-docker.db');
};

/**
 * Load database configuration from environment or defaults
 */
const loadDatabaseConfig = (): DatabaseConfig => {
  const dbPath = process.env['DATABASE_PATH'] || getDefaultDbPath();
  const verbose = process.env['DATABASE_VERBOSE'] === 'true';

  return {
    dbPath,
    verbose,
  };
};

/**
 * Singleton database instance
 */
let dbInstance: Database.Database | null = null;

/**
 * Initialize database connection
 * Creates the database directory if it doesn't exist
 */
export const initializeDatabase = (): Database.Database => {
  if (dbInstance) {
    return dbInstance;
  }

  const config = loadDatabaseConfig();

  // Ensure directory exists
  const dbDir = dirname(config.dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    logger.info({ dbDir }, 'Created database directory');
  }

  // Create database connection with verbose logging in development
  const db = new Database(config.dbPath, {
    verbose: config.verbose ? (message) => logger.debug({ sql: message }, 'SQL') : undefined,
  });

  // Enable WAL mode for better concurrent read/write performance
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Optimize for performance
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('temp_store = MEMORY');

  logger.info({ dbPath: config.dbPath }, 'Database initialized');

  dbInstance = db;
  return db;
};

/**
 * Get the database instance
 * Throws if not initialized
 */
export const getDatabase = (): Database.Database => {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbInstance;
};

/**
 * Close database connection
 */
export const closeDatabase = (): void => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    logger.info('Database connection closed');
  }
};

/**
 * Execute a transaction
 * Automatically commits on success, rolls back on error
 */
export const transaction = <T>(fn: () => T): T => {
  const db = getDatabase();
  return db.transaction(fn)();
};

/**
 * Health check for database
 */
export const isDatabaseHealthy = (): boolean => {
  try {
    const db = getDatabase();
    const result = db.prepare('SELECT 1 as check_value').get() as { check_value: number };
    return result.check_value === 1;
  } catch {
    return false;
  }
};

// Re-export types for convenience
export type { Database } from 'better-sqlite3';
