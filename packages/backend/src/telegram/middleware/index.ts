/**
 * Telegram Bot Middleware
 *
 * This module exports all middleware for the Telegram bot:
 * - auth: User ID whitelist authentication
 * - rate-limit: Per-user rate limiting with tiers
 * - session: In-memory session management
 */

// Authentication middleware
export {
  authMiddleware,
  parseAllowedUsers,
} from './auth.middleware'

// Rate limiting middleware
export {
  rateLimitMiddleware,
  readRateLimit,
  writeRateLimit,
  criticalRateLimit,
  startRateLimitCleanup,
  stopRateLimitCleanup,
  clearRateLimits,
  getRateLimitStatus,
  type RateLimitTier,
} from './rate-limit.middleware'

// Session middleware
export {
  sessionMiddleware,
  startSessionCleanup,
  stopSessionCleanup,
  clearSessions,
  getSessionCount,
  getSession,
  getAllSessions,
  selectContainer,
  clearContainerSelection,
  getSelectedContainer,
  type SessionConfig,
} from './session.middleware'
