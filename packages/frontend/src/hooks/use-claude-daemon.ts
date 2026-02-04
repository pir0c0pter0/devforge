'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useClaudeChatStore } from '@/stores/claude-chat.store'
import { apiClient } from '@/lib/api-client'

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
 * Extract text content from Claude message content array
 * Claude returns content as array: [{"type": "text", "text": "..."}]
 */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .filter((item): item is { type: string; text: string } =>
        item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string'
      )
      .map((item) => item.text)
      .join('\n')
  }
  return ''
}

/**
 * Parse ClaudeEvent to ClaudeMessage
 */
function parseClaudeEventToMessage(event: ClaudeEvent, messageId: string): ClaudeMessage | null {
  const { type, timestamp, data } = event

  switch (type) {
    case 'assistant': {
      const assistantData = data as { message?: { content?: unknown }; result?: string }
      // Try message.content first, then result field
      const content = extractTextContent(assistantData?.message?.content) || assistantData?.result || ''
      if (!content) return null
      return {
        id: messageId,
        type: 'assistant',
        content,
        timestamp: new Date(timestamp),
      }
    }

    case 'user': {
      const userData = data as { message?: { content?: unknown } }
      const content = extractTextContent(userData?.message?.content)
      if (!content) return null
      return {
        id: messageId,
        type: 'user',
        content,
        timestamp: new Date(timestamp),
      }
    }

    case 'tool_use': {
      const toolData = data as { tool?: string; name?: string; input?: unknown }
      const toolName = toolData?.tool || toolData?.name || 'unknown'
      return {
        id: messageId,
        type: 'tool_use',
        content: `Using tool: ${toolName}`,
        timestamp: new Date(timestamp),
        toolName,
        toolInput: toolData?.input,
      }
    }

    case 'tool_result': {
      const resultData = data as { content?: unknown; isError?: boolean }
      const content = typeof resultData?.content === 'string'
        ? resultData.content
        : JSON.stringify(resultData?.content || '')
      return {
        id: messageId,
        type: 'tool_result',
        content,
        timestamp: new Date(timestamp),
      }
    }

    case 'error': {
      const errorData = data as { message?: string; error?: string; errors?: string[] }
      const content = errorData?.message || errorData?.error || errorData?.errors?.join(', ') || 'Unknown error'
      return {
        id: messageId,
        type: 'error',
        content,
        timestamp: new Date(timestamp),
      }
    }

    case 'system': {
      // Skip system init/hook events, only show meaningful messages
      const systemData = data as { subtype?: string; message?: string; raw?: string; stderr?: string }
      if (systemData?.subtype === 'init' || systemData?.subtype?.startsWith('hook')) {
        return null
      }
      const content = systemData?.message || systemData?.raw || systemData?.stderr || ''
      if (!content) return null
      return {
        id: messageId,
        type: 'system',
        content,
        timestamp: new Date(timestamp),
      }
    }

    case 'result': {
      // Result events contain the final answer - show it!
      const resultData = data as { result?: string; is_error?: boolean; errors?: string[] }
      if (resultData?.is_error) {
        return {
          id: messageId,
          type: 'error',
          content: resultData?.errors?.join(', ') || 'Execution failed',
          timestamp: new Date(timestamp),
        }
      }
      // Don't duplicate - result is usually same as last assistant message
      return null
    }

    default:
      return null
  }
}

/**
 * Hook for managing WebSocket connection to the /claude-daemon namespace
 * for real-time Claude Code communication.
 *
 * Messages are persisted in SQLite via backend and loaded on initialization.
 */
export function useClaudeDaemon(options: UseClaudeDaemonOptions): UseClaudeDaemonReturn {
  const { containerId, onMessage, onStatusChange, onError } = options

  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Use Zustand store for state management
  const {
    messagesByContainer,
    daemonStatusByContainer,
    addMessage,
    setMessages,
    clearMessages: storeClearMessages,
    setDaemonStatus,
    getNextMessageId,
  } = useClaudeChatStore()

  // Get messages and daemon status for this container from store
  const messages = messagesByContainer[containerId] || []
  const daemonStatus = daemonStatusByContainer[containerId] || null

  const socketRef = useRef<Socket | null>(null)
  const historyLoadedRef = useRef(false)

  // Store callbacks in refs to avoid recreating socket handlers
  const onMessageRef = useRef(onMessage)
  const onStatusChangeRef = useRef(onStatusChange)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onMessageRef.current = onMessage
    onStatusChangeRef.current = onStatusChange
    onErrorRef.current = onError
  }, [onMessage, onStatusChange, onError])

  // Load chat history from backend on mount
  useEffect(() => {
    if (!containerId || historyLoadedRef.current) return

    const loadHistory = async () => {
      try {
        console.log('[ClaudeDaemon] Loading chat history for container:', containerId)
        const response = await apiClient.getChatMessages(containerId, { limit: 500 })

        if (response.success && response.data?.messages) {
          const loadedMessages: ClaudeMessage[] = response.data.messages.map((msg) => ({
            id: msg.id,
            type: msg.type,
            content: msg.content,
            timestamp: new Date(msg.timestamp),
            toolName: msg.toolName,
            toolInput: msg.toolInput,
          }))

          if (loadedMessages.length > 0) {
            console.log('[ClaudeDaemon] Loaded', loadedMessages.length, 'messages from history')
            setMessages(containerId, loadedMessages)
          }
        }
      } catch (error) {
        console.error('[ClaudeDaemon] Failed to load chat history:', error)
      } finally {
        historyLoadedRef.current = true
      }
    }

    loadHistory()
  }, [containerId, setMessages])

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
      setDaemonStatus(containerId, state)
      onStatusChangeRef.current?.(state)
    })

    // Handle Claude output events
    socket.on('claude:output', (event: ClaudeEvent) => {
      console.log('[ClaudeDaemon] Claude output:', event)
      const messageId = getNextMessageId(containerId)
      const message = parseClaudeEventToMessage(event, messageId)

      if (message) {
        addMessage(containerId, message)
        onMessageRef.current?.(message)
        // Save to backend asynchronously (fire and forget)
        apiClient.saveChatMessage(containerId, {
          id: message.id,
          type: message.type,
          content: message.content,
          timestamp: message.timestamp.toISOString(),
          toolName: message.toolName,
          toolInput: message.toolInput,
        }).catch((err) => console.error('[ClaudeDaemon] Failed to save message:', err))
      }

      // These events mean Claude has responded - stop loading indicator
      // 'result' = final result, 'assistant' = Claude's response, 'error' = something went wrong
      if (event.type === 'result' || event.type === 'assistant' || event.type === 'error') {
        setIsLoading(false)
      }
    })

    // Handle instruction received confirmation
    // Note: We do NOT set isLoading=false here because Claude is still processing
    // isLoading will be set to false when we receive 'result' or 'assistant' event
    socket.on('instruction:received', () => {
      console.log('[ClaudeDaemon] Instruction received by daemon, waiting for response...')
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
  }, [containerId, addMessage, setDaemonStatus, getNextMessageId])

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

      // Add user message to store immediately
      const messageId = getNextMessageId(containerId)
      const userMessage: ClaudeMessage = {
        id: messageId,
        type: 'user',
        content: instruction,
        timestamp: new Date(),
      }
      addMessage(containerId, userMessage)
      onMessageRef.current?.(userMessage)

      // Save user message to backend asynchronously
      apiClient.saveChatMessage(containerId, {
        id: userMessage.id,
        type: userMessage.type,
        content: userMessage.content,
        timestamp: userMessage.timestamp.toISOString(),
      }).catch((err) => console.error('[ClaudeDaemon] Failed to save user message:', err))

      socketRef.current.emit('instruction:send', {
        containerId,
        instruction,
      })
    },
    [containerId, addMessage, getNextMessageId]
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

  // Clear all messages (from store and backend)
  const clearMessages = useCallback(() => {
    storeClearMessages(containerId)
    // Clear from backend too
    apiClient.clearChatMessages(containerId)
      .then(() => console.log('[ClaudeDaemon] Messages cleared from backend'))
      .catch((err) => console.error('[ClaudeDaemon] Failed to clear messages from backend:', err))
  }, [containerId, storeClearMessages])

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
