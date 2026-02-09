import { Server, Socket } from 'socket.io'
import { terminalService } from '../../services/terminal.service'
import { cleanupSocketRateLimit } from '../../middleware/websocket-rate-limit'
import { validateContainerId } from '../../utils/validation'
import { createChildLogger } from '../../utils/logger'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from '@devforge/shared'

const logger = createChildLogger({ namespace: 'terminal' })

/**
 * Map of terminal subscriptions (sessionId -> socket ID)
 */
const terminalSubscriptions = new Map<string, string>()

/**
 * Reference to the terminal namespace
 */
let terminalNamespace: ReturnType<Server<ClientToServerEvents, ServerToClientEvents>['of']> | null = null

/**
 * Setup /terminal namespace for interactive container terminal
 */
export function setupTerminalNamespace(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  terminalNamespace = io.of('/terminal')

  terminalNamespace.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Client connected to /terminal')

    // Require authentication for terminal operations
    if (!socket.data.user) {
      logger.warn({ socketId: socket.id }, 'Unauthenticated access attempt to /terminal')
      socket.emit('error', { message: 'Authentication required' })
      socket.disconnect(true)
      return
    }

    let currentSessionId: string | null = null

    socket.on('terminal:connect', async (
      data: { containerId: string; cols: number; rows: number },
      callback: (response: { sessionId?: string; error?: string }) => void
    ) => {
      try {
        // QA-H4: Validate containerId
        const validatedContainerId = validateContainerId(data.containerId)
        if (!validatedContainerId) {
          callback({ error: 'Invalid container ID format' })
          return
        }
        const session = await terminalService.createSession(
          validatedContainerId,
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

        logger.info({ sessionId: session.sessionId, containerId: data.containerId }, 'Terminal session created')

        callback({ sessionId: session.sessionId })
        socket.emit('terminal:ready', session)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error({ err: error }, 'Failed to create terminal session')
        callback({ error: errorMessage })
      }
    })

    socket.on('terminal:input', (data: { sessionId: string; data: string }) => {
      if (data.sessionId !== currentSessionId) {
        logger.warn({ sessionId: data.sessionId }, 'Invalid session ID for input')
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
        logger.error({ err: error }, 'Failed to resize terminal')
        callback?.({ success: false, error: errorMessage })
      }
    })

    socket.on('terminal:disconnect', (sessionId: string) => {
      if (sessionId === currentSessionId) {
        terminalService.closeSession(sessionId, 0)
        socket.leave(`terminal:${sessionId}`)
        terminalSubscriptions.delete(sessionId)
        currentSessionId = null
        logger.info({ sessionId }, 'Terminal session closed by client')
      }
    })

    socket.on('disconnect', () => {
      if (currentSessionId) {
        terminalService.closeSession(currentSessionId, 143)
        terminalSubscriptions.delete(currentSessionId)
        logger.info({ sessionId: currentSessionId }, 'Client disconnected, closed terminal session')
      }
      cleanupSocketRateLimit(socket.id)
      logger.info({ socketId: socket.id }, 'Client disconnected from /terminal')
    })
  })
}

/**
 * Get terminal subscription by session ID
 */
export function getTerminalSocketId(sessionId: string): string | undefined {
  return terminalSubscriptions.get(sessionId)
}

/**
 * Check if a terminal session exists
 */
export function hasTerminalSession(sessionId: string): boolean {
  return terminalSubscriptions.has(sessionId)
}
