/**
 * Docker Logs types for container log collection and streaming
 */

/**
 * Log stream type (stdout or stderr)
 */
export type DockerLogStream = 'stdout' | 'stderr'

/**
 * Log type classification
 */
export type DockerLogType = 'build' | 'runtime' | 'error' | 'warning' | 'info'

/**
 * Time range presets for UI filtering
 */
export type DockerLogTimeRange = '1h' | '6h' | '12h' | '24h' | 'all'

/**
 * Log tab filter type (for UI sub-tabs)
 */
export type DockerLogTabType = 'all' | 'build' | 'runtime' | 'errors'

/**
 * Single log entry from a Docker container
 */
export interface DockerLogEntry {
  /** Unique ID of the log entry */
  readonly id: number
  /** Container ID this log belongs to */
  readonly containerId: string
  /** Stream type (stdout or stderr) */
  readonly stream: DockerLogStream
  /** Log type classification */
  readonly logType: DockerLogType
  /** Log content */
  readonly content: string
  /** Timestamp when log was recorded */
  readonly recordedAt: Date | string
}

/**
 * Collapsed log group for smart collapse feature
 */
export interface CollapsedLogGroup {
  /** Unique ID for the group */
  readonly id: string
  /** Log type of the group */
  readonly logType: DockerLogType
  /** Pattern that represents this group */
  readonly pattern: string
  /** Number of logs in the group */
  readonly count: number
  /** First log in the group */
  readonly firstLog: DockerLogEntry
  /** Last log in the group */
  readonly lastLog: DockerLogEntry
  /** Whether the group is currently collapsed */
  collapsed: boolean
}

/**
 * Display item for log list (either single log or collapsed group)
 */
export type LogDisplayItem =
  | { readonly type: 'single'; readonly log: DockerLogEntry }
  | { readonly type: 'group'; readonly group: CollapsedLogGroup }

/**
 * Filter for querying Docker logs
 */
export interface DockerLogFilter {
  /** Filter by container ID */
  readonly containerId?: string
  /** Filter by stream type */
  readonly stream?: DockerLogStream
  /** Filter by single log type */
  readonly logType?: DockerLogType
  /** Filter by multiple log types (comma-separated in API) */
  readonly logTypes?: readonly DockerLogType[]
  /** Filter logs after this timestamp (ISO string or Date) */
  readonly since?: Date | string
  /** Filter logs before this timestamp (ISO string or Date) */
  readonly until?: Date | string
  /** Text search in log content */
  readonly search?: string
  /** Maximum number of logs to return */
  readonly limit?: number
  /** Offset for pagination */
  readonly offset?: number
}

/**
 * Response for paginated logs query
 */
export interface DockerLogsResponse {
  /** List of log entries */
  readonly logs: readonly DockerLogEntry[]
  /** Total count of logs matching filter */
  readonly total: number
  /** Whether more logs are available */
  readonly hasMore: boolean
}

/**
 * Statistics for Docker logs
 */
export interface DockerLogStats {
  /** Total number of log entries */
  readonly totalLogs: number
  /** Count of stdout entries */
  readonly stdoutCount: number
  /** Count of stderr entries */
  readonly stderrCount: number
  /** Count by log type */
  readonly byType: {
    readonly build: number
    readonly runtime: number
    readonly error: number
    readonly warning: number
    readonly info: number
  }
  /** Timestamp of oldest log entry */
  readonly oldestLog: Date | string | null
  /** Timestamp of newest log entry */
  readonly newestLog: Date | string | null
  /** Total size of logs in bytes */
  readonly sizeBytes: number
}

/**
 * WebSocket events for Docker logs streaming
 */
export interface DockerLogEvents {
  /** Single new log entry */
  readonly 'docker:log': DockerLogEntry
  /** Batch of log entries */
  readonly 'docker:logs:batch': readonly DockerLogEntry[]
  /** Historical logs response */
  readonly 'docker:logs:history': DockerLogsResponse
}

/**
 * Subscribe payload for Docker logs WebSocket
 */
export interface DockerLogsSubscribe {
  /** Container ID to subscribe to */
  readonly containerId: string
  /** ISO timestamp to load logs from (default: 24h ago) */
  readonly since?: string
  /** Enable batch mode (receive logs in batches every 500ms) */
  readonly batchMode?: boolean
}

/**
 * Unsubscribe payload for Docker logs WebSocket
 */
export interface DockerLogsUnsubscribe {
  /** Container ID to unsubscribe from */
  readonly containerId: string
}

/**
 * Request history payload for Docker logs WebSocket
 */
export interface DockerLogsRequestHistory {
  /** Container ID to request history for */
  readonly containerId: string
  /** ISO timestamp to load logs from */
  readonly since?: string
  /** Maximum number of logs to return */
  readonly limit?: number
}
