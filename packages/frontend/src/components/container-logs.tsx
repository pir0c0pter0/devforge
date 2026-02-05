'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo, CSSProperties } from 'react'
import { io, Socket } from 'socket.io-client'
import { List, useListRef } from 'react-window'
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
  Clock,
  ChevronDown,
  ArrowDown,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'

const WS_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ContainerLogsProps {
  containerId: string
  className?: string
}

interface LogEntry {
  id: string
  timestamp: Date
  content: string
  stream: 'stdout' | 'stderr'
  recordedAt?: Date
}

// Ring buffer max capacity
const MAX_LOG_ENTRIES = 100000

// Row height for virtual scrolling
const ROW_HEIGHT = 30

// Time range options in hours
const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
] as const

type TimeRange = typeof TIME_RANGES[number]['hours']

// Generate unique ID
let logIdCounter = 0
const generateLogId = () => `log-${Date.now()}-${++logIdCounter}`

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
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

// Row props type for the List component
interface LogRowProps {
  logs: LogEntry[]
}

// Row component for the virtual list (react-window v2 API)
function LogRow({
  index,
  style,
  logs
}: {
  index: number
  style: CSSProperties
  ariaAttributes: {
    "aria-posinset": number
    "aria-setsize": number
    role: "listitem"
  }
} & LogRowProps) {
  const log = logs[index]
  if (!log) return null

  return (
    <div
      style={style}
      className={clsx(
        'font-mono text-sm leading-relaxed flex px-2 hover:bg-[#252525]',
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
      <span className="flex-1 truncate" title={log.content}>
        {log.content}
      </span>
    </div>
  )
}

export function ContainerLogs({ containerId, className }: ContainerLogsProps) {
  const { t } = useI18n()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [filter, setFilter] = useState('')
  const [streamFilter, setStreamFilter] = useState<'all' | 'stdout' | 'stderr'>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>(24)
  const [showFilters, setShowFilters] = useState(false)
  const [showTimeDropdown, setShowTimeDropdown] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const socketRef = useRef<Socket | null>(null)
  const listRef = useListRef(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pausedLogsRef = useRef<LogEntry[]>([])
  const [containerHeight, setContainerHeight] = useState(400)

  // Track seen log IDs to prevent duplicates
  const seenIdsRef = useRef<Set<string>>(new Set())

  // Track last rendered row for scroll detection
  const lastRenderedStopIndex = useRef<number>(0)

  // Debounce search filter for performance
  const debouncedFilter = useDebounce(filter, 300)

  // Add log entry with ring buffer logic
  const addLog = useCallback((entry: LogEntry) => {
    if (isPaused) {
      pausedLogsRef.current.push(entry)
      return
    }

    // Skip if we've already seen this log
    const dedupeKey = `${entry.timestamp.getTime()}-${entry.content}-${entry.stream}`
    if (seenIdsRef.current.has(dedupeKey)) {
      return
    }
    seenIdsRef.current.add(dedupeKey)

    // Clean up old seen IDs to prevent memory leak
    if (seenIdsRef.current.size > MAX_LOG_ENTRIES * 2) {
      const idsArray = Array.from(seenIdsRef.current)
      seenIdsRef.current = new Set(idsArray.slice(-MAX_LOG_ENTRIES))
    }

    setLogs(prev => {
      const newLogs = [...prev, entry]
      // Ring buffer: keep last MAX_LOG_ENTRIES
      if (newLogs.length > MAX_LOG_ENTRIES) {
        return newLogs.slice(-MAX_LOG_ENTRIES)
      }
      return newLogs
    })
  }, [isPaused])

  // Add multiple logs (for historical load)
  const addHistoricalLogs = useCallback((entries: LogEntry[]) => {
    setLogs(prev => {
      // Create a map of existing logs by timestamp+content for deduplication
      const existingKeys = new Set(
        prev.map(log => `${log.timestamp.getTime()}-${log.content}-${log.stream}`)
      )

      // Filter out duplicates and add deduplication keys
      const newEntries = entries.filter(entry => {
        const key = `${entry.timestamp.getTime()}-${entry.content}-${entry.stream}`
        if (existingKeys.has(key) || seenIdsRef.current.has(key)) {
          return false
        }
        seenIdsRef.current.add(key)
        return true
      })

      // Merge and sort by timestamp
      const merged = [...newEntries, ...prev]
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

      // Apply ring buffer limit
      if (merged.length > MAX_LOG_ENTRIES) {
        return merged.slice(-MAX_LOG_ENTRIES)
      }
      return merged
    })
  }, [])

  // Load historical logs from REST API
  const loadHistoricalLogs = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const since = new Date()
      since.setHours(since.getHours() - timeRange)

      const params = new URLSearchParams({
        since: since.toISOString(),
        limit: '10000',
      })

      const response = await fetch(`${API_URL}/api/containers/${containerId}/docker-logs?${params}`)

      if (!response.ok) {
        console.error('[ContainerLogs] Failed to fetch historical logs:', response.status)
        return
      }

      const data = await response.json()

      if (data.success && data.data?.logs) {
        const historicalLogs: LogEntry[] = data.data.logs.map((log: {
          id: number
          containerId: string
          stream: 'stdout' | 'stderr'
          content: string
          recordedAt: string
        }) => ({
          id: generateLogId(),
          timestamp: new Date(log.recordedAt),
          content: log.content,
          stream: log.stream,
          recordedAt: new Date(log.recordedAt),
        }))

        addHistoricalLogs(historicalLogs)
        console.log(`[ContainerLogs] Loaded ${historicalLogs.length} historical logs`)
      }
    } catch (error) {
      console.error('[ContainerLogs] Error loading historical logs:', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [containerId, timeRange, addHistoricalLogs])

  // Load historical logs on mount and when time range changes
  useEffect(() => {
    loadHistoricalLogs()
  }, [loadHistoricalLogs])

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

  // Measure container height for virtual list
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const height = containerRef.current.clientHeight
        if (height > 0) {
          setContainerHeight(height)
        }
      }
    }

    updateHeight()

    const resizeObserver = new ResizeObserver(updateHeight)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [])

  // Filter logs with memoization
  const filteredLogs = useMemo(() => {
    const since = new Date()
    since.setHours(since.getHours() - timeRange)

    return logs.filter(log => {
      // Time range filter
      if (log.timestamp < since) {
        return false
      }
      // Stream filter
      if (streamFilter !== 'all' && log.stream !== streamFilter) {
        return false
      }
      // Text search filter (debounced)
      if (debouncedFilter) {
        return log.content.toLowerCase().includes(debouncedFilter.toLowerCase())
      }
      return true
    })
  }, [logs, streamFilter, debouncedFilter, timeRange])

  // Auto-scroll to bottom when new logs arrive (if already at bottom)
  useEffect(() => {
    if (!isPaused && isAtBottom && listRef.current && filteredLogs.length > 0) {
      listRef.current.scrollToRow({ index: filteredLogs.length - 1, align: 'end' })
    }
  }, [filteredLogs.length, isPaused, isAtBottom, listRef])

  // Handle rows rendered to detect if user is at bottom
  const handleRowsRendered = useCallback((
    visibleRows: { startIndex: number; stopIndex: number },
    _allRows: { startIndex: number; stopIndex: number }
  ) => {
    lastRenderedStopIndex.current = visibleRows.stopIndex

    // Check if we're at the bottom (within 2 rows of the end)
    const atBottom = visibleRows.stopIndex >= filteredLogs.length - 2

    setIsAtBottom(atBottom)
  }, [filteredLogs.length])

  // Resume and add paused logs
  const handleResume = useCallback(() => {
    setIsPaused(false)
    if (pausedLogsRef.current.length > 0) {
      setLogs(prev => {
        const merged = [...prev, ...pausedLogsRef.current]
        if (merged.length > MAX_LOG_ENTRIES) {
          return merged.slice(-MAX_LOG_ENTRIES)
        }
        return merged
      })
      pausedLogsRef.current = []
    }
  }, [])

  // Clear logs
  const handleClear = useCallback(() => {
    setLogs([])
    pausedLogsRef.current = []
    seenIdsRef.current.clear()
  }, [])

  // Download logs
  const handleDownload = useCallback(() => {
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
  }, [logs, containerId])

  // Jump to bottom
  const handleJumpToBottom = useCallback(() => {
    if (listRef.current && filteredLogs.length > 0) {
      listRef.current.scrollToRow({ index: filteredLogs.length - 1, align: 'end' })
      setIsAtBottom(true)
    }
  }, [filteredLogs.length, listRef])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showTimeDropdown) {
        setShowTimeDropdown(false)
      }
    }

    if (showTimeDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showTimeDropdown])

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
          {isLoadingHistory && (
            <span className="text-xs text-terminal-yellow animate-pulse">
              Loading...
            </span>
          )}
          {isPaused && pausedLogsRef.current.length > 0 && (
            <span className="text-xs text-terminal-yellow">
              ({pausedLogsRef.current.length} {t.containerDetail.pending || 'pendentes'})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Time range dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowTimeDropdown(!showTimeDropdown)
              }}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                'text-terminal-textMuted hover:text-terminal-text hover:bg-terminal-bg'
              )}
              title={t.containerDetail.timeRange || 'Time range'}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{timeRange}h</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showTimeDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-terminal-bgLight border border-terminal-border rounded shadow-lg z-10">
                {TIME_RANGES.map((range) => (
                  <button
                    key={range.hours}
                    onClick={(e) => {
                      e.stopPropagation()
                      setTimeRange(range.hours)
                      setShowTimeDropdown(false)
                    }}
                    className={clsx(
                      'block w-full px-4 py-1.5 text-xs text-left transition-colors',
                      timeRange === range.hours
                        ? 'bg-terminal-green/20 text-terminal-green'
                        : 'text-terminal-textMuted hover:text-terminal-text hover:bg-terminal-bg'
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            )}
          </div>

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

      {/* Logs container - virtual scrolling */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden font-mono text-sm min-h-0 bg-[#1a1a1a] relative"
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
          <>
            <List<LogRowProps>
              listRef={listRef}
              rowComponent={LogRow}
              rowCount={filteredLogs.length}
              rowHeight={ROW_HEIGHT}
              rowProps={{ logs: filteredLogs }}
              onRowsRendered={handleRowsRendered}
              overscanCount={20}
              defaultHeight={containerHeight}
              style={{ height: containerHeight, width: '100%' }}
            />

            {/* Jump to bottom button */}
            {!isAtBottom && (
              <button
                onClick={handleJumpToBottom}
                className="absolute bottom-4 right-4 flex items-center gap-1 px-3 py-1.5 bg-terminal-green text-terminal-bg text-xs font-medium rounded-full shadow-lg hover:bg-terminal-green/90 transition-colors"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                {t.containerDetail.jumpToBottom || 'Ir para o fim'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-1 bg-terminal-bgLight border-t border-terminal-border text-xs text-terminal-textMuted rounded-b-lg">
        <span>
          {filteredLogs.length.toLocaleString()} logs
          {(debouncedFilter || streamFilter !== 'all' || timeRange !== 24) && ` (${t.containerDetail.filtered || 'filtrado'})`}
          {logs.length > filteredLogs.length && ` | ${logs.length.toLocaleString()} total`}
        </span>
        <span>
          {isConnected ? (t.containerDetail.connected || 'Conectado') : (t.containerDetail.disconnected || 'Desconectado')}
          {isPaused && ` | ${t.containerDetail.paused || 'Pausado'}`}
        </span>
      </div>
    </div>
  )
}
