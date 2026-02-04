'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

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
 * Opções do hook useClaudeDaemon
 */
export interface UseClaudeDaemonOptions {
  /** Container ID to connect to */
  containerId: string
  /** Callback when a new message is received */
  onMessage?: (message: ClaudeMessage) => void
  /** Callback when daemon status changes */
  onStatusChange?: (status: DaemonState) => void
  /** Callback when an error occurs */
  onError?: (error: string) => void
}

/**
 * Return type of useClaudeDaemon hook
 */
export interface UseClaudeDaemonReturn {
  /** Whether WebSocket is connected */
  isConnected: boolean
  /** Current daemon status */
  daemonStatus: DaemonState | null
  /** All messages received from Claude */
  messages: ClaudeMessage[]
  /** Whether waiting for instruction response */
  isLoading: boolean
  /** Send an instruction to Claude */
  sendInstruction: (instruction: string) => void
  /** Start the Claude daemon */
  startDaemon: () => void
  /** Stop the Claude daemon */
  stopDaemon: () => void
  /** Clear all messages */
  clearMessages: () => void
}

/**
 * Parse ClaudeEvent to ClaudeMessage
 */
function parseClaudeEventToMessage(event: ClaudeEvent, messageId: string): ClaudeMessage | null {
  const { type, timestamp, data } = event

  switch (type) {
    case 'assistant': {
      const assistantData = data as { message?: { content?: string } }
      const content = assistantData?.message?.content || ''
      if (!content) return null
      return {
        id: messageId,
        type: 'assistant',
        content,
        timestamp: new Date(timestamp),
      }
    }

    case 'user': {
      const userData = data as { message?: { content?: string } }
      const content = userData?.message?.content || ''
      if (!content) return null
      return {
        id: messageId,
        type: 'user',
        content,
        timestamp: new Date(timestamp),
      }
    }

    case 'tool_use': {
      const toolData = data as { tool?: string; input?: unknown }
      return {
        id: messageId,
        type: 'tool_use',
        content: `Using tool: ${toolData?.tool || 'unknown'}`,
        timestamp: new Date(timestamp),
        toolName: toolData?.tool,
        toolInput: toolData?.input,
      }
    }

    case 'tool_result': {
      const resultData = data as { content?: string; isError?: boolean }
      return {
        id: messageId,
        type: 'tool_result',
        content: resultData?.content || '',
        timestamp: new Date(timestamp),
      }
    }

    case 'error': {
      const errorData = data as { message?: string; error?: string }
      return {
        id: messageId,
        type: 'error',
        content: errorData?.message || errorData?.error || 'Unknown error',
        timestamp: new Date(timestamp),
      }
    }

    case 'system': {
      const systemData = data as { message?: string }
      return {
        id: messageId,
        type: 'system',
        content: systemData?.message || '',
        timestamp: new Date(timestamp),
      }
    }

    case 'result': {
      // Result events indicate completion, not a message to display
      return null
    }

    default:
      return null
  }
}

/**
 * Hook for managing WebSocket connection to the /claude-daemon namespace
 * for real-time Claude Code communication.
 */
export function useClaudeDaemon(options: UseClaudeDaemonOptions): UseClaudeDaemonReturn {
  const { containerId, onMessage, onStatusChange, onError } = options

  const [isConnected, setIsConnected] = useState(false)
  const [daemonStatus, setDaemonStatus] = useState<DaemonState | null>(null)
  const [messages, setMessages] = useState<ClaudeMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const messageIdCounterRef = useRef(0)

  // Store callbacks in refs to avoid recreating socket handlers
  const onMessageRef = useRef(onMessage)
  const onStatusChangeRef = useRef(onStatusChange)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onMessageRef.current = onMessage
    onStatusChangeRef.current = onStatusChange
    onErrorRef.current = onError
  }, [onMessage, onStatusChange, onError])

  // Generate unique message ID
  const generateMessageId = useCallback(() => {
    messageIdCounterRef.current += 1
    return `msg-${Date.now()}-${messageIdCounterRef.current}`
  }, [])

  // Initialize WebSocket connection
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!containerId) return

    console.log('[ClaudeDaemon] Connecting to /claude-daemon namespace for container:', containerId)

    const socket = io(`${BACKEND_URL}/claude-daemon`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[ClaudeDaemon] Connected:', socket.id)
      setIsConnected(true)

      // Auto-subscribe to container output
      socket.emit('output:subscribe', { containerId })
      console.log('[ClaudeDaemon] Subscribed to container output:', containerId)

      // Request current daemon status
      socket.emit('daemon:get-status', { containerId })
    })

    socket.on('disconnect', (reason) => {
      console.log('[ClaudeDaemon] Disconnected:', reason)
      setIsConnected(false)
    })

    socket.on('connect_error', (error) => {
      console.error('[ClaudeDaemon] Connection error:', error)
      onErrorRef.current?.(`Connection error: ${error.message}`)
    })

    // Handle daemon status updates
    socket.on('daemon:status', (state: DaemonState) => {
      console.log('[ClaudeDaemon] Daemon status:', state)
      setDaemonStatus(state)
      onStatusChangeRef.current?.(state)
    })

    // Handle Claude output events
    socket.on('claude:output', (event: ClaudeEvent) => {
      console.log('[ClaudeDaemon] Claude output:', event)
      const messageId = generateMessageId()
      const message = parseClaudeEventToMessage(event, messageId)

      if (message) {
        setMessages((prev) => [...prev, message])
        onMessageRef.current?.(message)
      }

      // Result event means Claude finished processing
      if (event.type === 'result') {
        setIsLoading(false)
      }
    })

    // Handle instruction received confirmation
    socket.on('instruction:received', () => {
      console.log('[ClaudeDaemon] Instruction received by daemon')
      setIsLoading(false)
    })

    // Handle errors
    socket.on('error', (data: { message: string }) => {
      console.error('[ClaudeDaemon] Error:', data.message)
      onErrorRef.current?.(data.message)
      setIsLoading(false)
    })

    socket.on('daemon:error', (data: { error: string }) => {
      console.error('[ClaudeDaemon] Daemon error:', data.error)
      onErrorRef.current?.(data.error)
      setIsLoading(false)
    })

    return () => {
      console.log('[ClaudeDaemon] Cleaning up connection')
      if (socketRef.current) {
        socketRef.current.emit('output:unsubscribe', { containerId })
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [containerId, generateMessageId])

  // Send instruction to Claude
  const sendInstruction = useCallback(
    (instruction: string) => {
      if (!socketRef.current?.connected) {
        console.warn('[ClaudeDaemon] Cannot send instruction: not connected')
        onErrorRef.current?.('Not connected to daemon')
        return
      }

      if (!instruction.trim()) {
        console.warn('[ClaudeDaemon] Cannot send empty instruction')
        return
      }

      console.log('[ClaudeDaemon] Sending instruction:', instruction)
      setIsLoading(true)

      // Add user message to local state immediately
      const messageId = generateMessageId()
      const userMessage: ClaudeMessage = {
        id: messageId,
        type: 'user',
        content: instruction,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])
      onMessageRef.current?.(userMessage)

      socketRef.current.emit('instruction:send', {
        containerId,
        instruction,
      })
    },
    [containerId, generateMessageId]
  )

  // Start the daemon
  const startDaemon = useCallback(() => {
    if (!socketRef.current?.connected) {
      console.warn('[ClaudeDaemon] Cannot start daemon: not connected')
      onErrorRef.current?.('Not connected to server')
      return
    }

    console.log('[ClaudeDaemon] Starting daemon for container:', containerId)
    socketRef.current.emit('daemon:start', { containerId })
  }, [containerId])

  // Stop the daemon
  const stopDaemon = useCallback(() => {
    if (!socketRef.current?.connected) {
      console.warn('[ClaudeDaemon] Cannot stop daemon: not connected')
      onErrorRef.current?.('Not connected to server')
      return
    }

    console.log('[ClaudeDaemon] Stopping daemon for container:', containerId)
    socketRef.current.emit('daemon:stop', { containerId })
  }, [containerId])

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([])
    messageIdCounterRef.current = 0
  }, [])

  return {
    isConnected,
    daemonStatus,
    messages,
    isLoading,
    sendInstruction,
    startDaemon,
    stopDaemon,
    clearMessages,
  }
}
