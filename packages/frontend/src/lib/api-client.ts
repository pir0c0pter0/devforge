import type {
  Container,
  CreateContainerRequest,
  Metrics,
  MetricsHistoryPoint,
  QueueItem,
  JobDetails,
  ApiResponse,
  Task,
} from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/**
 * Read CSRF token from cookie (set by backend's csrfCookieMiddleware)
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    try {
      // Include CSRF token header for state-changing methods
      const csrfHeaders: Record<string, string> = {}
      const method = options?.method?.toUpperCase()
      if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        const csrfToken = getCsrfToken()
        if (csrfToken) {
          csrfHeaders['x-csrf-token'] = csrfToken
        }
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders,
          ...options?.headers,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const data = await response.json()
      // Backend returns { success: true, data: ... } - extract the inner data
      return {
        success: true,
        data: data.data !== undefined ? data.data : data,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  async listContainers(): Promise<ApiResponse<Container[]>> {
    return this.request<Container[]>('/api/containers')
  }

  async getContainer(id: string): Promise<ApiResponse<Container>> {
    return this.request<Container>(`/api/containers/${id}`)
  }

  async createContainer(
    data: CreateContainerRequest
  ): Promise<ApiResponse<{ taskId: string }>> {
    // Convert frontend format to backend format
    const backendData = {
      name: data.name,
      template: data.template,
      mode: data.mode,
      repoType: data.repositoryType === 'github' ? 'clone' : 'empty',
      repoUrl: data.repositoryUrl || '',
      cpuLimit: data.limits.cpuCores,
      memoryLimit: data.limits.memoryMB,
      diskLimit: data.limits.diskGB * 1024, // Convert GB to MB
      embeddedDev: data.embeddedDev,
    }
    return this.request<{ taskId: string }>('/api/containers', {
      method: 'POST',
      body: JSON.stringify(backendData),
    })
  }

  async startContainer(id: string): Promise<ApiResponse<{ taskId: string }>> {
    return this.request<{ taskId: string }>(`/api/containers/${id}/start`, {
      method: 'POST',
    })
  }

  async stopContainer(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/containers/${id}/stop`, {
      method: 'POST',
    })
  }

  async deleteContainer(id: string): Promise<ApiResponse<{ taskId: string; containerId: string }>> {
    return this.request<{ taskId: string; containerId: string }>(`/api/containers/${id}`, {
      method: 'DELETE',
    })
  }

  async restartContainer(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/containers/${id}/restart`, {
      method: 'POST',
    })
  }

  async updateContainerLimits(id: string, limits: {
    cpuCores?: number
    memoryMB?: number
    diskGB?: number
  }): Promise<ApiResponse<{
    id: string
    name: string
    status: string
    limits: {
      cpuCores: number
      memoryMB: number
      diskGB: number
    }
  }>> {
    return this.request(`/api/containers/${id}/limits`, {
      method: 'PUT',
      body: JSON.stringify(limits),
    })
  }

  async getMetrics(id: string): Promise<ApiResponse<Metrics>> {
    return this.request<Metrics>(`/api/containers/${id}/metrics`)
  }

  async getMetricsHistory(id: string, hours: number = 5): Promise<ApiResponse<MetricsHistoryPoint[]>> {
    return this.request<MetricsHistoryPoint[]>(`/api/containers/${id}/metrics/history?hours=${hours}`)
  }

  async getQueue(id: string): Promise<ApiResponse<QueueItem[]>> {
    return this.request<QueueItem[]>(`/api/claude-daemon/${id}/queue/history`)
  }

  async addToQueue(
    id: string,
    instruction: string,
    mode: 'interactive' | 'autonomous' = 'interactive'
  ): Promise<ApiResponse<QueueItem>> {
    return this.request<QueueItem>(`/api/claude-daemon/${id}/instruction`, {
      method: 'POST',
      body: JSON.stringify({ instruction, mode }),
    })
  }

  async getQueueStatus(id: string): Promise<ApiResponse<{
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
    isPaused: boolean
  }>> {
    return this.request(`/api/claude-daemon/${id}/queue`)
  }

  async cancelJob(id: string, jobId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/claude-daemon/${id}/queue/jobs/${jobId}/cancel`, {
      method: 'POST',
    })
  }

  async getJobDetails(id: string, jobId: string): Promise<ApiResponse<JobDetails>> {
    return this.request<JobDetails>(`/api/claude-daemon/${id}/queue/jobs/${jobId}`)
  }

  async retryJob(id: string, jobId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/claude-daemon/${id}/queue/jobs/${jobId}/retry`, {
      method: 'POST',
    })
  }

  async deleteJob(id: string, jobId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/claude-daemon/${id}/queue/jobs/${jobId}`, {
      method: 'DELETE',
    })
  }

  async openShell(id: string): Promise<ApiResponse<{ url: string }>> {
    return this.request<{ url: string }>(`/api/containers/${id}/shell`, {
      method: 'POST',
    })
  }

  async openVSCode(id: string): Promise<ApiResponse<{ url: string }>> {
    return this.request<{ url: string }>(`/api/containers/${id}/vscode`, {
      method: 'POST',
    })
  }

  async getTask(id: string): Promise<ApiResponse<Task>> {
    return this.request<Task>(`/api/tasks/${id}`)
  }

  async listTasks(): Promise<ApiResponse<Task[]>> {
    return this.request<Task[]>('/api/tasks')
  }

  async deleteTask(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/tasks/${id}`, {
      method: 'DELETE',
    })
  }

  // Ralph Loop
  async updateRalphLoop(id: string, enabled: boolean): Promise<ApiResponse<Container>> {
    return this.request<Container>(`/api/containers/${id}/ralph-loop`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    })
  }

  // Claude Model
  async updateClaudeModel(id: string, model: string): Promise<ApiResponse<Container>> {
    return this.request<Container>(`/api/containers/${id}/claude-model`, {
      method: 'PUT',
      body: JSON.stringify({ model }),
    })
  }

  // Disk metrics
  async getDiskMetrics(id: string): Promise<ApiResponse<{
    usage: number
    limit: number
    percentage: number
    alertLevel: 'normal' | 'warning' | 'critical'
    breakdown: {
      workspace: number
      nodeModules: number
      cache: number
      claudeCode?: number
      other: number
      total: number
    }
    projectPath: string | null
    hasGitRepo: boolean
    collectedAt: string
  }>> {
    return this.request(`/api/containers/${id}/disk-metrics`)
  }

  async getDiskCleanupSuggestions(id: string): Promise<ApiResponse<Array<{
    type: string
    description: string
    estimatedSavings: number
    command: string
    risk: 'low' | 'medium' | 'high'
  }>>> {
    return this.request(`/api/containers/${id}/disk-cleanup-suggestions`)
  }

  async expandDisk(id: string, newLimitMB: number): Promise<ApiResponse<{
    previousLimit: number
    newLimit: number
    currentUsage: number
    newPercentage: number
  }>> {
    return this.request(`/api/containers/${id}/expand-disk`, {
      method: 'POST',
      body: JSON.stringify({ newLimitMB }),
    })
  }

  // Token Usage
  async getContainerUsage(id: string): Promise<ApiResponse<{
    daily: { tokens: number; cost: number }
    weekly: { tokens: number; cost: number }
    session: { tokens: number; cost: number; endsAt: string }
  }>> {
    return this.request(`/api/containers/${id}/usage`)
  }

  // Claude Chat Messages (History)
  async getChatMessages(containerId: string, options?: { limit?: number; since?: string }): Promise<ApiResponse<{
    containerId: string
    messages: Array<{
      id: string
      type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error'
      content: string
      timestamp: string
      toolName?: string
      toolInput?: unknown
    }>
    total: number
    hasMore: boolean
  }>> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.since) params.set('since', options.since)
    const query = params.toString()
    return this.request(`/api/claude-daemon/${containerId}/messages${query ? `?${query}` : ''}`)
  }

  async saveChatMessage(containerId: string, message: {
    id: string
    type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error'
    content: string
    timestamp?: string
    toolName?: string
    toolInput?: unknown
  }): Promise<ApiResponse<{ id: string; saved: boolean }>> {
    return this.request(`/api/claude-daemon/${containerId}/messages`, {
      method: 'POST',
      body: JSON.stringify(message),
    })
  }

  async saveChatMessagesBatch(containerId: string, messages: Array<{
    id: string
    type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error'
    content: string
    timestamp?: string
    toolName?: string
    toolInput?: unknown
  }>): Promise<ApiResponse<{ savedCount: number }>> {
    return this.request(`/api/claude-daemon/${containerId}/messages/batch`, {
      method: 'POST',
      body: JSON.stringify({ messages }),
    })
  }

  async clearChatMessages(containerId: string): Promise<ApiResponse<{ clearedCount: number }>> {
    return this.request(`/api/claude-daemon/${containerId}/messages`, {
      method: 'DELETE',
    })
  }

  // Claude Sessions (grouped conversations)
  async getClaudeSessions(containerId: string, options?: { limit?: number }): Promise<ApiResponse<{
    containerId: string
    sessions: Array<{
      id: string
      containerId: string
      startedAt: string
      lastMessageAt: string
      messageCount: number
      firstMessage?: string
    }>
    total: number
  }>> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', options.limit.toString())
    const query = params.toString()
    return this.request(`/api/claude-daemon/${containerId}/sessions${query ? `?${query}` : ''}`)
  }

  async getClaudeSessionMessages(containerId: string, sessionId: string): Promise<ApiResponse<{
    id: string
    containerId: string
    startedAt: string
    lastMessageAt: string
    messageCount: number
    messages: Array<{
      id: string
      type: string
      content: string
      timestamp: string
      toolName?: string
      toolInput?: unknown
    }>
  }>> {
    return this.request(`/api/claude-daemon/${containerId}/sessions/${sessionId}`)
  }

  async createClaudeSession(containerId: string): Promise<ApiResponse<{
    id: string
    containerId: string
    startedAt: string
    lastMessageAt: string
    messageCount: number
    createdExplicitly: boolean
  }>> {
    return this.request(`/api/claude-daemon/${containerId}/sessions`, {
      method: 'POST',
    })
  }
}

export const apiClient = new ApiClient()
