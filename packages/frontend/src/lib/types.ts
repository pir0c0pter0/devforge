export type ContainerStatus = 'running' | 'stopped' | 'creating' | 'error'

export type TemplateType = 'claude' | 'vscode' | 'both'

export type ContainerMode = 'interactive' | 'autonomous'

export type RepositoryType = 'empty' | 'github'

export interface Container {
  id: string
  name: string
  status: ContainerStatus
  template: TemplateType
  mode: ContainerMode
  repositoryUrl?: string
  createdAt: string
  metrics: {
    cpu: number
    memory: number
    disk: number
  }
  limits: {
    cpuCores: number
    memoryMB: number
    diskGB: number
  }
  activeAgents: number
  queueLength: number
  taskId?: string // Task ID for tracking creation progress
}

export interface CreateContainerRequest {
  name: string
  template: TemplateType
  mode: ContainerMode
  repositoryType: RepositoryType
  repositoryUrl?: string
  limits: {
    cpuCores: number
    memoryMB: number
    diskGB: number
  }
  taskId?: string
}

export interface Metrics {
  containerId: string
  timestamp: string
  cpu: number
  memory: number
  disk: number
}

export interface Instruction {
  id: string
  containerId: string
  command: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: string
  startedAt?: string
  completedAt?: string
  result?: string
  error?: string
}

export interface QueueItem {
  id: string
  instruction: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  addedAt: string
  startedAt?: string
  completedAt?: string
  result?: string
  error?: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export type TaskType = 'create-container' | 'start-container' | 'clone-repo' | 'generic'

export interface Task {
  id: string
  type: TaskType
  status: TaskStatus
  progress: number
  message: string
  result?: any
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}
