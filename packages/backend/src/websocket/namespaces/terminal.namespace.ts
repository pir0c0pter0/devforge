import { Server, Socket } from 'socket.io'
import { terminalService } from '../../services/terminal.service'
import { cleanupSocketRateLimit } from '../../middleware/websocket-rate-limit'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from '@devforge/shared'

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
    console.info(`[WebSocket] Client connected to /terminal: ${socket.id}`)

    // Require authentication for terminal operations
    if (!socket.data.user) {
      console.warn(`[WebSocket] Unauthenticated access attempt to /terminal: ${socket.id}`)
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
      cleanupSocketRateLimit(socket.id)
      console.info(`[WebSocket] Client disconnected from /terminal: ${socket.id}`)
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
