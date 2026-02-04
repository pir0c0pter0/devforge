import { BotContext, SessionData } from '../telegram.types'
import { logger } from '../../utils/logger'

/**
 * Session storage configuration
 */
export interface SessionConfig {
  /** Session TTL in milliseconds (default: 30 minutes) */
  ttlMs: number
  /** Cleanup interval in milliseconds (default: 5 minutes) */
  cleanupIntervalMs: number
}

/**
 * Default session configuration
 */
const DEFAULT_CONFIG: SessionConfig = {
  ttlMs: 30 * 60 * 1000, // 30 minutes
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
}

/**
 * In-memory session storage
 * Map<userId, SessionData>
 */
const sessionStore = new Map<number, SessionData>()

/**
 * Cleanup interval reference for graceful shutdown
 */
let cleanupInterval: NodeJS.Timeout | null = null

/**
 * Session logger
 */
const sessionLogger = logger.child({ middleware: 'session' })

/**
 * Create default session data for a user
 *
 * @param userId - Telegram user ID
 * @param username - Optional Telegram username
 * @param firstName - Optional first name
 * @param lastName - Optional last name
 * @returns Default SessionData object
 */
function createDefaultSession(
  userId: number,
  username?: string,
  firstName?: string,
  lastName?: string
): SessionData {
  return {
    userId,
    username,
    firstName,
    lastName,
    selectedContainerId: undefined,
    lastActivity: new Date(),
  }
}

/**
 * Start automatic cleanup of expired sessions
 * Removes sessions that have been inactive longer than TTL
 *
 * @param config - Session configuration
 */
export function startSessionCleanup(config: Partial<SessionConfig> = {}): void {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  // Clear existing interval if any
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
  }

  cleanupInterval = setInterval(() => {
    const now = Date.now()
    let cleaned = 0

    const userIds = Array.from(sessionStore.keys())
    for (const userId of userIds) {
      const session = sessionStore.get(userId)
      if (!session) continue

      const inactiveTime = now - session.lastActivity.getTime()

      if (inactiveTime > mergedConfig.ttlMs) {
        sessionStore.delete(userId)
        cleaned++

        sessionLogger.debug(
          {
            userId,
            username: session.username,
            inactiveMinutes: Math.round(inactiveTime / 60_000),
          },
          'Sessao expirada removida'
        )
      }
    }

    if (cleaned > 0) {
      sessionLogger.info(
        { cleaned, remaining: sessionStore.size },
        'Cleanup de sessoes executado'
      )
    }
  }, mergedConfig.cleanupIntervalMs)

  // Don't keep the process alive just for cleanup
  cleanupInterval.unref()

  sessionLogger.info(
    {
      ttlMinutes: Math.round(mergedConfig.ttlMs / 60_000),
      cleanupIntervalMinutes: Math.round(mergedConfig.cleanupIntervalMs / 60_000),
    },
    'Session cleanup iniciado'
  )
}

/**
 * Stop the cleanup interval (for graceful shutdown)
 */
export function stopSessionCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
    sessionLogger.info('Session cleanup parado')
  }
}

/**
 * Clear all sessions (for testing)
 */
export function clearSessions(): void {
  sessionStore.clear()
}

/**
 * Get current session count (for monitoring)
 */
export function getSessionCount(): number {
  return sessionStore.size
}

/**
 * Get session by user ID (for debugging/admin)
 *
 * @param userId - Telegram user ID
 * @returns Session data or undefined
 */
export function getSession(userId: number): SessionData | undefined {
  return sessionStore.get(userId)
}

/**
 * Get all active sessions (for admin/monitoring)
 *
 * @returns Array of all sessions
 */
export function getAllSessions(): SessionData[] {
  return Array.from(sessionStore.values())
}

/**
 * Session middleware for Telegraf
 *
 * Initializes session data for each user request.
 * Sessions are stored in memory with automatic TTL cleanup.
 * Updates lastActivity on each request.
 *
 * @param config - Optional session configuration
 * @returns Telegraf middleware function
 */
export function sessionMiddleware(config: Partial<SessionConfig> = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  // Start cleanup if not already running
  if (!cleanupInterval) {
    startSessionCleanup(mergedConfig)
  }

  return async (ctx: BotContext, next: () => Promise<void>) => {
    const userId = ctx.from?.id

    if (!userId) {
      // No user ID, create empty session and continue
      ctx.session = createDefaultSession(0)
      return next()
    }

    // Get or create session
    let session = sessionStore.get(userId)

    if (!session) {
      session = createDefaultSession(
        userId,
        ctx.from?.username,
        ctx.from?.first_name,
        ctx.from?.last_name
      )
      sessionStore.set(userId, session)

      sessionLogger.debug(
        {
          userId,
          username: session.username,
          firstName: session.firstName,
        },
        'Nova sessao criada'
      )
    } else {
      // Update user info (may have changed)
      session.username = ctx.from?.username
      session.firstName = ctx.from?.first_name
      session.lastName = ctx.from?.last_name
    }

    // Update last activity
    session.lastActivity = new Date()

    // Attach session to context
    ctx.session = session

    try {
      await next()
    } finally {
      // Session is automatically persisted since we're using reference
      sessionLogger.debug(
        {
          userId,
          selectedContainerId: session.selectedContainerId,
        },
        'Sessao atualizada'
      )
    }
  }
}

/**
 * Helper to select a container in the session
 *
 * @param ctx - Bot context
 * @param containerId - Container ID to select
 */
export function selectContainer(ctx: BotContext, containerId: string): void {
  if (ctx.session) {
    ctx.session.selectedContainerId = containerId
    sessionLogger.debug(
      { userId: ctx.session.userId, containerId },
      'Container selecionado na sessao'
    )
  }
}

/**
 * Helper to clear container selection in the session
 *
 * @param ctx - Bot context
 */
export function clearContainerSelection(ctx: BotContext): void {
  if (ctx.session) {
    ctx.session.selectedContainerId = undefined
    sessionLogger.debug(
      { userId: ctx.session.userId },
      'Selecao de container limpa'
    )
  }
}

/**
 * Helper to get selected container ID from session
 *
 * @param ctx - Bot context
 * @returns Selected container ID or undefined
 */
export function getSelectedContainer(ctx: BotContext): string | undefined {
  return ctx.session?.selectedContainerId
}
