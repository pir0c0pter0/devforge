'use client'

import { useState, useEffect } from 'react'
import { Bot, Brain, X } from 'lucide-react'
import type { ProcessingStage } from '@/hooks/use-claude-daemon'
import { useI18n } from '@/lib/i18n'

interface ThinkingIndicatorProps {
  /** Main thinking text */
  text: string
  /** Subtext / description */
  subtext?: string
  /** Variant style */
  variant?: 'default' | 'compact' | 'minimal' | 'enhanced'
  /** Processing stage from backend (fix #9) */
  stage?: ProcessingStage
  /** When processing started (fix #9) */
  startedAt?: Date
  /** Cancel callback - shown after 30s (fix #9) */
  onCancel?: () => void
}

/**
 * Format duration in seconds to human readable string
 */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

/**
 * ThinkingIndicator component
 * Shows an animated thinking state with pulsing brain/bot icons and wave animation
 * Enhanced variant (fix #9) shows processing stage, elapsed time, and cancel button
 */
export function ThinkingIndicator({
  text,
  subtext,
  variant = 'default',
  stage,
  startedAt,
  onCancel,
}: ThinkingIndicatorProps) {
  const { t } = useI18n()
  const [elapsed, setElapsed] = useState(0)

  // Update elapsed time every second (fix #9)
  useEffect(() => {
    if (!startedAt) return

    const updateElapsed = () => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000))
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  // Stage messages (fix #9)
  const stageMessages: Record<ProcessingStage, string> = {
    idle: '',
    starting: t.claudeChat.thinking || 'Starting...',
    streaming: t.claudeChat.thinking || 'Receiving response...',
    processing: t.claudeChat.thinking || 'Processing...',
    waiting_agents: 'Waiting for agents...',
    finalizing: 'Finalizing...',
  }

  // Minimal variant - just dots, very subtle
  if (variant === 'minimal') {
    return (
      <div className="flex items-center gap-1.5 text-terminal-textMuted text-xs">
        <span>{text}</span>
        <div className="thinking-wave-minimal">
          <span className="thinking-wave-dot-minimal" style={{ animationDelay: '0ms' }} />
          <span className="thinking-wave-dot-minimal" style={{ animationDelay: '150ms' }} />
          <span className="thinking-wave-dot-minimal" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 text-terminal-cyan">
        <div className="thinking-brain-icon">
          <Brain className="w-4 h-4" />
        </div>
        <span className="text-sm font-medium thinking-text">{text}</span>
        <div className="thinking-wave">
          <span className="thinking-wave-dot" style={{ animationDelay: '0ms' }} />
          <span className="thinking-wave-dot" style={{ animationDelay: '150ms' }} />
          <span className="thinking-wave-dot" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    )
  }

  // Enhanced variant (fix #9) - shows stage, elapsed time, and cancel button
  if (variant === 'enhanced') {
    const displayText = stage && stage !== 'idle' ? stageMessages[stage] : text
    const showCancel = elapsed > 30 && onCancel

    return (
      <div className="flex items-center gap-3 p-3 bg-terminal-bg/50 border border-terminal-border rounded-lg">
        <Bot className="h-5 w-5 animate-pulse text-terminal-cyan" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-terminal-text">
              {displayText}
            </p>
            <div className="thinking-wave">
              <span className="thinking-wave-dot" style={{ animationDelay: '0ms' }} />
              <span className="thinking-wave-dot" style={{ animationDelay: '150ms' }} />
              <span className="thinking-wave-dot" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
          {startedAt && (
            <p className="text-xs text-terminal-textMuted">
              ⏱️ {formatDuration(elapsed)}
            </p>
          )}
        </div>
        {showCancel && (
          <button
            onClick={onCancel}
            className="p-1.5 rounded hover:bg-terminal-border transition-colors text-terminal-textMuted hover:text-terminal-text"
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }

  // Default variant
  return (
    <div className="thinking-container">
      <div className="thinking-icon-container">
        <div className="thinking-icon-glow" />
        <Bot className="thinking-icon" />
      </div>
      <div className="thinking-content">
        <div className="flex items-center gap-2">
          <span className="thinking-text">{text}</span>
          <div className="thinking-wave">
            <span className="thinking-wave-dot" style={{ animationDelay: '0ms' }} />
            <span className="thinking-wave-dot" style={{ animationDelay: '150ms' }} />
            <span className="thinking-wave-dot" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
        {subtext && (
          <p className="thinking-subtext">{subtext}</p>
        )}
        <div className="thinking-progress-bar">
          <div className="thinking-progress-fill" />
        </div>
      </div>
    </div>
  )
}

export default ThinkingIndicator
