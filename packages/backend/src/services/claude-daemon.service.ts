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
  mode: 'interactive' | 'autonomous'
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
 * Repository is cloned to /workspace in container.service.ts
 */
const CONTAINER_WORKSPACE = '/workspace'

/**
 * Inactivity timeout (30 minutes)
 */
const INACTIVITY_TIMEOUT = 30 * 60 * 1000

/**
 * Poll interval for checking if background agents completed (ms)
 */
const AGENT_POLL_INTERVAL = 2000

/**
 * Maximum time to wait for background agents (10 minutes)
 */
const MAX_AGENT_WAIT_TIME = 10 * 60 * 1000

/**
 * Lock for preventing parallel starts of the same container
 */
const daemonStartLocks = new Map<string, Promise<void>>()

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
    // Verificar se já existe um start em andamento
    const existingLock = daemonStartLocks.get(containerId)
    if (existingLock) {
      logger.debug({ containerId }, 'Daemon start already in progress, waiting...')
      await existingLock
      // Após o lock ser liberado, retornar o estado atual
      const existing = this.sessions.get(containerId)
      if (existing) {
        return existing.state
      }
      throw new Error('Daemon start completed but session not found')
    }

    // Criar promise de lock
    let resolveLock: () => void
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve
    })
    daemonStartLocks.set(containerId, lockPromise)

    try {
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

      // Resolve dockerId and mode from container repository
      let resolvedDockerId = dockerId
      let containerMode: 'interactive' | 'autonomous' = 'interactive'

      const containerEntity = containerRepository.findById(containerId)
      if (containerEntity) {
        if (!resolvedDockerId) {
          resolvedDockerId = containerEntity.dockerId
        }
        containerMode = containerEntity.mode as 'interactive' | 'autonomous'
        logger.info({ containerId, mode: containerMode }, 'Container mode detected')
      }

      if (!resolvedDockerId) {
        throw new Error(`Container ${containerId} not found or has no Docker ID`)
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
        mode: containerMode,
      }

      // Update state to running
      state.status = 'running'

      this.sessions.set(containerId, activeSession)

      logger.info({ containerId, sessionId }, 'Claude session started')
      this.emit('daemon:started', { containerId, state })

      return state
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ containerId, error: errorMessage }, 'Failed to start Claude session')
      this.emit('daemon:error', { containerId, error: errorMessage })

      throw error
    } finally {
      // Liberar lock
      daemonStartLocks.delete(containerId)
      resolveLock!()
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
   * Result from sendInstruction
   */


  /**
   * Send an instruction to Claude Code
   * Spawns a new process for each instruction, using --resume for subsequent calls
   * Returns a Promise that resolves when the instruction completes with captured output
   */
  async sendInstruction(containerId: string, instruction: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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

    return new Promise((resolve, reject) => {
      try {
        // Build command flags
        // --dangerously-skip-permissions already handles autonomous execution
        const flags = [...CLAUDE_BASE_FLAGS]

        logger.debug({ containerId, mode: session.mode }, 'Building command flags')

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
        const childProcess = spawn('docker', [
          'exec',
          '-i',
          '-w', CONTAINER_WORKSPACE,
          session.dockerId,
          'claude',
          ...flags,
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        let stdoutBuffer = ''
        let stderrBuffer = ''

        // Handle stdout (JSON streaming)
        childProcess.stdout?.on('data', (chunk: Buffer) => {
          const data = chunk.toString('utf-8')
          stdoutBuffer += data
          this.handleOutput(containerId, data)
        })

        // Handle stderr
        childProcess.stderr?.on('data', (chunk: Buffer) => {
          const errorOutput = chunk.toString('utf-8')
          stderrBuffer += errorOutput
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
        childProcess.stdin?.write(jsonInput)
        childProcess.stdin?.end()

        // Handle process exit
        childProcess.on('exit', async (code, signal) => {
          const exitCode = code ?? -1

          if (exitCode === 0) {
            logger.info({ containerId, exitCode }, 'Main instruction process completed')
          } else {
            logger.warn({ containerId, exitCode, signal }, 'Instruction process exited with non-zero code')

            // Check if there's an error in the output
            if (stdoutBuffer.includes('"is_error":true')) {
              const event: ClaudeEvent = {
                type: 'error',
                timestamp: new Date(),
                data: { code: exitCode, signal, message: 'Instruction failed' },
              }
              this.emit('claude:event', { containerId, event })
            }
          }

          // Check if background agents were spawned (Task tool usage)
          const hasBackgroundAgents = stdoutBuffer.includes('"name":"Task"') ||
                                       stdoutBuffer.includes('run_in_background')

          if (hasBackgroundAgents && exitCode === 0) {
            logger.info({ containerId }, 'Background agents detected, waiting for completion...')

            // Emit event to inform frontend
            const waitEvent: ClaudeEvent = {
              type: 'system',
              timestamp: new Date(),
              data: { message: 'Aguardando agentes em background terminarem...' },
            }
            this.emit('claude:event', { containerId, event: waitEvent })

            // Wait for all background agents to complete
            await this.waitForAgentsToComplete(containerId, session.dockerId)
          }

          // Now mark as complete
          session.isProcessing = false
          session.state.instructionCount++
          session.state.lastActivity = new Date()

          logger.info({ containerId, exitCode }, 'Instruction fully completed (including background agents)')

          // Resolve with captured output
          resolve({
            stdout: stdoutBuffer,
            stderr: stderrBuffer,
            exitCode,
          })
        })

        // Handle process error
        childProcess.on('error', (error) => {
          session.isProcessing = false
          logger.error({ containerId, error }, 'Instruction process error')

          const event: ClaudeEvent = {
            type: 'error',
            timestamp: new Date(),
            data: { error: error.message },
          }
          this.emit('claude:event', { containerId, event })

          reject(error)
        })

      } catch (error) {
        session.isProcessing = false
        reject(error)
      }
    })
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
   * Check if there are still Claude processes running in the container
   * Returns the count of active claude processes
   */
  private async getActiveClaudeProcessCount(dockerId: string): Promise<number> {
    return new Promise((resolve) => {
      const checkProcess = spawn('docker', [
        'exec',
        dockerId,
        'pgrep', '-c', '-f', 'claude',
      ])

      let countStr = ''

      checkProcess.stdout?.on('data', (chunk: Buffer) => {
        countStr += chunk.toString('utf-8')
      })

      checkProcess.on('exit', (code) => {
        // pgrep returns 0 if found, 1 if not found
        if (code === 0) {
          const count = parseInt(countStr.trim(), 10) || 0
          resolve(count)
        } else {
          resolve(0)
        }
      })

      checkProcess.on('error', () => {
        resolve(0)
      })
    })
  }

  /**
   * Wait for all background agents to complete
   * Returns when no more claude processes are running
   */
  private async waitForAgentsToComplete(
    containerId: string,
    dockerId: string,
    maxWaitTime: number = MAX_AGENT_WAIT_TIME
  ): Promise<void> {
    const session = this.sessions.get(containerId)
    const startTime = Date.now()

    logger.info({ containerId }, 'Waiting for background agents to complete...')

    // Initial delay to let any background tasks spawn
    await new Promise(resolve => setTimeout(resolve, 1000))

    while (Date.now() - startTime < maxWaitTime) {
      const processCount = await this.getActiveClaudeProcessCount(dockerId)

      if (processCount === 0) {
        logger.info({ containerId }, 'All background agents completed')
        return
      }

      logger.debug({ containerId, processCount }, 'Background agents still running')

      // Emit progress event
      if (session) {
        const event: ClaudeEvent = {
          type: 'system',
          timestamp: new Date(),
          data: {
            message: `Aguardando ${processCount} agente(s) em background...`,
            agentCount: processCount,
          },
        }
        this.emit('claude:event', { containerId, event })
      }

      await new Promise(resolve => setTimeout(resolve, AGENT_POLL_INTERVAL))
    }

    logger.warn({ containerId, maxWaitTime }, 'Max wait time reached, agents may still be running')
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
