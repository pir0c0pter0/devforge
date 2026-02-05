/**
 * Claude Sessions types for conversation history management
 */

/**
 * Source of the Claude session
 */
export type ClaudeSessionSource = 'telegram' | 'container' | 'api'

/**
 * Claude session information
 */
export interface ClaudeSession {
  /** Unique ID of the session */
  readonly id: string
  /** Container ID this session belongs to */
  readonly containerId: string
  /** Session title */
  readonly title: string
  /** Source of the session */
  readonly source: ClaudeSessionSource
  /** Session creation timestamp */
  readonly createdAt: Date | string
  /** Last update timestamp */
  readonly updatedAt: Date | string
  /** Number of messages in the session */
  readonly messageCount: number
}

/**
 * Claude message entry from database
 */
export interface ClaudeSessionMessage {
  /** Unique ID of the message */
  readonly id: string
  /** Container ID this message belongs to */
  readonly containerId: string
  /** Session ID this message belongs to */
  readonly sessionId: string | null
  /** Message type */
  readonly type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error'
  /** Message content */
  readonly content: string
  /** Tool name (for tool_use and tool_result types) */
  readonly toolName?: string | null
  /** Tool input (for tool_use type) */
  readonly toolInput?: Record<string, unknown> | null
  /** Message creation timestamp */
  readonly createdAt: Date | string
}

/**
 * Response for paginated sessions list
 */
export interface ClaudeSessionListResponse {
  /** List of sessions */
  readonly sessions: readonly ClaudeSession[]
  /** Total count of sessions matching filter */
  readonly total: number
  /** Current page number (1-based) */
  readonly page: number
  /** Number of items per page */
  readonly pageSize: number
  /** Whether more sessions are available */
  readonly hasMore: boolean
}

/**
 * Session with its messages
 */
export interface ClaudeSessionWithMessages {
  /** Session information */
  readonly session: ClaudeSession
  /** List of messages in the session */
  readonly messages: readonly ClaudeSessionMessage[]
}

/**
 * Filter for querying Claude sessions
 */
export interface ClaudeSessionFilter {
  /** Filter by container ID */
  readonly containerId?: string
  /** Filter by source */
  readonly source?: ClaudeSessionSource
  /** Filter sessions updated after this timestamp */
  readonly since?: Date | string
  /** Filter sessions updated before this timestamp */
  readonly until?: Date | string
  /** Text search in session title */
  readonly search?: string
  /** Page number (1-based) */
  readonly page?: number
  /** Number of items per page */
  readonly pageSize?: number
}

/**
 * Request to create a new session
 */
export interface CreateClaudeSessionRequest {
  /** Container ID */
  readonly containerId: string
  /** Session title */
  readonly title: string
  /** Source of the session */
  readonly source: ClaudeSessionSource
}

/**
 * Request to update a session
 */
export interface UpdateClaudeSessionRequest {
  /** New session title */
  readonly title?: string
}

/**
 * Statistics for Claude sessions
 */
export interface ClaudeSessionStats {
  /** Total number of sessions */
  readonly totalSessions: number
  /** Sessions by source */
  readonly bySource: {
    readonly telegram: number
    readonly container: number
    readonly api: number
  }
  /** Total number of messages across all sessions */
  readonly totalMessages: number
  /** Timestamp of oldest session */
  readonly oldestSession: Date | string | null
  /** Timestamp of newest session */
  readonly newestSession: Date | string | null
}
