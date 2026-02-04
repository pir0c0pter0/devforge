/**
 * Container resource usage metrics
 */
export interface ContainerMetrics {
  /** Container ID */
  containerId: string
  /** Timestamp of the metrics snapshot */
  timestamp: Date
  /** CPU metrics */
  cpu: {
    /** Current CPU usage percentage (average across all cores) */
    usage: number
    /** CPU limit in cores */
    limit: number
    /** Usage per core (optional, percentage 0-100 each) */
    perCore?: number[]
  }
  /** Memory metrics */
  memory: {
    /** Current memory usage in MB */
    usage: number
    /** Memory limit in MB */
    limit: number
    /** Memory usage percentage */
    percentage: number
  }
  /** Disk metrics */
  disk: {
    /** Current disk usage in MB */
    usage: number
    /** Disk limit in MB */
    limit: number
    /** Disk usage percentage */
    percentage: number
  }
  /** Network metrics (optional) */
  network?: {
    /** Received bytes */
    rxBytes: number
    /** Transmitted bytes */
    txBytes: number
  }
  /** Active agent processes */
  activeAgents: AgentProcess[]
}

/**
 * Agent process information
 */
export interface AgentProcess {
  /** Process ID */
  pid: number
  /** Command that started the process */
  command: string
  /** CPU usage percentage */
  cpu: number
  /** Memory usage percentage */
  memory: number
}

/**
 * Information about a running agent process
 */
export interface AgentInfo {
  /** Process ID */
  pid: number
  /** Command line that started the agent */
  command: string
  /** CPU usage percentage for this process */
  cpuPercent: number
  /** Memory usage percentage for this process */
  memoryPercent: number
  /** Process start time */
  startTime: string
}
