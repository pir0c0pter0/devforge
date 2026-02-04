import { EventEmitter } from 'events'
import Docker from 'dockerode'
import { spawn, ChildProcess } from 'child_process'
import { dockerLogger as logger } from '../utils/logger'
import { containerRepository } from '../repositories'
import type {
  DaemonState,
  ClaudeEvent,
  ClaudeEventType,
  ClaudeStreamInput,
} from '@claude-docker/shared'

/**
 * Active daemon tracking structure
 */
interface ActiveDaemon {
  state: DaemonState
  process: ChildProcess
  dockerId: string
  outputBuffer: string
  stdinReady: boolean
}

/**
 * Claude Daemon flags for execution
 */
const CLAUDE_FLAGS = [
  '--dangerously-skip-permissions',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
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
 * ClaudeDaemonService manages Claude Code daemon processes running inside Docker containers.
 * It handles starting/stopping daemons, sending instructions, and parsing JSON output.
 */
class ClaudeDaemonService extends EventEmitter {
  private docker: Docker
  private daemons: Map<string, ActiveDaemon> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.docker = new Docker({
      socketPath: process.env['DOCKER_SOCKET_PATH'] || '/var/run/docker.sock',
    })
    this.startCleanupTimer()
  }

  /**
   * Start a Claude Code daemon in a container
   */
  async startDaemon(containerId: string, dockerId: string): Promise<DaemonState> {
    // Check if daemon already exists
    const existing = this.daemons.get(containerId)
    if (existing) {
      if (existing.state.status === 'running' || existing.state.status === 'starting') {
        logger.warn({ containerId }, 'Daemon already running')
        return existing.state
      }
      // Clean up old daemon
      await this.stopDaemon(containerId)
    }

    logger.info({ containerId, dockerId }, 'Starting Claude daemon')

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

      // Spawn docker exec process with Claude Code
      const process = spawn('docker', [
        'exec',
        '-i',
        '-w', CONTAINER_WORKSPACE,
        resolvedDockerId,
        'claude',
        ...CLAUDE_FLAGS,
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const activeDaemon: ActiveDaemon = {
        state,
        process,
        dockerId: resolvedDockerId,
        outputBuffer: '',
        stdinReady: true,
      }

      // Handle stdout (JSON streaming)
      process.stdout?.on('data', (chunk: Buffer) => {
        this.handleOutput(containerId, chunk.toString('utf-8'))
      })

      // Handle stderr
      process.stderr?.on('data', (chunk: Buffer) => {
        const errorOutput = chunk.toString('utf-8')
        logger.warn({ containerId, error: errorOutput }, 'Claude daemon stderr')

        // Emit as system event
        const event: ClaudeEvent = {
          type: 'system',
          timestamp: new Date(),
          data: { stderr: errorOutput },
        }
        this.emit('claude:event', { containerId, event })
      })

      // Handle process exit
      process.on('exit', (code, signal) => {
        logger.info({ containerId, code, signal }, 'Claude daemon process exited')
        this.handleDaemonExit(containerId, code, signal)
      })

      // Handle process error
      process.on('error', (error) => {
        logger.error({ containerId, error }, 'Claude daemon process error')
        this.handleDaemonError(containerId, error)
      })

      // Handle stdin drain
      process.stdin?.on('drain', () => {
        const daemon = this.daemons.get(containerId)
        if (daemon) {
          daemon.stdinReady = true
        }
      })

      // Update state to running
      state.status = 'running'
      state.pid = process.pid

      this.daemons.set(containerId, activeDaemon)

      logger.info({ containerId, pid: process.pid }, 'Claude daemon started')
      this.emit('daemon:started', { containerId, state })

      return state
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      state.status = 'error'
      state.error = errorMessage

      logger.error({ containerId, error: errorMessage }, 'Failed to start Claude daemon')
      this.emit('daemon:error', { containerId, error: errorMessage })

      throw error
    }
  }

  /**
   * Stop a Claude Code daemon gracefully
   */
  async stopDaemon(containerId: string): Promise<void> {
    const daemon = this.daemons.get(containerId)
    if (!daemon) {
      logger.debug({ containerId }, 'No daemon to stop')
      return
    }

    logger.info({ containerId }, 'Stopping Claude daemon')
    daemon.state.status = 'stopping'

    try {
      // Send SIGTERM first for graceful shutdown
      if (daemon.process && !daemon.process.killed) {
        // Close stdin to signal end of input
        daemon.process.stdin?.end()

        // Give it a moment to exit gracefully
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            // Force kill if still running
            if (!daemon.process.killed) {
              logger.warn({ containerId }, 'Force killing Claude daemon')
              daemon.process.kill('SIGKILL')
            }
            resolve()
          }, 5000)

          daemon.process.once('exit', () => {
            clearTimeout(timeout)
            resolve()
          })

          daemon.process.kill('SIGTERM')
        })
      }

      daemon.state.status = 'stopped'
      this.daemons.delete(containerId)

      logger.info({ containerId }, 'Claude daemon stopped')
      this.emit('daemon:stopped', { containerId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      daemon.state.status = 'error'
      daemon.state.error = errorMessage

      logger.error({ containerId, error: errorMessage }, 'Error stopping Claude daemon')
      this.emit('daemon:error', { containerId, error: errorMessage })

      // Force cleanup
      this.daemons.delete(containerId)
      throw error
    }
  }

  /**
   * Send an instruction to the Claude daemon via stdin
   */
  async sendInstruction(containerId: string, instruction: string): Promise<void> {
    const daemon = this.daemons.get(containerId)
    if (!daemon) {
      throw new Error(`No daemon running for container ${containerId}`)
    }

    if (daemon.state.status !== 'running') {
      throw new Error(`Daemon is not running (status: ${daemon.state.status})`)
    }

    if (!daemon.process.stdin || daemon.process.stdin.destroyed) {
      throw new Error('Daemon stdin is not available')
    }

    logger.info({ containerId, instructionLength: instruction.length }, 'Sending instruction to Claude daemon')

    // Format instruction as stream-json input
    const streamInput: ClaudeStreamInput = {
      type: 'user',
      message: {
        role: 'user',
        content: instruction,
      },
    }

    const jsonInput = JSON.stringify(streamInput) + '\n'

    // Wait for stdin to be ready if needed
    if (!daemon.stdinReady) {
      await new Promise<void>((resolve) => {
        daemon.process.stdin?.once('drain', resolve)
      })
    }

    // Write to stdin
    const written = daemon.process.stdin.write(jsonInput)
    if (!written) {
      daemon.stdinReady = false
    }

    // Update state
    daemon.state.instructionCount++
    daemon.state.lastActivity = new Date()

    logger.debug({ containerId, instructionCount: daemon.state.instructionCount }, 'Instruction sent')
  }

  /**
   * Get the current status of a daemon
   */
  getStatus(containerId: string): DaemonState | null {
    const daemon = this.daemons.get(containerId)
    if (!daemon) {
      return null
    }

    // Return a copy to maintain immutability
    return { ...daemon.state }
  }

  /**
   * List all active daemons
   */
  listDaemons(): DaemonState[] {
    return Array.from(this.daemons.values()).map(d => ({ ...d.state }))
  }

  /**
   * Handle output from Claude daemon (JSON streaming)
   * Parses complete JSON lines and emits events
   */
  handleOutput(containerId: string, data: string): void {
    const daemon = this.daemons.get(containerId)
    if (!daemon) {
      logger.warn({ containerId }, 'Received output for unknown daemon')
      return
    }

    // Update activity
    daemon.state.lastActivity = new Date()

    // Append to buffer
    daemon.outputBuffer += data

    // Process complete lines
    const lines = daemon.outputBuffer.split('\n')

    // Keep incomplete line in buffer
    daemon.outputBuffer = lines.pop() || ''

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
      } catch (parseError) {
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
   * Handle daemon process exit
   */
  private handleDaemonExit(containerId: string, code: number | null, signal: NodeJS.Signals | null): void {
    const daemon = this.daemons.get(containerId)
    if (!daemon) return

    if (daemon.state.status === 'stopping') {
      // Expected exit during stop
      daemon.state.status = 'stopped'
    } else {
      // Unexpected exit
      daemon.state.status = 'error'
      daemon.state.error = `Process exited with code ${code}, signal ${signal}`

      this.emit('daemon:error', {
        containerId,
        error: daemon.state.error,
      })
    }

    this.daemons.delete(containerId)
    this.emit('daemon:stopped', { containerId })
  }

  /**
   * Handle daemon process error
   */
  private handleDaemonError(containerId: string, error: Error): void {
    const daemon = this.daemons.get(containerId)
    if (!daemon) return

    daemon.state.status = 'error'
    daemon.state.error = error.message

    this.emit('daemon:error', {
      containerId,
      error: error.message,
    })

    this.daemons.delete(containerId)
  }

  /**
   * Start cleanup timer for inactive daemons
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()

      for (const [containerId, daemon] of this.daemons) {
        const inactiveMs = now - (daemon.state.lastActivity?.getTime() || 0)

        if (inactiveMs > INACTIVITY_TIMEOUT) {
          logger.info({ containerId, inactiveMs }, 'Stopping inactive Claude daemon')
          this.stopDaemon(containerId).catch((error) => {
            logger.error({ containerId, error }, 'Error stopping inactive daemon')
          })
        }
      }
    }, 60 * 1000) // Check every minute
  }

  /**
   * Stop all daemons for a specific container (e.g., when container is deleted)
   */
  async stopDaemonForContainer(containerId: string): Promise<void> {
    if (this.daemons.has(containerId)) {
      await this.stopDaemon(containerId)
    }
  }

  /**
   * Stop all daemons and cleanup
   */
  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    const stopPromises = Array.from(this.daemons.keys()).map((containerId) =>
      this.stopDaemon(containerId).catch((error) => {
        logger.error({ containerId, error }, 'Error stopping daemon during destroy')
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
