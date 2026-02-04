/**
 * Instruction execution status
 */
export type InstructionStatus = 'pending' | 'running' | 'completed' | 'failed'

/**
 * Current stage of instruction execution
 */
export type InstructionStage =
  | 'validating'
  | 'checking_daemon'
  | 'starting_daemon'
  | 'daemon_ready'
  | 'sending_instruction'
  | 'processing'
  | 'finalizing'
  | 'completed'
  | 'failed'

/**
 * Progress details for instruction execution
 */
export interface InstructionProgress {
  /** Progress percentage (0-100) */
  percentage: number
  /** Current execution stage */
  stage: InstructionStage
  /** Human-readable message describing current status */
  message: string
  /** Timestamp of this progress update */
  timestamp: Date
}

/**
 * Instruction sent to a container for execution
 */
export interface Instruction {
  /** Unique instruction ID */
  id: string
  /** Target container ID */
  containerId: string
  /** Instruction text to execute */
  instruction: string
  /** Current execution status */
  status: InstructionStatus
  /** Timestamp when instruction was created */
  createdAt: Date
  /** Timestamp when instruction started executing */
  startedAt?: Date
  /** Timestamp when instruction completed or failed */
  completedAt?: Date
  /** Execution result (stdout/output) */
  result?: string
  /** Error message if execution failed */
  error?: string
  /** Execution progress percentage (0-100) */
  progress?: number
  /** Detailed progress information */
  progressDetail?: InstructionProgress
}

/**
 * Queue status for a specific container
 */
export interface QueueStatus {
  /** Container ID */
  containerId: string
  /** Number of pending instructions */
  waiting: number
  /** Number of currently executing instructions */
  active: number
  /** Number of completed instructions */
  completed: number
  /** Number of failed instructions */
  failed: number
  /** List of all instructions in the queue */
  jobs: Instruction[]
}

/**
 * Request body for adding a new instruction
 */
export interface AddInstructionRequest {
  /** Instruction text to execute */
  instruction: string
}
