import { BotContext, SessionData } from '../telegram.types'
import { logger } from '../../utils/logger'
import { sanitizeUserForLogs } from '../../utils/sanitize'
import { getRedisConnection, isRedisConnected } from '../../utils/redis'

/**
 * Session storage configuration
 */
export interface SessionConfig {
  /** Session TTL in seconds (default: 24 hours) */
  ttlSeconds: number
  /** Cleanup interval in milliseconds for memory fallback (default: 5 minutes) */
  cleanupIntervalMs: number
}

/**
 * Default session configuration
 */
const DEFAULT_CONFIG: SessionConfig = {
  ttlSeconds: 86400, // 24 hours
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
}

/**
 * Redis key prefix for sessions
 */
const SESSION_PREFIX = 'telegram:session:'

/**
 * In-memory fallback session storage (when Redis unavailable)
 * Map<userId, SessionData>
 */
const memoryFallback = new Map<number, SessionData>()

/**
 * Track if using Redis or memory fallback
 */
let usingRedis = false

/**
 * Cleanup interval reference for graceful shutdown (memory fallback only)
 */
let cleanupInterval: NodeJS.Timeout | null = null

/**
 * Session logger
 */
const sessionLogger = logger.child({ middleware: 'session' })

/**
 * Serialize SessionData to JSON string for Redis
 */
function serializeSession(session: SessionData): string {
  return JSON.stringify({
    ...session,
    lastActivity: session.lastActivity.toISOString(),
  })
}

/**
 * Deserialize JSON string to SessionData from Redis
 */
function deserializeSession(data: string): SessionData {
  const parsed = JSON.parse(data)
  return {
    ...parsed,
    lastActivity: new Date(parsed.lastActivity),
  }
}

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
    mode: 'container', // Default mode
    conversationId: undefined,
    lastActivity: new Date(),
  }
}

/**
 * Get session from Redis
 *
 * @param userId - Telegram user ID
 * @returns Session data or null
 */
async function getSessionFromRedis(userId: number): Promise<SessionData | null> {
  try {
    const redis = getRedisConnection()
    const data = await redis.get(`${SESSION_PREFIX}${userId}`)
    if (!data) return null
    return deserializeSession(data)
  } catch (error) {
    sessionLogger.error({ error, userId }, 'Error getting session from Redis')
    return null
  }
}

/**
 * Set session in Redis with TTL
 *
 * @param userId - Telegram user ID
 * @param session - Session data to store
 * @param ttlSeconds - TTL in seconds
 */
async function setSessionInRedis(
  userId: number,
  session: SessionData,
  ttlSeconds: number
): Promise<void> {
  try {
    const redis = getRedisConnection()
    await redis.setex(`${SESSION_PREFIX}${userId}`, ttlSeconds, serializeSession(session))
  } catch (error) {
    sessionLogger.error({ error, userId }, 'Error setting session in Redis')
  }
}

/**
 * Delete session from Redis
 *
 * @param userId - Telegram user ID
 */
async function deleteSessionFromRedis(userId: number): Promise<void> {
  try {
    const redis = getRedisConnection()
    await redis.del(`${SESSION_PREFIX}${userId}`)
  } catch (error) {
    sessionLogger.error({ error, userId }, 'Error deleting session from Redis')
  }
}

/**
 * Start automatic cleanup of expired sessions (memory fallback only)
 * Redis handles TTL automatically
 *
 * @param config - Session configuration
 */
export function startSessionCleanup(config: Partial<SessionConfig> = {}): void {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  // Clear existing interval if any
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
  }

  // Only needed for memory fallback
  cleanupInterval = setInterval(() => {
    if (usingRedis) return // Redis handles TTL automatically

    const now = Date.now()
    const ttlMs = mergedConfig.ttlSeconds * 1000
    let cleaned = 0

    const userIds = Array.from(memoryFallback.keys())
    for (const userId of userIds) {
      const session = memoryFallback.get(userId)
      if (!session) continue

      const inactiveTime = now - session.lastActivity.getTime()

      if (inactiveTime > ttlMs) {
        memoryFallback.delete(userId)
        cleaned++

        sessionLogger.debug(
          {
            ...sanitizeUserForLogs({ id: userId, username: session.username }),
            inactiveMinutes: Math.round(inactiveTime / 60_000),
          },
          'Sessao expirada removida (memory fallback)'
        )
      }
    }

    if (cleaned > 0) {
      sessionLogger.info(
        { cleaned, remaining: memoryFallback.size },
        'Cleanup de sessoes executado (memory fallback)'
      )
    }
  }, mergedConfig.cleanupIntervalMs)

  // Don't keep the process alive just for cleanup
  cleanupInterval.unref()

  sessionLogger.info(
    {
      ttlHours: Math.round(mergedConfig.ttlSeconds / 3600),
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
export async function clearSessions(): Promise<void> {
  memoryFallback.clear()

  if (usingRedis) {
    try {
      const redis = getRedisConnection()
      const keys = await redis.keys(`${SESSION_PREFIX}*`)
      if (keys.length > 0) {
        await redis.del(...keys)
      }
      sessionLogger.info({ count: keys.length }, 'Sessions cleared from Redis')
    } catch (error) {
      sessionLogger.error({ error }, 'Error clearing sessions from Redis')
    }
  }
}

/**
 * Get current session count (for monitoring)
 */
export async function getSessionCount(): Promise<number> {
  if (usingRedis) {
    try {
      const redis = getRedisConnection()
      const keys = await redis.keys(`${SESSION_PREFIX}*`)
      return keys.length
    } catch (error) {
      sessionLogger.error({ error }, 'Error getting session count from Redis')
      return memoryFallback.size
    }
  }
  return memoryFallback.size
}

/**
 * Get session by user ID (for debugging/admin)
 *
 * @param userId - Telegram user ID
 * @returns Session data or undefined
 */
export async function getSession(userId: number): Promise<SessionData | undefined> {
  if (usingRedis) {
    const session = await getSessionFromRedis(userId)
    return session ?? undefined
  }
  return memoryFallback.get(userId)
}

/**
 * Set session by user ID (for external updates)
 *
 * @param userId - Telegram user ID
 * @param session - Session data to store
 * @param ttlSeconds - TTL in seconds (default: 24 hours)
 */
export async function setSession(
  userId: number,
  session: SessionData,
  ttlSeconds: number = DEFAULT_CONFIG.ttlSeconds
): Promise<void> {
  if (usingRedis) {
    await setSessionInRedis(userId, session, ttlSeconds)
  } else {
    memoryFallback.set(userId, session)
  }
}

/**
 * Delete session by user ID
 *
 * @param userId - Telegram user ID
 */
export async function deleteSession(userId: number): Promise<void> {
  if (usingRedis) {
    await deleteSessionFromRedis(userId)
  } else {
    memoryFallback.delete(userId)
  }
}

/**
 * Get all active sessions (for admin/monitoring)
 *
 * @returns Array of all sessions
 */
export async function getAllSessions(): Promise<SessionData[]> {
  if (usingRedis) {
    try {
      const redis = getRedisConnection()
      const keys = await redis.keys(`${SESSION_PREFIX}*`)
      if (keys.length === 0) return []

      const sessions: SessionData[] = []
      for (const key of keys) {
        const data = await redis.get(key)
        if (data) {
          sessions.push(deserializeSession(data))
        }
      }
      return sessions
    } catch (error) {
      sessionLogger.error({ error }, 'Error getting all sessions from Redis')
      return Array.from(memoryFallback.values())
    }
  }
  return Array.from(memoryFallback.values())
}

/**
 * Check if using Redis storage
 */
export function isUsingRedis(): boolean {
  return usingRedis
}

/**
 * Session middleware for Telegraf
 *
 * Initializes session data for each user request.
 * Sessions are stored in Redis with TTL (falls back to memory if Redis unavailable).
 * Updates lastActivity on each request.
 *
 * @param config - Optional session configuration
 * @returns Telegraf middleware function
 */
export function sessionMiddleware(config: Partial<SessionConfig> = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  // Check Redis availability on first call
  isRedisConnected().then((connected) => {
    usingRedis = connected
    if (connected) {
      sessionLogger.info('Using Redis for session storage')
    } else {
      sessionLogger.warn('Redis unavailable, using memory fallback for sessions')
    }
  })

  // Start cleanup for memory fallback
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

    // Re-check Redis availability periodically
    const redisConnected = await isRedisConnected()
    if (redisConnected !== usingRedis) {
      usingRedis = redisConnected
      sessionLogger.info(
        { usingRedis },
        usingRedis ? 'Switched to Redis storage' : 'Switched to memory fallback'
      )
    }

    // Get or create session
    let session: SessionData | null | undefined

    if (usingRedis) {
      session = await getSessionFromRedis(userId)
    } else {
      session = memoryFallback.get(userId)
    }

    if (!session) {
      session = createDefaultSession(
        userId,
        ctx.from?.username,
        ctx.from?.first_name,
        ctx.from?.last_name
      )

      sessionLogger.debug(
        {
          ...sanitizeUserForLogs({
            id: userId,
            username: session.username,
            firstName: session.firstName,
          }),
          storage: usingRedis ? 'redis' : 'memory',
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
      // Persist session after request
      if (usingRedis) {
        await setSessionInRedis(userId, ctx.session, mergedConfig.ttlSeconds)
      } else {
        memoryFallback.set(userId, ctx.session)
      }

      sessionLogger.debug(
        {
          userId,
          selectedContainerId: ctx.session.selectedContainerId,
          mode: ctx.session.mode,
          storage: usingRedis ? 'redis' : 'memory',
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

/**
 * Helper to set session mode
 *
 * @param ctx - Bot context
 * @param mode - Session mode
 */
export function setSessionMode(ctx: BotContext, mode: 'conversation' | 'container'): void {
  if (ctx.session) {
    ctx.session.mode = mode
    sessionLogger.debug(
      { userId: ctx.session.userId, mode },
      'Modo da sessao alterado'
    )
  }
}

/**
 * Helper to get session mode
 *
 * @param ctx - Bot context
 * @returns Session mode
 */
export function getSessionMode(ctx: BotContext): 'conversation' | 'container' {
  return ctx.session?.mode ?? 'container'
}

/**
 * Helper to set conversation ID
 *
 * @param ctx - Bot context
 * @param conversationId - Conversation ID
 */
export function setConversationId(ctx: BotContext, conversationId: string): void {
  if (ctx.session) {
    ctx.session.conversationId = conversationId
    sessionLogger.debug(
      { userId: ctx.session.userId, conversationId },
      'Conversation ID definido'
    )
  }
}

/**
 * Helper to get conversation ID
 *
 * @param ctx - Bot context
 * @returns Conversation ID or undefined
 */
export function getConversationId(ctx: BotContext): string | undefined {
  return ctx.session?.conversationId
}
