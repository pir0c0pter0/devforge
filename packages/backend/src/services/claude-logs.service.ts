import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { createChildLogger } from '../utils/logger'
import { claudeLogsRepository } from '../repositories'
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
  /** Maximo de linhas por container no banco */
  MAX_LOGS_PER_CONTAINER: 5000,
  /** Tempo de retencao em horas */
  RETENTION_HOURS: 24,
  /** Intervalo de limpeza em ms (30 minutos) */
  CLEANUP_INTERVAL_MS: 30 * 60 * 1000,
  /** Tamanho maximo do cache em memoria por container */
  MEMORY_CACHE_SIZE: 100,
}

/**
 * Verifica se o conteudo do log e valido (nao vazio)
 */
function isValidLogContent(content: string): boolean {
  if (!content) return false
  const trimmed = content.trim()
  if (!trimmed) return false
  // Ignorar logs que sao apenas pontuacao ou caracteres de controle
  if (/^[\s\n\r\t]*$/.test(trimmed)) return false
  return true
}

/**
 * Verifica se o log deve ser filtrado (nao mostrado/salvo)
 */
function shouldFilterLog(type: ClaudeLogType, content: string, _metadata?: ClaudeLogMetadata): boolean {
  // Filtrar conteudo vazio
  if (!isValidLogContent(content)) return true

  // Filtrar mensagens de status repetitivas sem conteudo util
  if (type === 'system') {
    const lower = content.toLowerCase()
    // Filtrar status genericos sem informacao
    if (lower === 'daemon status: running') return true
    if (lower === 'daemon status: stopped') return true
    if (lower === 'health: unknown') return true
  }

  return false
}

/**
 * Cache em memoria para logs recentes (para WebSocket streaming rapido)
 */
interface MemoryCache {
  entries: ClaudeLogEntry[]
  lastUpdated: Date
}

/**
 * ClaudeLogsService gerencia logs de execucao do Claude Code
 *
 * Funcionalidades:
 * - Persistencia em SQLite
 * - Cache em memoria para streaming rapido via WebSocket
 * - Filtragem de logs vazios/repetitivos
 * - Limpeza automatica baseada em tempo
 * - API REST para historico
 */
class ClaudeLogsService extends EventEmitter {
  /** Cache em memoria para logs recentes */
  private memoryCache: Map<string, MemoryCache> = new Map()

  /** Timer de limpeza */
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.startCleanupTimer()
    logger.info('ClaudeLogsService inicializado com persistencia SQLite')
  }

  /**
   * Adiciona uma nova entrada de log para um container
   */
  addLog(
    containerId: string,
    type: ClaudeLogType,
    content: string,
    metadata?: ClaudeLogMetadata
  ): ClaudeLogEntry | null {
    // Filtrar logs vazios ou repetitivos
    if (shouldFilterLog(type, content, metadata)) {
      logger.debug({ containerId, type, content: content.substring(0, 50) }, 'Log filtrado')
      return null
    }

    const entry: ClaudeLogEntry = {
      id: randomUUID(),
      timestamp: new Date(),
      type,
      content,
      metadata,
    }

    // Persistir no banco de dados
    try {
      claudeLogsRepository.create({
        containerId,
        type,
        content,
        metadata: metadata as Record<string, unknown>,
      })
    } catch (error) {
      logger.error({ containerId, error }, 'Falha ao persistir log no banco')
    }

    // Adicionar ao cache em memoria
    this.addToMemoryCache(containerId, entry)

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
    const toInsert: Array<{ containerId: string; type: ClaudeLogType; content: string; metadata?: Record<string, unknown> }> = []

    for (const entry of entries) {
      // Filtrar logs vazios
      if (shouldFilterLog(entry.type, entry.content, entry.metadata)) {
        continue
      }

      const logEntry: ClaudeLogEntry = {
        id: randomUUID(),
        timestamp: new Date(),
        type: entry.type,
        content: entry.content,
        metadata: entry.metadata,
      }

      results.push(logEntry)
      toInsert.push({
        containerId,
        type: entry.type,
        content: entry.content,
        metadata: entry.metadata as Record<string, unknown>,
      })

      // Adicionar ao cache em memoria
      this.addToMemoryCache(containerId, logEntry)
    }

    // Batch insert no banco
    if (toInsert.length > 0) {
      try {
        claudeLogsRepository.createBatch(toInsert)
      } catch (error) {
        logger.error({ containerId, count: toInsert.length, error }, 'Falha ao persistir batch de logs')
      }
    }

    // Emitir batch event
    if (results.length > 0) {
      this.emit('log:batch', { containerId, entries: results })
    }

    return results
  }

  /**
   * Obtem logs de um container com filtros opcionais
   * Carrega do banco de dados para historico completo
   */
  getLogs(containerId: string, filter?: ClaudeLogFilter): ClaudeLogsResponse {
    try {
      const result = claudeLogsRepository.getContainerLogs(containerId, {
        limit: filter?.limit ?? 500,
        offset: filter?.offset ?? 0,
        since: filter?.since ? (typeof filter.since === 'string' ? new Date(filter.since) : filter.since) : undefined,
        types: filter?.types,
      })

      // Converter para formato esperado
      const logs: ClaudeLogEntry[] = result.logs.map(entity => ({
        id: entity.id.toString(),
        timestamp: entity.recordedAt,
        type: entity.type,
        content: entity.content,
        metadata: entity.metadata as ClaudeLogMetadata,
      }))

      return {
        containerId,
        logs,
        total: result.total,
        hasMore: result.hasMore,
      }
    } catch (error) {
      logger.error({ containerId, error }, 'Falha ao carregar logs do banco')
      return {
        containerId,
        logs: [],
        total: 0,
        hasMore: false,
      }
    }
  }

  /**
   * Obtem logs recentes para carga inicial
   */
  getRecentLogs(containerId: string, limit: number = 500): ClaudeLogsResponse {
    try {
      const entities = claudeLogsRepository.getRecentLogs(containerId, limit)

      const logs: ClaudeLogEntry[] = entities.map(entity => ({
        id: entity.id.toString(),
        timestamp: entity.recordedAt,
        type: entity.type,
        content: entity.content,
        metadata: entity.metadata as ClaudeLogMetadata,
      }))

      const total = claudeLogsRepository.count({ containerId })

      return {
        containerId,
        logs,
        total,
        hasMore: total > limit,
      }
    } catch (error) {
      logger.error({ containerId, error }, 'Falha ao carregar logs recentes')
      return {
        containerId,
        logs: [],
        total: 0,
        hasMore: false,
      }
    }
  }

  /**
   * Obtem uma entrada de log especifica
   */
  getLogById(containerId: string, logId: string): ClaudeLogEntry | null {
    try {
      const entity = claudeLogsRepository.findById(logId)
      if (!entity || entity.containerId !== containerId) return null

      return {
        id: entity.id.toString(),
        timestamp: entity.recordedAt,
        type: entity.type,
        content: entity.content,
        metadata: entity.metadata as ClaudeLogMetadata,
      }
    } catch {
      return null
    }
  }

  /**
   * Obtem estatisticas de logs de um container
   */
  getStats(containerId: string): ClaudeLogStats {
    try {
      const stats = claudeLogsRepository.getStats(containerId)

      return {
        containerId,
        totalEntries: stats.total,
        byType: stats.byType,
        oldestEntry: stats.oldestLog,
        newestEntry: stats.newestLog,
      }
    } catch (error) {
      logger.error({ containerId, error }, 'Falha ao obter estatisticas')
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
  }

  /**
   * Limpa todos os logs de um container
   */
  clearLogs(containerId: string): number {
    try {
      const count = claudeLogsRepository.deleteByContainerId(containerId)

      // Limpar cache em memoria
      this.memoryCache.delete(containerId)

      logger.info({ containerId, count }, 'Logs limpos')

      // Emitir evento
      this.emit('log:cleared', { containerId, count })

      return count
    } catch (error) {
      logger.error({ containerId, error }, 'Falha ao limpar logs')
      return 0
    }
  }

  /**
   * Remove logs de containers que nao existem mais
   */
  cleanupOrphanedLogs(activeContainerIds: string[]): number {
    // Este metodo seria chamado pelo container service ao sincronizar
    // Por ora, confiamos no CASCADE DELETE da foreign key
    logger.debug({ activeContainers: activeContainerIds.length }, 'Cleanup de logs orfaos')
    return 0
  }

  /**
   * Lista todos os containers com logs armazenados
   */
  listContainersWithLogs(): string[] {
    // Cache em memoria apenas - para operacoes mais pesadas usar query direta
    return Array.from(this.memoryCache.keys())
  }

  /**
   * Adiciona entrada ao cache em memoria
   */
  private addToMemoryCache(containerId: string, entry: ClaudeLogEntry): void {
    let cache = this.memoryCache.get(containerId)

    if (!cache) {
      cache = {
        entries: [],
        lastUpdated: new Date(),
      }
      this.memoryCache.set(containerId, cache)
    }

    cache.entries.push(entry)
    cache.lastUpdated = new Date()

    // Manter apenas os ultimos N entries no cache
    if (cache.entries.length > CONFIG.MEMORY_CACHE_SIZE) {
      cache.entries = cache.entries.slice(-CONFIG.MEMORY_CACHE_SIZE)
    }
  }

  /**
   * Executa limpeza de logs antigos
   */
  private runCleanup(): void {
    try {
      // Deletar logs mais antigos que o tempo de retencao
      const deleted = claudeLogsRepository.deleteOld(CONFIG.RETENTION_HOURS)

      if (deleted > 0) {
        logger.info({ deleted, retentionHours: CONFIG.RETENTION_HOURS }, 'Logs antigos removidos')
      }

      // Limpar cache de memoria de containers inativos
      const now = Date.now()
      const cacheTimeout = CONFIG.CLEANUP_INTERVAL_MS * 2 // 1 hora

      for (const [containerId, cache] of this.memoryCache.entries()) {
        if (now - cache.lastUpdated.getTime() > cacheTimeout) {
          this.memoryCache.delete(containerId)
          logger.debug({ containerId }, 'Cache em memoria removido por inatividade')
        }
      }
    } catch (error) {
      logger.error({ error }, 'Falha durante limpeza de logs')
    }
  }

  /**
   * Inicia timer de limpeza automatica
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      logger.debug('Executando limpeza programada de logs')
      this.runCleanup()
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
    this.memoryCache.clear()
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
