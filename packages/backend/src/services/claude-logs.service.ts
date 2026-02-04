import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { createChildLogger } from '../utils/logger'
import type {
  ClaudeLogType,
  ClaudeLogEntry,
  ClaudeLogMetadata,
  ClaudeLogFilter,
  ClaudeLogsResponse,
  ClaudeLogStats,
} from '@claude-docker/shared'

const logger = createChildLogger({ service: 'claude-logs' })

/**
 * Configuracao do sistema de logs
 */
const CONFIG = {
  /** Maximo de linhas por container */
  MAX_LINES_PER_CONTAINER: 5000,
  /** Tempo de retencao em ms (6 horas) */
  RETENTION_TIME_MS: 6 * 60 * 60 * 1000,
  /** Intervalo de limpeza em ms (30 minutos) */
  CLEANUP_INTERVAL_MS: 30 * 60 * 1000,
  /** Tamanho do batch para streaming */
  BATCH_SIZE: 100,
}

/**
 * Estrutura interna de armazenamento de logs por container
 */
interface ContainerLogs {
  /** Lista de entradas de log */
  entries: ClaudeLogEntry[]
  /** Indice para lookup rapido */
  entriesById: Map<string, ClaudeLogEntry>
  /** Timestamp da ultima atualizacao */
  lastUpdated: Date
  /** Total de entradas removidas (para estatisticas) */
  evictedCount: number
}

/**
 * ClaudeLogsService gerencia logs de execucao do Claude Code em tempo real
 *
 * Funcionalidades:
 * - Armazenamento em memoria com LRU eviction
 * - Maximo de 5000 linhas por container
 * - Auto-cleanup de logs mais antigos que 6 horas
 * - Streaming via WebSocket
 * - API REST para historico
 */
class ClaudeLogsService extends EventEmitter {
  /** Logs por container */
  private logs: Map<string, ContainerLogs> = new Map()

  /** Timer de limpeza */
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.startCleanupTimer()
    logger.info('ClaudeLogsService inicializado')
  }

  /**
   * Adiciona uma nova entrada de log para um container
   */
  addLog(
    containerId: string,
    type: ClaudeLogType,
    content: string,
    metadata?: ClaudeLogMetadata
  ): ClaudeLogEntry {
    const containerLogs = this.getOrCreateContainerLogs(containerId)

    const entry: ClaudeLogEntry = {
      id: randomUUID(),
      timestamp: new Date(),
      type,
      content,
      metadata,
    }

    // Adicionar entrada
    containerLogs.entries.push(entry)
    containerLogs.entriesById.set(entry.id, entry)
    containerLogs.lastUpdated = new Date()

    // LRU eviction se exceder limite
    this.enforceMaxLines(containerId, containerLogs)

    // Emitir evento para WebSocket
    this.emit('log:new', { containerId, entry })

    logger.debug({ containerId, type, entryId: entry.id }, 'Log adicionado')

    return entry
  }

  /**
   * Adiciona multiplas entradas de log (batch)
   */
  addLogs(
    containerId: string,
    entries: Array<{ type: ClaudeLogType; content: string; metadata?: ClaudeLogMetadata }>
  ): ClaudeLogEntry[] {
    const results: ClaudeLogEntry[] = []

    for (const entry of entries) {
      const logEntry = this.addLog(containerId, entry.type, entry.content, entry.metadata)
      results.push(logEntry)
    }

    // Emitir batch event
    if (results.length > 0) {
      this.emit('log:batch', { containerId, entries: results })
    }

    return results
  }

  /**
   * Obtem logs de um container com filtros opcionais
   */
  getLogs(containerId: string, filter?: ClaudeLogFilter): ClaudeLogsResponse {
    const containerLogs = this.logs.get(containerId)

    if (!containerLogs) {
      return {
        containerId,
        logs: [],
        total: 0,
        hasMore: false,
      }
    }

    let entries = [...containerLogs.entries]

    // Filtrar por timestamp
    if (filter?.since) {
      const sinceDate = typeof filter.since === 'string' ? new Date(filter.since) : filter.since
      entries = entries.filter(e => new Date(e.timestamp) >= sinceDate)
    }

    // Filtrar por tipos
    if (filter?.types && filter.types.length > 0) {
      entries = entries.filter(e => filter.types!.includes(e.type))
    }

    const total = entries.length

    // Aplicar paginacao
    const offset = filter?.offset ?? 0
    const limit = filter?.limit ?? 500

    entries = entries.slice(offset, offset + limit)

    return {
      containerId,
      logs: entries,
      total,
      hasMore: offset + entries.length < total,
    }
  }

  /**
   * Obtem uma entrada de log especifica
   */
  getLogById(containerId: string, logId: string): ClaudeLogEntry | null {
    const containerLogs = this.logs.get(containerId)
    if (!containerLogs) return null
    return containerLogs.entriesById.get(logId) ?? null
  }

  /**
   * Obtem estatisticas de logs de um container
   */
  getStats(containerId: string): ClaudeLogStats {
    const containerLogs = this.logs.get(containerId)

    if (!containerLogs) {
      return {
        containerId,
        totalEntries: 0,
        byType: {
          stdin: 0,
          stdout: 0,
          stderr: 0,
          system: 0,
        },
      }
    }

    const byType: Record<ClaudeLogType, number> = {
      stdin: 0,
      stdout: 0,
      stderr: 0,
      system: 0,
    }

    for (const entry of containerLogs.entries) {
      byType[entry.type]++
    }

    const entries = containerLogs.entries
    const oldestEntry = entries.length > 0 ? entries[0]?.timestamp : undefined
    const newestEntry = entries.length > 0 ? entries[entries.length - 1]?.timestamp : undefined

    return {
      containerId,
      totalEntries: entries.length,
      byType,
      oldestEntry,
      newestEntry,
    }
  }

  /**
   * Limpa todos os logs de um container
   */
  clearLogs(containerId: string): number {
    const containerLogs = this.logs.get(containerId)
    if (!containerLogs) return 0

    const count = containerLogs.entries.length
    this.logs.delete(containerId)

    logger.info({ containerId, count }, 'Logs limpos')

    // Emitir evento
    this.emit('log:cleared', { containerId, count })

    return count
  }

  /**
   * Remove logs de containers que nao existem mais
   */
  cleanupOrphanedLogs(activeContainerIds: string[]): number {
    const activeSet = new Set(activeContainerIds)
    let removed = 0

    for (const containerId of this.logs.keys()) {
      if (!activeSet.has(containerId)) {
        const count = this.clearLogs(containerId)
        removed += count
        logger.info({ containerId, count }, 'Logs orfaos removidos')
      }
    }

    return removed
  }

  /**
   * Lista todos os containers com logs armazenados
   */
  listContainersWithLogs(): string[] {
    return Array.from(this.logs.keys())
  }

  /**
   * Obtem ou cria estrutura de logs para um container
   */
  private getOrCreateContainerLogs(containerId: string): ContainerLogs {
    let containerLogs = this.logs.get(containerId)

    if (!containerLogs) {
      containerLogs = {
        entries: [],
        entriesById: new Map(),
        lastUpdated: new Date(),
        evictedCount: 0,
      }
      this.logs.set(containerId, containerLogs)
    }

    return containerLogs
  }

  /**
   * Aplica LRU eviction para manter maximo de linhas
   */
  private enforceMaxLines(_containerId: string, containerLogs: ContainerLogs): void {
    while (containerLogs.entries.length > CONFIG.MAX_LINES_PER_CONTAINER) {
      const oldest = containerLogs.entries.shift()
      if (oldest) {
        containerLogs.entriesById.delete(oldest.id)
        containerLogs.evictedCount++
      }
    }
  }

  /**
   * Remove entradas mais antigas que o tempo de retencao
   */
  private cleanupOldEntries(): void {
    const cutoffTime = Date.now() - CONFIG.RETENTION_TIME_MS
    let totalRemoved = 0

    for (const [containerId, containerLogs] of this.logs.entries()) {
      let removedCount = 0

      // Remover entradas antigas do inicio (mais antigas primeiro)
      while (containerLogs.entries.length > 0) {
        const oldest = containerLogs.entries[0]
        if (oldest && new Date(oldest.timestamp).getTime() < cutoffTime) {
          containerLogs.entries.shift()
          containerLogs.entriesById.delete(oldest.id)
          removedCount++
        } else {
          break
        }
      }

      if (removedCount > 0) {
        containerLogs.evictedCount += removedCount
        totalRemoved += removedCount
        logger.debug({ containerId, removedCount, remaining: containerLogs.entries.length }, 'Entradas antigas removidas')
      }

      // Se container ficou vazio, remover
      if (containerLogs.entries.length === 0) {
        this.logs.delete(containerId)
        logger.debug({ containerId }, 'Container sem logs removido')
      }
    }

    if (totalRemoved > 0) {
      logger.info({ totalRemoved, containers: this.logs.size }, 'Limpeza de logs concluida')
    }
  }

  /**
   * Inicia timer de limpeza automatica
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      logger.debug('Executando limpeza programada de logs')
      this.cleanupOldEntries()
    }, CONFIG.CLEANUP_INTERVAL_MS)

    // Nao impedir shutdown
    this.cleanupTimer.unref()
  }

  /**
   * Para timer de limpeza
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * Destroi servico e limpa recursos
   */
  destroy(): void {
    this.stopCleanupTimer()
    this.logs.clear()
    this.removeAllListeners()
    logger.info('ClaudeLogsService destruido')
  }
}

/**
 * Singleton instance do ClaudeLogsService
 */
export const claudeLogsService = new ClaudeLogsService()

/**
 * Export da classe para testes
 */
export { ClaudeLogsService }
