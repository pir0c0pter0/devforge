'use client'

import { Bot, Brain } from 'lucide-react'

interface ThinkingIndicatorProps {
  /** Main thinking text */
  text: string
  /** Subtext / description */
  subtext?: string
  /** Variant style */
  variant?: 'default' | 'compact'
}

/**
 * ThinkingIndicator component
 * Shows an animated thinking state with pulsing brain/bot icons and wave animation
 */
export function ThinkingIndicator({ text, subtext, variant = 'default' }: ThinkingIndicatorProps) {
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
