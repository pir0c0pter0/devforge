import { Worker, Job } from 'bullmq'
import { logger } from '../utils/logger'
import { claudeDaemonService } from '../services/claude-daemon.service'
import { validateContainerId, validateInstruction } from '../validators/claude.validators'
import { getRedisConnection } from '../utils/redis'
import {
  emitInstructionStarted,
  emitInstructionProgress,
  emitInstructionCompleted,
  emitInstructionFailed,
  emitQueueStatsUpdate,
} from '../services/websocket.service'
import { moveToDeadLetterQueue, getQueueStatus } from '../services/claude-queue.service'
import { usageService } from '../services/usage.service'
import type { InstructionJobData, InstructionEventData, InstructionStage, InstructionProgress } from '@devforge/shared'

/**
 * Helper to create progress data with stage information
 */
function createProgressData(
  percentage: number,
  stage: InstructionStage,
  message: string
): InstructionProgress {
  return {
    percentage,
    stage,
    message,
    timestamp: new Date(),
  }
}

/**
 * Map of active workers (containerId -> Worker)
 */
const workers = new Map<string, Worker>()

/**
 * Worker event emitter for tracking worker lifecycle
 */
import { EventEmitter } from 'events'
export const workerEvents = new EventEmitter()

/**
 * Create or return worker for a specific container
 * Each container gets its own dedicated worker that processes instructions sequentially
 */
export function getOrCreateWorker(containerId: string): Worker {
  // Validate container ID
  const validated = validateContainerId(containerId)

  // Return existing worker if already created
  if (workers.has(validated)) {
    return workers.get(validated)!
  }

  logger.info({ containerId: validated }, 'Creating BullMQ worker for container')

  // Create worker that processes jobs from the container's queue
  const worker = new Worker<InstructionJobData>(
    `claude-instructions-${validated}`, // Queue name must match claude-queue.service.ts
    async (job: Job<InstructionJobData>) => {
      const { containerId, instruction, mode } = job.data
      const startTime = Date.now()

      logger.info({
        jobId: job.id,
        containerId,
        mode,
        instructionLength: instruction.length
      }, 'Processing Claude instruction from queue')

      // Emit started event via WebSocket
      const baseEventData: InstructionEventData = {
        id: job.id || 'unknown',
        containerId,
        instruction,
        status: 'running',
        createdAt: new Date(job.timestamp),
        startedAt: new Date(),
      }
      emitInstructionStarted(baseEventData)

      try {
        // Stage 1: Validating inputs
        const progressValidating = createProgressData(5, 'validating', 'Validando instrução...')
        await job.updateProgress(progressValidating)
        emitInstructionProgress({ ...baseEventData, progress: 5, progressDetail: progressValidating })

        validateContainerId(containerId)
        const safeInstruction = validateInstruction(instruction)

        const progressValidated = createProgressData(10, 'validating', 'Instrução validada com sucesso')
        await job.updateProgress(progressValidated)
        emitInstructionProgress({ ...baseEventData, progress: 10, progressDetail: progressValidated })

        // Stage 2: Check daemon status
        const progressCheckDaemon = createProgressData(15, 'checking_daemon', 'Verificando status do daemon...')
        await job.updateProgress(progressCheckDaemon)
        emitInstructionProgress({ ...baseEventData, progress: 15, progressDetail: progressCheckDaemon })

        // Verify daemon is running, start if needed
        const status = claudeDaemonService.getStatus(containerId)
        if (!status || status.status !== 'running') {
          logger.info({ containerId }, 'Starting daemon before processing instruction')

          // Need to get dockerId from container
          const { containerRepository } = await import('../repositories')
          const container = containerRepository.findById(containerId)
          if (!container || !container.dockerId) {
            throw new Error(`Container ${containerId} not found or has no Docker ID`)
          }

          // Stage 3: Starting daemon
          const progressStartDaemon = createProgressData(20, 'starting_daemon', 'Iniciando daemon Claude Code...')
          await job.updateProgress(progressStartDaemon)
          emitInstructionProgress({ ...baseEventData, progress: 20, progressDetail: progressStartDaemon })

          await claudeDaemonService.startDaemon(containerId, container.dockerId)

          const progressWaitDaemon = createProgressData(25, 'starting_daemon', 'Aguardando daemon ficar pronto...')
          await job.updateProgress(progressWaitDaemon)
          emitInstructionProgress({ ...baseEventData, progress: 25, progressDetail: progressWaitDaemon })

          // Wait for daemon to be ready with verification
          const maxWaitTime = 10000 // 10 seconds max
          const checkInterval = 500
          let waited = 0

          while (waited < maxWaitTime) {
            const daemonStatus = claudeDaemonService.getStatus(containerId)
            if (daemonStatus?.status === 'running') {
              break
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval))
            waited += checkInterval

            const progressWaiting = createProgressData(
              25 + Math.floor((waited / maxWaitTime) * 5),
              'starting_daemon',
              `Aguardando daemon... (${Math.floor(waited / 1000)}s)`
            )
            await job.updateProgress(progressWaiting)
            emitInstructionProgress({ ...baseEventData, progress: progressWaiting.percentage, progressDetail: progressWaiting })
          }

          if (waited >= maxWaitTime) {
            throw new Error('Daemon failed to start within 10 seconds')
          }
        }

        // Stage 4: Daemon ready
        const progressDaemonReady = createProgressData(30, 'daemon_ready', 'Daemon Claude Code pronto')
        await job.updateProgress(progressDaemonReady)
        emitInstructionProgress({ ...baseEventData, progress: 30, progressDetail: progressDaemonReady })

        // Stage 5: Sending instruction
        const progressSending = createProgressData(35, 'sending_instruction', 'Preparando envio da instrução...')
        await job.updateProgress(progressSending)
        emitInstructionProgress({ ...baseEventData, progress: 35, progressDetail: progressSending })

        const progressSent = createProgressData(40, 'sending_instruction', 'Enviando instrução para Claude Code...')
        await job.updateProgress(progressSent)
        emitInstructionProgress({ ...baseEventData, progress: 40, progressDetail: progressSent })

        // Stage 6: Processing
        const progressProcessing = createProgressData(45, 'processing', 'Claude Code processando instrução...')
        await job.updateProgress(progressProcessing)
        emitInstructionProgress({ ...baseEventData, progress: 45, progressDetail: progressProcessing })

        // Listen for daemon events to track background agents
        const eventHandler = ({ containerId: eventContainerId, event }: { containerId: string; event: { type: string; data?: { message?: string; agentCount?: number } } }) => {
          if (eventContainerId !== containerId) return

          // Update progress when waiting for background agents
          if (event.type === 'system' && event.data?.agentCount) {
            const agentProgress = createProgressData(
              55,
              'processing',
              event.data.message || `Aguardando ${event.data.agentCount} agente(s)...`
            )
            job.updateProgress(agentProgress)
            emitInstructionProgress({ ...baseEventData, progress: 55, progressDetail: agentProgress })
          }
        }

        claudeDaemonService.on('claude:event', eventHandler)

        // Send instruction to Claude daemon and wait for completion
        // Now returns captured output when the instruction finishes (including background agents)
        // Pass jobId for log association
        let result
        try {
          result = await claudeDaemonService.sendInstruction(containerId, safeInstruction, job.id)
        } finally {
          // Remove event listener
          claudeDaemonService.off('claude:event', eventHandler)
        }

        // Stage 7: Finalizing
        const progressFinalizing = createProgressData(80, 'finalizing', 'Instrução concluída, processando resultado...')
        await job.updateProgress(progressFinalizing)
        emitInstructionProgress({ ...baseEventData, progress: 80, progressDetail: progressFinalizing })

        const duration = Date.now() - startTime

        logger.info({ jobId: job.id, containerId, duration, exitCode: result.exitCode }, 'Instruction processed successfully')

        const progressValidatingResult = createProgressData(90, 'finalizing', 'Validando resultado...')
        await job.updateProgress(progressValidatingResult)
        emitInstructionProgress({ ...baseEventData, progress: 90, progressDetail: progressValidatingResult })

        // Stage 8: Recording usage
        const progressRecordUsage = createProgressData(95, 'finalizing', 'Registrando uso de tokens...')
        await job.updateProgress(progressRecordUsage)
        emitInstructionProgress({ ...baseEventData, progress: 95, progressDetail: progressRecordUsage })

        // Record token usage from Claude output
        try {
          usageService.recordUsageFromOutput(containerId, job.id, result.stdout)
        } catch (usageError) {
          // Don't fail the job if usage tracking fails
          logger.warn({ usageError, containerId, jobId: job.id }, 'Failed to record usage, continuing')
        }

        // Stage 9: Completed
        const progressCompleted = createProgressData(100, 'completed', 'Instrução executada com sucesso')
        await job.updateProgress(progressCompleted)

        // Emit completed event via WebSocket
        emitInstructionCompleted({
          ...baseEventData,
          status: 'completed',
          completedAt: new Date(),
          progress: 100,
          progressDetail: progressCompleted,
        })

        // Return captured output as job result
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          duration,
          completedAt: new Date()
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error({ error, jobId: job.id, containerId }, 'Failed to process instruction')

        // Check if this is the last attempt
        const maxAttempts = job.opts.attempts || 3
        if (job.attemptsMade >= maxAttempts - 1) {
          // This is the last attempt, move to DLQ
          await moveToDeadLetterQueue(containerId, job, errorMessage)
        } else {
          // Emit failed event (will retry)
          emitInstructionFailed({
            ...baseEventData,
            status: 'failed',
            completedAt: new Date(),
            error: `${errorMessage} (tentativa ${job.attemptsMade + 1}/${maxAttempts})`,
          })
        }

        // BullMQ will handle retry based on job configuration
        throw new Error(`Failed to process instruction: ${errorMessage}`)
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1, // Process one instruction at a time per container
      limiter: {
        max: 10, // Max 10 jobs
        duration: 60000, // per minute
      },
    }
  )

  // Event handlers for worker lifecycle
  worker.on('completed', async (job) => {
    logger.info({ jobId: job.id, containerId: job.data.containerId }, 'Job completed')
    workerEvents.emit('job:completed', { jobId: job.id, containerId: job.data.containerId })

    // Emit updated queue stats
    try {
      const stats = await getQueueStatus(job.data.containerId)
      emitQueueStatsUpdate(job.data.containerId, {
        queueLength: stats.waiting + stats.active,
        activeJobs: stats.active,
        lastActivity: new Date(),
      })
    } catch (error) {
      logger.warn({ error, containerId: job.data.containerId }, 'Failed to emit queue stats after completion')
    }
  })

  worker.on('failed', async (job, error) => {
    if (job) {
      const maxAttempts = job.opts.attempts || 3
      const isLastAttempt = job.attemptsMade >= maxAttempts

      logger.error({
        jobId: job.id,
        containerId: job.data.containerId,
        error: error.message,
        attemptsMade: job.attemptsMade,
        maxAttempts,
        isLastAttempt,
      }, 'Job failed')

      workerEvents.emit('job:failed', {
        jobId: job.id,
        containerId: job.data.containerId,
        error: error.message,
        attemptsMade: job.attemptsMade,
        maxAttempts,
        willRetry: !isLastAttempt,
      })

      // Emit updated queue stats
      try {
        const stats = await getQueueStatus(job.data.containerId)
        emitQueueStatsUpdate(job.data.containerId, {
          queueLength: stats.waiting + stats.active,
          activeJobs: stats.active,
          lastActivity: new Date(),
        })
      } catch (err) {
        logger.warn({ err, containerId: job.data.containerId }, 'Failed to emit queue stats after failure')
      }
    } else {
      logger.error({ error: error.message }, 'Job failed without job data')
    }
  })

  worker.on('error', (error) => {
    logger.error({ error: error.message, containerId: validated }, 'Worker error')
    workerEvents.emit('worker:error', { containerId: validated, error: error.message })
  })

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId, containerId: validated }, 'Job stalled - will be retried')
    workerEvents.emit('job:stalled', { jobId, containerId: validated })
  })

  // Store worker reference
  workers.set(validated, worker)
  workerEvents.emit('worker:created', { containerId: validated })

  return worker
}

/**
 * Stop worker for a specific container
 */
export async function stopWorker(containerId: string): Promise<void> {
  const worker = workers.get(containerId)
  if (worker) {
    logger.info({ containerId }, 'Stopping worker')
    await worker.close()
    workers.delete(containerId)
    workerEvents.emit('worker:stopped', { containerId })
    logger.info({ containerId }, 'Worker stopped')
  }
}

/**
 * Stop all workers gracefully
 */
export async function stopAllWorkers(): Promise<void> {
  logger.info({ workerCount: workers.size }, 'Stopping all workers')

  const closePromises = Array.from(workers.entries()).map(async ([containerId, worker]) => {
    try {
      await worker.close()
      workers.delete(containerId)
      logger.info({ containerId }, 'Worker stopped')
    } catch (error) {
      logger.error({ containerId, error }, 'Error stopping worker')
    }
  })

  await Promise.all(closePromises)
  workers.clear()
  workerEvents.emit('all-workers:stopped')
  logger.info('All workers stopped')
}

/**
 * Get list of container IDs with active workers
 */
export function getActiveWorkers(): string[] {
  return Array.from(workers.keys())
}

/**
 * Get worker statistics
 */
export function getWorkerStats(): { total: number; containerIds: string[] } {
  return {
    total: workers.size,
    containerIds: Array.from(workers.keys())
  }
}
