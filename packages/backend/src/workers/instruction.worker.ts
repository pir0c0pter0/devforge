import { Worker, Job } from 'bullmq'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getRedisConnection } from '../utils/redis'
import { config } from '../config'
import {
  emitInstructionStarted,
  emitInstructionProgress,
  emitInstructionCompleted,
  emitInstructionFailed,
} from '../services/websocket.service'
import type {
  InstructionJobData,
  InstructionJobResult,
  InstructionEventData,
} from '@claude-docker/shared'

const execPromise = promisify(exec)

/**
 * Map of active workers (containerId -> Worker)
 */
const workers = new Map<string, Worker<InstructionJobData, InstructionJobResult>>()

/**
 * Execute command inside Docker container
 */
const executeInContainer = async (
  containerId: string,
  instruction: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  try {
    const startTime = Date.now()

    // Execute command inside container using docker exec
    const { stdout, stderr } = await execPromise(
      `docker exec ${containerId} /bin/bash -c ${JSON.stringify(instruction)}`,
      {
        timeout: config.jobTimeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }
    )

    const duration = Date.now() - startTime

    console.info(
      `[Worker] Command executed in container ${containerId} (${duration}ms)`
    )

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
    }
  } catch (error: unknown) {
    // Type guard for error with code property
    const hasCode = (err: unknown): err is { code: number } => {
      return (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        typeof (err as { code: unknown }).code === 'number'
      )
    }

    // Type guard for error with stdout/stderr
    const hasOutput = (
      err: unknown
    ): err is { stdout: string; stderr: string } => {
      return (
        typeof err === 'object' &&
        err !== null &&
        'stdout' in err &&
        'stderr' in err &&
        typeof (err as { stdout: unknown }).stdout === 'string' &&
        typeof (err as { stderr: unknown }).stderr === 'string'
      )
    }

    const exitCode = hasCode(error) ? error.code : 1
    const stdout = hasOutput(error) ? error.stdout?.trim() ?? '' : ''
    const stderr = hasOutput(error) ? error.stderr?.trim() ?? '' : ''

    return {
      stdout,
      stderr,
      exitCode,
    }
  }
}

/**
 * Check if container is running
 */
const isContainerRunning = async (containerId: string): Promise<boolean> => {
  try {
    const { stdout } = await execPromise(
      `docker inspect -f '{{.State.Running}}' ${containerId}`
    )
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * Process instruction job
 */
const processJob = async (
  job: Job<InstructionJobData, InstructionJobResult>
): Promise<InstructionJobResult> => {
  const { containerId, instruction, mode } = job.data
  const startTime = Date.now()

  console.info(`[Worker] Processing job ${job.id} for container ${containerId}`)

  // Emit started event
  const startedData: InstructionEventData = {
    id: job.id ?? 'unknown',
    containerId,
    instruction,
    status: 'running',
    createdAt: new Date(job.timestamp),
    startedAt: new Date(),
  }
  emitInstructionStarted(startedData)

  // Check if container is running
  const isRunning = await isContainerRunning(containerId)
  if (!isRunning) {
    throw new Error(`Container ${containerId} is not running`)
  }

  // For interactive mode, wait for user confirmation
  if (mode === 'interactive') {
    await job.updateProgress({
      percentage: 0,
      message: 'Waiting for user confirmation...',
      timestamp: new Date(),
    })

    emitInstructionProgress({
      ...startedData,
      progress: 0,
    })

    // In production, this would wait for WebSocket confirmation
    // For now, we'll proceed after a short delay
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  // Update progress
  await job.updateProgress({
    percentage: 25,
    message: 'Executing instruction...',
    timestamp: new Date(),
  })

  emitInstructionProgress({
    ...startedData,
    progress: 25,
  })

  // Execute the instruction
  const { stdout, stderr, exitCode } = await executeInContainer(
    containerId,
    instruction
  )

  // Update progress
  await job.updateProgress({
    percentage: 75,
    message: 'Processing results...',
    timestamp: new Date(),
  })

  emitInstructionProgress({
    ...startedData,
    progress: 75,
  })

  const duration = Date.now() - startTime
  const result: InstructionJobResult = {
    stdout,
    stderr,
    exitCode,
    duration,
    completedAt: new Date(),
  }

  // Update progress to complete
  await job.updateProgress({
    percentage: 100,
    message: 'Completed',
    timestamp: new Date(),
  })

  // Emit completion event
  const completedData: InstructionEventData = {
    id: job.id ?? 'unknown',
    containerId,
    instruction,
    status: exitCode === 0 ? 'completed' : 'failed',
    createdAt: new Date(job.timestamp),
    startedAt: new Date(startTime),
    completedAt: new Date(),
    result: stdout,
    error: exitCode !== 0 ? stderr : undefined,
    progress: 100,
  }

  if (exitCode === 0) {
    emitInstructionCompleted(completedData)
  } else {
    emitInstructionFailed(completedData)
  }

  console.info(`[Worker] Job ${job.id} completed in ${duration}ms`)

  return result
}

/**
 * Create worker for a specific container queue
 */
export const createWorker = (
  containerId: string
): Worker<InstructionJobData, InstructionJobResult> => {
  const existingWorker = workers.get(containerId)
  if (existingWorker) {
    return existingWorker
  }

  const connection = getRedisConnection()

  const worker = new Worker<InstructionJobData, InstructionJobResult>(
    containerId,
    processJob,
    {
      connection,
      concurrency: config.queueConcurrency,
      limiter: {
        max: 10,
        duration: 1000, // Max 10 jobs per second per container
      },
    }
  )

  worker.on('completed', (job) => {
    console.info(
      `[Worker] Job ${job.id} completed for container ${containerId}`
    )
  })

  worker.on('failed', (job, error) => {
    console.error(
      `[Worker] Job ${job?.id} failed for container ${containerId}:`,
      error.message
    )

    if (job) {
      const failedData: InstructionEventData = {
        id: job.id ?? 'unknown',
        containerId: job.data.containerId,
        instruction: job.data.instruction,
        status: 'failed',
        createdAt: new Date(job.timestamp),
        startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
        completedAt: new Date(),
        error: error.message,
      }
      emitInstructionFailed(failedData)
    }
  })

  worker.on('error', (error) => {
    console.error(`[Worker] Error in worker for container ${containerId}:`, error.message)
  })

  workers.set(containerId, worker)

  console.info(`[Worker] Created worker for container ${containerId}`)

  return worker
}

/**
 * Get worker for a container
 */
export const getWorker = (
  containerId: string
): Worker<InstructionJobData, InstructionJobResult> | undefined => {
  return workers.get(containerId)
}

/**
 * Stop worker for a container
 */
export const stopWorker = async (containerId: string): Promise<void> => {
  const worker = workers.get(containerId)
  if (worker) {
    await worker.close()
    workers.delete(containerId)
    console.info(`[Worker] Stopped worker for container ${containerId}`)
  }
}

/**
 * Stop all workers gracefully
 */
export const stopAllWorkers = async (): Promise<void> => {
  const stopPromises = Array.from(workers.entries()).map(
    async ([containerId, worker]) => {
      await worker.close()
      workers.delete(containerId)
      console.info(`[Worker] Stopped worker for container ${containerId}`)
    }
  )

  await Promise.all(stopPromises)
}

/**
 * Get all active worker container IDs
 */
export const getActiveWorkers = (): string[] => {
  return Array.from(workers.keys())
}
