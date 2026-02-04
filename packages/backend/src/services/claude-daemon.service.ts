import { EventEmitter } from 'events'
import Docker from 'dockerode'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { dockerLogger as logger } from '../utils/logger'
import { containerRepository } from '../repositories'
import type {
  DaemonState,
  ClaudeEvent,
  ClaudeEventType,
  ClaudeStreamInput,
} from '@claude-docker/shared'

/**
 * Active session tracking structure
 * Unlike the old daemon approach, we now use session-based execution
 * where each instruction spawns a new process but maintains context via session ID
 */
interface ActiveSession {
  state: DaemonState
  dockerId: string
  sessionId: string
  isProcessing: boolean
}

/**
 * Claude flags for execution (print mode with streaming JSON)
 */
const CLAUDE_BASE_FLAGS = [
  '--print',
  '--dangerously-skip-permissions',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
]

/**
 * Working directory inside containers
 */
const CONTAINER_WORKSPACE = '/home/developer/workspace'

/**
 * Inactivity timeout (30 minutes)
 */
const INACTIVITY_TIMEOUT = 30 * 60 * 1000

/**
 * ClaudeDaemonService manages Claude Code sessions running inside Docker containers.
 *
 * New Architecture (v0.0.37):
 * - Each container gets a unique session ID (UUID)
 * - Instructions spawn individual processes that use --session-id or --resume
 * - Session context is maintained by Claude Code between instructions
 * - No persistent daemon process - each instruction is fire-and-forget
 */
class ClaudeDaemonService extends EventEmitter {
  private docker: Docker
  private sessions: Map<string, ActiveSession> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.docker = new Docker({
      socketPath: process.env['DOCKER_SOCKET_PATH'] || '/var/run/docker.sock',
    })
    this.startCleanupTimer()
  }

  /**
   * Start a Claude Code session for a container
   * This doesn't spawn a persistent process, just initializes the session
   */
  async startDaemon(containerId: string, dockerId: string): Promise<DaemonState> {
    // Check if session already exists
    const existing = this.sessions.get(containerId)
    if (existing) {
      if (existing.state.status === 'running') {
        logger.warn({ containerId }, 'Session already active')
        return existing.state
      }
      // Clean up old session
      this.sessions.delete(containerId)
    }

    logger.info({ containerId, dockerId }, 'Starting Claude session')

    const state: DaemonState = {
      containerId,
      status: 'starting',
      startedAt: new Date(),
      lastActivity: new Date(),
      instructionCount: 0,
    }

    try {
      // Resolve dockerId from internal containerId if not provided
      let resolvedDockerId = dockerId
      if (!resolvedDockerId) {
        const containerEntity = containerRepository.findById(containerId)
        if (!containerEntity || !containerEntity.dockerId) {
          throw new Error(`Container ${containerId} not found or has no Docker ID`)
        }
        resolvedDockerId = containerEntity.dockerId
      }

      // Verify container is running
      const container = this.docker.getContainer(resolvedDockerId)
      const containerInfo = await container.inspect()

      if (!containerInfo.State.Running) {
        throw new Error('Container is not running')
      }

      // Generate a unique session ID for this container
      const sessionId = randomUUID()

      const activeSession: ActiveSession = {
        state,
        dockerId: resolvedDockerId,
        sessionId,
        isProcessing: false,
      }

      // Update state to running
      state.status = 'running'

      this.sessions.set(containerId, activeSession)

      logger.info({ containerId, sessionId }, 'Claude session started')
      this.emit('daemon:started', { containerId, state })

      return state
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      state.status = 'error'
      state.error = errorMessage

      logger.error({ containerId, error: errorMessage }, 'Failed to start Claude session')
      this.emit('daemon:error', { containerId, error: errorMessage })

      throw error
    }
  }

  /**
   * Stop a Claude Code session
   */
  async stopDaemon(containerId: string): Promise<void> {
    const session = this.sessions.get(containerId)
    if (!session) {
      logger.debug({ containerId }, 'No session to stop')
      return
    }

    logger.info({ containerId }, 'Stopping Claude session')
    session.state.status = 'stopping'

    // No persistent process to kill, just clean up
    session.state.status = 'stopped'
    this.sessions.delete(containerId)

    logger.info({ containerId }, 'Claude session stopped')
    this.emit('daemon:stopped', { containerId })
  }

  /**
   * Send an instruction to Claude Code
   * Spawns a new process for each instruction, using --resume for subsequent calls
   */
  async sendInstruction(containerId: string, instruction: string): Promise<void> {
    const session = this.sessions.get(containerId)
    if (!session) {
      throw new Error(`No session active for container ${containerId}`)
    }

    if (session.state.status !== 'running') {
      throw new Error(`Session is not running (status: ${session.state.status})`)
    }

    if (session.isProcessing) {
      throw new Error('Session is already processing an instruction')
    }

    session.isProcessing = true
    session.state.lastActivity = new Date()

    logger.info({ containerId, instructionLength: instruction.length, sessionId: session.sessionId }, 'Sending instruction to Claude')

    try {
      // Build command flags
      const flags = [...CLAUDE_BASE_FLAGS]

      // First instruction uses --session-id, subsequent use --resume
      if (session.state.instructionCount === 0) {
        flags.push('--session-id', session.sessionId)
      } else {
        flags.push('--resume', session.sessionId)
      }

      // Format instruction as stream-json input
      const streamInput: ClaudeStreamInput = {
        type: 'user',
        message: {
          role: 'user',
          content: instruction,
        },
      }

      const jsonInput = JSON.stringify(streamInput)

      // Spawn docker exec process
      const process = spawn('docker', [
        'exec',
        '-i',
        '-w', CONTAINER_WORKSPACE,
        session.dockerId,
        'claude',
        ...flags,
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let outputBuffer = ''

      // Handle stdout (JSON streaming)
      process.stdout?.on('data', (chunk: Buffer) => {
        const data = chunk.toString('utf-8')
        outputBuffer += data
        this.handleOutput(containerId, data)
      })

      // Handle stderr
      process.stderr?.on('data', (chunk: Buffer) => {
        const errorOutput = chunk.toString('utf-8')
        logger.warn({ containerId, error: errorOutput }, 'Claude stderr')

        // Emit as system event
        const event: ClaudeEvent = {
          type: 'system',
          timestamp: new Date(),
          data: { stderr: errorOutput },
        }
        this.emit('claude:event', { containerId, event })
      })

      // Write instruction to stdin and close
      process.stdin?.write(jsonInput)
      process.stdin?.end()

      // Handle process exit
      process.on('exit', (code, signal) => {
        session.isProcessing = false
        session.state.instructionCount++
        session.state.lastActivity = new Date()

        if (code === 0) {
          logger.info({ containerId, code }, 'Instruction completed successfully')
        } else {
          logger.warn({ containerId, code, signal }, 'Instruction process exited with non-zero code')

          // Check if there's an error in the output
          if (outputBuffer.includes('"is_error":true')) {
            const event: ClaudeEvent = {
              type: 'error',
              timestamp: new Date(),
              data: { code, signal, message: 'Instruction failed' },
            }
            this.emit('claude:event', { containerId, event })
          }
        }
      })

      // Handle process error
      process.on('error', (error) => {
        session.isProcessing = false
        logger.error({ containerId, error }, 'Instruction process error')

        const event: ClaudeEvent = {
          type: 'error',
          timestamp: new Date(),
          data: { error: error.message },
        }
        this.emit('claude:event', { containerId, event })
      })

    } catch (error) {
      session.isProcessing = false
      throw error
    }
  }

  /**
   * Get the current status of a session
   */
  getStatus(containerId: string): DaemonState | null {
    const session = this.sessions.get(containerId)
    if (!session) {
      return null
    }

    // Return a copy to maintain immutability
    return { ...session.state }
  }

  /**
   * List all active sessions
   */
  listDaemons(): DaemonState[] {
    return Array.from(this.sessions.values()).map(s => ({ ...s.state }))
  }

  /**
   * Handle output from Claude (JSON streaming)
   * Parses complete JSON lines and emits events
   */
  private handleOutput(containerId: string, data: string): void {
    const session = this.sessions.get(containerId)
    if (!session) {
      logger.warn({ containerId }, 'Received output for unknown session')
      return
    }

    // Update activity
    session.state.lastActivity = new Date()

    // Process complete lines
    const lines = data.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const parsed = JSON.parse(trimmed)
        const event = this.parseClaudeOutput(parsed)

        if (event) {
          logger.debug({ containerId, eventType: event.type }, 'Claude event received')
          this.emit('claude:event', { containerId, event })
        }
      } catch {
        // Not valid JSON, emit as raw system message
        logger.debug({ containerId, line: trimmed }, 'Non-JSON output from Claude')
        const event: ClaudeEvent = {
          type: 'system',
          timestamp: new Date(),
          data: { raw: trimmed },
        }
        this.emit('claude:event', { containerId, event })
      }
    }
  }

  /**
   * Parse Claude output into a ClaudeEvent
   */
  private parseClaudeOutput(data: unknown): ClaudeEvent | null {
    if (!data || typeof data !== 'object') {
      return null
    }

    const output = data as Record<string, unknown>
    const type = this.mapOutputType(output['type'] as string)

    return {
      type,
      timestamp: new Date(),
      data: output,
    }
  }

  /**
   * Map Claude output type to ClaudeEventType
   */
  private mapOutputType(type: string | undefined): ClaudeEventType {
    switch (type) {
      case 'assistant':
        return 'assistant'
      case 'user':
        return 'user'
      case 'tool_use':
        return 'tool_use'
      case 'tool_result':
        return 'tool_result'
      case 'result':
        return 'result'
      case 'error':
        return 'error'
      default:
        return 'system'
    }
  }

  /**
   * Start cleanup timer for inactive sessions
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()

      for (const [containerId, session] of this.sessions) {
        const inactiveMs = now - (session.state.lastActivity?.getTime() || 0)

        if (inactiveMs > INACTIVITY_TIMEOUT) {
          logger.info({ containerId, inactiveMs }, 'Stopping inactive Claude session')
          this.stopDaemon(containerId).catch((error) => {
            logger.error({ containerId, error }, 'Error stopping inactive session')
          })
        }
      }
    }, 60 * 1000) // Check every minute
  }

  /**
   * Stop all sessions for a specific container
   */
  async stopDaemonForContainer(containerId: string): Promise<void> {
    if (this.sessions.has(containerId)) {
      await this.stopDaemon(containerId)
    }
  }

  /**
   * Stop all sessions and cleanup
   */
  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    const stopPromises = Array.from(this.sessions.keys()).map((containerId) =>
      this.stopDaemon(containerId).catch((error) => {
        logger.error({ containerId, error }, 'Error stopping session during destroy')
      })
    )

    await Promise.all(stopPromises)
    this.removeAllListeners()
  }
}

/**
 * Singleton instance of ClaudeDaemonService
 */
export const claudeDaemonService = new ClaudeDaemonService()

/**
 * Export class for testing
 */
export { ClaudeDaemonService }
