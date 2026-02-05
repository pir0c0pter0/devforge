/**
 * Repository exports for database operations
 *
 * This module provides the data access layer for the application.
 * All repositories follow the Repository pattern and use immutable patterns.
 */

// Base repository
export { BaseRepository, type BaseFilters, type PaginatedResult, type Repository } from './base.repository';

// Container repository
export {
  ContainerRepository,
  containerRepository,
  type ContainerEntity,
  type CreateContainerDto,
  type UpdateContainerDto,
  type UpdateLimitsDto,
  type ContainerFilters,
} from './container.repository';

// Instruction repository
export {
  InstructionRepository,
  instructionRepository,
  PRIORITY_MAP,
  type InstructionEntity,
  type InstructionResult,
  type CreateInstructionDto,
  type UpdateInstructionDto,
  type InstructionFilters,
} from './instruction.repository';

// Metrics repository
export {
  MetricsRepository,
  metricsRepository,
  type MetricsEntity,
  type ActiveAgent,
  type AggregatedMetrics,
  type CreateMetricsDto,
  type UpdateMetricsDto,
  type MetricsFilters,
  type MetricsHistoryPoint,
} from './metrics.repository';

// User repository
export {
  UserRepository,
  userRepository,
  hashPassword,
  verifyPassword,
  type UserEntity,
  type SafeUserEntity,
  type UserRole,
  type CreateUserDto,
  type UpdateUserDto,
  type UserFilters,
} from './user.repository';

// Session repository
export {
  SessionRepository,
  sessionRepository,
  generateToken,
  type SessionEntity,
  type CreateSessionDto,
  type UpdateSessionDto,
  type SessionFilters,
} from './session.repository';

// Usage repository
export {
  UsageRepository,
  usageRepository,
  sessionUtils,
  type UsageEntity,
  type AggregatedUsage,
  type CreateUsageDto,
  type UpdateUsageDto,
  type UsageFilters,
} from './usage.repository';

// Claude logs repository
export {
  ClaudeLogsRepository,
  claudeLogsRepository,
  type ClaudeLogEntity,
  type CreateClaudeLogDto,
  type ClaudeLogFilters,
} from './claude-logs.repository';

// Claude messages repository
export {
  ClaudeMessagesRepository,
  claudeMessagesRepository,
  type ClaudeMessageEntity,
  type CreateClaudeMessageDto,
  type ClaudeMessageFilters,
  type ClaudeMessageType,
} from './claude-messages.repository';

// Docker logs repository
export {
  DockerLogsRepository,
  dockerLogsRepository,
  type DockerLogEntity,
  type CreateDockerLogDto,
  type DockerLogFilters,
  type DockerLogStats,
} from './docker-logs.repository';
