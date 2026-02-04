/**
 * WebSocket Rate Limiting Middleware
 *
 * Implements rate limiting for Socket.io connections using a sliding window algorithm.
 * Supports different tiers for read, write, and critical operations.
 */

import { Socket } from 'socket.io'
import { logger } from '../utils/logger'

/**
 * Rate limit tiers for different operation types
 */
export type RateLimitTier = 'read' | 'write' | 'critical'

/**
 * Rate limit configuration per tier
 */
export interface WebSocketRateLimitConfig {
  /** Requests per minute for read operations (subscribe, list, status) */
  read: number
  /** Requests per minute for write operations (instruction:send) */
  write: number
  /** Requests per minute for critical operations (daemon:start, daemon:stop) */
  critical: number
  /** Time window in milliseconds */
  windowMs: number
  /** Block duration after limit exceeded (milliseconds) */
  blockDurationMs: number
}

/**
 * Default rate limit configuration
 */
const DEFAULT_CONFIG: WebSocketRateLimitConfig = {
  read: 60,      // 60/min for subscriptions, queries
  write: 10,     // 10/min for sending instructions
  critical: 3,   // 3/min for daemon start/stop
  windowMs: 60_000,
  blockDurationMs: 60_000,
}

/**
 * Track requests per socket and tier
 */
interface RateLimitEntry {
  timestamps: number[]
  blockedUntil?: number
}

/**
 * Rate limit state per socket
 */
const socketRateLimits = new Map<string, Map<RateLimitTier, RateLimitEntry>>()

/**
 * Event to tier mapping
 */
const EVENT_TIER_MAP: Record<string, RateLimitTier> = {
  // Read operations
  'subscribe:container': 'read',
  'unsubscribe:container': 'read',
  'logs:subscribe': 'read',
  'logs:unsubscribe': 'read',
  'docker-logs:subscribe': 'read',
  'docker-logs:unsubscribe': 'read',
  'task:subscribe': 'read',
  'task:unsubscribe': 'read',
  'terminal:subscribe': 'read',
  'terminal:unsubscribe': 'read',
  'daemon:subscribe': 'read',
  'daemon:unsubscribe': 'read',
  'logs:get': 'read',
  'stats:get': 'read',

  // Write operations
  'instruction:send': 'write',
  'instruction:confirm': 'write',
  'instruction:cancel': 'write',
  'terminal:input': 'write',
  'terminal:resize': 'write',
  'logs:clear': 'write',

  // Critical operations
  'daemon:start': 'critical',
  'daemon:stop': 'critical',
}

/**
 * Get or create rate limit entry for a socket/tier combination
 */
function getOrCreateEntry(socketId: string, tier: RateLimitTier): RateLimitEntry {
  let socketMap = socketRateLimits.get(socketId)
  if (!socketMap) {
    socketMap = new Map()
    socketRateLimits.set(socketId, socketMap)
  }

  let entry = socketMap.get(tier)
  if (!entry) {
    entry = { timestamps: [] }
    socketMap.set(tier, entry)
  }

  return entry
}

/**
 * Clean up old timestamps outside the window
 */
function cleanupTimestamps(entry: RateLimitEntry, windowMs: number): void {
  const cutoff = Date.now() - windowMs
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff)
}

/**
 * Check if a socket is rate limited for a specific tier
 */
export function isRateLimited(
  socketId: string,
  tier: RateLimitTier,
  config: WebSocketRateLimitConfig = DEFAULT_CONFIG
): { limited: boolean; retryAfter?: number; remaining: number } {
  const entry = getOrCreateEntry(socketId, tier)
  const now = Date.now()

  // Check if blocked
  if (entry.blockedUntil && entry.blockedUntil > now) {
    return {
      limited: true,
      retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
      remaining: 0,
    }
  }

  // Clear block if expired
  if (entry.blockedUntil && entry.blockedUntil <= now) {
    entry.blockedUntil = undefined
  }

  // Cleanup old timestamps
  cleanupTimestamps(entry, config.windowMs)

  const limit = config[tier]
  const remaining = Math.max(0, limit - entry.timestamps.length)

  return {
    limited: false,
    remaining,
  }
}

/**
 * Record a request and check if it should be rate limited
 */
export function checkAndRecordRequest(
  socketId: string,
  eventName: string,
  config: WebSocketRateLimitConfig = DEFAULT_CONFIG
): { allowed: boolean; retryAfter?: number; tier: RateLimitTier; remaining: number } {
  const tier = EVENT_TIER_MAP[eventName] || 'read'
  const entry = getOrCreateEntry(socketId, tier)
  const now = Date.now()

  // Check if blocked
  if (entry.blockedUntil && entry.blockedUntil > now) {
    logger.debug(
      { socketId, eventName, tier, blockedUntil: entry.blockedUntil },
      'WebSocket request blocked (rate limited)'
    )
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
      tier,
      remaining: 0,
    }
  }

  // Clear block if expired
  if (entry.blockedUntil) {
    entry.blockedUntil = undefined
  }

  // Cleanup old timestamps
  cleanupTimestamps(entry, config.windowMs)

  const limit = config[tier]

  // Check if over limit
  if (entry.timestamps.length >= limit) {
    entry.blockedUntil = now + config.blockDurationMs

    logger.warn(
      { socketId, eventName, tier, limit, count: entry.timestamps.length },
      'WebSocket rate limit exceeded, blocking socket'
    )

    return {
      allowed: false,
      retryAfter: Math.ceil(config.blockDurationMs / 1000),
      tier,
      remaining: 0,
    }
  }

  // Record this request
  entry.timestamps.push(now)

  const remaining = limit - entry.timestamps.length

  if (remaining <= 3) {
    logger.debug(
      { socketId, eventName, tier, remaining },
      'WebSocket rate limit warning (low remaining)'
    )
  }

  return {
    allowed: true,
    tier,
    remaining,
  }
}

/**
 * Create a Socket.io middleware for rate limiting
 */
export function createWebSocketRateLimitMiddleware(
  config: Partial<WebSocketRateLimitConfig> = {}
) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  return (socket: Socket, next: (err?: Error) => void) => {
    // On connection, initialize rate limit tracking
    const socketId = socket.id

    // Intercept all events for rate limiting
    const originalOnAny = socket.onAny.bind(socket)

    socket.onAny = (listener) => {
      return originalOnAny((eventName: string, ...args: unknown[]) => {
        // Skip internal socket.io events
        if (eventName.startsWith('socket.io')) {
          return listener(eventName, ...args)
        }

        const result = checkAndRecordRequest(socketId, eventName, finalConfig)

        if (!result.allowed) {
          socket.emit('error', {
            code: 'RATE_LIMITED',
            message: `Rate limit exceeded for ${result.tier} operations`,
            retryAfter: result.retryAfter,
            tier: result.tier,
          })
          return
        }

        // Pass through to actual handler
        return listener(eventName, ...args)
      })
    }

    // Cleanup on disconnect
    socket.on('disconnect', () => {
      socketRateLimits.delete(socketId)
    })

    next()
  }
}

/**
 * Cleanup rate limit data for a specific socket (call on disconnect)
 */
export function cleanupSocketRateLimit(socketId: string): void {
  socketRateLimits.delete(socketId)
}

/**
 * Get current rate limit stats for monitoring
 */
export function getRateLimitStats(): {
  totalSockets: number
  socketStats: Array<{
    socketId: string
    tiers: Record<RateLimitTier, { count: number; blocked: boolean }>
  }>
} {
  const stats: Array<{
    socketId: string
    tiers: Record<RateLimitTier, { count: number; blocked: boolean }>
  }> = []

  const now = Date.now()

  socketRateLimits.forEach((tierMap, socketId) => {
    const tiers: Record<RateLimitTier, { count: number; blocked: boolean }> = {
      read: { count: 0, blocked: false },
      write: { count: 0, blocked: false },
      critical: { count: 0, blocked: false },
    }

    tierMap.forEach((entry, tier) => {
      tiers[tier] = {
        count: entry.timestamps.length,
        blocked: !!(entry.blockedUntil && entry.blockedUntil > now),
      }
    })

    stats.push({ socketId, tiers })
  })

  return {
    totalSockets: socketRateLimits.size,
    socketStats: stats,
  }
}

export { DEFAULT_CONFIG as defaultWebSocketRateLimitConfig }
