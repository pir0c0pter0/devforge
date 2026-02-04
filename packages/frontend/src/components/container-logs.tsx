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
  Search,
  X,
  Filter,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'

const WS_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ContainerLogsProps {
  containerId: string
  className?: string
}

interface LogEntry {
  id: string
  timestamp: Date
  content: string
  stream: 'stdout' | 'stderr'
}

// Generate unique ID
let logIdCounter = 0
const generateLogId = () => `log-${Date.now()}-${++logIdCounter}`

export function ContainerLogs({ containerId, className }: ContainerLogsProps) {
  const { t } = useI18n()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [filter, setFilter] = useState('')
  const [streamFilter, setStreamFilter] = useState<'all' | 'stdout' | 'stderr'>('all')
  const [showFilters, setShowFilters] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pausedLogsRef = useRef<LogEntry[]>([])

  // Add log entry
  const addLog = useCallback((entry: LogEntry) => {
    if (isPaused) {
      pausedLogsRef.current.push(entry)
      return
    }

    setLogs(prev => {
      // Keep last 2000 entries
      const newLogs = [...prev, entry]
      if (newLogs.length > 2000) {
        return newLogs.slice(-2000)
      }
      return newLogs
    })
  }, [isPaused])

  // WebSocket connection
  useEffect(() => {
    const socket = io(`${WS_URL}/docker-logs`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      console.log('[ContainerLogs] Connected to /docker-logs')
      socket.emit('subscribe', { containerId })
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
      console.log('[ContainerLogs] Disconnected from /docker-logs')
    })

    socket.on('log', (data: { containerId: string; timestamp: string; content: string; stream: 'stdout' | 'stderr' }) => {
      if (data.containerId !== containerId) return

      const entry: LogEntry = {
        id: generateLogId(),
        timestamp: new Date(data.timestamp),
        content: data.content,
        stream: data.stream,
      }
      addLog(entry)
    })

    socket.on('error', (data: { message: string }) => {
      console.error('[ContainerLogs] Error:', data.message)
    })

    return () => {
      socket.emit('unsubscribe', { containerId })
      socket.disconnect()
      socketRef.current = null
    }
  }, [containerId, addLog])

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
  const handleClear = () => {
    setLogs([])
    pausedLogsRef.current = []
  }

  // Download logs
  const handleDownload = () => {
    const logText = logs.map(log => {
      const time = log.timestamp.toISOString()
      const stream = log.stream === 'stderr' ? '[STDERR]' : '[STDOUT]'
      return `${time} ${stream} ${log.content}`
    }).join('\n')

    const blob = new Blob([logText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `container-logs-${containerId}-${new Date().toISOString()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Format timestamp for display
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (streamFilter !== 'all' && log.stream !== streamFilter) {
      return false
    }
    if (filter) {
      return log.content.toLowerCase().includes(filter.toLowerCase())
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
            {t.containerDetail.dockerLogs || 'Docker Logs'}
          </span>
          <span className={clsx(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-terminal-green' : 'bg-terminal-red'
          )} />
          {isPaused && pausedLogsRef.current.length > 0 && (
            <span className="text-xs text-terminal-yellow">
              ({pausedLogsRef.current.length} {t.containerDetail.pending || 'pendentes'})
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
            title={t.containerDetail.filters || 'Filtros'}
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
            title={isPaused ? (t.containerDetail.resume || 'Resumir') : (t.containerDetail.pause || 'Pausar')}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={logs.length === 0}
            className="p-1.5 text-terminal-textMuted hover:text-terminal-text hover:bg-terminal-bg rounded transition-colors disabled:opacity-50"
            title={t.containerDetail.downloadLogs || 'Download logs'}
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            disabled={logs.length === 0}
            className="p-1.5 text-terminal-textMuted hover:text-terminal-red hover:bg-terminal-red/10 rounded transition-colors disabled:opacity-50"
            title={t.containerDetail.clearLogs || 'Limpar logs'}
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
              placeholder={t.containerDetail.searchLogs || 'Buscar nos logs...'}
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

          {/* Stream filter */}
          <div className="flex items-center gap-1">
            {(['all', 'stdout', 'stderr'] as const).map((stream) => (
              <button
                key={stream}
                onClick={() => setStreamFilter(stream)}
                className={clsx(
                  'px-2 py-1 text-xs rounded transition-colors',
                  streamFilter === stream
                    ? stream === 'all'
                      ? 'bg-terminal-green/20 text-terminal-green'
                      : stream === 'stdout'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-red-500/20 text-red-400'
                    : 'text-terminal-textMuted hover:text-terminal-text hover:bg-terminal-bgLight'
                )}
              >
                {stream === 'all' ? (t.containerDetail.all || 'Todos') : stream.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Logs container - terminal style */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto font-mono text-sm min-h-0 bg-[#1a1a1a]"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-terminal-textMuted">
            {logs.length === 0 ? (
              <div className="text-center">
                <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>{t.containerDetail.waitingForLogs || 'Aguardando logs do container...'}</p>
                <p className="text-xs mt-1">{t.containerDetail.logsStreamHint || 'Os logs aparecerão em tempo real'}</p>
              </div>
            ) : (
              <p>{t.containerDetail.noLogsMatch || 'Nenhum log corresponde aos filtros'}</p>
            )}
          </div>
        ) : (
          <div className="p-1">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={clsx(
                  'font-mono text-sm leading-relaxed flex px-2 py-0.5 hover:bg-[#252525]',
                  log.stream === 'stderr' ? 'text-red-400' : 'text-gray-200'
                )}
              >
                {/* Timestamp */}
                <span className="flex-shrink-0 text-gray-500 mr-2 select-none">
                  [{formatTime(log.timestamp)}]
                </span>

                {/* Stream indicator */}
                <span className={clsx(
                  'flex-shrink-0 mr-2 select-none w-16',
                  log.stream === 'stderr' ? 'text-red-500' : 'text-blue-400'
                )}>
                  {log.stream === 'stderr' ? 'STDERR' : 'STDOUT'}:
                </span>

                {/* Content */}
                <span className="flex-1 break-all whitespace-pre-wrap">
                  {log.content}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-1 bg-terminal-bgLight border-t border-terminal-border text-xs text-terminal-textMuted rounded-b-lg">
        <span>
          {filteredLogs.length} logs {(filter || streamFilter !== 'all') ? `(${t.containerDetail.filtered || 'filtrado'})` : ''}
        </span>
        <span>
          {isConnected ? (t.containerDetail.connected || 'Conectado') : (t.containerDetail.disconnected || 'Desconectado')}
          {isPaused && ` | ${t.containerDetail.paused || 'Pausado'}`}
        </span>
      </div>
    </div>
  )
}
