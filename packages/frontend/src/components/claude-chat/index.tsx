'use client'

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react'
import clsx from 'clsx'
import { Bot, Play, Square, Send, Loader2, Trash2, MessageSquareText, X, ListPlus, XCircle } from 'lucide-react'
import { useClaudeDaemon, ClaudeMessage } from '@/hooks/use-claude-daemon'
import { useClaudeChatStore } from '@/stores/claude-chat.store'
import { apiClient } from '@/lib/api-client'
import type { SessionMessage } from './session-selector'
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
    sendSilentInstruction,
    setBlockMessageUpdates,
    cancelInstruction,
    clearMessages,
  } = useClaudeDaemon({ containerId })

  const [inputValue, setInputValue] = useState('')
  const [showSkillSuggestions, setShowSkillSuggestions] = useState(false)
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0)
  const [filteredSkills, setFilteredSkills] = useState<ClaudeSkill[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined)
  const [pendingContext, setPendingContext] = useState<string | null>(null)
  const [ralphLoop, setRalphLoop] = useState(false)
  const [busyDialogMessage, setBusyDialogMessage] = useState<string | null>(null)
  const [queuedInstruction, setQueuedInstruction] = useState<string | null>(null)
  const { setMessages } = useClaudeChatStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Sync Ralph Loop state from container config
  useEffect(() => {
    const syncRalphLoop = async () => {
      const response = await apiClient.getContainer(containerId)
      if (response.success && response.data) {
        setRalphLoop(response.data.ralphLoop === true)
      }
    }
    syncRalphLoop()
  }, [containerId])

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

  // Auto-send queued instruction when processing finishes
  useEffect(() => {
    if (!isLoading && queuedInstruction) {
      const instruction = queuedInstruction
      setQueuedInstruction(null)
      sendInstruction(instruction)
    }
  }, [isLoading, queuedInstruction, sendInstruction])

  const buildInstruction = useCallback((trimmedInput: string): string => {
    if (pendingContext) {
      setPendingContext(null)
      return pendingContext + trimmedInput
    }
    return trimmedInput
  }, [pendingContext])

  const handleSend = useCallback(() => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput || daemonStatus?.status !== 'running') return

    // If Claude is processing, show busy dialog instead of sending
    if (isLoading) {
      setBusyDialogMessage(trimmedInput)
      return
    }

    const instruction = buildInstruction(trimmedInput)
    sendInstruction(instruction)
    setInputValue('')
    setShowSkillSuggestions(false)
  }, [inputValue, isLoading, daemonStatus, sendInstruction, buildInstruction])

  const handleCancelAndSend = useCallback(() => {
    if (!busyDialogMessage) return
    const instruction = buildInstruction(busyDialogMessage)
    cancelInstruction()
    // Small delay to let cancel propagate before sending new instruction
    setTimeout(() => {
      sendInstruction(instruction)
    }, 300)
    setInputValue('')
    setBusyDialogMessage(null)
    setShowSkillSuggestions(false)
  }, [busyDialogMessage, buildInstruction, cancelInstruction, sendInstruction])

  const handleQueueMessage = useCallback(() => {
    if (!busyDialogMessage) return
    const instruction = buildInstruction(busyDialogMessage)
    setQueuedInstruction(instruction)
    setInputValue('')
    setBusyDialogMessage(null)
    setShowSkillSuggestions(false)
  }, [busyDialogMessage, buildInstruction])

  const handleDismissBusyDialog = useCallback(() => {
    setBusyDialogMessage(null)
  }, [])

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

  const handleSelectSession = useCallback(async (sessionId: string, sessionMessages: SessionMessage[]) => {
    setCurrentSessionId(sessionId)

    // 1. Block message updates to prevent WebSocket events from interfering
    setBlockMessageUpdates(true)

    // 2. Clear the UI immediately
    setMessages(containerId, [])

    // 3. Send /clear to Claude daemon to reset its context
    if (daemonStatus?.status === 'running') {
      sendSilentInstruction('/clear')
    }

    // 4. Convert session messages to ClaudeMessage format
    const convertedMessages: ClaudeMessage[] = sessionMessages.map((msg) => ({
      id: msg.id,
      type: msg.type as ClaudeMessage['type'],
      content: msg.content,
      timestamp: new Date(msg.timestamp),
      toolName: msg.toolName,
      toolInput: msg.toolInput,
    }))

    // 5. Wait a moment for /clear to process, then load session messages
    setTimeout(() => {
      // Update the store with session messages
      setMessages(containerId, convertedMessages)

      // Store context for next message (will be prepended when user sends)
      const contextMessages = sessionMessages.filter(
        (m) => m.type === 'user' || m.type === 'assistant'
      )

      if (contextMessages.length > 0) {
        // Build context prompt with conversation history
        const contextParts = contextMessages.map((m) => {
          const role = m.type === 'user' ? 'Usuário' : 'Assistente'
          // Limit content to avoid too long context
          const content = m.content.length > 500
            ? m.content.substring(0, 500) + '...'
            : m.content
          return `${role}: ${content}`
        })

        const contextPrompt = `[CONTEXTO DA CONVERSA ANTERIOR]
${contextParts.join('\n\n')}
[FIM DO CONTEXTO]

`
        setPendingContext(contextPrompt)
      }

      // 6. Unblock message updates after session is loaded
      setBlockMessageUpdates(false)
    }, 800) // Wait 800ms for /clear events to be processed
  }, [containerId, setMessages, daemonStatus, sendSilentInstruction, setBlockMessageUpdates])

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

    // Clear pending context and messages from UI
    setPendingContext(null)
    clearMessages()
  }, [containerId, clearMessages])

  const isDaemonRunning = daemonStatus?.status === 'running'
  const isDaemonTransitioning = daemonStatus?.status === 'starting' || daemonStatus?.status === 'stopping'
  const canSend = isDaemonRunning && inputValue.trim().length > 0

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
      <div className="flex-1 overflow-y-auto p-4 space-y-1 relative">
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
        {/* Busy dialog - when user sends while Claude is processing */}
        {busyDialogMessage && (
          <div className="mb-2 p-3 bg-terminal-bgLight border border-terminal-cyan/30 rounded-lg animate-fade-in">
            <div className="flex items-start gap-2 mb-2">
              <Bot className="w-4 h-4 text-terminal-cyan flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-terminal-text font-medium">
                  {t.claudeChat.busyDialog.title}
                </p>
                <p className="text-xs text-terminal-textMuted mt-0.5 truncate">
                  &ldquo;{busyDialogMessage}&rdquo;
                </p>
              </div>
              <button
                onClick={handleDismissBusyDialog}
                className="text-terminal-textMuted hover:text-terminal-text p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex gap-2 ml-6">
              <button
                onClick={handleCancelAndSend}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-terminal-cyan/20 text-terminal-cyan hover:bg-terminal-cyan/30 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                {t.claudeChat.busyDialog.cancelAndSend}
              </button>
              <button
                onClick={handleQueueMessage}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-terminal-border text-terminal-text hover:bg-terminal-border/80 transition-colors"
              >
                <ListPlus className="w-3.5 h-3.5" />
                {t.claudeChat.busyDialog.addToQueue}
              </button>
            </div>
          </div>
        )}

        {/* Queued instruction indicator */}
        {queuedInstruction && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-terminal-purple/10 border border-terminal-purple/30 rounded-lg">
            <ListPlus className="w-4 h-4 text-terminal-purple flex-shrink-0" />
            <span className="text-xs text-terminal-purple flex-1 truncate">
              {t.claudeChat.busyDialog.queued}: &ldquo;{queuedInstruction.length > 60 ? queuedInstruction.substring(0, 60) + '...' : queuedInstruction}&rdquo;
            </span>
            <button
              onClick={() => setQueuedInstruction(null)}
              className="text-terminal-purple/70 hover:text-terminal-purple p-1 rounded"
              title={t.claudeChat.busyDialog.removeFromQueue}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

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

        {/* Context indicator when session history is loaded */}
        {pendingContext && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-terminal-cyan/10 border border-terminal-cyan/30 rounded-lg">
            <MessageSquareText className="w-4 h-4 text-terminal-cyan flex-shrink-0" />
            <span className="text-xs text-terminal-cyan flex-1">
              Contexto da conversa anterior será enviado com sua próxima mensagem
            </span>
            <button
              onClick={() => setPendingContext(null)}
              className="text-terminal-cyan/70 hover:text-terminal-cyan p-1 rounded"
              title="Limpar contexto"
            >
              <X className="w-3 h-3" />
            </button>
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
            <Send className="w-5 h-5" />
          </button>
        </div>

        {/* Helper text + Ralph Loop toggle */}
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-xs text-terminal-textMuted">
            {t.claudeChat.pressEnter} • Digite <span className="font-mono text-terminal-cyan">/</span> para skills
          </p>
          <label className="flex items-center gap-1.5 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={ralphLoop}
              onChange={async (e) => {
                const enabled = e.target.checked
                setRalphLoop(enabled)
                await apiClient.updateRalphLoop(containerId, enabled)
              }}
              className="w-3.5 h-3.5 rounded border-terminal-border bg-terminal-bgLight text-terminal-cyan focus:ring-terminal-cyan focus:ring-offset-0 accent-cyan-500"
            />
            <span className={clsx('text-xs font-medium transition-colors', ralphLoop ? 'text-terminal-cyan' : 'text-terminal-textMuted group-hover:text-terminal-text')}>
              {t.containerDetail.ralphLoop}
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}

export default ClaudeChat
