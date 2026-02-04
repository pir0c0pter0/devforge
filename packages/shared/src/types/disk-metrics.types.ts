/**
 * Disk usage breakdown by category
 */
export interface DiskBreakdown {
  /** Total workspace usage in MB */
  workspace: number
  /** node_modules usage in MB */
  nodeModules: number
  /** Cache directories usage in MB (.cache, .npm, .pnpm-store, etc.) */
  cache: number
  /** Other files in MB */
  other: number
  /** Total disk usage in MB */
  total: number
}

/**
 * Disk alert levels based on usage percentage
 */
export type DiskAlertLevel = 'normal' | 'warning' | 'critical'

/**
 * Detailed disk metrics with breakdown
 */
export interface DetailedDiskMetrics {
  /** Current disk usage in MB */
  usage: number
  /** Configured disk limit in MB */
  limit: number
  /** Usage percentage (0-100) */
  percentage: number
  /** Alert level based on percentage */
  alertLevel: DiskAlertLevel
  /** Breakdown by category */
  breakdown: DiskBreakdown
  /** Project path if detected */
  projectPath: string | null
  /** Whether a git repository was detected */
  hasGitRepo: boolean
  /** When metrics were collected */
  collectedAt: Date
}

/**
 * Suggestion for cleaning up disk space
 */
export interface CleanupSuggestion {
  /** Type of cleanup */
  type: 'node_modules' | 'cache' | 'logs' | 'build' | 'git'
  /** Human-readable description */
  description: string
  /** Estimated space to reclaim in MB */
  estimatedSavings: number
  /** Command to execute */
  command: string
  /** Risk level of the cleanup */
  risk: 'low' | 'medium' | 'high'
}

/**
 * Request to expand disk limit
 */
export interface ExpandDiskRequest {
  /** New disk limit in MB */
  newLimitMB: number
}

/**
 * Response from expand disk operation
 */
export interface ExpandDiskResponse {
  /** Previous limit in MB */
  previousLimit: number
  /** New limit in MB */
  newLimit: number
  /** Current usage in MB */
  currentUsage: number
  /** New percentage after expansion */
  newPercentage: number
}
