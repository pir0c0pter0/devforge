import { BotContext, RateLimitConfig } from '../telegram.types'
import { logger } from '../../utils/logger'

/**
 * Rate limit tier definitions
 * - read: list, status, help commands (30/min default)
 * - write: start, stop commands (5/min default)
 * - critical: delete, restart commands (2/min default)
 */
export type RateLimitTier = 'read' | 'write' | 'critical'

/**
 * Rate limit entry tracking request counts
 */
interface RateLimitEntry {
  /** Number of requests in current window */
  count: number
  /** Window start timestamp */
  windowStart: number
}

/**
 * Rate limit storage per user per tier
 * Map<userId, Map<tier, entry>>
 */
const rateLimitStore = new Map<number, Map<RateLimitTier, RateLimitEntry>>()

/**
 * Default rate limit configuration
 */
const DEFAULT_CONFIG: RateLimitConfig & { windowMs: number } = {
  read: 30,
  write: 5,
  critical: 2,
  windowMs: 60_000, // 1 minute
}

/**
 * Cleanup interval reference for graceful shutdown
 */
let cleanupInterval: NodeJS.Timeout | null = null

/**
 * Start automatic cleanup of expired rate limit entries
 * Runs every minute to remove entries older than the window
 *
 * @param windowMs - Window size in milliseconds
 */
export function startRateLimitCleanup(windowMs: number = DEFAULT_CONFIG.windowMs): void {
  // Clear existing interval if any
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
  }

  const rateLimitLogger = logger.child({ middleware: 'rate-limit' })

  cleanupInterval = setInterval(() => {
    const now = Date.now()
    let cleanedUsers = 0
    let cleanedEntries = 0

    const userIds = Array.from(rateLimitStore.keys())
    for (const userId of userIds) {
      const tierMap = rateLimitStore.get(userId)
      if (!tierMap) continue

      const tiers = Array.from(tierMap.keys())
      for (const tier of tiers) {
        const entry = tierMap.get(tier)
        if (entry && now - entry.windowStart > windowMs) {
          tierMap.delete(tier)
          cleanedEntries++
        }
      }

      // Remove empty user entries
      if (tierMap.size === 0) {
        rateLimitStore.delete(userId)
        cleanedUsers++
      }
    }

    if (cleanedUsers > 0 || cleanedEntries > 0) {
      rateLimitLogger.debug(
        { cleanedUsers, cleanedEntries, remainingUsers: rateLimitStore.size },
        'Rate limit cleanup executado'
      )
    }
  }, 60_000) // Run every minute

  // Don't keep the process alive just for cleanup
  cleanupInterval.unref()
}

/**
 * Stop the cleanup interval (for graceful shutdown)
 */
export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}

/**
 * Clear all rate limit data (for testing)
 */
export function clearRateLimits(): void {
  rateLimitStore.clear()
}

/**
 * Get current rate limit status for a user
 *
 * @param userId - Telegram user ID
 * @param tier - Rate limit tier
 * @param config - Rate limit configuration
 * @returns Current count and remaining requests
 */
export function getRateLimitStatus(
  userId: number,
  tier: RateLimitTier,
  config: Partial<RateLimitConfig & { windowMs: number }> = {}
): { count: number; limit: number; remaining: number; resetIn: number } {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const limit = mergedConfig[tier]
  const windowMs = mergedConfig.windowMs

  const userLimits = rateLimitStore.get(userId)
  const entry = userLimits?.get(tier)

  if (!entry) {
    return { count: 0, limit, remaining: limit, resetIn: 0 }
  }

  const now = Date.now()
  const elapsed = now - entry.windowStart

  // Window expired
  if (elapsed >= windowMs) {
    return { count: 0, limit, remaining: limit, resetIn: 0 }
  }

  return {
    count: entry.count,
    limit,
    remaining: Math.max(0, limit - entry.count),
    resetIn: Math.ceil((windowMs - elapsed) / 1000),
  }
}

/**
 * Rate limit middleware factory
 *
 * Implements fixed window rate limiting per user per tier.
 * Returns friendly message in Portuguese when limit is exceeded.
 *
 * @param tier - Rate limit tier (read, write, critical)
 * @param config - Optional rate limit configuration
 * @returns Telegraf middleware function
 */
export function rateLimitMiddleware(
  tier: RateLimitTier,
  config: Partial<RateLimitConfig & { windowMs: number }> = {}
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const rateLimitLogger = logger.child({ middleware: 'rate-limit', tier })

  return async (ctx: BotContext, next: () => Promise<void>) => {
    const userId = ctx.from?.id

    if (!userId) {
      // No user ID, let auth middleware handle it
      return next()
    }

    const limit = mergedConfig[tier]
    const windowMs = mergedConfig.windowMs
    const now = Date.now()

    // Get or create user's rate limit map
    let userLimits = rateLimitStore.get(userId)
    if (!userLimits) {
      userLimits = new Map()
      rateLimitStore.set(userId, userLimits)
    }

    // Get or create tier entry
    let entry = userLimits.get(tier)
    if (!entry || now - entry.windowStart >= windowMs) {
      // Start new window
      entry = { count: 0, windowStart: now }
      userLimits.set(tier, entry)
    }

    // Check if limit exceeded
    if (entry.count >= limit) {
      const resetIn = Math.ceil((windowMs - (now - entry.windowStart)) / 1000)

      rateLimitLogger.warn(
        {
          userId,
          username: ctx.from?.username,
          tier,
          count: entry.count,
          limit,
          resetIn,
        },
        'Rate limit excedido'
      )

      const tierMessages: Record<RateLimitTier, string> = {
        read: 'consultas',
        write: 'acoes',
        critical: 'operacoes criticas',
      }

      await ctx.reply(
        `Voce atingiu o limite de ${tierMessages[tier]} por minuto.\n\n` +
        `Aguarde ${resetIn} segundo${resetIn !== 1 ? 's' : ''} antes de tentar novamente.`
      )
      return
    }

    // Increment counter and proceed
    entry.count++

    rateLimitLogger.debug(
      {
        userId,
        tier,
        count: entry.count,
        limit,
        remaining: limit - entry.count,
      },
      'Rate limit verificado'
    )

    return next()
  }
}

/**
 * Create rate limit middleware for read operations
 */
export function readRateLimit(config?: Partial<RateLimitConfig & { windowMs: number }>) {
  return rateLimitMiddleware('read', config)
}

/**
 * Create rate limit middleware for write operations
 */
export function writeRateLimit(config?: Partial<RateLimitConfig & { windowMs: number }>) {
  return rateLimitMiddleware('write', config)
}

/**
 * Create rate limit middleware for critical operations
 */
export function criticalRateLimit(config?: Partial<RateLimitConfig & { windowMs: number }>) {
  return rateLimitMiddleware('critical', config)
}
