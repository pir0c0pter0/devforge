import { Worker, Job } from 'bullmq'
import { logger } from '../utils/logger'
import { claudeDaemonService } from '../services/claude-daemon.service'
import { validateContainerId, validateInstruction } from '../validators/claude.validators'
import { getRedisConnection } from '../utils/redis'
import type { InstructionJobData } from '@claude-docker/shared'

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
    validated, // Queue name matches containerId
    async (job: Job<InstructionJobData>) => {
      const { containerId, instruction, mode } = job.data

      logger.info({
        jobId: job.id,
        containerId,
        mode,
        instructionLength: instruction.length
      }, 'Processing Claude instruction from queue')

      try {
        // Validate inputs
        validateContainerId(containerId)
        const safeInstruction = validateInstruction(instruction)

        // Update job progress: Starting
        await job.updateProgress({
          percentage: 10,
          message: 'Verificando daemon...',
          timestamp: new Date()
        })

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

          await job.updateProgress({
            percentage: 20,
            message: 'Iniciando daemon Claude...',
            timestamp: new Date()
          })

          await claudeDaemonService.startDaemon(containerId, container.dockerId)

          // Wait for daemon to be ready
          await new Promise(resolve => setTimeout(resolve, 2000))
        }

        await job.updateProgress({
          percentage: 40,
          message: 'Enviando instrução...',
          timestamp: new Date()
        })

        // Send instruction to Claude daemon
        // The daemon service will emit events via EventEmitter which are forwarded to WebSocket
        await claudeDaemonService.sendInstruction(containerId, safeInstruction)

        await job.updateProgress({
          percentage: 80,
          message: 'Instrução enviada',
          timestamp: new Date()
        })

        logger.info({ jobId: job.id, containerId }, 'Instruction processed successfully')

        await job.updateProgress({
          percentage: 100,
          message: 'Concluído',
          timestamp: new Date()
        })

        // Return success result
        return {
          stdout: '', // Output is streamed via WebSocket, not returned here
          stderr: '',
          exitCode: 0,
          duration: Date.now() - job.timestamp,
          completedAt: new Date()
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error({ error, jobId: job.id, containerId }, 'Failed to process instruction')

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
  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, containerId: job.data.containerId }, 'Job completed')
    workerEvents.emit('job:completed', { jobId: job.id, containerId: job.data.containerId })
  })

  worker.on('failed', (job, error) => {
    if (job) {
      logger.error({
        jobId: job.id,
        containerId: job.data.containerId,
        error: error.message,
        attemptsMade: job.attemptsMade
      }, 'Job failed')
      workerEvents.emit('job:failed', {
        jobId: job.id,
        containerId: job.data.containerId,
        error: error.message
      })
    } else {
      logger.error({ error: error.message }, 'Job failed without job data')
    }
  })

  worker.on('error', (error) => {
    logger.error({ error: error.message, containerId: validated }, 'Worker error')
    workerEvents.emit('worker:error', { containerId: validated, error: error.message })
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
