import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskUpdate, TaskType } from '@claude-docker/shared'
import { logger } from '../utils/logger'

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
  complete(id: string, result?: any): Task | undefined {
    return this.update(id, {
      status: 'completed',
      progress: 100,
      message: 'Concluído!',
      result,
    })
  }

  /**
   * Helper to fail a task
   */
  fail(id: string, error: string): Task | undefined {
    return this.update(id, {
      status: 'failed',
      message: 'Falhou',
      error,
    })
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
