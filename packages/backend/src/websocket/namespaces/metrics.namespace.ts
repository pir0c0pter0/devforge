import { Server, Socket } from 'socket.io'
import { SubscriptionManager } from '../../utils/subscription-manager'
import { metricsService } from '../../services/metrics.service'
import { containerRepository } from '../../repositories'
import { cleanupSocketRateLimit } from '../../middleware/websocket-rate-limit'
import type {
  ContainerMetrics,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@claude-docker/shared'

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
    console.warn(`[WebSocket] Cannot start metrics collection: container ${containerId} not found`)
    return
  }

  const dockerId = container.dockerId

  console.info(`[WebSocket] Starting metrics collection for container ${containerId}`)

  // Collect and emit immediately
  collectAndEmitMetrics(containerId, dockerId, container.diskLimit || 10240)

  // Then set up interval
  const intervalId = setInterval(() => {
    collectAndEmitMetrics(containerId, dockerId, container.diskLimit || 10240)
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
    console.info(`[WebSocket] Stopped metrics collection for container ${containerId}`)
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
    console.error(`[WebSocket] Failed to collect metrics for ${containerId}:`, error)
  }
}

/**
 * Setup /metrics namespace for real-time container metrics
 */
export function setupMetricsNamespace(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  metricsNamespace = io.of('/metrics')

  metricsNamespace.on('connection', (socket: Socket) => {
    console.info(`[WebSocket] Client connected to /metrics: ${socket.id}`)

    socket.on('subscribe:container', async (containerId: string) => {
      socket.join(`container:${containerId}`)
      subscriptions.add(containerId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} subscribed to container ${containerId}`)

      // Start metrics collection if this is the first subscriber
      const subscriberCount = subscriptions.getCount(containerId)
      if (subscriberCount === 1) {
        await startMetricsCollection(containerId)
      }
    })

    socket.on('unsubscribe:container', (containerId: string) => {
      socket.leave(`container:${containerId}`)
      const isEmpty = subscriptions.remove(containerId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} unsubscribed from container ${containerId}`)

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
      console.info(`[WebSocket] Client disconnected from /metrics: ${socket.id}`)
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
