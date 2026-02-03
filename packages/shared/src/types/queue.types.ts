import type { ContainerMode } from './container.types'

/**
 * Job data stored in BullMQ queue
 */
export interface InstructionJobData {
  /** Target container ID */
  containerId: string
  /** Instruction text to execute */
  instruction: string
  /** Execution mode (interactive requires confirmation) */
  mode: ContainerMode
  /** Timestamp when job was created */
  timestamp: Date
}

/**
 * Job result returned after successful execution
 */
export interface InstructionJobResult {
  /** Standard output from command execution */
  stdout: string
  /** Standard error from command execution */
  stderr: string
  /** Exit code (0 for success) */
  exitCode: number
  /** Execution duration in milliseconds */
  duration: number
  /** Timestamp when execution completed */
  completedAt: Date
}

/**
 * Job progress data
 */
export interface InstructionJobProgress {
  /** Progress percentage (0-100) */
  percentage: number
  /** Current step description */
  message: string
  /** Timestamp of progress update */
  timestamp: Date
}

/**
 * Job status from BullMQ
 */
export type JobStatus =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused'

/**
 * Extended job information with BullMQ details
 */
export interface JobInfo {
  /** Job ID */
  id: string
  /** Job data */
  data: InstructionJobData
  /** Current job status */
  status: JobStatus
  /** Progress information */
  progress?: InstructionJobProgress
  /** Job result (if completed) */
  result?: InstructionJobResult
  /** Error information (if failed) */
  error?: string
  /** Number of attempts made */
  attemptsMade: number
  /** Timestamp when job was created */
  timestamp: number
  /** Timestamp when job was processed (if applicable) */
  processedOn?: number
  /** Timestamp when job finished (if applicable) */
  finishedOn?: number
  /** Stack trace (if failed) */
  stacktrace?: string[]
}

/**
 * Queue metrics and status
 */
export interface QueueMetrics {
  /** Container ID */
  containerId: string
  /** Number of jobs waiting to be processed */
  waiting: number
  /** Number of jobs currently being processed */
  active: number
  /** Number of completed jobs */
  completed: number
  /** Number of failed jobs */
  failed: number
  /** Number of delayed jobs */
  delayed: number
  /** Number of paused jobs */
  paused: number
  /** Total number of jobs */
  total: number
}
