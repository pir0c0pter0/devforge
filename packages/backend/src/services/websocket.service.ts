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
  DaemonState,
  ClaudeEvent,
} from '@claude-docker/shared'
import { config } from '../config'
import { metricsService } from './metrics.service'
import { containerRepository } from '../repositories'
import { terminalService } from './terminal.service'
import { claudeDaemonService } from './claude-daemon.service'
import { containerService } from './container.service'
import { healthMonitorService } from './health-monitor.service'
import { claudeLogsService } from './claude-logs.service'
import type { ClaudeLogEntry } from '@claude-docker/shared'

/**
 * Socket.io server instance
 */
let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null

/**
 * Map of container subscriptions (containerId -> Set of socket IDs)
 */
const subscriptions = new Map<string, Set<string>>()

/**
 * Map of active metrics collection intervals (containerId -> intervalId)
 */
const metricsIntervals = new Map<string, NodeJS.Timeout>()

/**
 * Default metrics collection interval in milliseconds
 */
const METRICS_INTERVAL_MS = 2000

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
  setupTerminalNamespace()
  setupClaudeDaemonNamespace()

  // Initialize health monitor event emitter
  healthMonitorService.setEventEmitter(emitClaudeEvent)

  console.info('[WebSocket] Server initialized successfully')

  return io
}

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
const setupMetricsNamespace = (): void => {
  if (!io) return

  const metricsNamespace = io.of('/metrics')

  metricsNamespace.on('connection', (socket: Socket) => {
    console.info(`[WebSocket] Client connected to /metrics: ${socket.id}`)

    socket.on('subscribe:container', async (containerId: string) => {
      socket.join(`container:${containerId}`)
      addSubscription(containerId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} subscribed to container ${containerId}`)

      // Start metrics collection if this is the first subscriber
      const subscribers = subscriptions.get(containerId)
      if (subscribers && subscribers.size === 1) {
        await startMetricsCollection(containerId)
      }
    })

    socket.on('unsubscribe:container', (containerId: string) => {
      socket.leave(`container:${containerId}`)
      removeSubscription(containerId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} unsubscribed from container ${containerId}`)

      // Stop metrics collection if no more subscribers
      const subscribers = subscriptions.get(containerId)
      if (!subscribers || subscribers.size === 0) {
        stopMetricsCollection(containerId)
      }
    })

    socket.on('disconnect', () => {
      // Get containers this socket was subscribed to before cleanup
      const subscribedContainers: string[] = []
      for (const [containerId, sockets] of subscriptions.entries()) {
        if (sockets.has(socket.id)) {
          subscribedContainers.push(containerId)
        }
      }

      cleanupSocketSubscriptions(socket.id)

      // Stop metrics collection for containers with no more subscribers
      for (const containerId of subscribedContainers) {
        const subscribers = subscriptions.get(containerId)
        if (!subscribers || subscribers.size === 0) {
          stopMetricsCollection(containerId)
        }
      }

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
 * Map of terminal subscriptions (sessionId -> socket ID)
 */
const terminalSubscriptions = new Map<string, string>()

/**
 * Setup /terminal namespace for interactive container terminal
 */
const setupTerminalNamespace = (): void => {
  if (!io) return

  const terminalNamespace = io.of('/terminal')

  terminalNamespace.on('connection', (socket: Socket) => {
    console.info(`[WebSocket] Client connected to /terminal: ${socket.id}`)

    let currentSessionId: string | null = null

    socket.on('terminal:connect', async (
      data: { containerId: string; cols: number; rows: number },
      callback: (response: { sessionId?: string; error?: string }) => void
    ) => {
      try {
        const session = await terminalService.createSession(
          data.containerId,
          data.cols || 80,
          data.rows || 24,
          (output) => {
            socket.emit('terminal:data', { sessionId: session.sessionId, data: output })
          },
          (exitCode) => {
            socket.emit('terminal:close', { sessionId: session.sessionId, exitCode })
            if (currentSessionId) {
              terminalSubscriptions.delete(currentSessionId)
            }
          }
        )

        currentSessionId = session.sessionId
        terminalSubscriptions.set(session.sessionId, socket.id)
        socket.join(`terminal:${session.sessionId}`)

        console.info(`[WebSocket] Terminal session ${session.sessionId} created for container ${data.containerId}`)

        callback({ sessionId: session.sessionId })
        socket.emit('terminal:ready', session)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[WebSocket] Failed to create terminal session:`, error)
        callback({ error: errorMessage })
      }
    })

    socket.on('terminal:input', (data: { sessionId: string; data: string }) => {
      if (data.sessionId !== currentSessionId) {
        console.warn(`[WebSocket] Invalid session ID for input: ${data.sessionId}`)
        return
      }
      terminalService.write(data.sessionId, data.data)
    })

    socket.on('terminal:resize', async (
      data: { sessionId: string; cols: number; rows: number },
      callback?: (response: { success: boolean; error?: string }) => void
    ) => {
      try {
        if (data.sessionId !== currentSessionId) {
          throw new Error('Invalid session ID')
        }
        await terminalService.resize(data.sessionId, data.cols, data.rows)
        callback?.({ success: true })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[WebSocket] Failed to resize terminal:`, error)
        callback?.({ success: false, error: errorMessage })
      }
    })

    socket.on('terminal:disconnect', (sessionId: string) => {
      if (sessionId === currentSessionId) {
        terminalService.closeSession(sessionId, 0)
        socket.leave(`terminal:${sessionId}`)
        terminalSubscriptions.delete(sessionId)
        currentSessionId = null
        console.info(`[WebSocket] Terminal session ${sessionId} closed by client`)
      }
    })

    socket.on('disconnect', () => {
      if (currentSessionId) {
        terminalService.closeSession(currentSessionId, 143)
        terminalSubscriptions.delete(currentSessionId)
        console.info(`[WebSocket] Client disconnected, closed terminal session ${currentSessionId}`)
      }
      console.info(`[WebSocket] Client disconnected from /terminal: ${socket.id}`)
    })
  })
}

/**
 * Map of claude daemon subscriptions (containerId -> Set of socket IDs)
 */
const claudeDaemonSubscriptions = new Map<string, Set<string>>()

/**
 * Add claude daemon subscription tracking
 */
const addClaudeDaemonSubscription = (containerId: string, socketId: string): void => {
  if (!claudeDaemonSubscriptions.has(containerId)) {
    claudeDaemonSubscriptions.set(containerId, new Set())
  }
  claudeDaemonSubscriptions.get(containerId)?.add(socketId)
}

/**
 * Remove claude daemon subscription tracking
 */
const removeClaudeDaemonSubscription = (containerId: string, socketId: string): void => {
  const subs = claudeDaemonSubscriptions.get(containerId)
  if (subs) {
    subs.delete(socketId)
    if (subs.size === 0) {
      claudeDaemonSubscriptions.delete(containerId)
    }
  }
}

/**
 * Cleanup all claude daemon subscriptions for a socket
 */
const cleanupSocketClaudeDaemonSubscriptions = (socketId: string): void => {
  for (const [containerId, sockets] of claudeDaemonSubscriptions.entries()) {
    sockets.delete(socketId)
    if (sockets.size === 0) {
      claudeDaemonSubscriptions.delete(containerId)
    }
  }
}

/**
 * Setup /claude-daemon namespace for Claude Code daemon communication
 */
const setupClaudeDaemonNamespace = (): void => {
  if (!io) return

  const claudeDaemonNamespace = io.of('/claude-daemon')

  // Forward events from daemon service to WebSocket clients
  claudeDaemonService.on('claude:event', ({ containerId, event }: { containerId: string; event: ClaudeEvent }) => {
    claudeDaemonNamespace.to(`claude:${containerId}`).emit('claude:output' as any, event)
  })

  // Forward log events from logs service to WebSocket clients
  claudeLogsService.on('log:new', ({ containerId, entry }: { containerId: string; entry: ClaudeLogEntry }) => {
    claudeDaemonNamespace.to(`claude:${containerId}`).emit('claude:log' as any, entry)
  })

  claudeLogsService.on('log:batch', ({ containerId, entries }: { containerId: string; entries: ClaudeLogEntry[] }) => {
    claudeDaemonNamespace.to(`claude:${containerId}`).emit('claude:logs:batch' as any, { containerId, logs: entries })
  })

  claudeLogsService.on('log:cleared', ({ containerId, count }: { containerId: string; count: number }) => {
    claudeDaemonNamespace.to(`claude:${containerId}`).emit('claude:logs:cleared' as any, { containerId, count })
  })

  claudeDaemonService.on('daemon:started', ({ containerId, state }: { containerId: string; state: DaemonState }) => {
    claudeDaemonNamespace.to(`claude:${containerId}`).emit('daemon:status' as any, state)
  })

  claudeDaemonService.on('daemon:stopped', ({ containerId }: { containerId: string }) => {
    claudeDaemonNamespace.to(`claude:${containerId}`).emit('daemon:status' as any, {
      containerId,
      status: 'stopped',
    })
  })

  claudeDaemonService.on('daemon:error', ({ containerId, error }: { containerId: string; error: string }) => {
    claudeDaemonNamespace.to(`claude:${containerId}`).emit('daemon:error' as any, { error })
  })

  claudeDaemonNamespace.on('connection', (socket: Socket) => {
    console.info(`[WebSocket] Client connected to /claude-daemon: ${socket.id}`)

    let currentContainerId: string | null = null

    // Subscribe to container output
    socket.on('output:subscribe', ({ containerId }: { containerId: string }) => {
      currentContainerId = containerId
      socket.join(`claude:${containerId}`)
      addClaudeDaemonSubscription(containerId, socket.id)
      console.info(`[WebSocket] Client ${socket.id} subscribed to claude daemon ${containerId}`)

      // Send current status
      const status = claudeDaemonService.getStatus(containerId)
      if (status) {
        socket.emit('daemon:status' as any, status)
      } else {
        socket.emit('daemon:status' as any, { containerId, status: 'stopped', instructionCount: 0 })
      }
    })

    // Unsubscribe from container output
    socket.on('output:unsubscribe', ({ containerId }: { containerId: string }) => {
      socket.leave(`claude:${containerId}`)
      removeClaudeDaemonSubscription(containerId, socket.id)
      if (currentContainerId === containerId) {
        currentContainerId = null
      }
      console.info(`[WebSocket] Client ${socket.id} unsubscribed from claude daemon ${containerId}`)
    })

    // Send instruction to daemon
    socket.on('instruction:send', async ({ containerId, instruction }: { containerId: string; instruction: string }) => {
      try {
        // Validate input
        if (!instruction || typeof instruction !== 'string') {
          socket.emit('error' as any, { message: 'Instrução inválida' })
          return
        }

        if (instruction.length > 100000) {
          socket.emit('error' as any, { message: 'Instrução muito longa (máx 100k caracteres)' })
          return
        }

        await claudeDaemonService.sendInstruction(containerId, instruction)

        // Confirm receipt
        socket.emit('instruction:received' as any, {
          containerId,
          timestamp: new Date(),
        })
      } catch (error) {
        socket.emit('error' as any, {
          message: error instanceof Error ? error.message : 'Falha ao enviar instrução',
        })
      }
    })

    // Start daemon
    socket.on('daemon:start', async ({ containerId }: { containerId: string }) => {
      try {
        // Get container info
        const container = await containerService.getById(containerId)
        if (!container) {
          socket.emit('error' as any, { message: 'Container não encontrado' })
          return
        }

        if (container.status !== 'running') {
          socket.emit('error' as any, { message: 'Container não está rodando' })
          return
        }

        const state = await claudeDaemonService.startDaemon(containerId, container.dockerId)
        socket.emit('daemon:status' as any, state)
      } catch (error) {
        socket.emit('error' as any, {
          message: error instanceof Error ? error.message : 'Falha ao iniciar daemon',
        })
      }
    })

    // Stop daemon
    socket.on('daemon:stop', async ({ containerId }: { containerId: string }) => {
      try {
        await claudeDaemonService.stopDaemon(containerId)
        socket.emit('daemon:status' as any, { containerId, status: 'stopped', instructionCount: 0 })
      } catch (error) {
        socket.emit('error' as any, {
          message: error instanceof Error ? error.message : 'Falha ao parar daemon',
        })
      }
    })

    // Get daemon status
    socket.on('daemon:get-status', ({ containerId }: { containerId: string }) => {
      const status = claudeDaemonService.getStatus(containerId)
      socket.emit('daemon:status' as any, status || { containerId, status: 'stopped', instructionCount: 0 })
    })

    // Get logs history (request batch of recent logs)
    socket.on('logs:get', ({ containerId, limit, since }: { containerId: string; limit?: number; since?: string }) => {
      try {
        const response = claudeLogsService.getLogs(containerId, {
          limit: limit || 500,
          since: since ? new Date(since) : undefined,
        })
        socket.emit('claude:logs:batch' as any, { containerId, logs: response.logs })
      } catch (error) {
        socket.emit('error' as any, {
          message: error instanceof Error ? error.message : 'Falha ao obter logs',
        })
      }
    })

    // Get logs stats
    socket.on('logs:stats', ({ containerId }: { containerId: string }) => {
      try {
        const stats = claudeLogsService.getStats(containerId)
        socket.emit('claude:logs:stats' as any, stats)
      } catch (error) {
        socket.emit('error' as any, {
          message: error instanceof Error ? error.message : 'Falha ao obter estatisticas',
        })
      }
    })

    // Clear logs
    socket.on('logs:clear', ({ containerId }: { containerId: string }) => {
      try {
        const count = claudeLogsService.clearLogs(containerId)
        socket.emit('claude:logs:cleared' as any, { containerId, count })
      } catch (error) {
        socket.emit('error' as any, {
          message: error instanceof Error ? error.message : 'Falha ao limpar logs',
        })
      }
    })

    socket.on('disconnect', () => {
      cleanupSocketClaudeDaemonSubscriptions(socket.id)
      console.info(`[WebSocket] Client disconnected from /claude-daemon: ${socket.id}`)
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
 * Emit Claude daemon health event to subscribers
 * Used by health-monitor.service.ts to notify frontend of health status
 */
export const emitClaudeEvent = (
  containerId: string,
  event: Record<string, unknown>
): void => {
  if (!io) return
  io.of('/claude-daemon').to(`claude:${containerId}`).emit('health:event' as any, event)
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
