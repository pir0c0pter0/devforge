/**
 * Task queue types for long-running operations
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export type TaskType = 'create-container' | 'start-container' | 'delete-container' | 'clone-repo' | 'generic'

export interface Task {
  id: string
  type: TaskType
  status: TaskStatus
  progress: number // 0-100
  message: string
  result?: any
  error?: string
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

export interface CreateTaskRequest {
  type: TaskType
}

export interface TaskUpdate {
  status?: TaskStatus
  progress?: number
  message?: string
  result?: any
  error?: string
}
