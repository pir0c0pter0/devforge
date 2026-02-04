/**
 * Claude Logs types for real-time log collection and streaming
 */

/**
 * Tipo de entrada de log do Claude
 */
export type ClaudeLogType = 'stdin' | 'stdout' | 'stderr' | 'system'

/**
 * Entrada de log do Claude Code
 */
export interface ClaudeLogEntry {
  /** ID unico da entrada de log */
  id: string
  /** Timestamp da entrada */
  timestamp: Date
  /** Tipo de log (stdin, stdout, stderr, system) */
  type: ClaudeLogType
  /** Conteudo do log */
  content: string
  /** Metadados opcionais */
  metadata?: ClaudeLogMetadata
}

/**
 * Metadados adicionais para entrada de log
 */
export interface ClaudeLogMetadata {
  /** Codigo de saida (para logs de conclusao de processo) */
  exitCode?: number
  /** Duracao em ms (para logs de conclusao) */
  duration?: number
  /** ID da sessao do daemon */
  sessionId?: string
  /** ID do job (se executado via fila) */
  jobId?: string
  /** Instrucao que gerou o log */
  instruction?: string
  /** Timeout configurado em ms (para logs de timeout) */
  timeout?: number
}

/**
 * Filtros para busca de logs
 */
export interface ClaudeLogFilter {
  /** Timestamp minimo */
  since?: Date | string
  /** Tipos de log para filtrar */
  types?: ClaudeLogType[]
  /** Limite de entradas */
  limit?: number
  /** Offset para paginacao */
  offset?: number
}

/**
 * Resposta da API de logs
 */
export interface ClaudeLogsResponse {
  /** Container ID */
  containerId: string
  /** Lista de entradas de log */
  logs: ClaudeLogEntry[]
  /** Total de entradas (para paginacao) */
  total: number
  /** Se ha mais logs disponiveis */
  hasMore: boolean
}

/**
 * Estatisticas de logs por container
 */
export interface ClaudeLogStats {
  /** Container ID */
  containerId: string
  /** Total de entradas */
  totalEntries: number
  /** Entradas por tipo */
  byType: Record<ClaudeLogType, number>
  /** Timestamp da entrada mais antiga */
  oldestEntry?: Date
  /** Timestamp da entrada mais recente */
  newestEntry?: Date
}

/**
 * Eventos WebSocket para logs do Claude
 */
export interface ClaudeLogEvents {
  /** Nova entrada de log */
  'claude:log': (entry: ClaudeLogEntry) => void
  /** Batch de logs (para historico) */
  'claude:logs:batch': (data: { containerId: string; logs: ClaudeLogEntry[] }) => void
  /** Logs limpos (apos cleanup) */
  'claude:logs:cleared': (data: { containerId: string; count: number }) => void
}
