import type { Task, TaskStatus, TaskType } from './task.types'

/**
 * WebSocket task event types for real-time communication
 */

/**
 * Task event types for WebSocket communication
 */
export enum TaskEvent {
  /** Task was created and added to queue */
  CREATED = 'CREATED',
  /** Task was updated (status, progress, etc.) */
  UPDATED = 'UPDATED',
  /** Task progress changed */
  PROGRESS = 'PROGRESS',
  /** Task completed successfully */
  COMPLETED = 'COMPLETED',
  /** Task execution failed */
  FAILED = 'FAILED',
}

/**
 * Payload sent with task events
 */
export interface TaskEventPayload {
  /** The event type */
  event: TaskEvent
  /** The task data */
  task: Task
  /** Timestamp of the event */
  timestamp: Date
  /** Additional metadata */
  meta?: {
    /** Previous status (for UPDATED events) */
    previousStatus?: TaskStatus
    /** Error details (for FAILED events) */
    errorDetails?: string
    /** Estimated time remaining in ms (for PROGRESS events) */
    estimatedTimeRemaining?: number
  }
}

/**
 * Request to subscribe to task updates
 */
export interface TaskSubscription {
  /** Task ID to subscribe to */
  taskId: string
  /** Optional: Subscribe to specific event types only */
  events?: TaskEvent[]
}

/**
 * Request to unsubscribe from task updates
 */
export interface TaskUnsubscription {
  /** Task ID to unsubscribe from */
  taskId: string
}

/**
 * Subscribe to all tasks of a specific type
 */
export interface TaskTypeSubscription {
  /** Task type to subscribe to */
  taskType: TaskType
  /** Optional: Subscribe to specific event types only */
  events?: TaskEvent[]
}

/**
 * Batch task subscription for multiple tasks
 */
export interface TaskBatchSubscription {
  /** Array of task IDs to subscribe to */
  taskIds: string[]
  /** Optional: Subscribe to specific event types only */
  events?: TaskEvent[]
}

/**
 * Task event handler callback type
 */
export type TaskEventHandler = (payload: TaskEventPayload) => void
