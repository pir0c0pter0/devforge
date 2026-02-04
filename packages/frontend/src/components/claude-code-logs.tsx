'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import clsx from 'clsx'
import {
  Terminal,
  Trash2,
  Download,
  Pause,
  Play,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Filter,
  Loader2,
} from 'lucide-react'

const WS_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ClaudeCodeLogsProps {
  containerId: string
  className?: string
}

// Claude event types
type ClaudeEventType =
  | 'assistant'
  | 'user'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'error'
  | 'system'
  | 'stdin'
  | 'stdout'
  | 'stderr'

interface ClaudeEvent {
  type: ClaudeEventType
  timestamp: Date
  data: Record<string, unknown>
}

interface LogEntry {
  id: string
  timestamp: Date
  type: ClaudeEventType
  summary: string
  details: string | null
  raw: Record<string, unknown>
  expanded: boolean
}

// Event type colors
const eventTypeColors: Record<ClaudeEventType, { bg: string; text: string; label: string }> = {
  assistant: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'CLAUDE' },
  user: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'USER' },
  tool_use: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'TOOL' },
  tool_result: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'RESULT' },
  result: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'FINAL' },
  error: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'ERROR' },
  system: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'SYSTEM' },
  stdin: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'INPUT' },
  stdout: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'OUTPUT' },
  stderr: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'STDERR' },
}

// Generate unique ID
let logIdCounter = 0
const generateLogId = () => `log-${Date.now()}-${++logIdCounter}`

/**
 * Verifica se o log deve ser filtrado (nao mostrado)
 */
function shouldFilterLog(type: ClaudeEventType, content: string): boolean {
  if (!content || !content.trim()) return true

  const lower = content.toLowerCase().trim()

  // Filtrar mensagens de status genericas
  if (type === 'system') {
    if (lower === 'daemon status: running') return true
    if (lower === 'daemon status: stopped') return true
    if (lower === 'health: unknown') return true
    if (lower.startsWith('health:') && lower.length < 20) return true
  }

  // Filtrar conteudo muito curto sem significado
  if (lower.length < 2) return true

  return false
}

export function ClaudeCodeLogs({ containerId, className }: ClaudeCodeLogsProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<ClaudeEventType | 'all'>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [totalLogs, setTotalLogs] = useState(0)
  const socketRef = useRef<Socket | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pausedLogsRef = useRef<LogEntry[]>([])

  // Parse event to create log entry
  const parseEvent = useCallback((event: ClaudeEvent): LogEntry | null => {
    const data = event.data || {}
    let summary = ''
    let details: string | null = null
    const type = event.type

    // Filtrar eventos sem conteudo util
    const content = (data.content as string) || (data.message as string) || ''
    if (shouldFilterLog(type, content)) {
      return null
    }

    switch (type) {
      case 'assistant': {
        const message = data.message as { content?: Array<{ type?: string; text?: string }> | string } | undefined
        if (message?.content) {
          if (Array.isArray(message.content)) {
            const contentArray = message.content as Array<{ type?: string; text?: string }>
            const textItems = contentArray
              .filter((c) => c.type === 'text')
              .map((c) => c.text || '')
              .join('\n')
            summary = textItems.substring(0, 100) + (textItems.length > 100 ? '...' : '')
            details = textItems
          } else if (typeof message.content === 'string') {
            summary = message.content.substring(0, 100) + (message.content.length > 100 ? '...' : '')
            details = message.content
          }
        } else {
          summary = 'Resposta do Claude'
          details = JSON.stringify(data, null, 2)
        }
        break
      }

      case 'user': {
        const message = data.message as { content?: string } | undefined
        summary = message?.content?.substring(0, 100) || 'Mensagem do usuário'
        details = message?.content || null
        break
      }

      case 'tool_use': {
        const name = data.name as string || 'Unknown'
        const input = data.input as Record<string, unknown> | undefined
        summary = `Tool: ${name}`
        if (input) {
          const inputStr = JSON.stringify(input)
          if (inputStr.length > 50) {
            summary += ` - ${inputStr.substring(0, 50)}...`
          } else {
            summary += ` - ${inputStr}`
          }
          details = JSON.stringify(input, null, 2)
        }
        break
      }

      case 'tool_result': {
        const resultContent = data.content as string | undefined
        const isError = data.is_error as boolean | undefined
        summary = isError ? 'Tool falhou' : 'Tool resultado'
        if (resultContent) {
          summary += `: ${resultContent.substring(0, 80)}${resultContent.length > 80 ? '...' : ''}`
          details = resultContent
        }
        break
      }

      case 'result': {
        const result = data.result as string | undefined
        const cost = data.total_cost_usd as number | undefined
        const duration = data.duration_ms as number | undefined
        summary = 'Instrução concluída'
        if (cost !== undefined) {
          summary += ` | Custo: $${cost.toFixed(4)}`
        }
        if (duration !== undefined) {
          summary += ` | Duração: ${(duration / 1000).toFixed(1)}s`
        }
        details = result || JSON.stringify(data, null, 2)
        break
      }

      case 'error': {
        const errorMessage = (data.message as string) || (data.error as string) || 'Erro desconhecido'
        summary = `Erro: ${errorMessage}`
        details = JSON.stringify(data, null, 2)
        break
      }

      case 'stdin': {
        const inputContent = data.content as string || ''
        summary = inputContent.substring(0, 100) + (inputContent.length > 100 ? '...' : '')
        details = inputContent.length > 100 ? inputContent : null
        break
      }

      case 'stdout':
      case 'stderr': {
        const outputContent = data.content as string || ''
        summary = outputContent.substring(0, 100) + (outputContent.length > 100 ? '...' : '')
        details = outputContent.length > 100 ? outputContent : null
        break
      }

      case 'system': {
        const sysMessage = data.message as string | undefined
        const raw = data.raw as string | undefined
        const stderr = data.stderr as string | undefined
        const agentCount = data.agentCount as number | undefined

        if (agentCount !== undefined) {
          summary = `Aguardando ${agentCount} agente(s) em background`
        } else if (sysMessage) {
          summary = sysMessage
        } else if (stderr) {
          summary = `stderr: ${stderr.substring(0, 80)}`
          details = stderr
        } else if (raw) {
          summary = raw.substring(0, 100)
          details = raw
        } else {
          summary = 'Evento do sistema'
          details = JSON.stringify(data, null, 2)
        }
        break
      }

      default:
        summary = JSON.stringify(data).substring(0, 100)
        details = JSON.stringify(data, null, 2)
    }

    // Validar que temos conteudo util
    if (!summary || summary.trim().length < 2) {
      return null
    }

    return {
      id: generateLogId(),
      timestamp: new Date(event.timestamp || Date.now()),
      type,
      summary,
      details,
      raw: data,
      expanded: false,
    }
  }, [])

  // Add log entry
  const addLog = useCallback((entry: LogEntry | null) => {
    if (!entry) return

    if (isPaused) {
      pausedLogsRef.current.push(entry)
      return
    }

    setLogs(prev => {
      // Verificar se ja existe
      if (prev.some(l => l.id === entry.id)) {
        return prev
      }

      // Keep last 1000 entries
      const newLogs = [...prev, entry]
      if (newLogs.length > 1000) {
        return newLogs.slice(-1000)
      }
      return newLogs
    })
  }, [isPaused])

  // Carregar historico de logs
  const loadHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/claude-daemon/${containerId}/logs?limit=500`)
      if (!response.ok) throw new Error('Failed to load logs')

      const data = await response.json()

      if (data.success && data.data?.logs) {
        const historyLogs: LogEntry[] = data.data.logs
          .map((log: { id: string; type: ClaudeEventType; content: string; metadata?: Record<string, unknown>; recordedAt: string }) => {
            // Filtrar logs vazios
            if (shouldFilterLog(log.type, log.content)) {
              return null
            }

            return {
              id: log.id,
              timestamp: new Date(log.recordedAt),
              type: log.type,
              summary: log.content.substring(0, 100) + (log.content.length > 100 ? '...' : ''),
              details: log.content.length > 100 ? log.content : null,
              raw: log.metadata || {},
              expanded: false,
            }
          })
          .filter(Boolean) as LogEntry[]

        setLogs(historyLogs)
        setTotalLogs(data.data.total || historyLogs.length)
      }
    } catch (error) {
      console.error('[ClaudeCodeLogs] Failed to load history:', error)
    } finally {
      setIsLoading(false)
    }
  }, [containerId])

  // Carregar historico na montagem
  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // WebSocket connection
  useEffect(() => {
    const socket = io(`${WS_URL}/claude-daemon`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      console.log('[ClaudeCodeLogs] Connected to /claude-daemon')
      socket.emit('output:subscribe', { containerId })
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
      console.log('[ClaudeCodeLogs] Disconnected from /claude-daemon')
    })

    socket.on('claude:output', (event: ClaudeEvent) => {
      const entry = parseEvent(event)
      addLog(entry)
    })

    socket.on('claude:log', (log: { id: string; type: ClaudeEventType; content: string; metadata?: Record<string, unknown>; timestamp: string }) => {
      // Filtrar logs vazios
      if (shouldFilterLog(log.type, log.content)) {
        return
      }

      const entry: LogEntry = {
        id: log.id || generateLogId(),
        timestamp: new Date(log.timestamp),
        type: log.type,
        summary: log.content.substring(0, 100) + (log.content.length > 100 ? '...' : ''),
        details: log.content.length > 100 ? log.content : null,
        raw: log.metadata || {},
        expanded: false,
      }
      addLog(entry)
    })

    // NAO adicionar evento de daemon:status para evitar logs repetitivos

    socket.on('daemon:error', (data: { error: string }) => {
      const entry: LogEntry = {
        id: generateLogId(),
        timestamp: new Date(),
        type: 'error',
        summary: `Daemon error: ${data.error}`,
        details: data.error,
        raw: data,
        expanded: false,
      }
      addLog(entry)
    })

    return () => {
      socket.emit('output:unsubscribe', { containerId })
      socket.disconnect()
      socketRef.current = null
    }
  }, [containerId, parseEvent, addLog])

  // Auto-scroll to bottom
  useEffect(() => {
    if (!isPaused && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isPaused])

  // Resume and add paused logs
  const handleResume = () => {
    setIsPaused(false)
    if (pausedLogsRef.current.length > 0) {
      setLogs(prev => [...prev, ...pausedLogsRef.current])
      pausedLogsRef.current = []
    }
  }

  // Clear logs
  const handleClear = async () => {
    try {
      await fetch(`${API_URL}/api/claude-daemon/${containerId}/logs`, { method: 'DELETE' })
    } catch (error) {
      console.error('[ClaudeCodeLogs] Failed to clear logs:', error)
    }
    setLogs([])
    pausedLogsRef.current = []
    setTotalLogs(0)
  }

  // Download logs
  const handleDownload = () => {
    const logText = logs.map(log => {
      const time = log.timestamp.toISOString()
      const type = `[${log.type.toUpperCase()}]`
      let content = log.summary
      if (log.details) {
        content += '\n' + log.details
      }
      return `${time} ${type} ${content}`
    }).join('\n\n')

    const blob = new Blob([logText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `claude-logs-${containerId}-${new Date().toISOString()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Toggle log expansion
  const toggleExpand = (logId: string) => {
    setLogs(prev => prev.map(log =>
      log.id === logId ? { ...log, expanded: !log.expanded } : log
    ))
  }

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (typeFilter !== 'all' && log.type !== typeFilter) {
      return false
    }
    if (filter) {
      const searchLower = filter.toLowerCase()
      return (
        log.summary.toLowerCase().includes(searchLower) ||
        (log.details?.toLowerCase().includes(searchLower) ?? false)
      )
    }
    return true
  })

  return (
    <div className={clsx('flex flex-col bg-terminal-bg rounded-lg border border-terminal-border h-full', className)}>
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-terminal-bgLight border-b border-terminal-border rounded-t-lg">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-terminal-green" />
          <span className="text-sm font-medium text-terminal-text">
            Claude Code Logs
          </span>
          <span className={clsx(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-terminal-green' : 'bg-terminal-red'
          )} />
          {isPaused && pausedLogsRef.current.length > 0 && (
            <span className="text-xs text-terminal-yellow">
              ({pausedLogsRef.current.length} pendentes)
            </span>
          )}
          {totalLogs > 0 && (
            <span className="text-xs text-terminal-textMuted">
              ({totalLogs} total)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              'p-1.5 rounded transition-colors',
              showFilters
                ? 'bg-terminal-green/20 text-terminal-green'
                : 'text-terminal-textMuted hover:text-terminal-text hover:bg-terminal-bg'
            )}
            title="Filtros"
          >
            <Filter className="w-4 h-4" />
          </button>

          {/* Pause/Resume */}
          <button
            onClick={() => isPaused ? handleResume() : setIsPaused(true)}
            className={clsx(
              'p-1.5 rounded transition-colors',
              isPaused
                ? 'bg-terminal-yellow/20 text-terminal-yellow'
                : 'text-terminal-textMuted hover:text-terminal-text hover:bg-terminal-bg'
            )}
            title={isPaused ? 'Resumir' : 'Pausar'}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={logs.length === 0}
            className="p-1.5 text-terminal-textMuted hover:text-terminal-text hover:bg-terminal-bg rounded transition-colors disabled:opacity-50"
            title="Download logs"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            disabled={logs.length === 0}
            className="p-1.5 text-terminal-textMuted hover:text-terminal-red hover:bg-terminal-red/10 rounded transition-colors disabled:opacity-50"
            title="Limpar logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex-shrink-0 flex items-center gap-4 px-4 py-2 bg-terminal-bg border-b border-terminal-border">
          {/* Text search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-terminal-textMuted" />
            <input
              type="text"
              placeholder="Buscar nos logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 bg-terminal-bgLight border border-terminal-border rounded text-sm text-terminal-text placeholder-terminal-textMuted focus:outline-none focus:border-terminal-green"
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-terminal-textMuted hover:text-terminal-text"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1 flex-wrap">
            {(['all', 'stdin', 'stdout', 'stderr', 'assistant', 'tool_use', 'result', 'error', 'system'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={clsx(
                  'px-2 py-1 text-xs rounded transition-colors',
                  typeFilter === type
                    ? type === 'all'
                      ? 'bg-terminal-green/20 text-terminal-green'
                      : `${eventTypeColors[type].bg} ${eventTypeColors[type].text}`
                    : 'text-terminal-textMuted hover:text-terminal-text hover:bg-terminal-bgLight'
                )}
              >
                {type === 'all' ? 'Todos' : eventTypeColors[type].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Logs - container com scroll interno */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto font-mono text-sm min-h-0"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-terminal-textMuted">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Carregando histórico...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-terminal-textMuted">
            {logs.length === 0 ? (
              <div className="text-center">
                <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Aguardando eventos do Claude Code...</p>
                <p className="text-xs mt-1">Execute uma instrução para ver os logs</p>
              </div>
            ) : (
              <p>Nenhum log corresponde aos filtros</p>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={clsx(
                  'rounded border transition-colors',
                  log.type === 'error' || log.type === 'stderr'
                    ? 'border-terminal-red/30 bg-terminal-red/5'
                    : 'border-terminal-border bg-terminal-bgLight/50 hover:bg-terminal-bgLight'
                )}
              >
                {/* Log header */}
                <div
                  className="flex items-start gap-2 px-3 py-2 cursor-pointer"
                  onClick={() => log.details && toggleExpand(log.id)}
                >
                  {/* Expand button */}
                  {log.details ? (
                    <button className="flex-shrink-0 mt-0.5 text-terminal-textMuted">
                      {log.expanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  ) : (
                    <div className="w-4" />
                  )}

                  {/* Timestamp */}
                  <span className="flex-shrink-0 text-terminal-textMuted text-xs">
                    {log.timestamp.toLocaleTimeString()}
                  </span>

                  {/* Type badge */}
                  <span className={clsx(
                    'flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium',
                    eventTypeColors[log.type]?.bg || 'bg-gray-500/20',
                    eventTypeColors[log.type]?.text || 'text-gray-400'
                  )}>
                    {eventTypeColors[log.type]?.label || log.type.toUpperCase()}
                  </span>

                  {/* Summary */}
                  <span className="flex-1 text-terminal-text break-all">
                    {log.summary}
                  </span>
                </div>

                {/* Expanded details */}
                {log.expanded && log.details && (
                  <div className="px-3 pb-3 ml-6">
                    <pre className="p-2 bg-terminal-bg rounded text-xs text-terminal-text overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
                      {log.details}
                    </pre>
                  </div>
                )}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-1 bg-terminal-bgLight border-t border-terminal-border text-xs text-terminal-textMuted rounded-b-lg">
        <span>{filteredLogs.length} logs {filter || typeFilter !== 'all' ? '(filtrado)' : ''}</span>
        <span>
          {isConnected ? 'Conectado' : 'Desconectado'}
          {isPaused && ' | Pausado'}
        </span>
      </div>
    </div>
  )
}
