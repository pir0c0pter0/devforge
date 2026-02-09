import { EventEmitter } from 'events'
import Docker from 'dockerode'
import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { dockerLogger as logger } from '../utils/logger'
import { containerRepository } from '../repositories'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { claudeLogsService } from './claude-logs.service'
import { CircuitOpenError } from './circuit-breaker.service'
import type {
  DaemonState,
  ClaudeEvent,
  ClaudeEventType,
  ClaudeStreamInput,
  ProcessingState,
  ProcessingStage,
} from '@devforge/shared'

/**
 * Per-container circuit breaker state
 */
interface ContainerCircuitBreaker {
  failures: number
  lastFailure: Date | null
  isOpen: boolean
  recoveryTimer?: NodeJS.Timeout
}

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
  currentProcess?: ChildProcess
  processingState: ProcessingState
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
 * Hard timeout for Claude CLI process (5 minutes)
 * If a process runs longer than this, it will be killed
 */
const PROCESS_HARD_TIMEOUT = 5 * 60 * 1000

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
/**
 * Circuit breaker configuration
 */
const CIRCUIT_BREAKER_THRESHOLD = 3 // failures before opening
const CIRCUIT_BREAKER_RECOVERY_MS = 30_000 // 30 seconds

class ClaudeDaemonService extends EventEmitter {
  private docker: Docker
  private sessions: Map<string, ActiveSession> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null
  private circuitBreakers: Map<string, ContainerCircuitBreaker> = new Map()

  constructor() {
    super()
    this.docker = new Docker({
      socketPath: process.env['DOCKER_SOCKET_PATH'] || '/var/run/docker.sock',
    })
    this.startCleanupTimer()
  }

  /**
   * Get or create circuit breaker for a container
   */
  private getCircuitBreaker(containerId: string): ContainerCircuitBreaker {
    if (!this.circuitBreakers.has(containerId)) {
      this.circuitBreakers.set(containerId, {
        failures: 0,
        lastFailure: null,
        isOpen: false,
      })
    }
    return this.circuitBreakers.get(containerId)!
  }

  /**
   * Record a failure for a container's circuit breaker
   */
  private recordFailure(containerId: string): void {
    const cb = this.getCircuitBreaker(containerId)
    cb.failures++
    cb.lastFailure = new Date()

    logger.debug(
      { containerId, failures: cb.failures, threshold: CIRCUIT_BREAKER_THRESHOLD },
      'Circuit breaker failure recorded'
    )

    if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      cb.isOpen = true
      logger.warn(
        { containerId, failures: cb.failures },
        'Circuit breaker opened for container'
      )

      // Clear any existing timer
      if (cb.recoveryTimer) {
        clearTimeout(cb.recoveryTimer)
      }

      // Auto-reset after recovery timeout
      cb.recoveryTimer = setTimeout(() => {
        cb.isOpen = false
        cb.failures = 0
        logger.info(
          { containerId },
          'Circuit breaker auto-reset after recovery timeout'
        )
      }, CIRCUIT_BREAKER_RECOVERY_MS)
    }
  }

  /**
   * Record a success for a container's circuit breaker
   */
  private recordSuccess(containerId: string): void {
    const cb = this.getCircuitBreaker(containerId)
    cb.failures = 0
    cb.isOpen = false

    // Clear recovery timer if it exists
    if (cb.recoveryTimer) {
      clearTimeout(cb.recoveryTimer)
      cb.recoveryTimer = undefined
    }
  }

  /**
   * Check if circuit breaker is open for a container
   */
  private isCircuitOpen(containerId: string): boolean {
    return this.getCircuitBreaker(containerId).isOpen
  }

  /**
   * Get circuit breaker stats for a container
   */
  getCircuitBreakerStats(containerId: string): { state: string; failures: number; lastFailure?: Date } {
    const cb = this.getCircuitBreaker(containerId)
    return {
      state: cb.isOpen ? 'open' : 'closed',
      failures: cb.failures,
      lastFailure: cb.lastFailure ?? undefined,
    }
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
      // Pure UUID for Claude CLI (it validates UUID format)
      // Isolation is handled by separate in-memory Maps per service
      const sessionId = randomUUID()

      const activeSession: ActiveSession = {
        state,
        dockerId: resolvedDockerId,
        sessionId,
        isProcessing: false,
        mode: containerMode,
        processingState: { isProcessing: false, stage: 'idle' },
      }

      // Update state to running
      state.status = 'running'

      this.sessions.set(containerId, activeSession)

      logger.info({ containerId, sessionId }, 'Claude session started')

      // Log inicio da sessao
      claudeLogsService.addLog(containerId, 'system', `Sessao Claude iniciada (sessionId: ${sessionId})`, {
        sessionId,
      })

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

    // Log parada da sessao
    claudeLogsService.addLog(containerId, 'system', `Sessao Claude encerrada (sessionId: ${session.sessionId})`, {
      sessionId: session.sessionId,
    })

    // No persistent process to kill, just clean up
    session.state.status = 'stopped'
    this.sessions.delete(containerId)

    // Clean up circuit breaker for this container
    const cb = this.circuitBreakers.get(containerId)
    if (cb?.recoveryTimer) {
      clearTimeout(cb.recoveryTimer)
    }
    this.circuitBreakers.delete(containerId)

    logger.info({ containerId }, 'Claude session stopped')
    this.emit('daemon:stopped', { containerId })
  }

  /**
   * Cancel the current instruction being processed
   * Kills the child process and resets the session state
   */
  async cancelCurrentInstruction(containerId: string): Promise<boolean> {
    const session = this.sessions.get(containerId)
    if (!session) {
      logger.debug({ containerId }, 'No session to cancel instruction')
      return false
    }

    if (!session.isProcessing || !session.currentProcess) {
      logger.debug({ containerId }, 'No instruction in progress to cancel')
      return false
    }

    logger.info({ containerId }, 'Cancelling current instruction')

    // Kill the process
    try {
      session.currentProcess.kill('SIGTERM')

      // Wait a bit and force kill if still running
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (session.currentProcess && !session.currentProcess.killed) {
            session.currentProcess.kill('SIGKILL')
          }
          resolve()
        }, 1000)
      })

      session.isProcessing = false
      session.currentProcess = undefined

      // Reset processing state on cancellation (fix #9)
      session.processingState = { isProcessing: false, stage: 'idle' }
      this.emit('instruction:processing:complete', {
        containerId,
        success: false,
        durationMs: 0,
        timestamp: new Date(),
      })

      // Log cancellation
      claudeLogsService.addLog(containerId, 'system', 'Instrucao cancelada pelo usuario', {
        sessionId: session.sessionId,
      })

      // Emit cancellation event
      const event: ClaudeEvent = {
        type: 'system',
        timestamp: new Date(),
        data: { message: 'Instrucao cancelada', cancelled: true },
      }
      this.emit('claude:event', { containerId, event })
      this.emit('instruction:cancelled', { containerId })

      return true
    } catch (error) {
      logger.error({ containerId, error }, 'Failed to cancel instruction')
      session.isProcessing = false
      session.currentProcess = undefined
      // Reset processing state on error (fix #9)
      session.processingState = { isProcessing: false, stage: 'idle' }
      return false
    }
  }

  /**
   * Send an instruction to Claude Code
   * Spawns a new process for each instruction, using --resume for subsequent calls
   * Returns a Promise that resolves when the instruction completes with captured output
   */
  async sendInstruction(containerId: string, instruction: string, jobId?: string, cancelIfBusy: boolean = false): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const session = this.sessions.get(containerId)
    if (!session) {
      throw new Error(`No session active for container ${containerId}`)
    }

    if (session.state.status !== 'running') {
      throw new Error(`Session is not running (status: ${session.state.status})`)
    }

    // If already processing and cancelIfBusy is true, cancel the current instruction
    if (session.isProcessing) {
      if (cancelIfBusy) {
        logger.info({ containerId }, 'Cancelling current instruction to process new one')
        await this.cancelCurrentInstruction(containerId)
      } else {
        throw new Error('Session is already processing an instruction')
      }
    }

    // Check per-container circuit breaker before processing
    if (this.isCircuitOpen(containerId)) {
      const stats = this.getCircuitBreakerStats(containerId)
      logger.warn({ containerId, circuitState: stats.state, failures: stats.failures }, 'Circuit breaker open for container')
      throw new CircuitOpenError(`Circuit breaker open for container ${containerId}. Too many failures.`, CIRCUIT_BREAKER_RECOVERY_MS)
    }

    session.isProcessing = true
    session.state.lastActivity = new Date()

    const startTime = Date.now()

    // Set processing state FIRST (fix #9 - backend as source of truth)
    session.processingState = {
      isProcessing: true,
      stage: 'starting',
      startedAt: new Date(),
      lastActivityAt: new Date(),
    }

    // Emit processing start event
    this.emit('instruction:processing:start', {
      containerId,
      timestamp: new Date(),
    })

    logger.info({ containerId, instructionLength: instruction.length, sessionId: session.sessionId }, 'Sending instruction to Claude')

    // Log instrucao enviada (stdin)
    claudeLogsService.addLog(containerId, 'stdin', instruction, {
      sessionId: session.sessionId,
      jobId,
      instruction,
    })

    return new Promise((resolve, reject) => {
      // Guard flag to prevent double resolve/reject
      let hasExited = false

      // Buffer size tracking to prevent OOM
      const MAX_BUFFER_SIZE = 10 * 1024 * 1024 // 10MB
      let bufferSize = 0

      // Variables declared here so cleanup() can access them
      let childProcess: ChildProcess | null = null
      let timeoutId: NodeJS.Timeout | null = null
      let stdoutBuffer = ''
      let stderrBuffer = ''

      // Cleanup function to remove all listeners and clear resources
      const cleanup = () => {
        // Clear timeout
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        // Remove all listeners from process
        if (childProcess) {
          childProcess.stdout?.removeAllListeners('data')
          childProcess.stderr?.removeAllListeners('data')
          childProcess.removeAllListeners('exit')
          childProcess.removeAllListeners('error')
        }

        // Mark session as not processing
        session.isProcessing = false
        session.currentProcess = undefined
        session.processingState = { isProcessing: false, stage: 'idle' }
      }

      // Safe resolve wrapper - prevents double resolution
      const safeResolve = (value: { stdout: string; stderr: string; exitCode: number }) => {
        if (!hasExited) {
          hasExited = true
          cleanup()
          resolve(value)
        }
      }

      // Safe reject wrapper - prevents double rejection
      const safeReject = (error: Error) => {
        if (!hasExited) {
          hasExited = true
          cleanup()
          reject(error)
        }
      }

      try {
        // Build command flags
        // --dangerously-skip-permissions already handles autonomous execution
        const flags = [...CLAUDE_BASE_FLAGS]

        logger.debug({ containerId, mode: session.mode }, 'Building command flags')

        // Add --model flag if configured for this container
        const containerEntity = containerRepository.findById(containerId)
        const claudeModel = containerEntity?.config?.['claudeModel'] as string | undefined
        if (claudeModel) {
          flags.push('--model', claudeModel)
          logger.debug({ containerId, model: claudeModel }, 'Using configured Claude model')
        }

        // Ralph Loop: wrap instruction if enabled
        const ralphLoopEnabled = containerEntity?.config?.['ralphLoop'] === true
        const finalInstruction = ralphLoopEnabled
          ? `[RALPH MODE] You MUST work iteratively and autonomously until the task is FULLY complete. Do NOT stop to ask questions or for confirmation. Keep coding, testing, fixing, and improving until EVERYTHING is done and verified. Do not give partial answers - finish the entire task.\n\n${instruction}`
          : instruction
        if (ralphLoopEnabled) {
          logger.debug({ containerId }, 'Ralph Loop enabled - instruction wrapped')
        }

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
            content: finalInstruction,
          },
        }

        const jsonInput = JSON.stringify(streamInput)

        // Spawn docker exec process
        childProcess = spawn('docker', [
          'exec',
          '-i',
          '-w', CONTAINER_WORKSPACE,
          session.dockerId,
          'claude',
          ...flags,
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        // Store reference to current process for cancellation
        session.currentProcess = childProcess

        // Hard timeout watchdog - kill process if it runs too long
        timeoutId = setTimeout(() => {
          if (childProcess && !childProcess.killed) {
            logger.warn({ containerId, timeout: PROCESS_HARD_TIMEOUT }, 'Process exceeded hard timeout, killing...')
            childProcess.kill('SIGKILL')

            // Log timeout
            claudeLogsService.addLog(containerId, 'system', `Processo excedeu timeout de ${PROCESS_HARD_TIMEOUT / 1000}s e foi encerrado`, {
              sessionId: session.sessionId,
              jobId,
              timeout: PROCESS_HARD_TIMEOUT,
            })

            // Reject AFTER killing the process (fix: timeout must guarantee rejection)
            safeReject(new Error(`Timeout: processo excedeu ${PROCESS_HARD_TIMEOUT / 1000}s e foi encerrado`))
          }
        }, PROCESS_HARD_TIMEOUT)

        // Handle stdout (JSON streaming)
        childProcess.stdout?.on('data', (chunk: Buffer) => {
          // Check buffer size limit to prevent OOM
          bufferSize += chunk.length
          if (bufferSize > MAX_BUFFER_SIZE) {
            logger.error({ containerId, bufferSize }, 'Output buffer exceeded 10MB limit')
            claudeLogsService.addLog(containerId, 'system', 'Processo encerrado: buffer de saida excedeu 10MB', {
              sessionId: session.sessionId,
              jobId,
              bufferSize,
            })
            if (childProcess && !childProcess.killed) {
              childProcess.kill('SIGKILL')
            }
            safeReject(new Error('Output buffer exceeded 10MB limit'))
            return
          }

          const data = chunk.toString('utf-8')
          stdoutBuffer += data

          // Log stdout em tempo real
          claudeLogsService.addLog(containerId, 'stdout', data, {
            sessionId: session.sessionId,
            jobId,
          })

          // Update processing state based on output (fix #9)
          const newStage = this.detectProcessingStage(data)
          if (session.processingState.stage !== newStage) {
            session.processingState.stage = newStage
            session.processingState.lastActivityAt = new Date()
            this.emit('instruction:processing:progress', {
              containerId,
              stage: newStage,
              timestamp: new Date(),
            })
          }

          this.handleOutput(containerId, data)
        })

        // Handle stderr
        childProcess.stderr?.on('data', (chunk: Buffer) => {
          // Check buffer size limit for stderr too
          bufferSize += chunk.length
          if (bufferSize > MAX_BUFFER_SIZE) {
            logger.error({ containerId, bufferSize }, 'Output buffer exceeded 10MB limit')
            claudeLogsService.addLog(containerId, 'system', 'Processo encerrado: buffer de saida excedeu 10MB', {
              sessionId: session.sessionId,
              jobId,
              bufferSize,
            })
            if (childProcess && !childProcess.killed) {
              childProcess.kill('SIGKILL')
            }
            safeReject(new Error('Output buffer exceeded 10MB limit'))
            return
          }

          const errorOutput = chunk.toString('utf-8')
          stderrBuffer += errorOutput
          logger.warn({ containerId, error: errorOutput }, 'Claude stderr')

          // Log stderr em tempo real
          claudeLogsService.addLog(containerId, 'stderr', errorOutput, {
            sessionId: session.sessionId,
            jobId,
          })

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
          // If already exited (e.g., via timeout or buffer overflow), ignore
          if (hasExited) {
            return
          }

          const exitCode = code ?? -1
          const duration = Date.now() - startTime

          if (exitCode === 0) {
            logger.info({ containerId, exitCode, duration }, 'Main instruction process completed')

            // Record success in per-container circuit breaker
            this.recordSuccess(containerId)

            // Log conclusao com sucesso
            claudeLogsService.addLog(containerId, 'system', `Instrucao concluida com sucesso (exit code: ${exitCode})`, {
              sessionId: session.sessionId,
              jobId,
              exitCode,
              duration,
            })
          } else {
            logger.warn({ containerId, exitCode, signal, duration }, 'Instruction process exited with non-zero code')

            // Record failure in per-container circuit breaker
            this.recordFailure(containerId)

            // Log conclusao com erro
            claudeLogsService.addLog(containerId, 'system', `Instrucao falhou (exit code: ${exitCode}, signal: ${signal || 'none'})`, {
              sessionId: session.sessionId,
              jobId,
              exitCode,
              duration,
            })

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

            // Update processing state to waiting_agents (fix #9)
            session.processingState.stage = 'waiting_agents'
            this.emit('instruction:processing:progress', {
              containerId,
              stage: 'waiting_agents',
              message: 'Aguardando agentes finalizarem...',
              timestamp: new Date(),
            })

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

          // Update session state (instruction count and last activity)
          session.state.instructionCount++
          session.state.lastActivity = new Date()

          // Reset processing state (fix #9)
          session.processingState = { isProcessing: false, stage: 'idle' }

          // Emit complete event (fix #9)
          logger.info({ containerId, exitCode, duration }, 'Emitting instruction:processing:complete')
          this.emit('instruction:processing:complete', {
            containerId,
            success: exitCode === 0,
            durationMs: duration,
            timestamp: new Date(),
          })

          // If exit code is non-zero, reject
          if (exitCode !== 0) {
            logger.error({ containerId, exitCode, signal, duration }, 'Instruction failed with non-zero exit code')
            safeReject(new Error(`Processo falhou com exit code ${exitCode}${signal ? ` (signal: ${signal})` : ''}`))
            return
          }

          logger.info({ containerId, exitCode }, 'Instruction fully completed (including background agents)')

          // Resolve with captured output
          safeResolve({
            stdout: stdoutBuffer,
            stderr: stderrBuffer,
            exitCode,
          })
        })

        // Handle process error
        childProcess.on('error', (error) => {
          // If already exited (e.g., via timeout or buffer overflow), ignore
          if (hasExited) {
            return
          }

          // Record failure in per-container circuit breaker
          this.recordFailure(containerId)

          const duration = Date.now() - startTime
          logger.error({ containerId, error, duration }, 'Instruction process error')

          // Emit error event (fix #9)
          this.emit('instruction:processing:error', {
            containerId,
            error: error.message,
            timestamp: new Date(),
          })

          // Log erro do processo
          claudeLogsService.addLog(containerId, 'system', `Erro no processo: ${error.message}`, {
            sessionId: session.sessionId,
            jobId,
            duration,
          })

          const event: ClaudeEvent = {
            type: 'error',
            timestamp: new Date(),
            data: { error: error.message },
          }
          this.emit('claude:event', { containerId, event })

          safeReject(error)
        })

      } catch (error) {
        // Emit error event (fix #9)
        this.emit('instruction:processing:error', {
          containerId,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        })
        safeReject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  /**
   * Get the current status of a session
   */
  getStatus(containerId: string): DaemonState & { circuitBreaker?: { state: string; failures: number; lastFailure?: Date } } | null {
    const session = this.sessions.get(containerId)
    if (!session) {
      return null
    }

    // Get per-container circuit breaker stats
    const circuitStats = this.getCircuitBreakerStats(containerId)

    // Return a copy to maintain immutability, including circuit breaker state
    return {
      ...session.state,
      circuitBreaker: circuitStats,
    }
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
   * Detect processing stage based on output content (fix #9)
   * Used to provide granular progress updates to frontend
   */
  private detectProcessingStage(data: string): ProcessingStage {
    // Check for tool usage (processing stage)
    if (data.includes('"type":"tool_use"') || data.includes('"name":"Task"')) {
      return 'processing'
    }

    // Check for streaming assistant response
    if (data.includes('"type":"assistant"')) {
      return 'streaming'
    }

    // Check for final result
    if (data.includes('"type":"result"')) {
      return 'finalizing'
    }

    // Default to streaming if we have any output
    return 'streaming'
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

    // Clean up all circuit breaker timers
    for (const [, cb] of this.circuitBreakers) {
      if (cb.recoveryTimer) {
        clearTimeout(cb.recoveryTimer)
      }
    }
    this.circuitBreakers.clear()

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
