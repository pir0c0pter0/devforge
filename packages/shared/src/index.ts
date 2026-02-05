/**
 * @claude-docker/shared
 * Shared types, schemas, and constants for Claude Docker Web
 */

// Export all container types
export type {
  ContainerTemplate,
  ContainerMode,
  ContainerStatus,
  RepoType,
  EmbeddedDevConfig,
  ContainerConfig,
  Container,
  ContainerWithMetrics,
  VSCodeResponse,
} from './types/container.types'

// Export all instruction types
export type {
  InstructionStatus,
  InstructionStage,
  InstructionProgress,
  Instruction,
  QueueStatus,
  AddInstructionRequest,
} from './types/instruction.types'

// Export all metrics types
export type {
  ContainerMetrics,
  AgentInfo,
} from './types/metrics.types'

// Export all disk metrics types
export type {
  DiskBreakdown,
  DiskAlertLevel,
  DetailedDiskMetrics,
  CleanupSuggestion,
  ExpandDiskRequest,
  ExpandDiskResponse,
} from './types/disk-metrics.types'

// Export all event types
export type {
  MetricsEventData,
  InstructionEventData,
  ContainerStatusEventData,
  QueueStatsEventData,
  ServerToClientEvents,
  ClientToServerEvents,
} from './types/events.types'

// Export all queue types
export type {
  InstructionJobData,
  InstructionJobResult,
  InstructionJobProgress,
  JobStatus,
  JobInfo,
  QueueMetrics,
} from './types/queue.types'

// Export all progress types
export type {
  ContainerProgressStage,
  ContainerCreationProgress,
} from './types/progress.types'

export { PROGRESS_STAGES } from './types/progress.types'

// Export all task types
export type {
  TaskStatus,
  TaskType,
  Task,
  CreateTaskRequest,
  TaskUpdate,
} from './types/task.types'

// Export all WebSocket task event types
export {
  TaskEvent,
} from './types/websocket'

export type {
  TaskEventPayload,
  TaskSubscription,
  TaskUnsubscription,
  TaskTypeSubscription,
  TaskBatchSubscription,
  TaskEventHandler,
} from './types/websocket'

// Export all schemas
export {
  containerConfigSchema,
  type ContainerConfigInput,
} from './schemas/container.schema'

export {
  addInstructionSchema,
  type AddInstructionInput,
} from './schemas/instruction.schema'

// Export all constants
export {
  DEFAULT_CPU_LIMIT,
  DEFAULT_MEMORY_LIMIT,
  DEFAULT_DISK_LIMIT,
  MAX_CONTAINERS,
  JOB_TIMEOUT,
  MAX_RETRIES,
  METRICS_INTERVAL,
  SOCKET_EVENTS,
  API_ENDPOINTS,
} from './constants'

// Export all terminal types
export type {
  TerminalSession,
  TerminalInput,
  TerminalResize,
  TerminalOutput,
  TerminalError,
  TerminalClose,
  TerminalConnect,
} from './types/terminal.types'

// Export all Claude Daemon types
export type {
  // Status & State
  DaemonStatus,
  DaemonState,
  DaemonSession,
  DaemonStatusResponse,
  // Processing State (fix #9)
  ProcessingStage,
  ProcessingState,
  ProcessingStartEvent,
  ProcessingProgressEvent,
  ProcessingCompleteEvent,
  ProcessingErrorEvent,
  // Events
  ClaudeEventType,
  BaseClaudeEvent,
  ClaudeStatusEvent,
  ClaudeOutputEvent,
  ClaudeToolUseEvent,
  ClaudeResultEvent,
  ClaudeErrorEvent,
  ClaudeHealthEvent,
  ClaudeRecoveringEvent,
  ClaudeRecoveredEvent,
  ClaudeRecoveryFailedEvent,
  GenericClaudeEvent,
  ClaudeEvent,
  // Chat Messages
  ClaudeMessageType,
  ClaudeMessage,
  // Queue
  InstructionMode,
  QueuedInstruction,
  // Health Monitor
  HealthStatus,
  HealthConfig,
  // API Types
  SendInstructionRequest,
  InstructionReceivedResponse,
  SendInstructionResponse,
  DaemonControlRequest,
  DaemonControlResponse,
  // WebSocket
  ClaudeDaemonClientToServerEvents,
  ClaudeDaemonServerToClientEvents,
  // Claude Code Format
  ClaudeStreamInput,
  ClaudeResult,
  ClaudeToolUse,
  ClaudeToolResult,
  ClaudeAssistantMessage,
} from './types/claude-daemon.types'

// Export all Claude Logs types
export type {
  ClaudeLogType,
  ClaudeLogEntry,
  ClaudeLogMetadata,
  ClaudeLogFilter,
  ClaudeLogsResponse,
  ClaudeLogStats,
  ClaudeLogEvents,
} from './types/claude-logs.types'

// Export all Docker Logs types
export type {
  DockerLogStream,
  DockerLogType,
  DockerLogTimeRange,
  DockerLogTabType,
  DockerLogEntry,
  CollapsedLogGroup,
  LogDisplayItem,
  DockerLogFilter,
  DockerLogsResponse,
  DockerLogStats,
  DockerLogEvents,
  DockerLogsSubscribe,
  DockerLogsUnsubscribe,
  DockerLogsRequestHistory,
} from './types/docker-logs.types'

// Export all Claude Sessions types
export type {
  ClaudeSessionSource,
  ClaudeSession,
  ClaudeSessionMessage,
  ClaudeSessionListResponse,
  ClaudeSessionWithMessages,
  ClaudeSessionFilter,
  CreateClaudeSessionRequest,
  UpdateClaudeSessionRequest,
  ClaudeSessionStats,
} from './types/claude-sessions.types'
