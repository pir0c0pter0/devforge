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
 * Hook for managing Claude conversation sessions
 *
 * NOTE: This hook is currently a wrapper around the messages API.
 * When the backend implements proper session management (/api/claude-daemon/:containerId/sessions),
 * this hook will be updated to use those endpoints while maintaining the same interface.
 *
 * For now, it treats the entire message history as a single "default" session.
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
   * NOTE: Since there's no session API yet, this creates a mock session
   * from the messages API. When the backend implements sessions, this will
   * call GET /api/claude-daemon/:containerId/sessions?page=X&limit=Y
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

        // TODO: Replace with actual sessions API when available
        // const response = await apiClient.getSessions(containerId, { page, limit: pageSize })

        // For now, fetch messages to create a mock session
        const response = await apiClient.getChatMessages(containerId, { limit: 1 })

        if (!response.success) {
          throw new Error(response.error || 'Failed to fetch sessions')
        }

        // Create a mock "default" session from messages
        const mockSession: ConversationSession = {
          id: 'default',
          containerId,
          title: 'Chat History',
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: response.data?.total || 0,
          lastMessage: response.data?.messages?.[0]?.content,
          isActive: true,
        }

        setSessions([mockSession])
        setCurrentPage(page)
        setHasMore(false) // Only one session for now
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
   * When the backend implements sessions, this will call:
   * GET /api/claude-daemon/:containerId/sessions/:sessionId/messages
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

        // TODO: Replace with actual session messages API when available
        // const response = await apiClient.getSessionMessages(containerId, sessionId, { limit: 500 })

        // For now, load all messages for the container
        const response = await apiClient.getChatMessages(containerId, { limit: 500 })

        if (!response.success) {
          throw new Error(response.error || 'Failed to load session')
        }

        const messages: ClaudeMessage[] = response.data?.messages.map(msg => ({
          id: msg.id,
          type: msg.type,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          toolName: msg.toolName,
          toolInput: msg.toolInput,
        })) || []

        setCurrentMessages(messages)
        setCurrentSessionId(sessionId)

        console.log('[useClaudeSessions] Loaded session:', sessionId, 'with', messages.length, 'messages')
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
   * When the backend implements sessions, this will call:
   * POST /api/claude-daemon/:containerId/sessions
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

        // TODO: Replace with actual session creation API when available
        // const response = await apiClient.createSession(containerId, { title })

        // For now, return null and log a warning
        console.warn('[useClaudeSessions] Session creation not implemented yet. Backend API pending.')
        setError('Session creation not implemented yet')

        return null
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
   * When the backend implements sessions, this will call:
   * DELETE /api/claude-daemon/:containerId/sessions/:sessionId
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

        // TODO: Replace with actual session deletion API when available
        // const response = await apiClient.deleteSession(containerId, sessionId)

        // For now, return false and log a warning
        console.warn('[useClaudeSessions] Session deletion not implemented yet. Backend API pending.')
        setError('Session deletion not implemented yet')

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
