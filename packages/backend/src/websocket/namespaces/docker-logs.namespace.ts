import { Server, Socket, Namespace } from 'socket.io'
import { SubscriptionManager } from '../../utils/subscription-manager'
import { dockerLogsService } from '../../services/docker-logs.service'
import { dockerService } from '../../services/docker.service'
import { containerRepository } from '../../repositories'
import { cleanupSocketRateLimit } from '../../middleware/websocket-rate-limit'
import { createChildLogger } from '../../utils/logger'
import type {
  DockerLogEntry,
  DockerLogsResponse,
  DockerLogsSubscribe,
  DockerLogsRequestHistory,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@devforge/shared'

const logger = createChildLogger({ service: 'docker-logs-namespace' })

/**
 * Extended socket interface with user data
 */
interface AuthenticatedSocket extends Socket {
  user?: {
    id: string
    email?: string
    role?: string
  }
}

/**
 * Subscription manager for docker-logs namespace
 */
const subscriptions = new SubscriptionManager<string>()

/**
 * Track batch mode per socket/container
 */
const batchModeMap = new Map<string, Set<string>>() // containerId -> Set of socketIds in batch mode

/**
 * Map of active Docker log streams (containerId -> cleanup function)
 */
const dockerLogStreams = new Map<string, () => void>()

/**
 * Rate limiter: track messages per second per client
 */
const clientRateLimits = new Map<string, { count: number; lastReset: number }>()
const MAX_MESSAGES_PER_SECOND = 100

/**
 * Reference to the namespace
 */
let dockerLogsNamespace: Namespace | null = null

/**
 * Check if client is rate limited
 */
function isClientRateLimited(socketId: string): boolean {
  const now = Date.now()
  let tracker = clientRateLimits.get(socketId)

  if (!tracker) {
    tracker = { count: 0, lastReset: now }
    clientRateLimits.set(socketId, tracker)
  }

  // Reset counter every second
  if (now - tracker.lastReset >= 1000) {
    tracker.count = 0
    tracker.lastReset = now
  }

  if (tracker.count >= MAX_MESSAGES_PER_SECOND) {
    return true
  }

  tracker.count++
  return false
}

/**
 * Get default 'since' timestamp (24h ago)
 */
function getDefaultSince(): Date {
  const since = new Date()
  since.setHours(since.getHours() - 24)
  return since
}

/**
 * Parse 'since' parameter to Date
 */
function parseSince(since?: string): Date {
  if (!since) {
    return getDefaultSince()
  }

  try {
    const date = new Date(since)
    if (isNaN(date.getTime())) {
      return getDefaultSince()
    }
    return date
  } catch {
    return getDefaultSince()
  }
}

/**
 * Add batch mode tracking for a socket/container
 */
function addBatchModeTracking(containerId: string, socketId: string): void {
  if (!batchModeMap.has(containerId)) {
    batchModeMap.set(containerId, new Set())
  }
  batchModeMap.get(containerId)?.add(socketId)
}

/**
 * Remove batch mode tracking for a socket/container
 */
function removeBatchModeTracking(containerId: string, socketId: string): void {
  const sockets = batchModeMap.get(containerId)
  if (sockets) {
    sockets.delete(socketId)
    if (sockets.size === 0) {
      batchModeMap.delete(containerId)
    }
  }
}

/**
 * Check if socket is in batch mode for a container
 */
function isSocketInBatchMode(containerId: string, socketId: string): boolean {
  return batchModeMap.get(containerId)?.has(socketId) ?? false
}

/**
 * Start log streaming for a container
 */
async function startLogStream(containerId: string): Promise<void> {
  if (dockerLogStreams.has(containerId)) {
    return // Already streaming
  }

  const container = await containerRepository.findById(containerId)
  if (!container?.dockerId) {
    logger.warn({ containerId }, 'Cannot start log stream: container not found')
    return
  }

  logger.info({ containerId, dockerId: container.dockerId }, 'Starting Docker log stream')

  const cleanup = dockerService.streamContainerLogs(
    container.dockerId,
    (line, stream, timestamp) => {
      // Persist to database
      const entry = dockerLogsService.addLog(containerId, stream, line, new Date(timestamp))

      if (!entry || !dockerLogsNamespace) {
        return
      }

      // Emit to subscribers
      const subscribers = subscriptions.get(containerId)
      if (!subscribers) {
        return
      }

      for (const socketId of subscribers) {
        // Check rate limit
        if (isClientRateLimited(socketId)) {
          continue
        }

        // Check batch mode
        if (isSocketInBatchMode(containerId, socketId)) {
          // Add to batch buffer - will be flushed by service
          dockerLogsService.addToBatchBuffer(containerId, entry)
        } else {
          // Emit immediately to this specific socket
          dockerLogsNamespace
            .to(socketId)
            .emit('docker:log' as any, entry)
        }
      }
    },
    { tail: 100 }
  )

  dockerLogStreams.set(containerId, cleanup)
}

/**
 * Stop log streaming for a container
 */
function stopLogStream(containerId: string): void {
  const cleanup = dockerLogStreams.get(containerId)
  if (cleanup) {
    cleanup()
    dockerLogStreams.delete(containerId)
    logger.info({ containerId }, 'Stopped Docker log stream')
  }
}

/**
 * Cleanup all subscriptions for a socket
 */
function cleanupSocketSubscriptions(socketId: string): string[] {
  const emptiedContainers = subscriptions.cleanupSocket(socketId)

  // Remove batch mode tracking
  for (const containerId of batchModeMap.keys()) {
    removeBatchModeTracking(containerId, socketId)
  }

  // Clean up rate limit tracker
  clientRateLimits.delete(socketId)

  // Stop streams for containers with no subscribers
  for (const containerId of emptiedContainers) {
    stopLogStream(containerId)
    dockerLogsService.clearBatchBuffer(containerId)
  }

  return emptiedContainers
}

/**
 * Setup /docker-logs namespace for Docker log streaming with persistence
 */
export function setupDockerLogsNamespace(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  dockerLogsNamespace = io.of('/docker-logs')

  // Listen for batch flush events from service
  dockerLogsService.on('log:batch:flush', ({ containerId, logs }) => {
    if (!dockerLogsNamespace) return

    const batchSockets = batchModeMap.get(containerId)
    if (!batchSockets || batchSockets.size === 0) return

    for (const socketId of batchSockets) {
      if (!isClientRateLimited(socketId)) {
        dockerLogsNamespace.to(socketId).emit('docker:logs:batch' as any, { containerId, logs })
      }
    }
  })

  dockerLogsNamespace.on('connection', (socket: AuthenticatedSocket) => {
    logger.debug({ socketId: socket.id, userId: socket.user?.id }, 'Client connected to /docker-logs')

    let currentContainerId: string | null = null

    /**
     * Subscribe to container logs
     */
    socket.on('subscribe', async (payload: DockerLogsSubscribe) => {
      const { containerId, since, batchMode } = payload

      // Verify container access
      const hasAccess = await dockerLogsService.verifyContainerAccess(
        containerId,
        socket.user?.id
      )

      if (!hasAccess) {
        socket.emit('error' as any, {
          code: 'ACCESS_DENIED',
          message: 'Container not found or access denied',
        })
        return
      }

      // Unsubscribe from previous container if any
      if (currentContainerId && currentContainerId !== containerId) {
        socket.leave(`docker-logs:${currentContainerId}`)
        subscriptions.remove(currentContainerId, socket.id)
        removeBatchModeTracking(currentContainerId, socket.id)

        // Stop stream if no more subscribers
        if (subscriptions.getCount(currentContainerId) === 0) {
          stopLogStream(currentContainerId)
        }
      }

      currentContainerId = containerId
      socket.join(`docker-logs:${containerId}`)
      subscriptions.add(containerId, socket.id)

      // Track batch mode
      if (batchMode) {
        addBatchModeTracking(containerId, socket.id)
      }

      logger.info(
        { socketId: socket.id, containerId, batchMode },
        'Client subscribed to Docker logs'
      )

      // Load historical logs from database
      const sinceDate = parseSince(since)
      const history = dockerLogsService.getLogsSince(containerId, sinceDate)

      // Emit history to the client
      socket.emit('docker:logs:history' as any, history)

      // Start real-time streaming if this is the first subscriber
      if (subscriptions.getCount(containerId) === 1) {
        await startLogStream(containerId)
      }
    })

    /**
     * Unsubscribe from container logs
     */
    socket.on('unsubscribe', (payload: { containerId: string }) => {
      const { containerId } = payload

      socket.leave(`docker-logs:${containerId}`)
      const isEmpty = subscriptions.remove(containerId, socket.id)
      removeBatchModeTracking(containerId, socket.id)

      if (currentContainerId === containerId) {
        currentContainerId = null
      }

      logger.debug({ socketId: socket.id, containerId }, 'Client unsubscribed from Docker logs')

      // Stop stream if no more subscribers
      if (isEmpty) {
        stopLogStream(containerId)
        dockerLogsService.clearBatchBuffer(containerId)
      }
    })

    /**
     * Request historical logs
     */
    socket.on('request-history', async (payload: DockerLogsRequestHistory) => {
      const { containerId, since, limit } = payload

      // Verify container access
      const hasAccess = await dockerLogsService.verifyContainerAccess(
        containerId,
        socket.user?.id
      )

      if (!hasAccess) {
        socket.emit('error' as any, {
          code: 'ACCESS_DENIED',
          message: 'Container not found or access denied',
        })
        return
      }

      const sinceDate = parseSince(since)
      let history: DockerLogsResponse

      if (limit) {
        history = dockerLogsService.getLogs(containerId, {
          limit,
          since: sinceDate,
        })
      } else {
        history = dockerLogsService.getLogsSince(containerId, sinceDate)
      }

      socket.emit('docker:logs:history' as any, history)
    })

    /**
     * Handle disconnect
     */
    socket.on('disconnect', () => {
      cleanupSocketSubscriptions(socket.id)
      cleanupSocketRateLimit(socket.id)
      logger.debug({ socketId: socket.id }, 'Client disconnected from /docker-logs')
    })
  })
}

/**
 * Emit a single Docker log entry to subscribers
 */
export function emitDockerLog(containerId: string, log: DockerLogEntry): void {
  if (!dockerLogsNamespace) return

  const subscribers = subscriptions.get(containerId)
  if (!subscribers) return

  for (const socketId of subscribers) {
    if (!isClientRateLimited(socketId) && !isSocketInBatchMode(containerId, socketId)) {
      dockerLogsNamespace.to(socketId).emit('docker:log' as any, log)
    }
  }
}

/**
 * Emit a batch of Docker log entries to batch-mode subscribers
 */
export function emitDockerLogsBatch(containerId: string, logs: DockerLogEntry[]): void {
  if (!dockerLogsNamespace) return

  const batchSockets = batchModeMap.get(containerId)
  if (!batchSockets || batchSockets.size === 0) return

  for (const socketId of batchSockets) {
    if (!isClientRateLimited(socketId)) {
      dockerLogsNamespace.to(socketId).emit('docker:logs:batch' as any, { containerId, logs })
    }
  }
}

/**
 * Get list of socket IDs subscribed to a container's logs
 */
export function getDockerLogsSubscribers(containerId: string): string[] {
  const sockets = subscriptions.get(containerId)
  return sockets ? Array.from(sockets) : []
}

/**
 * Get all active subscriptions count by container
 */
export function getAllDockerLogsSubscriptions(): Map<string, number> {
  return subscriptions.getAllCounts()
}
