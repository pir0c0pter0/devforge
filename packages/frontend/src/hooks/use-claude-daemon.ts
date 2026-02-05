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
 * Processing stage for tracking Claude Code execution state (fix #9)
 */
export type ProcessingStage =
  | 'idle'
  | 'starting'
  | 'streaming'
  | 'processing'
  | 'waiting_agents'
  | 'finalizing'

/**
 * Processing state received from backend (fix #9)
 */
export interface ProcessingState {
  isProcessing: boolean
  stage: ProcessingStage
  startedAt?: Date
  lastActivityAt?: Date
}

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
  /** Whether waiting for instruction response (derived from processingState) */
  isLoading: boolean
  /** Current processing state from backend (fix #9 - source of truth) */
  processingState: ProcessingState
  /** Send an instruction to Claude (auto-cancels if busy) */
  sendInstruction: (instruction: string) => void
  /** Send a silent instruction (doesn't add to UI or save to backend) */
  sendSilentInstruction: (instruction: string) => void
  /** Block/unblock message updates (used during session switch) */
  setBlockMessageUpdates: (block: boolean) => void
  /** Cancel the current instruction */
  cancelInstruction: () => void
  /** Start the Claude daemon */
  startDaemon: () => void
  /** Stop the Claude daemon */
  stopDaemon: () => void
  /** Clear all messages */
  clearMessages: () => void
}

// ============================================================================
// Connection Deduplication Registry
// ============================================================================

/**
 * Module-level connection registry for WebSocket deduplication.
 * Prevents multiple components mounting with the same containerId from creating
 * multiple WebSocket connections. Uses reference counting to properly manage
 * connection lifecycle.
 */
interface ConnectionEntry {
  socket: Socket
  refCount: number
  isConnected: boolean
  /** Set of subscribed containerIds for this socket */
  subscribedContainers: Set<string>
}

const connectionRegistry = new Map<string, ConnectionEntry>()

/**
 * Get or create a shared WebSocket connection for the /claude-daemon namespace.
 * Increments reference count if connection already exists.
 */
function getOrCreateConnection(containerId: string): ConnectionEntry {
  const existing = connectionRegistry.get(containerId)
  if (existing) {
    existing.refCount++
    return existing
  }

  const socket = io(`${BACKEND_URL}/claude-daemon`, {
    transports: ['polling', 'websocket'],
    upgrade: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10,
    timeout: 10000,
  })

  const entry: ConnectionEntry = {
    socket,
    refCount: 1,
    isConnected: false,
    subscribedContainers: new Set(),
  }

  connectionRegistry.set(containerId, entry)
  return entry
}

/**
 * Release a connection. Decrements reference count and disconnects if no more references.
 */
function releaseConnection(containerId: string): void {
  const entry = connectionRegistry.get(containerId)
  if (!entry) return

  entry.refCount--

  if (entry.refCount <= 0) {
    // Unsubscribe from all containers
    entry.subscribedContainers.forEach((cid) => {
      entry.socket.emit('output:unsubscribe', { containerId: cid })
    })
    entry.socket.disconnect()
    connectionRegistry.delete(containerId)
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

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
      // Never show system messages in the chat UI
      // User requested: "não quero ver NENHUM retorno do sistema nessa janela"
      return null
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
/**
 * Safety timeout for processing state (5 minutes)
 * If backend doesn't send complete event, reset to idle
 */
const PROCESSING_SAFETY_TIMEOUT = 5 * 60 * 1000

export function useClaudeDaemon(options: UseClaudeDaemonOptions): UseClaudeDaemonReturn {
  const { containerId, onMessage, onStatusChange, onError } = options

  const [isConnected, setIsConnected] = useState(false)

  // Use Zustand store for state management (processingState moved here for persistence across tab switches)
  const {
    messagesByContainer,
    daemonStatusByContainer,
    processingStateByContainer,
    addMessage,
    setMessages,
    clearMessages: storeClearMessages,
    setDaemonStatus,
    getNextMessageId,
    setProcessingState: storeSetProcessingState,
  } = useClaudeChatStore()

  // Get processing state from store (persists across tab switches)
  const processingState = processingStateByContainer[containerId] || {
    isProcessing: false,
    stage: 'idle' as ProcessingStage,
  }

  // Use ref to always have latest processing state for callbacks
  const processingStateRef = useRef(processingState)
  useEffect(() => {
    processingStateRef.current = processingState
  }, [processingState])

  // Stable wrapper to update processing state in store (doesn't recreate on state change)
  const setProcessingState = useCallback((state: ProcessingState | ((prev: ProcessingState) => ProcessingState)) => {
    if (typeof state === 'function') {
      const currentState = processingStateRef.current
      storeSetProcessingState(containerId, state(currentState))
    } else {
      storeSetProcessingState(containerId, state)
    }
  }, [containerId, storeSetProcessingState])

  // Derive isLoading from processingState (fix #9)
  const isLoading = processingState.isProcessing

  // Get messages and daemon status for this container from store
  const messages = messagesByContainer[containerId] || []
  const daemonStatus = daemonStatusByContainer[containerId] || null

  const socketRef = useRef<Socket | null>(null)
  const historyLoadedRef = useRef(false)
  const lastInstructionRef = useRef<string | null>(null)
  const retryCountRef = useRef(0)
  const MAX_RETRIES = 2
  // Flag to temporarily block message updates (used when manually loading session history)
  const blockMessageUpdatesRef = useRef(false)

  // Store callbacks in refs to avoid recreating socket handlers
  const onMessageRef = useRef(onMessage)
  const onStatusChangeRef = useRef(onStatusChange)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onMessageRef.current = onMessage
    onStatusChangeRef.current = onStatusChange
    onErrorRef.current = onError
  }, [onMessage, onStatusChange, onError])

  // Track which containerId we loaded history for
  const lastLoadedContainerIdRef = useRef<string | null>(null)

  // Load chat history from backend on mount or containerId change
  useEffect(() => {
    if (!containerId) return

    // Skip if already loaded for this specific container
    if (lastLoadedContainerIdRef.current === containerId && historyLoadedRef.current) {
      return
    }

    const loadHistory = async () => {
      try {
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

          // Always set messages (replace store state), even if empty
          setMessages(containerId, loadedMessages)
        }
      } catch (error) {
        console.error('[ClaudeDaemon] Failed to load chat history:', error)
      } finally {
        historyLoadedRef.current = true
        lastLoadedContainerIdRef.current = containerId
      }
    }

    loadHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]) // Only re-run when containerId changes, not setMessages

  // Initialize WebSocket connection with deduplication
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!containerId) return

    // Get or create shared connection (increments refCount)
    const connectionEntry = getOrCreateConnection(containerId)
    const socket = connectionEntry.socket
    socketRef.current = socket

    // Handler functions that we can add/remove
    const handleConnect = () => {
      connectionEntry.isConnected = true
      setIsConnected(true)

      // Subscribe to container output if not already subscribed
      if (!connectionEntry.subscribedContainers.has(containerId)) {
        socket.emit('output:subscribe', { containerId })
        connectionEntry.subscribedContainers.add(containerId)
      }

      // Request current daemon status
      socket.emit('daemon:get-status', { containerId })
    }

    const handleDisconnect = () => {
      connectionEntry.isConnected = false
      setIsConnected(false)
    }

    const handleConnectError = (error: Error) => {
      console.error('[ClaudeDaemon] Connection error:', error)
      onErrorRef.current?.(`Connection error: ${error.message}`)
    }

    const handleDaemonStatus = (state: DaemonState) => {
      // Only process if this is for our container
      if (state.containerId !== containerId) return
      setDaemonStatus(containerId, state)
      onStatusChangeRef.current?.(state)
    }

    const handleClaudeOutput = (event: ClaudeEvent) => {
      // Skip if message updates are temporarily blocked (during session switch)
      if (blockMessageUpdatesRef.current) {
        return
      }
      const messageId = getNextMessageId(containerId)
      const message = parseClaudeEventToMessage(event, messageId)

      if (message) {
        addMessage(containerId, message)
        onMessageRef.current?.(message)
        // Save to backend asynchronously (fire and forget)
        apiClient
          .saveChatMessage(containerId, {
            id: message.id,
            type: message.type,
            content: message.content,
            timestamp: message.timestamp.toISOString(),
            toolName: message.toolName,
            toolInput: message.toolInput,
          })
          .catch((err) => console.error('[ClaudeDaemon] Failed to save message:', err))
      }

      // Fix #9: Removed setIsLoading(false) here - now derived from backend processingState
      // Processing state is managed by instruction:processing:* events
      if (event.type === 'result' || event.type === 'assistant' || event.type === 'error') {
        // Reset retry count on successful response
        retryCountRef.current = 0
      }
    }

    const handleProcessingStart = ({ timestamp }: { timestamp: string }) => {
      setProcessingState({
        isProcessing: true,
        stage: 'starting',
        startedAt: new Date(timestamp),
        lastActivityAt: new Date(timestamp),
      })
    }

    const handleProcessingProgress = ({ stage, timestamp }: { stage: ProcessingStage; timestamp: string }) => {
      setProcessingState((prev) => ({
        ...prev,
        stage,
        lastActivityAt: new Date(timestamp),
      }))
    }

    const handleProcessingComplete = () => {
      setProcessingState({ isProcessing: false, stage: 'idle' })
    }

    const handleProcessingError = () => {
      setProcessingState({ isProcessing: false, stage: 'idle' })
    }

    const handleInstructionReceived = () => {
      // Instruction acknowledged by daemon, waiting for response
    }

    const handleInstructionCancelled = ({ cancelled }: { containerId: string; cancelled: boolean }) => {
      if (cancelled) {
        // Fix #9: processingState will be updated via instruction:processing:complete event
        // Add system message to inform user
        const messageId = getNextMessageId(containerId)
        const cancelMessage: ClaudeMessage = {
          id: messageId,
          type: 'system',
          content: 'Instrução anterior cancelada.',
          timestamp: new Date(),
        }
        addMessage(containerId, cancelMessage)
      }
    }

    const handleError = (data: { message: string; code?: number; status?: number }) => {
      console.error('[ClaudeDaemon] Error:', data.message, 'Code:', data.code || data.status)

      // Check if it's a 400 error and we have a last instruction to retry
      const errorCode = data.code || data.status
      const is400Error = errorCode === 400 || data.message?.includes('400') || data.message?.includes('Bad Request')

      if (is400Error && lastInstructionRef.current && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++

        // First, send /rewind to go back to last good state
        socket.emit('instruction:send', {
          containerId,
          instruction: '/rewind',
        })

        // Wait a bit then retry the last instruction
        setTimeout(() => {
          if (lastInstructionRef.current && socketRef.current?.connected) {
            socket.emit('instruction:send', {
              containerId,
              instruction: lastInstructionRef.current,
            })
          }
        }, 1500)
      } else {
        onErrorRef.current?.(data.message)
        // Fix #9: processingState will be updated via instruction:processing:error event
        retryCountRef.current = 0
      }
    }

    const handleDaemonError = (data: { error: string; code?: number; status?: number }) => {
      console.error('[ClaudeDaemon] Daemon error:', data.error)

      // Check if it's a 400 error
      const errorCode = data.code || data.status
      const is400Error = errorCode === 400 || data.error?.includes('400') || data.error?.includes('Bad Request')

      if (is400Error && lastInstructionRef.current && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++

        socket.emit('instruction:send', {
          containerId,
          instruction: '/rewind',
        })

        setTimeout(() => {
          if (lastInstructionRef.current && socketRef.current?.connected) {
            socket.emit('instruction:send', {
              containerId,
              instruction: lastInstructionRef.current,
            })
          }
        }, 1500)
      } else {
        onErrorRef.current?.(data.error)
        // Fix #9: processingState will be updated via instruction:processing:error event
        retryCountRef.current = 0
      }
    }

    // Set up event handlers
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.on('daemon:status', handleDaemonStatus)
    socket.on('claude:output', handleClaudeOutput)
    socket.on('instruction:processing:start', handleProcessingStart)
    socket.on('instruction:processing:progress', handleProcessingProgress)
    socket.on('instruction:processing:complete', handleProcessingComplete)
    socket.on('instruction:processing:error', handleProcessingError)
    socket.on('instruction:received', handleInstructionReceived)
    socket.on('instruction:cancelled', handleInstructionCancelled)
    socket.on('error', handleError)
    socket.on('daemon:error', handleDaemonError)

    // If already connected, trigger connect handler manually
    if (socket.connected) {
      handleConnect()
    }

    return () => {
      // Remove event handlers for this hook instance
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      socket.off('daemon:status', handleDaemonStatus)
      socket.off('claude:output', handleClaudeOutput)
      socket.off('instruction:processing:start', handleProcessingStart)
      socket.off('instruction:processing:progress', handleProcessingProgress)
      socket.off('instruction:processing:complete', handleProcessingComplete)
      socket.off('instruction:processing:error', handleProcessingError)
      socket.off('instruction:received', handleInstructionReceived)
      socket.off('instruction:cancelled', handleInstructionCancelled)
      socket.off('error', handleError)
      socket.off('daemon:error', handleDaemonError)

      // Release the connection (will disconnect if refCount reaches 0)
      releaseConnection(containerId)
      socketRef.current = null
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

      // Fix #9: Set optimistic processing state (will be confirmed by backend event)
      setProcessingState({
        isProcessing: true,
        stage: 'starting',
        startedAt: new Date(),
        lastActivityAt: new Date(),
      })

      // Store last instruction for potential retry (skip if it's a /rewind command)
      if (!instruction.startsWith('/rewind')) {
        lastInstructionRef.current = instruction
        retryCountRef.current = 0
      }

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

      // Send with cancelIfBusy=true to auto-cancel any current instruction
      socketRef.current.emit('instruction:send', {
        containerId,
        instruction,
        cancelIfBusy: true,
      })
    },
    [containerId, addMessage, getNextMessageId]
  )

  // Send silent instruction to Claude (doesn't add to UI or save to backend)
  const sendSilentInstruction = useCallback(
    (instruction: string) => {
      if (!socketRef.current?.connected) {
        console.warn('[ClaudeDaemon] Cannot send silent instruction: not connected')
        return
      }

      if (!instruction.trim()) {
        console.warn('[ClaudeDaemon] Cannot send empty instruction')
        return
      }

      // Send without adding to UI or saving to backend
      socketRef.current.emit('instruction:send', {
        containerId,
        instruction,
        cancelIfBusy: true,
      })
    },
    [containerId]
  )

  // Block/unblock message updates (used during session switch)
  const setBlockMessageUpdates = useCallback((block: boolean) => {
    blockMessageUpdatesRef.current = block
  }, [])

  // Cancel current instruction
  const cancelInstruction = useCallback(() => {
    if (!socketRef.current?.connected) {
      console.warn('[ClaudeDaemon] Cannot cancel instruction: not connected')
      return
    }

    socketRef.current.emit('instruction:cancel', { containerId })
    // Fix #9: processingState will be updated via instruction:processing:complete event from backend
  }, [containerId])

  // Start the daemon
  const startDaemon = useCallback(() => {
    if (!socketRef.current?.connected) {
      console.warn('[ClaudeDaemon] Cannot start daemon: not connected')
      onErrorRef.current?.('Not connected to server')
      return
    }

    socketRef.current.emit('daemon:start', { containerId })
  }, [containerId])

  // Stop the daemon
  const stopDaemon = useCallback(() => {
    if (!socketRef.current?.connected) {
      console.warn('[ClaudeDaemon] Cannot stop daemon: not connected')
      onErrorRef.current?.('Not connected to server')
      return
    }

    socketRef.current.emit('daemon:stop', { containerId })
  }, [containerId])

  // Clear all messages (from store and backend)
  const clearMessages = useCallback(() => {
    storeClearMessages(containerId)
    // Clear from backend too
    apiClient.clearChatMessages(containerId)
      .catch((err) => console.error('[ClaudeDaemon] Failed to clear messages from backend:', err))
  }, [containerId, storeClearMessages])

  // Fix #9: Safety timeout - if backend doesn't send complete event, reset to idle
  useEffect(() => {
    if (!processingState.isProcessing) return

    const timeoutId = setTimeout(() => {
      setProcessingState({ isProcessing: false, stage: 'idle' })
    }, PROCESSING_SAFETY_TIMEOUT)

    return () => clearTimeout(timeoutId)
  }, [processingState.isProcessing, setProcessingState])

  return {
    isConnected,
    daemonStatus,
    messages,
    isLoading,
    processingState,
    sendInstruction,
    sendSilentInstruction,
    setBlockMessageUpdates,
    cancelInstruction,
    startDaemon,
    stopDaemon,
    clearMessages,
  }
}
