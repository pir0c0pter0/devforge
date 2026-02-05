'use client'

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react'
import clsx from 'clsx'
import { Bot, Play, Square, Send, Loader2, Trash2 } from 'lucide-react'
import { useClaudeDaemon } from '@/hooks/use-claude-daemon'
import { StatusBadge } from './status-badge'
import { MessageItem } from './message-item'
import { ThinkingIndicator } from '@/components/ui/thinking-indicator'
import { useI18n } from '@/lib/i18n'
import { SKILL_CATEGORIES, filterSkills, type ClaudeSkill } from '@/lib/claude-skills'
import { SessionSelector } from './session-selector'

export interface ClaudeChatProps {
  containerId: string
}

export function ClaudeChat({ containerId }: ClaudeChatProps) {
  const { t } = useI18n()
  const {
    messages,
    daemonStatus,
    isConnected,
    isLoading,
    processingState,
    startDaemon,
    stopDaemon,
    sendInstruction,
    cancelInstruction,
    clearMessages,
  } = useClaudeDaemon({ containerId })

  const [inputValue, setInputValue] = useState('')
  const [showSkillSuggestions, setShowSkillSuggestions] = useState(false)
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0)
  const [filteredSkills, setFilteredSkills] = useState<ClaudeSkill[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Focus input when daemon starts running
  useEffect(() => {
    if (daemonStatus?.status === 'running' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [daemonStatus])

  // Filter skills when input starts with /
  useEffect(() => {
    if (inputValue.startsWith('/')) {
      const skills = filterSkills(inputValue)
      setFilteredSkills(skills)
      setShowSkillSuggestions(skills.length > 0)
      setSelectedSkillIndex(0)
    } else {
      setShowSkillSuggestions(false)
      setFilteredSkills([])
    }
  }, [inputValue])

  // Scroll to selected skill
  useEffect(() => {
    if (showSkillSuggestions && suggestionsRef.current) {
      const selectedElement = suggestionsRef.current.children[selectedSkillIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedSkillIndex, showSkillSuggestions])

  const handleSend = useCallback(() => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput || isLoading || daemonStatus?.status !== 'running') return

    // TODO: Pass currentSessionId to sendInstruction when session API is ready
    // sendInstruction(trimmedInput, { sessionId: currentSessionId })
    sendInstruction(trimmedInput)
    setInputValue('')
    setShowSkillSuggestions(false)
  }, [inputValue, isLoading, daemonStatus, sendInstruction])

  const handleSelectSkill = useCallback((skill: ClaudeSkill) => {
    setInputValue(skill.name + ' ')
    setShowSkillSuggestions(false)
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle skill autocomplete navigation
    if (showSkillSuggestions && filteredSkills.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedSkillIndex((prev) => (prev + 1) % filteredSkills.length)
          return
        case 'ArrowUp':
          e.preventDefault()
          setSelectedSkillIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length)
          return
        case 'Tab':
          e.preventDefault()
          if (filteredSkills[selectedSkillIndex]) {
            handleSelectSkill(filteredSkills[selectedSkillIndex])
          }
          return
        case 'Enter':
          if (!e.shiftKey) {
            e.preventDefault()
            if (filteredSkills[selectedSkillIndex]) {
              handleSelectSkill(filteredSkills[selectedSkillIndex])
            }
          }
          return
        case 'Escape':
          e.preventDefault()
          setShowSkillSuggestions(false)
          return
      }
    }

    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [showSkillSuggestions, filteredSkills, selectedSkillIndex, handleSelectSkill, handleSend])

  const handleStartDaemon = useCallback(() => {
    startDaemon()
  }, [startDaemon])

  const handleStopDaemon = useCallback(() => {
    stopDaemon()
  }, [stopDaemon])

  const handleClearMessages = useCallback(() => {
    clearMessages()
  }, [clearMessages])

  const handleSelectSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId)
    // TODO: Load messages from session API
    // const response = await fetch(`/api/sessions/${sessionId}/messages`)
    // const data = await response.json()
    // loadMessagesFromSession(data.messages)
  }, [])

  const handleNewSession = useCallback(async () => {
    // Create explicit new session in backend (marks end of current session)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/claude-daemon/${containerId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.id) {
          setCurrentSessionId(data.data.id)
        }
      }
    } catch (error) {
      console.error('[ClaudeChat] Failed to create new session:', error)
    }

    // Clear messages from UI
    clearMessages()
  }, [containerId, clearMessages])

  const isDaemonRunning = daemonStatus?.status === 'running'
  const isDaemonTransitioning = daemonStatus?.status === 'starting' || daemonStatus?.status === 'stopping'
  const canSend = isDaemonRunning && !isLoading && inputValue.trim().length > 0

  return (
    <div className="flex flex-col h-full bg-terminal-bg rounded-lg border border-terminal-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-bg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-terminal-cyan/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-terminal-cyan" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-terminal-text">Claude Code</h3>
            <StatusBadge daemonStatus={daemonStatus?.status || 'stopped'} isConnected={isConnected} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Session Selector */}
          <SessionSelector
            containerId={containerId}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
          />

          {/* Clear button */}
          {messages.length > 0 && (
            <button
              onClick={handleClearMessages}
              className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
              title={t.claudeChat.clear}
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">{t.claudeChat.clear}</span>
            </button>
          )}

          {/* Start/Stop button */}
          {isDaemonRunning || daemonStatus?.status === 'stopping' ? (
            <button
              onClick={handleStopDaemon}
              disabled={isDaemonTransitioning}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              {daemonStatus?.status === 'stopping' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Square className="w-3 h-3" />
              )}
              <span>{t.claudeChat.stop}</span>
            </button>
          ) : (
            <button
              onClick={handleStartDaemon}
              disabled={isDaemonTransitioning}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              {daemonStatus?.status === 'starting' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              <span>{t.claudeChat.start}</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 relative">
        {messages.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-12 h-12 text-terminal-textMuted mb-3" />
            <p className="text-terminal-textMuted text-sm">
              {isDaemonRunning
                ? t.claudeChat.sendMessage
                : t.claudeChat.startFirst}
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}

            <div ref={messagesEndRef} />
          </>
        )}

        {/* Enhanced thinking indicator with stage, timer and cancel (fix #9) */}
        {isLoading && (
          <div className="sticky bottom-0 left-0 pt-2 pb-1">
            <ThinkingIndicator
              text={t.claudeChat.thinkingShort}
              variant="enhanced"
              stage={processingState.stage}
              startedAt={processingState.startedAt}
              onCancel={cancelInstruction}
            />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-terminal-border p-3 bg-terminal-bg">
        {/* Skill suggestions - above input */}
        {showSkillSuggestions && filteredSkills.length > 0 && (
          <div
            ref={suggestionsRef}
            className="mb-2 max-h-48 overflow-y-auto bg-terminal-bgLight border border-terminal-border rounded-lg shadow-lg"
          >
            {filteredSkills.map((skill, index) => {
              const category = SKILL_CATEGORIES[skill.category]
              return (
                <div
                  key={skill.name}
                  className={clsx(
                    'px-3 py-2 cursor-pointer flex items-center justify-between gap-2 transition-colors',
                    index === selectedSkillIndex
                      ? 'bg-terminal-border text-terminal-text'
                      : 'hover:bg-terminal-bg text-terminal-textMuted'
                  )}
                  onClick={() => handleSelectSkill(skill)}
                  onMouseEnter={() => setSelectedSkillIndex(index)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-terminal-cyan">{skill.name}</span>
                      <span className={clsx('text-xs px-1.5 py-0.5 rounded', category.color, 'bg-terminal-bg')}>
                        {category.label}
                      </span>
                    </div>
                    <p className="text-xs text-terminal-textMuted truncate mt-0.5">
                      {skill.description}
                    </p>
                  </div>
                  {index === selectedSkillIndex && (
                    <span className="text-xs text-terminal-textMuted flex-shrink-0">
                      Enter ↵
                    </span>
                  )}
                </div>
              )
            })}
            <div className="px-3 py-1.5 text-xs text-terminal-textMuted border-t border-terminal-border bg-terminal-bg">
              ↑↓ navegar • Enter/Tab selecionar • Esc fechar
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!isDaemonRunning}
              placeholder={isDaemonRunning ? t.claudeChat.placeholder : t.claudeChat.placeholderDisabled}
              className={clsx(
                'w-full px-3 py-2 rounded-lg border resize-none',
                'bg-terminal-bgLight text-terminal-text placeholder-terminal-textMuted',
                'focus:outline-none focus:ring-2 focus:ring-terminal-cyan focus:border-transparent',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                isDaemonRunning
                  ? 'border-terminal-border'
                  : 'border-terminal-border/50'
              )}
              rows={1}
              style={{
                minHeight: '40px',
                maxHeight: '120px',
              }}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!canSend}
            className={clsx(
              'flex-shrink-0 p-2 rounded-lg transition-colors',
              'flex items-center justify-center',
              canSend
                ? 'bg-terminal-cyan text-terminal-bg hover:bg-terminal-cyan/80'
                : 'bg-terminal-border text-terminal-textMuted cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Helper text */}
        <p className="text-xs text-terminal-textMuted mt-1.5">
          {t.claudeChat.pressEnter} • Digite <span className="font-mono text-terminal-cyan">/</span> para skills
        </p>
      </div>
    </div>
  )
}

export default ClaudeChat
