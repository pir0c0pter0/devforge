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
    /** Current CPU usage percentage */
    usage: number
    /** CPU limit in cores */
    limit: number
  }
  /** Memory metrics */
  memory: {
    /** Current memory usage in bytes */
    usage: number
    /** Memory limit in bytes */
    limit: number
    /** Memory usage percentage */
    percent: number
  }
  /** Disk metrics */
  disk: {
    /** Current disk usage in bytes */
    usage: number
    /** Disk limit in bytes */
    limit: number
  }
  /** Network metrics */
  network: {
    /** Received bytes */
    rxBytes: number
    /** Transmitted bytes */
    txBytes: number
  }
  /** Number of active Claude Code agents */
  activeAgents: number
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
