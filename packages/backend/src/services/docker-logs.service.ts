import { EventEmitter } from 'events'
import { createChildLogger } from '../utils/logger'
import { dockerLogsRepository, containerRepository } from '../repositories'
import type {
  DockerLogEntry,
  DockerLogsResponse,
  DockerLogStats,
  DockerLogStream,
} from '@devforge/shared'

const logger = createChildLogger({ service: 'docker-logs' })

/**
 * Configuration for Docker logs service
 */
const CONFIG = {
  /** Maximum logs per container in memory cache */
  MEMORY_CACHE_SIZE: 200,
  /** Retention time in hours for database cleanup */
  RETENTION_HOURS: 24,
  /** Cleanup interval in milliseconds (30 minutes) */
  CLEANUP_INTERVAL_MS: 30 * 60 * 1000,
  /** Batch interval for batch mode (milliseconds) */
  BATCH_INTERVAL_MS: 500,
  /** Rate limit: max messages per second per container */
  MAX_MESSAGES_PER_SECOND: 100,
}

/**
 * Memory cache entry for a container's logs
 */
interface MemoryCache {
  entries: DockerLogEntry[]
  lastUpdated: Date
}

/**
 * Batch buffer for a container
 */
interface BatchBuffer {
  logs: DockerLogEntry[]
  timer: NodeJS.Timeout | null
}

/**
 * Rate limit tracker for a container
 */
interface RateLimitTracker {
  count: number
  lastReset: number
}

/**
 * DockerLogsService manages Docker container logs with database persistence
 *
 * Features:
 * - SQLite persistence for historical logs
 * - Memory cache for fast WebSocket streaming
 * - Batch mode for high-volume logging
 * - Rate limiting per container
 * - Automatic cleanup of old logs
 */
class DockerLogsService extends EventEmitter {
  /** Memory cache for recent logs */
  private memoryCache: Map<string, MemoryCache> = new Map()

  /** Batch buffers for containers in batch mode */
  private batchBuffers: Map<string, BatchBuffer> = new Map()

  /** Rate limit trackers per container */
  private rateLimitTrackers: Map<string, RateLimitTracker> = new Map()

  /** Cleanup timer */
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.startCleanupTimer()
    logger.info('DockerLogsService initialized with SQLite persistence')
  }

  /**
   * Add a new log entry for a container
   */
  addLog(
    containerId: string,
    stream: DockerLogStream,
    content: string,
    timestamp?: Date
  ): DockerLogEntry | null {
    // Skip empty content
    if (!content || !content.trim()) {
      return null
    }

    // Check rate limit
    if (!this.checkRateLimit(containerId)) {
      logger.debug(
        { containerId },
        'Docker log rate limited, dropping entry'
      )
      return null
    }

    // Persist to database
    let dbEntry
    try {
      dbEntry = dockerLogsRepository.create({
        containerId,
        stream,
        content,
      })
    } catch (error) {
      logger.error({ containerId, error }, 'Failed to persist Docker log')
      return null
    }

    const entry: DockerLogEntry = {
      id: dbEntry.id,
      containerId: dbEntry.containerId,
      stream: dbEntry.stream,
      logType: dbEntry.logType,
      content: dbEntry.content,
      recordedAt: timestamp || dbEntry.recordedAt,
    }

    // Add to memory cache
    this.addToMemoryCache(containerId, entry)

    // Emit event for real-time streaming
    this.emit('log:new', { containerId, entry })

    logger.debug(
      { containerId, stream, entryId: entry.id },
      'Docker log added'
    )

    return entry
  }

  /**
   * Add multiple log entries in batch (more efficient for high-volume logging)
   */
  addLogs(
    containerId: string,
    logs: Array<{ stream: DockerLogStream; content: string; timestamp?: string }>
  ): DockerLogEntry[] {
    const results: DockerLogEntry[] = []
    const toInsert: Array<{
      containerId: string
      stream: DockerLogStream
      content: string
    }> = []

    for (const log of logs) {
      // Skip empty content
      if (!log.content || !log.content.trim()) {
        continue
      }

      // Check rate limit for each entry
      if (!this.checkRateLimit(containerId)) {
        logger.debug({ containerId }, 'Docker log batch rate limited')
        break
      }

      toInsert.push({
        containerId,
        stream: log.stream,
        content: log.content,
      })
    }

    // Batch insert
    if (toInsert.length > 0) {
      try {
        dockerLogsRepository.createBatch(toInsert)
        // Fetch inserted entries (with IDs)
        const recent = dockerLogsRepository.getRecentLogs(containerId, toInsert.length)
        for (const entity of recent.slice(-toInsert.length)) {
          const entry: DockerLogEntry = {
            id: entity.id,
            containerId: entity.containerId,
            stream: entity.stream,
            logType: entity.logType,
            content: entity.content,
            recordedAt: entity.recordedAt,
          }
          results.push(entry)
          this.addToMemoryCache(containerId, entry)
        }
      } catch (error) {
        logger.error(
          { containerId, count: toInsert.length, error },
          'Failed to persist Docker log batch'
        )
      }
    }

    // Emit batch event
    if (results.length > 0) {
      this.emit('log:batch', { containerId, entries: results })
    }

    return results
  }

  /**
   * Add log to batch buffer (for batch mode subscribers)
   */
  addToBatchBuffer(containerId: string, entry: DockerLogEntry): void {
    let buffer = this.batchBuffers.get(containerId)

    if (!buffer) {
      buffer = {
        logs: [],
        timer: null,
      }
      this.batchBuffers.set(containerId, buffer)
    }

    buffer.logs.push(entry)

    // Start flush timer if not already running
    if (!buffer.timer) {
      buffer.timer = setTimeout(() => {
        this.flushBatchBuffer(containerId)
      }, CONFIG.BATCH_INTERVAL_MS)
    }
  }

  /**
   * Flush batch buffer and emit batch event
   */
  flushBatchBuffer(containerId: string): void {
    const buffer = this.batchBuffers.get(containerId)
    if (!buffer || buffer.logs.length === 0) {
      return
    }

    const logs = [...buffer.logs]
    buffer.logs = []

    if (buffer.timer) {
      clearTimeout(buffer.timer)
      buffer.timer = null
    }

    this.emit('log:batch:flush', { containerId, logs })
  }

  /**
   * Clear batch buffer for a container
   */
  clearBatchBuffer(containerId: string): void {
    const buffer = this.batchBuffers.get(containerId)
    if (buffer) {
      if (buffer.timer) {
        clearTimeout(buffer.timer)
      }
      this.batchBuffers.delete(containerId)
    }
  }

  /**
   * Get logs from database with optional filters
   */
  getLogs(
    containerId: string,
    options?: {
      limit?: number
      offset?: number
      since?: Date
      stream?: DockerLogStream
    }
  ): DockerLogsResponse {
    try {
      const result = dockerLogsRepository.getContainerLogs(containerId, {
        limit: options?.limit ?? 500,
        offset: options?.offset ?? 0,
        since: options?.since,
        stream: options?.stream,
      })

      const logs: DockerLogEntry[] = result.logs.map((entity) => ({
        id: entity.id,
        containerId: entity.containerId,
        stream: entity.stream,
        logType: entity.logType,
        content: entity.content,
        recordedAt: entity.recordedAt,
      }))

      return {
        logs,
        total: result.total,
        hasMore: result.hasMore,
      }
    } catch (error) {
      logger.error({ containerId, error }, 'Failed to load Docker logs')
      return {
        logs: [],
        total: 0,
        hasMore: false,
      }
    }
  }

  /**
   * Get recent logs for initial load (last 24 hours by default)
   */
  getRecentLogs(containerId: string, limit: number = 500): DockerLogsResponse {
    try {
      const logs = dockerLogsRepository.getRecentLogs(containerId, limit)
      const total = dockerLogsRepository.count({ containerId })

      return {
        logs: logs.map((entity) => ({
          id: entity.id,
          containerId: entity.containerId,
          stream: entity.stream,
          logType: entity.logType,
          content: entity.content,
          recordedAt: entity.recordedAt,
        })),
        total,
        hasMore: total > limit,
      }
    } catch (error) {
      logger.error({ containerId, error }, 'Failed to load recent Docker logs')
      return {
        logs: [],
        total: 0,
        hasMore: false,
      }
    }
  }

  /**
   * Get logs since a specific timestamp (for initial subscription load)
   */
  getLogsSince(containerId: string, since: Date): DockerLogsResponse {
    try {
      const logs = dockerLogsRepository.findSince(containerId, since)

      return {
        logs: logs.map((entity) => ({
          id: entity.id,
          containerId: entity.containerId,
          stream: entity.stream,
          logType: entity.logType,
          content: entity.content,
          recordedAt: entity.recordedAt,
        })),
        total: logs.length,
        hasMore: false,
      }
    } catch (error) {
      logger.error({ containerId, since, error }, 'Failed to load Docker logs since timestamp')
      return {
        logs: [],
        total: 0,
        hasMore: false,
      }
    }
  }

  /**
   * Get log statistics for a container
   */
  getStats(containerId: string): DockerLogStats {
    try {
      const stats = dockerLogsRepository.getStats(containerId)

      return {
        totalLogs: stats.total,
        stdoutCount: stats.byStream.stdout,
        stderrCount: stats.byStream.stderr,
        byType: stats.byType,
        oldestLog: stats.oldestLog || null,
        newestLog: stats.newestLog || null,
        sizeBytes: 0, // TODO: Calculate actual size if needed
      }
    } catch (error) {
      logger.error({ containerId, error }, 'Failed to get Docker log stats')
      return {
        totalLogs: 0,
        stdoutCount: 0,
        stderrCount: 0,
        byType: { build: 0, runtime: 0, error: 0, warning: 0, info: 0 },
        oldestLog: null,
        newestLog: null,
        sizeBytes: 0,
      }
    }
  }

  /**
   * Clear all logs for a container
   */
  clearLogs(containerId: string): number {
    try {
      const count = dockerLogsRepository.deleteByContainerId(containerId)

      // Clear memory cache
      this.memoryCache.delete(containerId)

      // Clear batch buffer
      this.clearBatchBuffer(containerId)

      logger.info({ containerId, count }, 'Docker logs cleared')

      this.emit('log:cleared', { containerId, count })

      return count
    } catch (error) {
      logger.error({ containerId, error }, 'Failed to clear Docker logs')
      return 0
    }
  }

  /**
   * Verify container ownership for a socket user
   * For now, this returns true as ownership is managed at container level
   * In the future, this could check user permissions
   */
  async verifyContainerAccess(
    containerId: string,
    _userId?: string
  ): Promise<boolean> {
    // Check if container exists
    const container = await containerRepository.findById(containerId)
    if (!container) {
      return false
    }

    // TODO: Add user-based access control when implemented
    // For now, any authenticated user can access any container
    return true
  }

  /**
   * Check rate limit for a container
   */
  private checkRateLimit(containerId: string): boolean {
    const now = Date.now()
    let tracker = this.rateLimitTrackers.get(containerId)

    if (!tracker) {
      tracker = { count: 0, lastReset: now }
      this.rateLimitTrackers.set(containerId, tracker)
    }

    // Reset counter every second
    if (now - tracker.lastReset >= 1000) {
      tracker.count = 0
      tracker.lastReset = now
    }

    if (tracker.count >= CONFIG.MAX_MESSAGES_PER_SECOND) {
      return false
    }

    tracker.count++
    return true
  }

  /**
   * Add entry to memory cache
   */
  private addToMemoryCache(containerId: string, entry: DockerLogEntry): void {
    let cache = this.memoryCache.get(containerId)

    if (!cache) {
      cache = {
        entries: [],
        lastUpdated: new Date(),
      }
      this.memoryCache.set(containerId, cache)
    }

    cache.entries.push(entry)
    cache.lastUpdated = new Date()

    // Keep only recent entries
    if (cache.entries.length > CONFIG.MEMORY_CACHE_SIZE) {
      cache.entries = cache.entries.slice(-CONFIG.MEMORY_CACHE_SIZE)
    }
  }

  /**
   * Run cleanup of old logs
   */
  private runCleanup(): void {
    try {
      // Delete logs older than retention period
      const deleted = dockerLogsRepository.deleteOlderThan(CONFIG.RETENTION_HOURS)

      if (deleted > 0) {
        logger.info(
          { deleted, retentionHours: CONFIG.RETENTION_HOURS },
          'Old Docker logs removed'
        )
      }

      // Clean up memory cache for inactive containers
      const now = Date.now()
      const cacheTimeout = CONFIG.CLEANUP_INTERVAL_MS * 2 // 1 hour

      for (const [containerId, cache] of this.memoryCache.entries()) {
        if (now - cache.lastUpdated.getTime() > cacheTimeout) {
          this.memoryCache.delete(containerId)
          logger.debug({ containerId }, 'Memory cache removed due to inactivity')
        }
      }

      // Clean up rate limit trackers
      for (const [containerId, tracker] of this.rateLimitTrackers.entries()) {
        if (now - tracker.lastReset > 60000) {
          this.rateLimitTrackers.delete(containerId)
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed during Docker logs cleanup')
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      logger.debug('Running scheduled Docker logs cleanup')
      this.runCleanup()
    }, CONFIG.CLEANUP_INTERVAL_MS)

    // Don't prevent shutdown
    this.cleanupTimer.unref()
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * Destroy service and clean up resources
   */
  destroy(): void {
    this.stopCleanupTimer()

    // Clear all batch buffers
    for (const containerId of this.batchBuffers.keys()) {
      this.clearBatchBuffer(containerId)
    }

    this.memoryCache.clear()
    this.rateLimitTrackers.clear()
    this.removeAllListeners()

    logger.info('DockerLogsService destroyed')
  }
}

/**
 * Singleton instance
 */
export const dockerLogsService = new DockerLogsService()

/**
 * Export class for testing
 */
export { DockerLogsService }
