import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
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
} from '@claude-docker/shared'
import { config } from '../config'

/**
 * Socket.io server instance
 */
let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null

/**
 * Map of container subscriptions (containerId -> Set of socket IDs)
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

  // Setup namespaces and event handlers
  setupMetricsNamespace()
  setupQueueNamespace()
  setupLogsNamespace()
  setupCreationNamespace()
  setupTasksNamespace()

  console.info('[WebSocket] Server initialized successfully')

  return io
}

/**
 * Setup /metrics namespace for real-time container metrics
 */
const setupMetricsNamespace = (): void => {
  if (!io) return

  const metricsNamespace = io.of('/metrics')

  metricsNamespace.on('connection', (socket: Socket) => {
    console.info(`[WebSocket] Client connected to /metrics: ${socket.id}`)

    socket.on('subscribe:container', (containerId: string) => {
      socket.join(`container:${containerId}`)
      addSubscription(containerId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} subscribed to container ${containerId}`)
    })

    socket.on('unsubscribe:container', (containerId: string) => {
      socket.leave(`container:${containerId}`)
      removeSubscription(containerId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} unsubscribed from container ${containerId}`)
    })

    socket.on('disconnect', () => {
      cleanupSocketSubscriptions(socket.id)
      console.info(`[WebSocket] Client disconnected from /metrics: ${socket.id}`)
    })
  })
}

/**
 * Setup /queue namespace for instruction queue updates
 */
const setupQueueNamespace = (): void => {
  if (!io) return

  const queueNamespace = io.of('/queue')

  queueNamespace.on('connection', (socket: Socket) => {
    console.info(`[WebSocket] Client connected to /queue: ${socket.id}`)

    socket.on('subscribe:container', (containerId: string) => {
      socket.join(`container:${containerId}`)
      addSubscription(containerId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} subscribed to queue ${containerId}`)
    })

    socket.on('unsubscribe:container', (containerId: string) => {
      socket.leave(`container:${containerId}`)
      removeSubscription(containerId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} unsubscribed from queue ${containerId}`)
    })

    socket.on('instruction:confirm', (instructionId: string, approved: boolean) => {
      console.info(
        `[WebSocket] Instruction ${instructionId} ${approved ? 'approved' : 'rejected'}`
      )
      // This will be handled by the worker
      queueNamespace
        .to(`instruction:${instructionId}`)
        .emit('instruction:confirmed', { instructionId, approved })
    })

    socket.on('disconnect', () => {
      cleanupSocketSubscriptions(socket.id)
      console.info(`[WebSocket] Client disconnected from /queue: ${socket.id}`)
    })
  })
}

/**
 * Setup /logs namespace for container log streaming
 */
const setupLogsNamespace = (): void => {
  if (!io) return

  const logsNamespace = io.of('/logs')

  logsNamespace.on('connection', (socket: Socket) => {
    console.info(`[WebSocket] Client connected to /logs: ${socket.id}`)

    socket.on('subscribe:container', (containerId: string) => {
      socket.join(`container:${containerId}`)
      addSubscription(containerId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} subscribed to logs ${containerId}`)
    })

    socket.on('unsubscribe:container', (containerId: string) => {
      socket.leave(`container:${containerId}`)
      removeSubscription(containerId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} unsubscribed from logs ${containerId}`)
    })

    socket.on('disconnect', () => {
      cleanupSocketSubscriptions(socket.id)
      console.info(`[WebSocket] Client disconnected from /logs: ${socket.id}`)
    })
  })
}

/**
 * Setup /creation namespace for container creation progress updates
 */
const setupCreationNamespace = (): void => {
  if (!io) return

  const creationNamespace = io.of('/creation')

  creationNamespace.on('connection', (socket: Socket) => {
    console.info(`[WebSocket] Client connected to /creation: ${socket.id}`)

    socket.on('subscribe:task', (taskId: string) => {
      socket.join(`task:${taskId}`)
      console.info(`[WebSocket] Client ${socket.id} subscribed to task ${taskId}`)
    })

    socket.on('unsubscribe:task', (taskId: string) => {
      socket.leave(`task:${taskId}`)
      console.info(`[WebSocket] Client ${socket.id} unsubscribed from task ${taskId}`)
    })

    socket.on('disconnect', () => {
      console.info(`[WebSocket] Client disconnected from /creation: ${socket.id}`)
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

  tasksNamespace.on('connection', (socket: Socket) => {
    console.info(`[WebSocket] Client connected to /tasks: ${socket.id}`)

    socket.on('task:subscribe', (subscription: TaskSubscription) => {
      const { taskId } = subscription
      socket.join(`task:${taskId}`)
      addTaskSubscription(taskId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} subscribed to task ${taskId}`)
    })

    socket.on('task:unsubscribe', (unsubscription: TaskUnsubscription) => {
      const { taskId } = unsubscription
      socket.leave(`task:${taskId}`)
      removeTaskSubscription(taskId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} unsubscribed from task ${taskId}`)
    })

    socket.on('task:subscribe:batch', (subscription: TaskBatchSubscription) => {
      const { taskIds } = subscription
      for (const taskId of taskIds) {
        socket.join(`task:${taskId}`)
        addTaskSubscription(taskId, socket.id)
      }
      console.info(
        `[WebSocket] Client ${socket.id} batch subscribed to ${taskIds.length} tasks`
      )
    })

    socket.on('disconnect', () => {
      cleanupSocketTaskSubscriptions(socket.id)
      console.info(`[WebSocket] Client disconnected from /tasks: ${socket.id}`)
    })
  })
}

/**
 * Add subscription tracking
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

/**
 * Emit container metrics to subscribers
 */
export const emitContainerMetrics = (containerId: string, metrics: ContainerMetrics): void => {
  if (!io) return
  io.of('/metrics').to(`container:${containerId}`).emit('container:metrics', metrics)
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
 * Get active subscriptions for a container
 */
export const getContainerSubscribers = (containerId: string): number => {
  return subscriptions.get(containerId)?.size ?? 0
}

/**
 * Get all active subscriptions
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
        console.info('[WebSocket] Server closed gracefully')
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
