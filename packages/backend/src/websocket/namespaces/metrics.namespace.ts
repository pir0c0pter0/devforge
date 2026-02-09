import { Server, Socket } from 'socket.io'
import { SubscriptionManager } from '../../utils/subscription-manager'
import { metricsService } from '../../services/metrics.service'
import { containerRepository } from '../../repositories'
import { cleanupSocketRateLimit } from '../../middleware/websocket-rate-limit'
import { validateContainerId } from '../../utils/validation'
import { createChildLogger } from '../../utils/logger'
import { ResourceDefaults } from '../../config/resources.config'
import type {
  ContainerMetrics,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@devforge/shared'

const logger = createChildLogger({ namespace: 'metrics' })

/**
 * Subscription manager for metrics namespace
 */
const subscriptions = new SubscriptionManager<string>()

/**
 * Map of active metrics collection intervals (containerId -> intervalId)
 */
const metricsIntervals = new Map<string, NodeJS.Timeout>()

/**
 * Default metrics collection interval in milliseconds
 */
const METRICS_INTERVAL_MS = 2000

/**
 * Reference to the metrics namespace
 */
let metricsNamespace: ReturnType<Server<ClientToServerEvents, ServerToClientEvents>['of']> | null = null

/**
 * Start metrics collection for a container
 */
const startMetricsCollection = async (containerId: string): Promise<void> => {
  // Already collecting for this container
  if (metricsIntervals.has(containerId)) return

  // Get container's dockerId from repository
  const container = await containerRepository.findById(containerId)
  if (!container || !container.dockerId) {
    logger.warn({ containerId }, 'Cannot start metrics collection: container not found')
    return
  }

  const dockerId = container.dockerId

  logger.info({ containerId }, 'Starting metrics collection for container')

  // Collect and emit immediately
  collectAndEmitMetrics(containerId, dockerId, container.diskLimit || ResourceDefaults.DISK_MB)

  // Then set up interval
  const intervalId = setInterval(() => {
    collectAndEmitMetrics(containerId, dockerId, container.diskLimit || ResourceDefaults.DISK_MB)
  }, METRICS_INTERVAL_MS)

  metricsIntervals.set(containerId, intervalId)
}

/**
 * Stop metrics collection for a container
 */
const stopMetricsCollection = (containerId: string): void => {
  const intervalId = metricsIntervals.get(containerId)
  if (intervalId) {
    clearInterval(intervalId)
    metricsIntervals.delete(containerId)
    logger.info({ containerId }, 'Stopped metrics collection for container')
  }
}

/**
 * Collect and emit metrics for a container
 */
const collectAndEmitMetrics = async (
  containerId: string,
  dockerId: string,
  diskLimitMB: number
): Promise<void> => {
  try {
    const metrics = await metricsService.getContainerMetrics(dockerId)

    // Apply disk limit from container config
    if (diskLimitMB > 0) {
      metrics.disk.limit = diskLimitMB
      metrics.disk.percentage = Number(((metrics.disk.usage / diskLimitMB) * 100).toFixed(2))
    }

    // Update containerId to use our internal ID
    metrics.containerId = containerId

    emitContainerMetrics(containerId, metrics)
  } catch (error) {
    logger.error({ containerId, err: error }, 'Failed to collect metrics')
  }
}

/**
 * Setup /metrics namespace for real-time container metrics
 */
export function setupMetricsNamespace(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  metricsNamespace = io.of('/metrics')

  metricsNamespace.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Client connected to /metrics')

    socket.on('subscribe:container', async (rawContainerId: string) => {
      // QA-H4: Validate containerId
      const containerId = validateContainerId(rawContainerId)
      if (!containerId) {
        socket.emit('error', { message: 'Invalid container ID format' })
        return
      }
      socket.join(`container:${containerId}`)
      subscriptions.add(containerId, socket.id)
      logger.info({ socketId: socket.id, containerId }, 'Client subscribed to metrics')

      // Start metrics collection if this is the first subscriber
      const subscriberCount = subscriptions.getCount(containerId)
      if (subscriberCount === 1) {
        await startMetricsCollection(containerId)
      }
    })

    socket.on('unsubscribe:container', (rawContainerId: string) => {
      const containerId = validateContainerId(rawContainerId)
      if (!containerId) return
      socket.leave(`container:${containerId}`)
      const isEmpty = subscriptions.remove(containerId, socket.id)
      logger.info({ socketId: socket.id, containerId }, 'Client unsubscribed from metrics')

      // Stop metrics collection if no more subscribers
      if (isEmpty) {
        stopMetricsCollection(containerId)
      }
    })

    socket.on('disconnect', () => {
      // Cleanup subscriptions and stop metrics for containers with no more subscribers
      const emptiedContainers = subscriptions.cleanupSocket(socket.id)
      for (const containerId of emptiedContainers) {
        stopMetricsCollection(containerId)
      }

      cleanupSocketRateLimit(socket.id)
      logger.info({ socketId: socket.id }, 'Client disconnected from /metrics')
    })
  })
}

/**
 * Emit container metrics to subscribers
 */
export function emitContainerMetrics(containerId: string, metrics: ContainerMetrics): void {
  if (!metricsNamespace) return
  metricsNamespace.to(`container:${containerId}`).emit('container:metrics', metrics)
}

/**
 * Get active subscriptions for a container
 */
export function getContainerSubscribers(containerId: string): number {
  return subscriptions.getCount(containerId)
}

/**
 * Get all active subscriptions
 */
export function getAllSubscriptions(): Map<string, number> {
  return subscriptions.getAllCounts()
}
