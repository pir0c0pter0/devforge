/**
 * Claude Daemon types for autonomous Claude Code execution
 */

// ============================================
// Daemon Status & State
// ============================================

/**
 * Status do daemon Claude Code
 */
export type DaemonStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'processing'
  | 'stopping'
  | 'stopped'
  | 'error'

/**
 * Estado do daemon Claude Code em um container
 */
export interface DaemonState {
  containerId: string
  status: DaemonStatus
  pid?: number
  startedAt?: Date
  lastActivity?: Date
  instructionCount: number
  error?: string
}

/**
 * Sessão do daemon (para gerenciamento de contexto)
 */
export interface DaemonSession {
  containerId: string
  sessionId: string
  status: DaemonStatus
  startedAt?: Date
  lastActivity?: Date
  currentInstruction?: string
}

/**
 * Resposta de status do daemon
 */
export interface DaemonStatusResponse {
  containerId: string
  status: DaemonStatus
  sessionId?: string
  uptime?: number
  lastActivity?: string
  error?: string
}

// ============================================
// Claude Events (WebSocket)
// ============================================

/**
 * Tipos de eventos do Claude Code
 */
export type ClaudeEventType =
  | 'status'
  | 'output'
  | 'assistant'
  | 'user'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'error'
  | 'system'
  | 'health'
  | 'recovering'
  | 'recovered'
  | 'recovery_failed'

/**
 * Base para todos os eventos Claude
 */
export interface BaseClaudeEvent {
  type: ClaudeEventType
  containerId?: string
  timestamp: Date | string
  data?: unknown // For backward compatibility
}

/**
 * Evento de mudança de status
 */
export interface ClaudeStatusEvent extends BaseClaudeEvent {
  type: 'status'
  status: DaemonStatus
  message?: string
}

/**
 * Evento de output de texto
 */
export interface ClaudeOutputEvent extends BaseClaudeEvent {
  type: 'output'
  content: string
  isPartial?: boolean
}

/**
 * Evento de uso de ferramenta
 */
export interface ClaudeToolUseEvent extends BaseClaudeEvent {
  type: 'tool_use'
  toolName: string
  toolInput?: Record<string, unknown>
}

/**
 * Evento de resultado final
 */
export interface ClaudeResultEvent extends BaseClaudeEvent {
  type: 'result'
  success: boolean
  result?: unknown
  error?: string
}

/**
 * Evento de erro
 */
export interface ClaudeErrorEvent extends BaseClaudeEvent {
  type: 'error'
  message: string
  code?: string
}

/**
 * Evento de health check
 */
export interface ClaudeHealthEvent extends BaseClaudeEvent {
  type: 'health'
  status: 'healthy' | 'unhealthy'
  message: string
}

/**
 * Evento de início de recovery
 */
export interface ClaudeRecoveringEvent extends BaseClaudeEvent {
  type: 'recovering'
  message: string
  attempt: number
}

/**
 * Evento de recovery bem-sucedido
 */
export interface ClaudeRecoveredEvent extends BaseClaudeEvent {
  type: 'recovered'
  message: string
}

/**
 * Evento de falha no recovery
 */
export interface ClaudeRecoveryFailedEvent extends BaseClaudeEvent {
  type: 'recovery_failed'
  message: string
  attempts: number
  lastError?: string
}

/**
 * Generic Claude event (backward compatibility)
 */
export interface GenericClaudeEvent extends BaseClaudeEvent {
  type: ClaudeEventType
  data?: unknown
}

/**
 * Union type de todos os eventos Claude
 */
export type ClaudeEvent =
  | ClaudeStatusEvent
  | ClaudeOutputEvent
  | ClaudeToolUseEvent
  | ClaudeResultEvent
  | ClaudeErrorEvent
  | ClaudeHealthEvent
  | ClaudeRecoveringEvent
  | ClaudeRecoveredEvent
  | ClaudeRecoveryFailedEvent
  | GenericClaudeEvent

// ============================================
// Chat Messages (Frontend)
// ============================================

/**
 * Tipos de mensagens no chat
 */
export type ClaudeMessageType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error'

/**
 * Mensagem formatada para exibição no frontend
 */
export interface ClaudeMessage {
  id: string
  type: ClaudeMessageType
  content: string
  timestamp: Date
  toolName?: string
  toolInput?: unknown
}

// ============================================
// Queue Types
// ============================================

/**
 * Modo de execução da instrução
 */
export type InstructionMode = 'interactive' | 'autonomous'

/**
 * Instrução na fila
 */
export interface QueuedInstruction {
  id: string
  containerId: string
  instruction: string
  mode: InstructionMode
  status: 'pending' | 'processing' | 'completed' | 'failed'
  createdAt: Date
  processedAt?: Date
  result?: unknown
  error?: string
  attempts: number
}

/**
 * Status da fila de instruções
 */
export interface QueueStatus {
  containerId: string
  pending: number
  processing: number
  completed: number
  failed: number
  isPaused: boolean
}

// ============================================
// Health Monitor Types
// ============================================

/**
 * Status de saúde do daemon
 */
export interface HealthStatus {
  containerId: string
  healthy: boolean
  lastCheck: Date
  consecutiveFailures: number
  lastError?: string
  recovering: boolean
}

/**
 * Configuração do health monitor
 */
export interface HealthConfig {
  checkIntervalMs: number
  maxRecoveryAttempts: number
  recoveryDelayMs: number
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Requisição para enviar instrução
 */
export interface SendInstructionRequest {
  instruction: string
  mode?: InstructionMode
}

/**
 * Resposta de instrução recebida
 */
export interface InstructionReceivedResponse {
  containerId: string
  timestamp: Date
}

/**
 * Resposta ao enviar instrução
 */
export interface SendInstructionResponse {
  success: boolean
  jobId: string
  position: number
  message: string
}

/**
 * Requisição para iniciar/parar daemon
 */
export interface DaemonControlRequest {
  containerId: string
}

/**
 * Resposta de controle do daemon
 */
export interface DaemonControlResponse {
  success: boolean
  status: DaemonStatus
  message: string
}

// ============================================
// WebSocket Events
// ============================================

/**
 * Eventos WebSocket do Claude Daemon (Client → Server)
 */
export interface ClaudeDaemonClientToServerEvents {
  'output:subscribe': (data: { containerId: string }) => void
  'output:unsubscribe': (data: { containerId: string }) => void
  'instruction:send': (data: SendInstructionRequest & { containerId: string }) => void
  'daemon:start': (data: DaemonControlRequest) => void
  'daemon:stop': (data: DaemonControlRequest) => void
  'daemon:get-status': (data: DaemonControlRequest) => void
}

/**
 * Eventos WebSocket do Claude Daemon (Server → Client)
 */
export interface ClaudeDaemonServerToClientEvents {
  'daemon:status': (data: DaemonState) => void
  'daemon:error': (data: { error: string }) => void
  'claude:output': (data: ClaudeEvent) => void
  'claude:event': (data: ClaudeEvent) => void
  'instruction:received': (data: InstructionReceivedResponse) => void
  'error': (data: { message: string }) => void
}

// ============================================
// Claude Code Format Types
// ============================================

/**
 * Formato de entrada para Claude Code (stream-json)
 */
export interface ClaudeStreamInput {
  type: 'user'
  message: {
    role: 'user'
    content: string
  }
}

/**
 * Resultado de uma instrução (quando Claude termina de processar)
 */
export interface ClaudeResult {
  type: 'result'
  cost?: {
    input: number
    output: number
  }
  duration?: number
}

/**
 * Tool use event do Claude
 */
export interface ClaudeToolUse {
  type: 'tool_use'
  tool: string
  input: unknown
}

/**
 * Tool result event do Claude
 */
export interface ClaudeToolResult {
  type: 'tool_result'
  content: string
  isError?: boolean
}

/**
 * Assistant message do Claude
 */
export interface ClaudeAssistantMessage {
  type: 'assistant'
  message: {
    role: 'assistant'
    content: string
  }
}
