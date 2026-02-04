/**
 * Container template types defining what tools are available in the container
 */
export type ContainerTemplate = 'claude' | 'vscode' | 'both'

/**
 * Container mode defining how the container operates
 * - interactive: requires user confirmation for actions
 * - autonomous: runs automatically without confirmation
 */
export type ContainerMode = 'interactive' | 'autonomous'

/**
 * Container status indicating current state
 */
export type ContainerStatus = 'running' | 'stopped' | 'created' | 'error'

/**
 * Repository type for container initialization
 */
export type RepoType = 'empty' | 'clone'

/**
 * Configuration for creating a new container
 */
export interface ContainerConfig {
  /** Unique name for the container */
  name: string
  /** Template defining available tools */
  template: ContainerTemplate
  /** Operating mode */
  mode: ContainerMode
  /** Git repository URL (required if repoType is 'clone') */
  repoUrl?: string
  /** Repository initialization type */
  repoType: RepoType
  /** Path to SSH key for Git operations */
  sshKeyPath?: string
  /** CPU limit (e.g., '2.0' for 2 cores) */
  cpuLimit: string
  /** Memory limit (e.g., '4G' for 4 gigabytes) */
  memoryLimit: string
  /** Disk limit (e.g., '20G' for 20 gigabytes) */
  diskLimit: string
}

/**
 * Container information returned from the API
 */
export interface Container {
  /** Docker container ID */
  id: string
  /** Container name */
  name: string
  /** Current status */
  status: ContainerStatus
  /** Template used */
  template: ContainerTemplate
  /** Operating mode */
  mode: ContainerMode
  /** Creation timestamp */
  createdAt: Date
  /** Exposed ports mapping (service name -> port number) */
  ports: Record<string, number>
}

/**
 * Container information with current resource usage metrics
 */
export interface ContainerWithMetrics extends Container {
  /** Current CPU usage percentage */
  cpuUsage: number
  /** Current memory usage in megabytes */
  memoryUsage: number
  /** Current disk usage in megabytes */
  diskUsage: number
  /** Number of active Claude Code agents */
  activeAgents: number
  /** Number of pending instructions in queue */
  queueLength: number
}

/**
 * VS Code (code-server) URL response
 */
export interface VSCodeResponse {
  /** URL to access VS Code in the browser */
  url: string
}
