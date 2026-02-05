'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { History, MessageSquare, Clock, Plus, ChevronDown } from 'lucide-react'
import { apiClient } from '@/lib/api-client'

/**
 * Session interface - groups messages by time gaps
 */
export interface ChatSession {
  id: string
  title: string
  startTime: Date
  endTime: Date
  messageCount: number
  preview: string
}

/**
 * Session Selector props
 */
export interface SessionSelectorProps {
  containerId: string
  currentSessionId?: string
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
}

/**
 * Format relative time (e.g., "2h ago", "3 days ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `${diffMins}min atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays < 7) return `${diffDays}d atrás`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}sem atrás`
  return `${Math.floor(diffDays / 30)}mês atrás`
}

/**
 * Group messages into sessions based on time gaps
 * New session starts if gap > 2 hours between messages
 */
function groupMessagesIntoSessions(messages: Array<{
  id: string
  type: string
  content: string
  timestamp: string
}>): ChatSession[] {
  if (messages.length === 0) return []

  const SESSION_GAP_MS = 2 * 60 * 60 * 1000 // 2 hours
  const sessions: ChatSession[] = []
  let currentSession: {
    messages: typeof messages
    startTime: Date
    endTime: Date
  } | null = null

  // Process messages in chronological order
  const sortedMessages = [...messages].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  sortedMessages.forEach((msg) => {
    const msgTime = new Date(msg.timestamp)

    if (!currentSession) {
      // Start first session
      currentSession = {
        messages: [msg],
        startTime: msgTime,
        endTime: msgTime,
      }
    } else {
      const gap = msgTime.getTime() - currentSession.endTime.getTime()

      if (gap > SESSION_GAP_MS) {
        // Save current session and start new one
        sessions.push(createSessionFromGroup(currentSession))
        currentSession = {
          messages: [msg],
          startTime: msgTime,
          endTime: msgTime,
        }
      } else {
        // Add to current session
        currentSession.messages.push(msg)
        currentSession.endTime = msgTime
      }
    }
  })

  // Save last session
  if (currentSession) {
    sessions.push(createSessionFromGroup(currentSession))
  }

  // Return in reverse chronological order (newest first)
  return sessions.reverse()
}

/**
 * Create session object from message group
 */
function createSessionFromGroup(group: {
  messages: Array<{ id: string; type: string; content: string; timestamp: string }>
  startTime: Date
  endTime: Date
}): ChatSession {
  // Generate title from first user message or use generic title
  const firstUserMsg = group.messages.find(m => m.type === 'user')
  const title = firstUserMsg
    ? firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '')
    : 'Conversa'

  // Get preview from last message
  const lastMsg = group.messages[group.messages.length - 1]
  const preview = lastMsg.content.substring(0, 60) + (lastMsg.content.length > 60 ? '...' : '')

  return {
    id: `session-${group.startTime.getTime()}`,
    title,
    startTime: group.startTime,
    endTime: group.endTime,
    messageCount: group.messages.length,
    preview,
  }
}

/**
 * Session Selector Component
 * Dropdown to select previous chat sessions
 */
export function SessionSelector({
  containerId,
  currentSessionId,
  onSelectSession,
  onNewSession,
}: SessionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
      })
    }
  }, [isOpen])

  // Load sessions from backend
  const loadSessions = useCallback(async () => {
    if (!containerId) return

    setIsLoading(true)
    try {
      const response = await apiClient.getChatMessages(containerId, { limit: 500 })

      if (response.success && response.data?.messages) {
        const grouped = groupMessagesIntoSessions(response.data.messages)
        setSessions(grouped)
        setHasMore(response.data.hasMore)
      }
    } catch (error) {
      console.error('[SessionSelector] Failed to load sessions:', error)
    } finally {
      setIsLoading(false)
    }
  }, [containerId])

  // Load sessions on mount
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const isOutsideButton = buttonRef.current && !buttonRef.current.contains(target)
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target)

      if (isOutsideButton && isOutsideDropdown) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelectSession = (sessionId: string) => {
    onSelectSession(sessionId)
    setIsOpen(false)
  }

  const handleNewSession = () => {
    onNewSession()
    setIsOpen(false)
  }

  // Get current session for display
  const currentSession = currentSessionId
    ? sessions.find(s => s.id === currentSessionId)
    : null

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
          'bg-terminal-bgLight border-terminal-border text-terminal-text',
          'hover:bg-terminal-bg hover:border-terminal-cyan',
          isOpen && 'bg-terminal-bg border-terminal-cyan'
        )}
      >
        <History className="w-4 h-4 text-terminal-cyan" />
        <span className="text-sm font-medium">
          {currentSession ? currentSession.title : 'Histórico'}
        </span>
        <ChevronDown
          className={clsx(
            'w-4 h-4 text-terminal-textMuted transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown - rendered via portal to escape overflow:hidden */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            zIndex: 9999,
          }}
          className={clsx(
            'w-80 max-h-96 overflow-y-auto',
            'bg-terminal-bgLight border border-terminal-border rounded-lg shadow-xl'
          )}
        >
          {/* New Session Button */}
          <button
            onClick={handleNewSession}
            className={clsx(
              'w-full flex items-center gap-3 px-4 py-3 border-b border-terminal-border',
              'text-terminal-text hover:bg-terminal-bg transition-colors'
            )}
          >
            <div className="w-8 h-8 rounded-full bg-terminal-green/20 flex items-center justify-center flex-shrink-0">
              <Plus className="w-4 h-4 text-terminal-green" />
            </div>
            <span className="font-medium">Nova conversa</span>
          </button>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Sessions List */}
          {!isLoading && sessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <MessageSquare className="w-8 h-8 text-terminal-textMuted mb-2" />
              <p className="text-sm text-terminal-textMuted">
                Nenhuma conversa anterior
              </p>
            </div>
          )}

          {!isLoading && sessions.length > 0 && (
            <div className="py-1">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  className={clsx(
                    'w-full flex items-start gap-3 px-4 py-3 transition-colors',
                    'hover:bg-terminal-bg',
                    currentSessionId === session.id && 'bg-terminal-border'
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-terminal-cyan/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4 text-terminal-cyan" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="text-sm font-medium text-terminal-text truncate">
                        {session.title}
                      </h4>
                      <span className="text-xs text-terminal-textMuted flex-shrink-0">
                        {session.messageCount}
                      </span>
                    </div>
                    <p className="text-xs text-terminal-textMuted truncate mb-1">
                      {session.preview}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-terminal-textMuted">
                      <Clock className="w-3 h-3" />
                      <span>{formatRelativeTime(session.startTime)}</span>
                    </div>
                  </div>
                </button>
              ))}

              {/* Load More */}
              {hasMore && (
                <button
                  onClick={loadSessions}
                  className={clsx(
                    'w-full px-4 py-2 text-xs text-terminal-cyan',
                    'hover:bg-terminal-bg transition-colors border-t border-terminal-border'
                  )}
                >
                  Carregar mais
                </button>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

export default SessionSelector
