import { Server, Socket } from 'socket.io'
import { SubscriptionManager } from '../../utils/subscription-manager'
import { claudeDaemonService } from '../../services/claude-daemon.service'
import { claudeLogsService } from '../../services/claude-logs.service'
import { containerService } from '../../services/container.service'
import { cleanupSocketRateLimit } from '../../middleware/websocket-rate-limit'
import { validateAndSanitize } from '../../validators/instruction.validator'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  DaemonState,
  ClaudeEvent,
  ClaudeLogEntry,
} from '@claude-docker/shared'

/**
 * Subscription manager for claude daemon namespace
 */
const subscriptions = new SubscriptionManager<string>()

/**
 * Reference to the claude daemon namespace
 */
let claudeDaemonNamespace: ReturnType<Server<ClientToServerEvents, ServerToClientEvents>['of']> | null = null

/**
 * Setup /claude-daemon namespace for Claude Code daemon communication
 */
export function setupClaudeDaemonNamespace(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  claudeDaemonNamespace = io.of('/claude-daemon')

  // Forward events from daemon service to WebSocket clients
  claudeDaemonService.on('claude:event', ({ containerId, event }: { containerId: string; event: ClaudeEvent }) => {
    claudeDaemonNamespace?.to(`claude:${containerId}`).emit('claude:output' as any, event)
  })

  // Forward log events from logs service to WebSocket clients
  claudeLogsService.on('log:new', ({ containerId, entry }: { containerId: string; entry: ClaudeLogEntry }) => {
    claudeDaemonNamespace?.to(`claude:${containerId}`).emit('claude:log' as any, entry)
  })

  claudeLogsService.on('log:batch', ({ containerId, entries }: { containerId: string; entries: ClaudeLogEntry[] }) => {
    claudeDaemonNamespace?.to(`claude:${containerId}`).emit('claude:logs:batch' as any, { containerId, logs: entries })
  })

  claudeLogsService.on('log:cleared', ({ containerId, count }: { containerId: string; count: number }) => {
    claudeDaemonNamespace?.to(`claude:${containerId}`).emit('claude:logs:cleared' as any, { containerId, count })
  })

  claudeDaemonService.on('daemon:started', ({ containerId, state }: { containerId: string; state: DaemonState }) => {
    claudeDaemonNamespace?.to(`claude:${containerId}`).emit('daemon:status' as any, state)
  })

  claudeDaemonService.on('daemon:stopped', ({ containerId }: { containerId: string }) => {
    claudeDaemonNamespace?.to(`claude:${containerId}`).emit('daemon:status' as any, {
      containerId,
      status: 'stopped',
    })
  })

  claudeDaemonService.on('daemon:error', ({ containerId, error }: { containerId: string; error: string }) => {
    claudeDaemonNamespace?.to(`claude:${containerId}`).emit('daemon:error' as any, { error })
  })

  claudeDaemonNamespace.on('connection', (socket: Socket) => {
    console.info(`[WebSocket] Client connected to /claude-daemon: ${socket.id}`)

    // Require authentication for daemon operations
    if (!socket.data.user) {
      console.warn(`[WebSocket] Unauthenticated access attempt to /claude-daemon: ${socket.id}`)
      socket.emit('error', { message: 'Authentication required' })
      socket.disconnect(true)
      return
    }

    let currentContainerId: string | null = null

    // Subscribe to container output
    socket.on('output:subscribe', ({ containerId }: { containerId: string }) => {
      currentContainerId = containerId
      socket.join(`claude:${containerId}`)
      subscriptions.add(containerId, socket.id)
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
      subscriptions.remove(containerId, socket.id)
      if (currentContainerId === containerId) {
        currentContainerId = null
      }
      console.info(`[WebSocket] Client ${socket.id} unsubscribed from claude daemon ${containerId}`)
    })

    // Send instruction to daemon
    // If cancelIfBusy is true, cancels any current instruction before sending
    socket.on('instruction:send', async ({ containerId, instruction, cancelIfBusy }: { containerId: string; instruction: string; cancelIfBusy?: boolean }) => {
      try {
        // Validate and sanitize instruction
        const safeInstruction = validateAndSanitize(instruction)

        await claudeDaemonService.sendInstruction(containerId, safeInstruction, undefined, cancelIfBusy ?? false)

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

    // Cancel current instruction
    socket.on('instruction:cancel', async ({ containerId }: { containerId: string }) => {
      try {
        const cancelled = await claudeDaemonService.cancelCurrentInstruction(containerId)
        socket.emit('instruction:cancelled' as any, { containerId, cancelled })
      } catch (error) {
        socket.emit('error' as any, {
          message: error instanceof Error ? error.message : 'Falha ao cancelar instrução',
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
      subscriptions.cleanupSocket(socket.id)
      cleanupSocketRateLimit(socket.id)
      console.info(`[WebSocket] Client disconnected from /claude-daemon: ${socket.id}`)
    })
  })
}

/**
 * Emit Claude daemon health event to subscribers
 * Used by health-monitor.service.ts to notify frontend of health status
 */
export function emitClaudeEvent(
  containerId: string,
  event: Record<string, unknown>
): void {
  if (!claudeDaemonNamespace) return
  claudeDaemonNamespace.to(`claude:${containerId}`).emit('health:event' as any, event)
}

/**
 * Get active subscriptions count for a container
 */
export function getClaudeDaemonSubscribers(containerId: string): number {
  return subscriptions.getCount(containerId)
}
