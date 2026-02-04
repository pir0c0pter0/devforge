'use client'

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react'
import clsx from 'clsx'
import { Bot, Play, Square, Send, Loader2, Trash2 } from 'lucide-react'
import { useClaudeDaemon } from '@/hooks/use-claude-daemon'
import { StatusBadge } from './status-badge'
import { MessageItem } from './message-item'
import { AnimatedDots } from '@/components/ui/animated-dots'
import { useI18n } from '@/lib/i18n'

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
    startDaemon,
    stopDaemon,
    sendInstruction,
    clearMessages,
  } = useClaudeDaemon({ containerId })

  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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

  const handleSend = useCallback(() => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput || isLoading || daemonStatus?.status !== 'running') return

    sendInstruction(trimmedInput)
    setInputValue('')
  }, [inputValue, isLoading, daemonStatus, sendInstruction])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleStartDaemon = useCallback(() => {
    startDaemon()
  }, [startDaemon])

  const handleStopDaemon = useCallback(() => {
    stopDaemon()
  }, [stopDaemon])

  const handleClearMessages = useCallback(() => {
    clearMessages()
  }, [clearMessages])

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
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
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

            {/* Loading indicator - Claude is thinking */}
            {isLoading && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-terminal-cyan/5 border border-terminal-cyan/20 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-terminal-cyan/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-terminal-cyan animate-pulse" />
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-terminal-cyan animate-spin" />
                    <span className="text-sm text-terminal-cyan font-medium">
                      <AnimatedDots text={t.claudeChat.thinking} />
                    </span>
                  </div>
                  <p className="text-xs text-terminal-textMuted mt-1">
                    {t.claudeChat.thinkingSubtext}
                  </p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-terminal-border p-3 bg-terminal-bg">
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
          {t.claudeChat.pressEnter}
        </p>
      </div>
    </div>
  )
}

export default ClaudeChat
