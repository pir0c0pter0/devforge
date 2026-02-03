import { Queue, Job } from 'bullmq'
import { getRedisConnection } from '../utils/redis'
import { config } from '../config'
import type {
  InstructionJobData,
  InstructionJobResult,
  JobInfo,
  QueueMetrics,
  JobStatus,
} from '@claude-docker/shared'

/**
 * Map of container queues (containerId -> Queue)
 */
const queues = new Map<string, Queue>()

/**
 * Get or create queue for a specific container
 */
const getQueue = (containerId: string): Queue => {
  let queue = queues.get(containerId)

  if (!queue) {
    const connection = getRedisConnection()

    queue = new Queue(containerId, {
      connection,
      defaultJobOptions: {
        attempts: config.maxJobRetries,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
          count: 200, // Keep last 200 failed jobs
        },
      },
    })

    queues.set(containerId, queue)
  }

  return queue
}

/**
 * Convert BullMQ job to JobInfo
 */
const jobToInfo = async (job: Job): Promise<JobInfo> => {
  const state = await job.getState()

  let progress: JobInfo['progress'] = undefined
  if (job.progress) {
    if (
      typeof job.progress === 'object' &&
      'percentage' in job.progress &&
      'message' in job.progress &&
      'timestamp' in job.progress
    ) {
      progress = job.progress as JobInfo['progress']
    } else if (typeof job.progress === 'number') {
      progress = { percentage: job.progress, message: '', timestamp: new Date() }
    }
  }

  return {
    id: job.id ?? 'unknown',
    data: job.data as InstructionJobData,
    status: state as JobStatus,
    progress,
    result: job.returnvalue as InstructionJobResult | undefined,
    error: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    processedOn: job.processedOn ?? undefined,
    finishedOn: job.finishedOn ?? undefined,
    stacktrace: job.stacktrace,
  }
}

/**
 * Add instruction to queue
 */
export const addInstruction = async (
  containerId: string,
  instruction: string,
  mode: 'interactive' | 'autonomous'
): Promise<JobInfo> => {
  const queue = getQueue(containerId)

  const jobData: InstructionJobData = {
    containerId,
    instruction,
    mode,
    timestamp: new Date(),
  }

  const job = await queue.add(`instruction-${Date.now()}`, jobData, {
    priority: mode === 'interactive' ? 1 : 2, // Interactive has higher priority
  })

  return jobToInfo(job)
}

/**
 * Get queue status and metrics
 */
export const getQueueStatus = async (containerId: string): Promise<QueueMetrics> => {
  const queue = getQueue(containerId)

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ])

  return {
    containerId,
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused: 0, // BullMQ doesn't expose getPausedCount in current version
    total: waiting + active + completed + failed + delayed,
  }
}

/**
 * Get job history (recent jobs)
 */
export const getJobHistory = async (
  containerId: string,
  limit: number = 50
): Promise<JobInfo[]> => {
  const queue = getQueue(containerId)

  const [waiting, active, completed, failed] = await Promise.all([
    queue.getJobs(['waiting'], 0, limit),
    queue.getJobs(['active'], 0, limit),
    queue.getJobs(['completed'], 0, limit),
    queue.getJobs(['failed'], 0, limit),
  ])

  const allJobs = [...waiting, ...active, ...completed, ...failed]

  // Sort by timestamp descending
  allJobs.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

  // Take only the requested limit
  const limitedJobs = allJobs.slice(0, limit)

  return Promise.all(limitedJobs.map(jobToInfo))
}

/**
 * Get specific job by ID
 */
export const getJob = async (
  containerId: string,
  jobId: string
): Promise<JobInfo | null> => {
  const queue = getQueue(containerId)
  const job = await queue.getJob(jobId)

  if (!job) {
    return null
  }

  return jobToInfo(job)
}

/**
 * Cancel a pending or active job
 */
export const cancelJob = async (containerId: string, jobId: string): Promise<void> => {
  const queue = getQueue(containerId)
  const job = await queue.getJob(jobId)

  if (!job) {
    throw new Error(`Job ${jobId} not found`)
  }

  const state = await job.getState()

  if (state === 'completed' || state === 'failed') {
    throw new Error(`Cannot cancel ${state} job`)
  }

  await job.remove()
}

/**
 * Retry a failed job
 */
export const retryJob = async (containerId: string, jobId: string): Promise<JobInfo> => {
  const queue = getQueue(containerId)
  const job = await queue.getJob(jobId)

  if (!job) {
    throw new Error(`Job ${jobId} not found`)
  }

  const state = await job.getState()

  if (state !== 'failed') {
    throw new Error(`Cannot retry job in ${state} state`)
  }

  await job.retry()

  return jobToInfo(job)
}

/**
 * Clear entire queue (remove all jobs)
 */
export const clearQueue = async (containerId: string): Promise<void> => {
  const queue = getQueue(containerId)

  await queue.drain()
  await queue.clean(0, 1000, 'completed')
  await queue.clean(0, 1000, 'failed')
}

/**
 * Pause queue (stop processing new jobs)
 */
export const pauseQueue = async (containerId: string): Promise<void> => {
  const queue = getQueue(containerId)
  await queue.pause()
}

/**
 * Resume queue (start processing jobs again)
 */
export const resumeQueue = async (containerId: string): Promise<void> => {
  const queue = getQueue(containerId)
  await queue.resume()
}

/**
 * Delete queue and cleanup resources
 */
export const deleteQueue = async (containerId: string): Promise<void> => {
  const queue = queues.get(containerId)

  if (queue) {
    await queue.drain()
    await queue.close()
    queues.delete(containerId)
  }
}

/**
 * Close all queues gracefully
 */
export const closeAllQueues = async (): Promise<void> => {
  const closePromises = Array.from(queues.entries()).map(async ([containerId, queue]) => {
    await queue.close()
    queues.delete(containerId)
  })

  await Promise.all(closePromises)
}

/**
 * Get all active queue container IDs
 */
export const getActiveQueues = (): string[] => {
  return Array.from(queues.keys())
}
