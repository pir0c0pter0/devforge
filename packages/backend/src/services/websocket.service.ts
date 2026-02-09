import { Server as HttpServer } from 'http'
import { Server, Socket, Namespace } from 'socket.io'
import { createWebSocketRateLimitMiddleware, cleanupSocketRateLimit } from '../middleware/websocket-rate-limit'
import { authenticateWebSocket } from '../middleware/auth.middleware'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  ContainerMetrics,
  InstructionEventData,
  ContainerStatusEventData,
  ContainerCreationProgress,
  TaskEventPayload,
  TaskSubscription,
  TaskUnsubscription,
  TaskBatchSubscription,
} from '@devforge/shared'
import { config } from '../config'
import { createChildLogger } from '../utils/logger'

const logger = createChildLogger({ service: 'websocket' })

/**
 * Extended Socket interface with authenticated user data
 */
interface AuthenticatedSocket extends Socket {
  user?: {
    id: string
    email?: string
    role?: string
  }
}

/**
 * JWT Authentication middleware for WebSocket connections
 * Validates JWT token from handshake auth or query params
 * Rejects unauthenticated connections when JWT_SECRET is configured
 */
const createWebSocketAuthMiddleware = () => {
  return (socket: Socket, next: (err?: Error) => void) => {
    // Extract token from auth object or query params
    const token = socket.handshake.auth?.['token'] ||
                  socket.handshake.query?.['token'] as string ||
                  socket.handshake.headers?.authorization?.replace('Bearer ', '')

    // If no token provided
    if (!token) {
      // Check if authentication is required (JWT_SECRET configured)
      const jwtSecret = process.env['JWT_SECRET']
      if (jwtSecret) {
        logger.warn(`[WebSocket] Connection rejected: no token provided (socket: ${socket.id})`)
        return next(new Error('Authentication required'))
      }
      // Auth disabled - allow anonymous connections with anonymous user marker
      socket.data.user = { id: 'anonymous', role: 'admin' }
      logger.debug(`[WebSocket] Anonymous connection allowed (JWT_SECRET not configured)`)
      return next()
    }

    // Validate token
    const user = authenticateWebSocket(token)

    if (!user) {
      logger.warn(`[WebSocket] Connection rejected: invalid token (socket: ${socket.id})`)
      return next(new Error('Invalid or expired token'))
    }

    // Attach user data to socket.data (used by namespace handlers)
    socket.data.user = user
    logger.debug({ userId: user.id }, `[WebSocket] Authenticated connection: ${socket.id}`)

    next()
  }
}

/**
 * Apply authentication middleware to a namespace
 */
const applyAuthMiddleware = (namespace: Namespace): void => {
  namespace.use(createWebSocketAuthMiddleware())
}

// Import extracted namespace modules
import {
  setupMetricsNamespace as setupMetricsNamespaceModule,
  emitContainerMetrics as emitContainerMetricsModule,
} from '../websocket/namespaces'
import {
  setupTerminalNamespace as setupTerminalNamespaceModule,
} from '../websocket/namespaces'
import {
  setupClaudeDaemonNamespace as setupClaudeDaemonNamespaceModule,
  emitClaudeEvent as emitClaudeEventModule,
} from '../websocket/namespaces'
import {
  setupDockerLogsNamespace as setupDockerLogsNamespaceModule,
} from '../websocket/namespaces'

import { healthMonitorService } from './health-monitor.service'

/**
 * Socket.io server instance
 */
let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null

/**
 * Map of container subscriptions (containerId -> Set of socket IDs)
 * Used by /queue, /logs namespaces
 */
const subscriptions = new Map<string, Set<string>>()

/**
 * Initialize Socket.io server
 */
export const initializeWebSocket = (
  httpServer: HttpServer
): Server<ClientToServerEvents, ServerToClientEvents> => {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (same-origin, curl, etc.)
        if (!origin) {
          callback(null, true)
          return
        }
        // Check if origin is in the allowed list
        if (config.allowedOrigins.includes(origin)) {
          callback(null, true)
          return
        }
        callback(new Error(`Origin ${origin} not allowed by CORS policy`))
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  // Apply authentication middleware first (validates JWT)
  io.use(createWebSocketAuthMiddleware())

  // Apply rate limiting middleware
  io.use(createWebSocketRateLimitMiddleware())

  // Setup extracted modular namespaces (pass io instance)
  setupMetricsNamespaceModule(io)
  setupTerminalNamespaceModule(io)
  setupClaudeDaemonNamespaceModule(io)
  setupDockerLogsNamespaceModule(io)

  // Apply auth middleware to extracted namespaces (io.use() only covers default namespace)
  applyAuthMiddleware(io.of('/metrics'))
  applyAuthMiddleware(io.of('/terminal'))
  applyAuthMiddleware(io.of('/claude-daemon'))
  applyAuthMiddleware(io.of('/docker-logs'))

  // Setup namespaces that remain in this file
  setupQueueNamespace()
  setupLogsNamespace()
  setupCreationNamespace()
  setupTasksNamespace()

  // Initialize health monitor event emitter
  healthMonitorService.setEventEmitter(emitClaudeEventModule)

  logger.debug('[WebSocket] Server initialized successfully')

  return io
}

/**
 * Setup /queue namespace for instruction queue updates
 */
const setupQueueNamespace = (): void => {
  if (!io) return

  const queueNamespace = io.of('/queue')

  // Apply authentication middleware to namespace
  applyAuthMiddleware(queueNamespace)

  queueNamespace.on('connection', (socket: AuthenticatedSocket) => {
    logger.debug(`[WebSocket] Client connected to /queue: ${socket.id}`)

    socket.on('subscribe:container', (containerId: string) => {
      socket.join(`container:${containerId}`)
      addSubscription(containerId, socket.id)
      logger.debug(`[WebSocket] Client ${socket.id} subscribed to queue ${containerId}`)
    })

    socket.on('unsubscribe:container', (containerId: string) => {
      socket.leave(`container:${containerId}`)
      removeSubscription(containerId, socket.id)
      logger.debug(`[WebSocket] Client ${socket.id} unsubscribed from queue ${containerId}`)
    })

    socket.on('instruction:confirm', (instructionId: string, approved: boolean) => {
      logger.debug(
        `[WebSocket] Instruction ${instructionId} ${approved ? 'approved' : 'rejected'}`
      )
      // This will be handled by the worker
      queueNamespace
        .to(`instruction:${instructionId}`)
        .emit('instruction:confirmed', { instructionId, approved })
    })

    socket.on('disconnect', () => {
      cleanupSocketSubscriptions(socket.id)
      cleanupSocketRateLimit(socket.id)
      logger.debug(`[WebSocket] Client disconnected from /queue: ${socket.id}`)
    })
  })
}

/**
 * Setup /logs namespace for container log streaming
 */
const setupLogsNamespace = (): void => {
  if (!io) return

  const logsNamespace = io.of('/logs')

  // Apply authentication middleware to namespace
  applyAuthMiddleware(logsNamespace)

  logsNamespace.on('connection', (socket: AuthenticatedSocket) => {
    logger.debug(`[WebSocket] Client connected to /logs: ${socket.id}`)

    socket.on('subscribe:container', (containerId: string) => {
      socket.join(`container:${containerId}`)
      addSubscription(containerId, socket.id)
      logger.debug(`[WebSocket] Client ${socket.id} subscribed to logs ${containerId}`)
    })

    socket.on('unsubscribe:container', (containerId: string) => {
      socket.leave(`container:${containerId}`)
      removeSubscription(containerId, socket.id)
      logger.debug(`[WebSocket] Client ${socket.id} unsubscribed from logs ${containerId}`)
    })

    socket.on('disconnect', () => {
      cleanupSocketSubscriptions(socket.id)
      cleanupSocketRateLimit(socket.id)
      logger.debug(`[WebSocket] Client disconnected from /logs: ${socket.id}`)
    })
  })
}

/**
 * Setup /creation namespace for container creation progress updates
 */
const setupCreationNamespace = (): void => {
  if (!io) return

  const creationNamespace = io.of('/creation')

  // Apply authentication middleware to namespace
  applyAuthMiddleware(creationNamespace)

  creationNamespace.on('connection', (socket: AuthenticatedSocket) => {
    logger.debug(`[WebSocket] Client connected to /creation: ${socket.id}`)

    socket.on('subscribe:task', (taskId: string) => {
      socket.join(`task:${taskId}`)
      logger.debug(`[WebSocket] Client ${socket.id} subscribed to task ${taskId}`)
    })

    socket.on('unsubscribe:task', (taskId: string) => {
      socket.leave(`task:${taskId}`)
      logger.debug(`[WebSocket] Client ${socket.id} unsubscribed from task ${taskId}`)
    })

    socket.on('disconnect', () => {
      cleanupSocketRateLimit(socket.id)
      logger.debug(`[WebSocket] Client disconnected from /creation: ${socket.id}`)
    })
  })
}

/**
 * Map of task subscriptions (taskId -> Set of socket IDs)
 */
const taskSubscriptions = new Map<string, Set<string>>()

/**
 * Add task subscription tracking
 */
const addTaskSubscription = (taskId: string, socketId: string): void => {
  if (!taskSubscriptions.has(taskId)) {
    taskSubscriptions.set(taskId, new Set())
  }
  taskSubscriptions.get(taskId)?.add(socketId)
}

/**
 * Remove task subscription tracking
 */
const removeTaskSubscription = (taskId: string, socketId: string): void => {
  const subs = taskSubscriptions.get(taskId)
  if (subs) {
    subs.delete(socketId)
    if (subs.size === 0) {
      taskSubscriptions.delete(taskId)
    }
  }
}

/**
 * Cleanup all task subscriptions for a socket
 */
const cleanupSocketTaskSubscriptions = (socketId: string): void => {
  for (const [taskId, sockets] of taskSubscriptions.entries()) {
    sockets.delete(socketId)
    if (sockets.size === 0) {
      taskSubscriptions.delete(taskId)
    }
  }
}

/**
 * Setup /tasks namespace for real-time task updates
 */
const setupTasksNamespace = (): void => {
  if (!io) return

  const tasksNamespace = io.of('/tasks')

  // Apply authentication middleware to namespace
  applyAuthMiddleware(tasksNamespace)

  tasksNamespace.on('connection', (socket: AuthenticatedSocket) => {
    logger.debug(`[WebSocket] Client connected to /tasks: ${socket.id}`)

    socket.on('task:subscribe', (subscription: TaskSubscription) => {
      const { taskId } = subscription
      socket.join(`task:${taskId}`)
      addTaskSubscription(taskId, socket.id)
      logger.debug(`[WebSocket] Client ${socket.id} subscribed to task ${taskId}`)
    })

    socket.on('task:unsubscribe', (unsubscription: TaskUnsubscription) => {
      const { taskId } = unsubscription
      socket.leave(`task:${taskId}`)
      removeTaskSubscription(taskId, socket.id)
      logger.debug(`[WebSocket] Client ${socket.id} unsubscribed from task ${taskId}`)
    })

    socket.on('task:subscribe:batch', (subscription: TaskBatchSubscription) => {
      const { taskIds } = subscription
      for (const taskId of taskIds) {
        socket.join(`task:${taskId}`)
        addTaskSubscription(taskId, socket.id)
      }
      logger.debug(
        `[WebSocket] Client ${socket.id} batch subscribed to ${taskIds.length} tasks`
      )
    })

    socket.on('disconnect', () => {
      cleanupSocketTaskSubscriptions(socket.id)
      cleanupSocketRateLimit(socket.id)
      logger.debug(`[WebSocket] Client disconnected from /tasks: ${socket.id}`)
    })
  })
}

/**
 * Add subscription tracking (used by /queue, /logs namespaces)
 */
const addSubscription = (containerId: string, socketId: string): void => {
  if (!subscriptions.has(containerId)) {
    subscriptions.set(containerId, new Set())
  }
  subscriptions.get(containerId)?.add(socketId)
}

/**
 * Remove subscription tracking
 */
const removeSubscription = (containerId: string, socketId: string): void => {
  const subs = subscriptions.get(containerId)
  if (subs) {
    subs.delete(socketId)
    if (subs.size === 0) {
      subscriptions.delete(containerId)
    }
  }
}

/**
 * Cleanup all subscriptions for a socket
 */
const cleanupSocketSubscriptions = (socketId: string): void => {
  for (const [containerId, sockets] of subscriptions.entries()) {
    sockets.delete(socketId)
    if (sockets.size === 0) {
      subscriptions.delete(containerId)
    }
  }
}

// =====================================================================
// Emit helpers
// =====================================================================

/**
 * Re-export emitContainerMetrics from extracted metrics namespace module
 */
export const emitContainerMetrics = (containerId: string, metrics: ContainerMetrics): void => {
  emitContainerMetricsModule(containerId, metrics)
}

/**
 * Emit container status change
 */
export const emitContainerStatus = (data: ContainerStatusEventData): void => {
  if (!io) return
  io.of('/metrics')
    .to(`container:${data.containerId}`)
    .emit('container:status', data)
}

/**
 * Emit instruction pending event
 */
export const emitInstructionPending = (data: InstructionEventData): void => {
  if (!io) return
  io.of('/queue')
    .to(`container:${data.containerId}`)
    .emit('instruction:pending', data)
}

/**
 * Emit instruction started event
 */
export const emitInstructionStarted = (data: InstructionEventData): void => {
  if (!io) return
  io.of('/queue')
    .to(`container:${data.containerId}`)
    .emit('instruction:started', data)
}

/**
 * Emit instruction progress event
 */
export const emitInstructionProgress = (data: InstructionEventData): void => {
  if (!io) return
  io.of('/queue')
    .to(`container:${data.containerId}`)
    .emit('instruction:progress', data)
}

/**
 * Emit instruction completed event
 */
export const emitInstructionCompleted = (data: InstructionEventData): void => {
  if (!io) return
  io.of('/queue')
    .to(`container:${data.containerId}`)
    .emit('instruction:completed', data)
}

/**
 * Emit instruction failed event
 */
export const emitInstructionFailed = (data: InstructionEventData): void => {
  if (!io) return
  io.of('/queue')
    .to(`container:${data.containerId}`)
    .emit('instruction:failed', data)
}

/**
 * Emit queue stats update (for real-time counters in container list)
 */
export const emitQueueStatsUpdate = (containerId: string, stats: {
  queueLength: number
  activeAgents?: number
  activeJobs?: number
  lastActivity?: Date
}): void => {
  if (!io) return
  // Emit to queue namespace so container cards and instruction queue get updates
  const data = {
    containerId,
    ...stats,
    lastActivity: stats.lastActivity || new Date(),
  }
  io.of('/queue')
    .to(`container:${containerId}`)
    .emit('queue:stats', data)
}

/**
 * Emit container log line
 */
export const emitContainerLog = (
  containerId: string,
  log: { timestamp: Date; message: string; stream: 'stdout' | 'stderr' }
): void => {
  if (!io) return
  io.of('/logs').to(`container:${containerId}`).emit('log', log)
}

/**
 * Emit container creation progress update
 */
export const emitContainerCreationProgress = (
  taskId: string,
  data: ContainerCreationProgress
): void => {
  if (!io) return
  io.of('/creation').to(`task:${taskId}`).emit('container:creation:progress', data)
}

/**
 * Emit task event to subscribers
 */
export const emitTaskEvent = (taskId: string, payload: TaskEventPayload): void => {
  if (!io) return
  io.of('/tasks').to(`task:${taskId}`).emit('task:event', payload)
}

/**
 * Re-export emitClaudeEvent from extracted claude-daemon namespace module
 */
export const emitClaudeEvent = (
  containerId: string,
  event: Record<string, unknown>
): void => {
  emitClaudeEventModule(containerId, event)
}

// =====================================================================
// Query helpers
// =====================================================================

/**
 * Get active task subscriptions count for a task
 */
export const getTaskSubscribers = (taskId: string): number => {
  return taskSubscriptions.get(taskId)?.size ?? 0
}

/**
 * Get all active task subscriptions
 */
export const getAllTaskSubscriptions = (): Map<string, number> => {
  const result = new Map<string, number>()
  for (const [taskId, sockets] of taskSubscriptions.entries()) {
    result.set(taskId, sockets.size)
  }
  return result
}

/**
 * Get active subscriptions for a container (queue/logs namespaces)
 */
export const getContainerSubscribers = (containerId: string): number => {
  return subscriptions.get(containerId)?.size ?? 0
}

/**
 * Get all active subscriptions (queue/logs namespaces)
 */
export const getAllSubscriptions = (): Map<string, number> => {
  const result = new Map<string, number>()
  for (const [containerId, sockets] of subscriptions.entries()) {
    result.set(containerId, sockets.size)
  }
  return result
}

/**
 * Close WebSocket server gracefully
 */
export const closeWebSocket = async (): Promise<void> => {
  if (io) {
    await new Promise<void>((resolve) => {
      io?.close(() => {
        logger.debug('[WebSocket] Server closed gracefully')
        resolve()
      })
    })
    io = null
  }
}

/**
 * Get Socket.io server instance
 */
export const getSocketServer = (): Server<
  ClientToServerEvents,
  ServerToClientEvents
> | null => {
  return io
}
