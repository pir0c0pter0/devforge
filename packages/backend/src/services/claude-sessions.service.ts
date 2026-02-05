import { randomUUID } from 'crypto'
import { createChildLogger } from '../utils/logger'
import { getDatabase } from '../database'
import type Database from 'better-sqlite3'

const logger = createChildLogger({ service: 'claude-sessions' })

/**
 * Sessão de conversa Claude
 */
export interface ClaudeSession {
  readonly id: string
  readonly containerId: string
  readonly title: string
  readonly messageCount: number
  readonly source: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly lastMessageAt?: Date
}

/**
 * Session database row type
 */
interface ClaudeSessionRow {
  id: string
  container_id: string
  title: string
  message_count: number
  source: string
  created_at: string
  updated_at: string
  last_message_at: string | null
}

/**
 * Mensagem de sessão
 */
export interface SessionMessage {
  readonly id: string
  readonly sessionId: string
  readonly containerId: string
  readonly type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error'
  readonly content: string
  readonly toolName?: string
  readonly toolInput?: unknown
  readonly timestamp: Date
}

/**
 * Message database row type
 */
interface SessionMessageRow {
  id: string
  session_id: string
  container_id: string
  type: string
  content: string
  tool_name: string | null
  tool_input: string | null
  created_at: string
}

/**
 * Resposta paginada de sessões
 */
export interface SessionsListResponse {
  readonly sessions: ClaudeSession[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly hasMore: boolean
}

/**
 * ClaudeSessionsService gerencia sessões de conversas Claude
 *
 * Funcionalidades:
 * - Criar e gerenciar sessões de conversa
 * - Listar sessões com paginação
 * - Obter mensagens de uma sessão
 * - Atualizar contagem de mensagens
 * - Obter ou criar sessão ativa
 */
class ClaudeSessionsService {
  private db: Database.Database

  constructor() {
    this.db = getDatabase()
    this.ensureTablesExist()
    logger.info('ClaudeSessionsService inicializado')
  }

  /**
   * Garante que as tabelas necessárias existem
   */
  private ensureTablesExist(): void {
    // Criar tabela de sessões se não existir
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claude_sessions (
        id TEXT PRIMARY KEY,
        container_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message_count INTEGER DEFAULT 0,
        source TEXT DEFAULT 'web',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_message_at DATETIME,
        FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
      )
    `)

    // Criar índices
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_claude_sessions_container_id
      ON claude_sessions(container_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_claude_sessions_created_at
      ON claude_sessions(created_at DESC)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_claude_sessions_container_created
      ON claude_sessions(container_id, created_at DESC)
    `)

    // Criar trigger para atualizar updated_at
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS trigger_claude_sessions_updated_at
      AFTER UPDATE ON claude_sessions
      BEGIN
        UPDATE claude_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `)

    // Criar tabela de relacionamento sessão-mensagem se não existir
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claude_session_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        container_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('user', 'assistant', 'tool_use', 'tool_result', 'system', 'error')),
        content TEXT NOT NULL,
        tool_name TEXT,
        tool_input JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES claude_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
      )
    `)

    // Criar índices para mensagens
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_claude_session_messages_session_id
      ON claude_session_messages(session_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_claude_session_messages_container_id
      ON claude_session_messages(container_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_claude_session_messages_session_created
      ON claude_session_messages(session_id, created_at ASC)
    `)

    logger.debug('Tabelas claude_sessions e claude_session_messages verificadas')
  }

  /**
   * Converte row do banco em ClaudeSession
   */
  private rowToSession(row: ClaudeSessionRow): ClaudeSession {
    return {
      id: row.id,
      containerId: row.container_id,
      title: row.title,
      messageCount: row.message_count,
      source: row.source,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : undefined,
    }
  }

  /**
   * Converte row do banco em SessionMessage
   */
  private rowToMessage(row: SessionMessageRow): SessionMessage {
    let toolInput: unknown | undefined
    if (row.tool_input) {
      try {
        toolInput = JSON.parse(row.tool_input)
      } catch {
        toolInput = undefined
      }
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      containerId: row.container_id,
      type: row.type as SessionMessage['type'],
      content: row.content,
      toolName: row.tool_name || undefined,
      toolInput,
      timestamp: new Date(row.created_at),
    }
  }

  /**
   * Lista sessões de um container com paginação
   */
  listSessions(
    containerId: string,
    page: number = 1,
    pageSize: number = 20
  ): SessionsListResponse {
    try {
      const offset = (page - 1) * pageSize

      // Contar total
      const countResult = this.db
        .prepare('SELECT COUNT(*) as count FROM claude_sessions WHERE container_id = ?')
        .get(containerId) as { count: number }

      const total = countResult.count

      // Buscar sessões
      const rows = this.db
        .prepare(`
          SELECT * FROM claude_sessions
          WHERE container_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `)
        .all(containerId, pageSize, offset) as ClaudeSessionRow[]

      const sessions = rows.map((row) => this.rowToSession(row))

      return {
        sessions,
        total,
        page,
        pageSize,
        hasMore: offset + sessions.length < total,
      }
    } catch (error) {
      logger.error({ containerId, page, pageSize, error }, 'Falha ao listar sessões')
      throw new Error('Falha ao listar sessões')
    }
  }

  /**
   * Obtém uma sessão por ID
   */
  getSession(sessionId: string): ClaudeSession | null {
    try {
      const row = this.db
        .prepare('SELECT * FROM claude_sessions WHERE id = ?')
        .get(sessionId) as ClaudeSessionRow | undefined

      if (!row) {
        return null
      }

      return this.rowToSession(row)
    } catch (error) {
      logger.error({ sessionId, error }, 'Falha ao obter sessão')
      return null
    }
  }

  /**
   * Obtém mensagens de uma sessão
   */
  getSessionMessages(sessionId: string): SessionMessage[] {
    try {
      const rows = this.db
        .prepare(`
          SELECT * FROM claude_session_messages
          WHERE session_id = ?
          ORDER BY created_at ASC
        `)
        .all(sessionId) as SessionMessageRow[]

      return rows.map((row) => this.rowToMessage(row))
    } catch (error) {
      logger.error({ sessionId, error }, 'Falha ao obter mensagens da sessão')
      return []
    }
  }

  /**
   * Cria uma nova sessão
   */
  createSession(
    containerId: string,
    title: string,
    source: string = 'web'
  ): ClaudeSession {
    try {
      const id = randomUUID()
      const now = new Date().toISOString()

      this.db
        .prepare(`
          INSERT INTO claude_sessions (id, container_id, title, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(id, containerId, title, source, now, now)

      logger.info({ sessionId: id, containerId, title, source }, 'Sessão criada')

      const session = this.getSession(id)
      if (!session) {
        throw new Error('Falha ao criar sessão')
      }

      return session
    } catch (error) {
      logger.error({ containerId, title, source, error }, 'Falha ao criar sessão')
      throw new Error('Falha ao criar sessão')
    }
  }

  /**
   * Atualiza a contagem de mensagens de uma sessão
   */
  updateSessionMessageCount(sessionId: string): ClaudeSession | null {
    try {
      // Contar mensagens
      const countResult = this.db
        .prepare('SELECT COUNT(*) as count FROM claude_session_messages WHERE session_id = ?')
        .get(sessionId) as { count: number }

      const messageCount = countResult.count

      // Obter última mensagem
      const lastMessageRow = this.db
        .prepare(`
          SELECT created_at FROM claude_session_messages
          WHERE session_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(sessionId) as { created_at: string } | undefined

      // Atualizar sessão
      if (lastMessageRow) {
        this.db
          .prepare(`
            UPDATE claude_sessions
            SET message_count = ?, last_message_at = ?
            WHERE id = ?
          `)
          .run(messageCount, lastMessageRow.created_at, sessionId)
      } else {
        this.db
          .prepare('UPDATE claude_sessions SET message_count = ? WHERE id = ?')
          .run(messageCount, sessionId)
      }

      logger.debug({ sessionId, messageCount }, 'Contagem de mensagens atualizada')

      return this.getSession(sessionId)
    } catch (error) {
      logger.error({ sessionId, error }, 'Falha ao atualizar contagem de mensagens')
      return null
    }
  }

  /**
   * Obtém a sessão ativa atual de um container ou cria uma nova
   */
  getCurrentSession(containerId: string): ClaudeSession {
    try {
      // Tentar obter a sessão mais recente
      const row = this.db
        .prepare(`
          SELECT * FROM claude_sessions
          WHERE container_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(containerId) as ClaudeSessionRow | undefined

      if (row) {
        const session = this.rowToSession(row)
        logger.debug({ sessionId: session.id, containerId }, 'Sessão ativa encontrada')
        return session
      }

      // Se não existe, criar nova sessão
      const now = new Date()
      const title = `Sessão ${now.toLocaleString('pt-BR')}`
      const newSession = this.createSession(containerId, title, 'web')

      logger.info({ sessionId: newSession.id, containerId }, 'Nova sessão criada automaticamente')

      return newSession
    } catch (error) {
      logger.error({ containerId, error }, 'Falha ao obter ou criar sessão atual')
      throw new Error('Falha ao obter ou criar sessão atual')
    }
  }

  /**
   * Adiciona uma mensagem a uma sessão
   */
  addMessage(
    sessionId: string,
    containerId: string,
    type: SessionMessage['type'],
    content: string,
    toolName?: string,
    toolInput?: unknown
  ): SessionMessage | null {
    try {
      const id = randomUUID()
      const now = new Date().toISOString()

      this.db
        .prepare(`
          INSERT INTO claude_session_messages
          (id, session_id, container_id, type, content, tool_name, tool_input, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          sessionId,
          containerId,
          type,
          content,
          toolName || null,
          toolInput ? JSON.stringify(toolInput) : null,
          now
        )

      // Atualizar contagem
      this.updateSessionMessageCount(sessionId)

      logger.debug({ messageId: id, sessionId, type }, 'Mensagem adicionada à sessão')

      const row = this.db
        .prepare('SELECT * FROM claude_session_messages WHERE id = ?')
        .get(id) as SessionMessageRow | undefined

      return row ? this.rowToMessage(row) : null
    } catch (error) {
      logger.error({ sessionId, containerId, type, error }, 'Falha ao adicionar mensagem')
      return null
    }
  }

  /**
   * Deleta uma sessão e todas suas mensagens
   */
  deleteSession(sessionId: string): boolean {
    try {
      const result = this.db
        .prepare('DELETE FROM claude_sessions WHERE id = ?')
        .run(sessionId)

      const deleted = result.changes > 0

      if (deleted) {
        logger.info({ sessionId }, 'Sessão deletada')
      }

      return deleted
    } catch (error) {
      logger.error({ sessionId, error }, 'Falha ao deletar sessão')
      return false
    }
  }

  /**
   * Deleta todas as sessões de um container
   */
  deleteContainerSessions(containerId: string): number {
    try {
      const result = this.db
        .prepare('DELETE FROM claude_sessions WHERE container_id = ?')
        .run(containerId)

      const count = result.changes

      if (count > 0) {
        logger.info({ containerId, count }, 'Sessões do container deletadas')
      }

      return count
    } catch (error) {
      logger.error({ containerId, error }, 'Falha ao deletar sessões do container')
      return 0
    }
  }

  /**
   * Obtém estatísticas de sessões de um container
   */
  getContainerStats(containerId: string): {
    totalSessions: number
    totalMessages: number
    lastSessionAt?: Date
  } {
    try {
      const sessionCountResult = this.db
        .prepare('SELECT COUNT(*) as count FROM claude_sessions WHERE container_id = ?')
        .get(containerId) as { count: number }

      const messageCountResult = this.db
        .prepare(`
          SELECT COUNT(*) as count
          FROM claude_session_messages
          WHERE container_id = ?
        `)
        .get(containerId) as { count: number }

      const lastSessionRow = this.db
        .prepare(`
          SELECT created_at
          FROM claude_sessions
          WHERE container_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(containerId) as { created_at: string } | undefined

      return {
        totalSessions: sessionCountResult.count,
        totalMessages: messageCountResult.count,
        lastSessionAt: lastSessionRow ? new Date(lastSessionRow.created_at) : undefined,
      }
    } catch (error) {
      logger.error({ containerId, error }, 'Falha ao obter estatísticas do container')
      return {
        totalSessions: 0,
        totalMessages: 0,
      }
    }
  }
}

/**
 * Singleton instance do ClaudeSessionsService
 */
export const claudeSessionsService = new ClaudeSessionsService()

/**
 * Export da classe para testes
 */
export { ClaudeSessionsService }
