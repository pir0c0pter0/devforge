/**
 * Log Collapse Utility
 *
 * Provides smart collapse functionality for Docker container logs.
 * Groups consecutive similar log lines to reduce visual clutter.
 */

import type { DockerLogEntry, CollapsedLogGroup, LogDisplayItem } from '@claude-docker/shared'

/**
 * Configuration for log collapse
 */
export interface CollapseConfig {
  /** Minimum number of similar logs to create a group (default: 3) */
  minGroupSize: number
  /** Similarity threshold 0-1 (default: 0.7 = 70%) */
  similarityThreshold: number
}

const DEFAULT_CONFIG: CollapseConfig = {
  minGroupSize: 3,
  similarityThreshold: 0.7,
}

/**
 * Normalize a log line to extract its pattern
 * Removes variable parts like numbers, hashes, timestamps
 */
function extractPattern(content: string): string {
  let pattern = content
    // Remove timestamps
    .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<timestamp>')
    // Remove UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    // Remove hex hashes (8+ chars)
    .replace(/\b[0-9a-f]{8,}\b/gi, '<hash>')
    // Remove numbers (but keep significant ones like HTTP codes)
    .replace(/(?<!\d)\d{5,}(?!\d)/g, '<num>') // Only replace 5+ digit numbers
    // Remove IP addresses
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '<ip>')
    // Remove port numbers
    .replace(/:\d{4,5}\b/g, ':<port>')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()

  return pattern
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 * Returns a value between 0 and 1 (1 = identical)
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0

  // Use pattern comparison for efficiency
  const patternA = extractPattern(a)
  const patternB = extractPattern(b)

  if (patternA === patternB) return 1

  // Quick length check
  const maxLen = Math.max(patternA.length, patternB.length)
  const lenDiff = Math.abs(patternA.length - patternB.length) / maxLen
  if (lenDiff > 0.5) return 0.3 // Very different lengths, low similarity

  // Simple token-based similarity
  const tokensA = new Set(patternA.split(/\s+/))
  const tokensB = new Set(patternB.split(/\s+/))

  let common = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) common++
  }

  const totalTokens = tokensA.size + tokensB.size
  if (totalTokens === 0) return 0

  return (2 * common) / totalTokens
}

/**
 * Generate a unique ID for a collapsed group
 */
let groupIdCounter = 0
function generateGroupId(): string {
  return `group-${Date.now()}-${++groupIdCounter}`
}

/**
 * Collapse consecutive similar logs into groups
 *
 * @param logs - Array of log entries to process
 * @param config - Optional configuration overrides
 * @returns Array of display items (single logs or groups)
 */
export function collapseConsecutiveLogs(
  logs: DockerLogEntry[],
  config?: Partial<CollapseConfig>
): LogDisplayItem[] {
  const { minGroupSize, similarityThreshold } = { ...DEFAULT_CONFIG, ...config }

  if (logs.length === 0) {
    return []
  }

  const result: LogDisplayItem[] = []
  let currentGroup: DockerLogEntry[] = []
  let currentPattern: string | null = null

  const flushGroup = () => {
    if (currentGroup.length === 0) return

    if (currentGroup.length >= minGroupSize) {
      // Create a collapsed group
      const group: CollapsedLogGroup = {
        id: generateGroupId(),
        logType: currentGroup[0]?.logType ?? 'runtime',
        pattern: currentPattern ?? '',
        count: currentGroup.length,
        firstLog: currentGroup[0] as DockerLogEntry,
        lastLog: currentGroup[currentGroup.length - 1] as DockerLogEntry,
        collapsed: true,
      }
      result.push({ type: 'group', group })
    } else {
      // Not enough to group, add as individual logs
      for (const log of currentGroup) {
        result.push({ type: 'single', log })
      }
    }

    currentGroup = []
    currentPattern = null
  }

  for (const log of logs) {
    const logPattern = extractPattern(log.content)

    if (currentPattern === null) {
      // Start new potential group
      currentGroup = [log]
      currentPattern = logPattern
    } else {
      // Check if this log is similar to current group
      const similarity = calculateSimilarity(currentPattern, logPattern)

      if (similarity >= similarityThreshold) {
        // Add to current group
        currentGroup.push(log)
      } else {
        // Different pattern, flush current group and start new
        flushGroup()
        currentGroup = [log]
        currentPattern = logPattern
      }
    }
  }

  // Flush remaining group
  flushGroup()

  return result
}

/**
 * Get logs from a collapsed group (for expanding)
 */
export function getLogsFromGroup(group: CollapsedLogGroup, allLogs: readonly DockerLogEntry[]): DockerLogEntry[] {
  const firstTime = new Date(group.firstLog.recordedAt).getTime()
  const lastTime = new Date(group.lastLog.recordedAt).getTime()

  return allLogs.filter((log) => {
    const logTime = new Date(log.recordedAt).getTime()
    return logTime >= firstTime && logTime <= lastTime
  })
}

/**
 * Calculate display item count (total visible rows)
 */
export function countDisplayItems(items: LogDisplayItem[], expandedGroups: Set<string>): number {
  return items.reduce((count, item) => {
    if (item.type === 'single') {
      return count + 1
    }
    // Group: if expanded, show all logs + header, else just header
    if (expandedGroups.has(item.group.id)) {
      return count + 1 + item.group.count
    }
    return count + 1
  }, 0)
}

/**
 * Flatten display items into individual rows (for virtual list)
 */
export interface FlattenedRow {
  type: 'single' | 'group-header' | 'group-item'
  log?: DockerLogEntry
  group?: CollapsedLogGroup
  indexInGroup?: number
}

export function flattenDisplayItems(
  items: LogDisplayItem[],
  expandedGroups: Set<string>,
  allLogs?: readonly DockerLogEntry[]
): FlattenedRow[] {
  const rows: FlattenedRow[] = []

  for (const item of items) {
    if (item.type === 'single') {
      rows.push({ type: 'single', log: item.log })
    } else {
      // Add group header
      rows.push({ type: 'group-header', group: item.group })

      // If expanded, add individual logs
      if (expandedGroups.has(item.group.id) && allLogs) {
        const groupLogs = getLogsFromGroup(item.group, allLogs)
        groupLogs.forEach((log, index) => {
          rows.push({ type: 'group-item', log, group: item.group, indexInGroup: index })
        })
      }
    }
  }

  return rows
}
