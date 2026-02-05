import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskUpdate, TaskType, TaskEventPayload, TaskStatus } from '@devforge/shared'
import { TaskEvent } from '@devforge/shared'
import { logger } from '../utils/logger'
import { emitTaskEvent } from './websocket.service'

/**
 * Task service for managing long-running operations
 * Tasks are stored in-memory for simplicity and cleaned up after 1 hour
 */
class TaskService {
  private tasks: Map<string, Task> = new Map()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Cleanup tasks older than 1 hour
    this.cleanupInterval = setInterval(() => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      for (const [id, task] of this.tasks) {
        if (task.createdAt.getTime() < oneHourAgo) {
          this.tasks.delete(id)
          logger.debug({ taskId: id }, 'Cleaned up old task')
        }
      }
    }, 5 * 60 * 1000) // Run every 5 minutes
  }

  /**
   * Create a new task
   */
  create(type: TaskType): Task {
    const task: Task = {
      id: uuidv4(),
      type,
      status: 'pending',
      progress: 0,
      message: 'Aguardando início...',
      createdAt: new Date(),
    }
    this.tasks.set(task.id, task)
    logger.info({ taskId: task.id, type }, 'Task created')

    // Emit task created event
    this.emitEvent(task.id, TaskEvent.CREATED, task)

    return task
  }

  /**
   * Get task by ID
   */
  get(id: string): Task | undefined {
    return this.tasks.get(id)
  }

  /**
   * Get all tasks
   */
  getAll(): Task[] {
    return Array.from(this.tasks.values())
  }

  /**
   * Update task
   */
  update(id: string, update: TaskUpdate): Task | undefined {
    const task = this.tasks.get(id)
    if (!task) {
      logger.warn({ taskId: id }, 'Task not found for update')
      return undefined
    }

    const previousStatus: TaskStatus = task.status
    const previousProgress = task.progress

    if (update.status) {
      task.status = update.status
      if (update.status === 'running' && !task.startedAt) {
        task.startedAt = new Date()
      }
      if (update.status === 'completed' || update.status === 'failed') {
        task.completedAt = new Date()
      }
    }
    if (update.progress !== undefined) task.progress = update.progress
    if (update.message !== undefined) task.message = update.message
    if (update.result !== undefined) task.result = update.result
    if (update.error !== undefined) task.error = update.error

    logger.debug({ taskId: id, update }, 'Task updated')

    // Emit appropriate event based on what changed
    const progressChanged = update.progress !== undefined && update.progress !== previousProgress
    const eventType = progressChanged ? TaskEvent.PROGRESS : TaskEvent.UPDATED
    this.emitEvent(id, eventType, task, { previousStatus })

    return task
  }

  /**
   * Delete task
   */
  delete(id: string): boolean {
    const deleted = this.tasks.delete(id)
    if (deleted) {
      logger.info({ taskId: id }, 'Task deleted')
    }
    return deleted
  }

  /**
   * Helper to start a task
   */
  start(id: string, message: string = 'Iniciando...'): Task | undefined {
    return this.update(id, { status: 'running', progress: 0, message })
  }

  /**
   * Helper to update progress
   */
  setProgress(id: string, progress: number, message: string): Task | undefined {
    return this.update(id, { progress, message })
  }

  /**
   * Helper to complete a task
   */
  complete(id: string, result?: unknown): Task | undefined {
    const task = this.tasks.get(id)
    if (!task) {
      logger.warn({ taskId: id }, 'Task not found for completion')
      return undefined
    }

    const previousStatus: TaskStatus = task.status
    task.status = 'completed'
    task.progress = 100
    task.message = 'Concluído!'
    task.result = result
    task.completedAt = new Date()

    logger.debug({ taskId: id }, 'Task completed')

    // Emit task completed event
    this.emitEvent(id, TaskEvent.COMPLETED, task, { previousStatus })

    return task
  }

  /**
   * Helper to fail a task
   */
  fail(id: string, error: string): Task | undefined {
    const task = this.tasks.get(id)
    if (!task) {
      logger.warn({ taskId: id }, 'Task not found for failure')
      return undefined
    }

    const previousStatus: TaskStatus = task.status
    task.status = 'failed'
    task.message = 'Falhou'
    task.error = error
    task.completedAt = new Date()

    logger.debug({ taskId: id, error }, 'Task failed')

    // Emit task failed event
    this.emitEvent(id, TaskEvent.FAILED, task, { previousStatus, errorDetails: error })

    return task
  }

  /**
   * Emit a task event via WebSocket
   */
  private emitEvent(
    taskId: string,
    event: TaskEvent,
    task: Task,
    meta?: { previousStatus?: TaskStatus; errorDetails?: string; estimatedTimeRemaining?: number }
  ): void {
    const payload: TaskEventPayload = {
      event,
      task: { ...task },
      timestamp: new Date(),
      meta,
    }
    emitTaskEvent(taskId, payload)
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
  }
}

// Export singleton instance
export const taskService = new TaskService()
