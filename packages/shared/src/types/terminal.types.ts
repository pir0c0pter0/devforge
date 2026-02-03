/**
 * Terminal types for interactive container shell
 */

/**
 * Terminal session information
 */
export interface TerminalSession {
  sessionId: string
  containerId: string
  cols: number
  rows: number
  createdAt: Date
  lastActivity: Date
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
}

/**
 * Terminal input message (client -> server)
 */
export interface TerminalInput {
  sessionId: string
  data: string
}

/**
 * Terminal resize message
 */
export interface TerminalResize {
  sessionId: string
  cols: number
  rows: number
}

/**
 * Terminal output message (server -> client)
 */
export interface TerminalOutput {
  sessionId: string
  data: string
}

/**
 * Terminal error message
 */
export interface TerminalError {
  sessionId: string
  message: string
  code?: string
}

/**
 * Terminal close message
 */
export interface TerminalClose {
  sessionId: string
  exitCode?: number
}

/**
 * Terminal connection request
 */
export interface TerminalConnect {
  containerId: string
  cols: number
  rows: number
}
