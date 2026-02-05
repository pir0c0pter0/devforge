/**
 * WebSocket Namespace Exports
 *
 * This module re-exports all namespace setup functions and emit helpers
 * for use by the main websocket service.
 */

// Metrics namespace
export {
  setupMetricsNamespace,
  emitContainerMetrics,
  getContainerSubscribers,
  getAllSubscriptions,
} from './metrics.namespace'

// Terminal namespace
export {
  setupTerminalNamespace,
  getTerminalSocketId,
  hasTerminalSession,
} from './terminal.namespace'

// Claude daemon namespace
export {
  setupClaudeDaemonNamespace,
  emitClaudeEvent,
  getClaudeDaemonSubscribers,
} from './claude-daemon.namespace'

// Docker logs namespace
export {
  setupDockerLogsNamespace,
  emitDockerLog,
  emitDockerLogsBatch,
  getDockerLogsSubscribers,
  getAllDockerLogsSubscriptions,
} from './docker-logs.namespace'
