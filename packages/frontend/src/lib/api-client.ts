import type {
  Container,
  CreateContainerRequest,
  Metrics,
  QueueItem,
  ApiResponse,
  Task,
} from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

class ApiClient {
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
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

  async getMetrics(id: string): Promise<ApiResponse<Metrics>> {
    return this.request<Metrics>(`/api/containers/${id}/metrics`)
  }

  async getQueue(id: string): Promise<ApiResponse<QueueItem[]>> {
    return this.request<QueueItem[]>(`/api/containers/${id}/queue`)
  }

  async addToQueue(
    id: string,
    instruction: string
  ): Promise<ApiResponse<QueueItem>> {
    return this.request<QueueItem>(`/api/containers/${id}/queue`, {
      method: 'POST',
      body: JSON.stringify({ instruction }),
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
}

export const apiClient = new ApiClient()
