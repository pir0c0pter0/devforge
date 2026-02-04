/**
 * Claude Daemon types for autonomous Claude Code execution
 */

/**
 * Status do daemon Claude Code
 */
export type DaemonStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

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
 * Tipos de eventos do Claude Code
 */
export type ClaudeEventType =
  | 'assistant'
  | 'user'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'error'
  | 'system'

/**
 * Evento do Claude Code (output do processo)
 */
export interface ClaudeEvent {
  type: ClaudeEventType
  timestamp: Date
  data: unknown
}

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

/**
 * Requisição para enviar instrução
 */
export interface SendInstructionRequest {
  containerId: string
  instruction: string
}

/**
 * Resposta de instrução recebida
 */
export interface InstructionReceivedResponse {
  containerId: string
  timestamp: Date
}

/**
 * Requisição para iniciar/parar daemon
 */
export interface DaemonControlRequest {
  containerId: string
}

/**
 * Resposta de status do daemon
 */
export interface DaemonStatusResponse {
  containerId: string
  status: DaemonStatus
  error?: string
}

/**
 * Eventos WebSocket do Claude Daemon
 */
export interface ClaudeDaemonClientToServerEvents {
  'output:subscribe': (data: { containerId: string }) => void
  'output:unsubscribe': (data: { containerId: string }) => void
  'instruction:send': (data: SendInstructionRequest) => void
  'daemon:start': (data: DaemonControlRequest) => void
  'daemon:stop': (data: DaemonControlRequest) => void
  'daemon:get-status': (data: DaemonControlRequest) => void
}

export interface ClaudeDaemonServerToClientEvents {
  'daemon:status': (data: DaemonState) => void
  'daemon:error': (data: { error: string }) => void
  'claude:output': (data: ClaudeEvent) => void
  'instruction:received': (data: InstructionReceivedResponse) => void
  'error': (data: { message: string }) => void
}

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
