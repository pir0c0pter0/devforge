/**
 * Database schema definitions for SQLite tables
 */

/**
 * Containers table - stores container metadata and configuration
 */
export const CONTAINERS_TABLE = `
  CREATE TABLE IF NOT EXISTS containers (
    id TEXT PRIMARY KEY,
    docker_id TEXT NOT NULL,
    name TEXT NOT NULL,
    template TEXT NOT NULL CHECK (template IN ('claude', 'vscode', 'both')),
    mode TEXT NOT NULL CHECK (mode IN ('interactive', 'autonomous')),
    status TEXT NOT NULL CHECK (status IN ('creating', 'running', 'stopped', 'paused', 'restarting', 'removing', 'exited', 'dead')),
    repo_url TEXT,
    repo_type TEXT NOT NULL CHECK (repo_type IN ('empty', 'clone')),
    ssh_key_path TEXT,
    cpu_limit REAL NOT NULL DEFAULT 2,
    memory_limit INTEGER NOT NULL DEFAULT 2048,
    disk_limit INTEGER NOT NULL DEFAULT 10240,
    config JSON NOT NULL DEFAULT '{}',
    network_id TEXT,
    volume_name TEXT,
    vscode_port INTEGER,
    vscode_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    stopped_at DATETIME
  )
`;

/**
 * Instructions table - instruction queue for containers
 */
export const INSTRUCTIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS instructions (
    id TEXT PRIMARY KEY,
    container_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    priority INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME,
    completed_at DATETIME,
    result JSON,
    metadata JSON,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    timeout INTEGER,
    FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
  )
`;

/**
 * Metrics table - historical metrics data
 */
export const METRICS_TABLE = `
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id TEXT NOT NULL,
    cpu_percent REAL,
    memory_usage INTEGER,
    memory_limit INTEGER,
    disk_usage INTEGER,
    network_rx_bytes INTEGER,
    network_tx_bytes INTEGER,
    active_agents JSON DEFAULT '[]',
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
  )
`;

/**
 * Users table - authentication
 */
export const USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME
  )
`;

/**
 * Sessions table - session management
 */
export const SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`;

/**
 * Container logs table - stores important log entries
 */
export const CONTAINER_LOGS_TABLE = `
  CREATE TABLE IF NOT EXISTS container_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    metadata JSON,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
  )
`;

/**
 * Usage tracking table - tracks Claude API token usage and costs
 */
export const USAGE_TRACKING_TABLE = `
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
`;

/**
 * Claude logs table - persistent storage for Claude Code terminal logs
 */
export const CLAUDE_LOGS_TABLE = `
  CREATE TABLE IF NOT EXISTS claude_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('stdin', 'stdout', 'stderr', 'system')),
    content TEXT NOT NULL,
    metadata JSON,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
  )
`;

/**
 * All table creation statements in order (respecting foreign keys)
 */
export const ALL_TABLES = [
  { name: 'containers', sql: CONTAINERS_TABLE },
  { name: 'instructions', sql: INSTRUCTIONS_TABLE },
  { name: 'metrics', sql: METRICS_TABLE },
  { name: 'users', sql: USERS_TABLE },
  { name: 'sessions', sql: SESSIONS_TABLE },
  { name: 'container_logs', sql: CONTAINER_LOGS_TABLE },
  { name: 'usage_tracking', sql: USAGE_TRACKING_TABLE },
  { name: 'claude_logs', sql: CLAUDE_LOGS_TABLE },
];

/**
 * Index definitions for performance
 */
export const INDEXES = [
  // Containers indexes
  'CREATE INDEX IF NOT EXISTS idx_containers_status ON containers(status)',
  'CREATE INDEX IF NOT EXISTS idx_containers_docker_id ON containers(docker_id)',
  'CREATE INDEX IF NOT EXISTS idx_containers_name ON containers(name)',
  'CREATE INDEX IF NOT EXISTS idx_containers_created_at ON containers(created_at)',

  // Instructions indexes
  'CREATE INDEX IF NOT EXISTS idx_instructions_container_id ON instructions(container_id)',
  'CREATE INDEX IF NOT EXISTS idx_instructions_status ON instructions(status)',
  'CREATE INDEX IF NOT EXISTS idx_instructions_priority ON instructions(priority DESC)',
  'CREATE INDEX IF NOT EXISTS idx_instructions_created_at ON instructions(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_instructions_container_status ON instructions(container_id, status)',

  // Metrics indexes
  'CREATE INDEX IF NOT EXISTS idx_metrics_container_id ON metrics(container_id)',
  'CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON metrics(recorded_at)',
  'CREATE INDEX IF NOT EXISTS idx_metrics_container_recorded ON metrics(container_id, recorded_at DESC)',

  // Users indexes
  'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',

  // Sessions indexes
  'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)',

  // Container logs indexes
  'CREATE INDEX IF NOT EXISTS idx_container_logs_container_id ON container_logs(container_id)',
  'CREATE INDEX IF NOT EXISTS idx_container_logs_level ON container_logs(level)',
  'CREATE INDEX IF NOT EXISTS idx_container_logs_recorded_at ON container_logs(recorded_at)',

  // Usage tracking indexes
  'CREATE INDEX IF NOT EXISTS idx_usage_tracking_container_id ON usage_tracking(container_id)',
  'CREATE INDEX IF NOT EXISTS idx_usage_tracking_session_id ON usage_tracking(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_usage_tracking_recorded_at ON usage_tracking(recorded_at)',
  'CREATE INDEX IF NOT EXISTS idx_usage_tracking_container_recorded ON usage_tracking(container_id, recorded_at DESC)',

  // Claude logs indexes
  'CREATE INDEX IF NOT EXISTS idx_claude_logs_container_id ON claude_logs(container_id)',
  'CREATE INDEX IF NOT EXISTS idx_claude_logs_type ON claude_logs(type)',
  'CREATE INDEX IF NOT EXISTS idx_claude_logs_recorded_at ON claude_logs(recorded_at)',
  'CREATE INDEX IF NOT EXISTS idx_claude_logs_container_recorded ON claude_logs(container_id, recorded_at DESC)',
];

/**
 * Triggers for automatic updated_at timestamps
 */
export const TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS trigger_containers_updated_at
   AFTER UPDATE ON containers
   BEGIN
     UPDATE containers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS trigger_instructions_updated_at
   AFTER UPDATE ON instructions
   BEGIN
     UPDATE instructions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS trigger_users_updated_at
   AFTER UPDATE ON users
   BEGIN
     UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
   END`,
];
