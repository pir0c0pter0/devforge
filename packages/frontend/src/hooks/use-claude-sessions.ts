'use client'

import { useState, useCallback, useRef } from 'react'
import { apiClient } from '@/lib/api-client'

/**
 * Claude chat message type
 */
export interface ClaudeMessage {
  id: string
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error'
  content: string
  timestamp: Date
  toolName?: string
  toolInput?: unknown
}

/**
 * Conversation session
 */
export interface ConversationSession {
  id: string
  containerId: string
  title: string
  createdAt: Date
  updatedAt: Date
  messageCount: number
  lastMessage?: string
  isActive: boolean
}

/**
 * Options for useClaudeSessions hook
 */
export interface UseClaudeSessionsOptions {
  /** Container ID to fetch sessions for */
  containerId: string
  /** Page size for pagination */
  pageSize?: number
  /** Auto-load sessions on mount */
  autoLoad?: boolean
}

/**
 * Return type of useClaudeSessions hook
 */
export interface UseClaudeSessionsReturn {
  /** List of conversation sessions */
  sessions: ConversationSession[]
  /** Currently loaded session messages */
  currentMessages: ClaudeMessage[]
  /** Currently selected session ID */
  currentSessionId: string | null
  /** Whether data is being loaded */
  loading: boolean
  /** Error message if any */
  error: string | null
  /** Whether there are more sessions to load */
  hasMore: boolean
  /** Current page number */
  currentPage: number
  /** Fetch sessions for the container */
  fetchSessions: (page?: number) => Promise<void>
  /** Load a specific session with its messages */
  loadSession: (sessionId: string) => Promise<void>
  /** Create a new session */
  createSession: (title?: string) => Promise<ConversationSession | null>
  /** Delete a session */
  deleteSession: (sessionId: string) => Promise<boolean>
  /** Load more sessions (pagination) */
  loadMore: () => Promise<void>
  /** Refresh current session */
  refreshSession: () => Promise<void>
  /** Clear error state */
  clearError: () => void
}

/**
 * Determines session active status based on last message timestamp.
 * A session is considered active if the last message was within the last 30 minutes.
 */
function isSessionActive(lastMessageAt: Date): boolean {
  const SESSION_GAP_MS = 30 * 60 * 1000
  return Date.now() - lastMessageAt.getTime() < SESSION_GAP_MS
}

/**
 * Generates a human-readable title from the first message or a fallback.
 */
function generateSessionTitle(firstMessage: string | undefined, startedAt: Date): string {
  if (firstMessage) {
    const trimmed = firstMessage.length > 60
      ? firstMessage.substring(0, 57) + '...'
      : firstMessage
    return trimmed
  }
  return `Session ${startedAt.toLocaleDateString()} ${startedAt.toLocaleTimeString()}`
}

/**
 * Hook for managing Claude conversation sessions
 *
 * Uses the backend sessions API:
 * - GET /api/claude-daemon/:containerId/sessions (list sessions grouped by 30-min gaps)
 * - GET /api/claude-daemon/:containerId/sessions/:sessionId (get session with messages)
 * - POST /api/claude-daemon/:containerId/sessions (create session boundary)
 */
export function useClaudeSessions(options: UseClaudeSessionsOptions): UseClaudeSessionsReturn {
  const { containerId, pageSize = 20, autoLoad = true } = options

  // State
  const [sessions, setSessions] = useState<ConversationSession[]>([])
  const [currentMessages, setCurrentMessages] = useState<ClaudeMessage[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  // Refs to prevent duplicate calls
  const isFetchingRef = useRef(false)
  const hasInitialLoadRef = useRef(false)

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * Fetch sessions for the container
   *
   * Calls GET /api/claude-daemon/:containerId/sessions?limit=N
   * Backend returns sessions grouped by 30-min message gaps, most recent first.
   */
  const fetchSessions = useCallback(
    async (page: number = 1) => {
      if (!containerId) {
        setError('Container ID is required')
        return
      }

      if (isFetchingRef.current) return
      isFetchingRef.current = true

      try {
        setLoading(true)
        setError(null)

        const response = await apiClient.getClaudeSessions(containerId, { limit: pageSize })

        if (!response.success) {
          throw new Error(response.error || 'Failed to fetch sessions')
        }

        const backendSessions = response.data?.sessions ?? []
        const total = response.data?.total ?? 0

        // Map backend session format to frontend ConversationSession type
        const mappedSessions: ConversationSession[] = backendSessions.map((session, index) => {
          const startedAt = new Date(session.startedAt)
          const lastMessageAt = new Date(session.lastMessageAt)

          return {
            id: session.id,
            containerId: session.containerId,
            title: generateSessionTitle(session.firstMessage, startedAt),
            createdAt: startedAt,
            updatedAt: lastMessageAt,
            messageCount: session.messageCount,
            lastMessage: session.firstMessage,
            isActive: index === 0 && isSessionActive(lastMessageAt),
          }
        })

        setSessions(mappedSessions)
        setCurrentPage(page)
        setHasMore(mappedSessions.length < total)
        hasInitialLoadRef.current = true
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch sessions'
        setError(errorMessage)
        console.error('[useClaudeSessions] Failed to fetch sessions:', err)
      } finally {
        setLoading(false)
        isFetchingRef.current = false
      }
    },
    [containerId, pageSize]
  )

  /**
   * Load a specific session with its messages
   *
   * Calls GET /api/claude-daemon/:containerId/sessions/:sessionId
   * Backend returns the session object with a messages array.
   */
  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!containerId) {
        setError('Container ID is required')
        return
      }

      try {
        setLoading(true)
        setError(null)

        const response = await apiClient.getClaudeSessionMessages(containerId, sessionId)

        if (!response.success) {
          throw new Error(response.error || 'Failed to load session')
        }

        const sessionData = response.data
        const rawMessages = sessionData?.messages ?? []

        const messages: ClaudeMessage[] = rawMessages.map(msg => ({
          id: msg.id,
          type: msg.type as ClaudeMessage['type'],
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          toolName: msg.toolName,
          toolInput: msg.toolInput,
        }))

        setCurrentMessages(messages)
        setCurrentSessionId(sessionId)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load session'
        setError(errorMessage)
        console.error('[useClaudeSessions] Failed to load session:', err)
      } finally {
        setLoading(false)
      }
    },
    [containerId]
  )

  /**
   * Create a new session
   *
   * Calls POST /api/claude-daemon/:containerId/sessions
   * Backend creates a system message as session boundary marker.
   */
  const createSession = useCallback(
    async (_title?: string): Promise<ConversationSession | null> => {
      if (!containerId) {
        setError('Container ID is required')
        return null
      }

      try {
        setLoading(true)
        setError(null)

        const response = await apiClient.createClaudeSession(containerId)

        if (!response.success) {
          throw new Error(response.error || 'Failed to create session')
        }

        const sessionData = response.data
        if (!sessionData) {
          throw new Error('No session data returned from backend')
        }

        const startedAt = new Date(sessionData.startedAt)
        const lastMessageAt = new Date(sessionData.lastMessageAt)

        const newSession: ConversationSession = {
          id: sessionData.id,
          containerId: sessionData.containerId,
          title: _title || `Session ${startedAt.toLocaleDateString()} ${startedAt.toLocaleTimeString()}`,
          createdAt: startedAt,
          updatedAt: lastMessageAt,
          messageCount: sessionData.messageCount,
          isActive: true,
        }

        // Prepend to sessions list (most recent first)
        setSessions(prev => [newSession, ...prev])

        return newSession
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create session'
        setError(errorMessage)
        console.error('[useClaudeSessions] Failed to create session:', err)
        return null
      } finally {
        setLoading(false)
      }
    },
    [containerId]
  )

  /**
   * Delete a session
   *
   * NOTE: The backend does not currently have a DELETE /sessions/:sessionId endpoint.
   * Sessions are computed dynamically from message time gaps, so deletion would require
   * deleting the underlying messages. This remains unimplemented until backend support is added.
   */
  const deleteSession = useCallback(
    async (_sessionId: string): Promise<boolean> => {
      if (!containerId) {
        setError('Container ID is required')
        return false
      }

      try {
        setLoading(true)
        setError(null)

        // TODO: Backend does not support session deletion yet.
        // Sessions are computed dynamically from messages grouped by 30-min gaps.
        // A DELETE endpoint would need to remove the underlying messages.
        setError('Session deletion is not supported by the backend')

        return false
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete session'
        setError(errorMessage)
        console.error('[useClaudeSessions] Failed to delete session:', err)
        return false
      } finally {
        setLoading(false)
      }
    },
    [containerId]
  )

  /**
   * Load more sessions (pagination)
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return
    await fetchSessions(currentPage + 1)
  }, [hasMore, loading, currentPage, fetchSessions])

  /**
   * Refresh current session
   */
  const refreshSession = useCallback(async () => {
    if (currentSessionId) {
      await loadSession(currentSessionId)
    }
  }, [currentSessionId, loadSession])

  // Auto-load sessions on mount
  if (autoLoad && !hasInitialLoadRef.current && !isFetchingRef.current && containerId) {
    fetchSessions(1)
  }

  return {
    sessions,
    currentMessages,
    currentSessionId,
    loading,
    error,
    hasMore,
    currentPage,
    fetchSessions,
    loadSession,
    createSession,
    deleteSession,
    loadMore,
    refreshSession,
    clearError,
  }
}
