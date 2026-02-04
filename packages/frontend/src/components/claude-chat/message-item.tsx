'use client'

import clsx from 'clsx'
import {
  User,
  Bot,
  Terminal,
  CheckCircle,
  AlertCircle,
  FileSearch,
  FileEdit,
} from 'lucide-react'

export type MessageType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'error' | 'system'

export interface ClaudeMessage {
  id: string
  type: MessageType
  content: string
  timestamp: Date
  toolName?: string
  toolInput?: unknown
}

export interface MessageItemProps {
  message: ClaudeMessage
}

const messageConfig: Record<MessageType, {
  bgClass: string
  borderClass: string
  iconBgClass: string
  iconTextClass: string
  Icon: React.ComponentType<{ className?: string }>
}> = {
  user: {
    bgClass: 'bg-terminal-cyan/10',
    borderClass: 'border-terminal-cyan/30',
    iconBgClass: 'bg-terminal-cyan/20',
    iconTextClass: 'text-terminal-cyan',
    Icon: User,
  },
  assistant: {
    bgClass: 'bg-terminal-bgLight',
    borderClass: 'border-terminal-border',
    iconBgClass: 'bg-terminal-green/20',
    iconTextClass: 'text-terminal-green',
    Icon: Bot,
  },
  tool_use: {
    bgClass: 'bg-terminal-yellow/10',
    borderClass: 'border-terminal-yellow/30',
    iconBgClass: 'bg-terminal-yellow/20',
    iconTextClass: 'text-terminal-yellow',
    Icon: Terminal,
  },
  tool_result: {
    bgClass: 'bg-terminal-green/10',
    borderClass: 'border-terminal-green/30',
    iconBgClass: 'bg-terminal-green/20',
    iconTextClass: 'text-terminal-green',
    Icon: CheckCircle,
  },
  error: {
    bgClass: 'bg-terminal-red/10',
    borderClass: 'border-terminal-red/30',
    iconBgClass: 'bg-terminal-red/20',
    iconTextClass: 'text-terminal-red',
    Icon: AlertCircle,
  },
  system: {
    bgClass: 'bg-terminal-bg',
    borderClass: 'border-terminal-border',
    iconBgClass: 'bg-terminal-bgLight',
    iconTextClass: 'text-terminal-textMuted',
    Icon: Bot,
  },
}

function getToolIcon(toolName?: string): React.ComponentType<{ className?: string }> {
  if (!toolName) return Terminal

  const lowerName = toolName.toLowerCase()
  if (lowerName.includes('read') || lowerName.includes('search') || lowerName.includes('grep') || lowerName.includes('glob')) {
    return FileSearch
  }
  if (lowerName.includes('write') || lowerName.includes('edit')) {
    return FileEdit
  }
  return Terminal
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function MessageItem({ message }: MessageItemProps) {
  const config = messageConfig[message.type]
  const Icon = message.type === 'tool_use' ? getToolIcon(message.toolName) : config.Icon

  return (
    <div className={clsx(
      'rounded-lg border p-3',
      config.bgClass,
      config.borderClass
    )}>
      <div className="flex items-start gap-3">
        <div className={clsx(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          config.iconBgClass
        )}>
          <Icon className={clsx('w-4 h-4', config.iconTextClass)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            {message.type === 'tool_use' && message.toolName && (
              <span className="text-xs font-mono font-medium text-terminal-yellow">
                {message.toolName}
              </span>
            )}
            {message.type !== 'tool_use' && (
              <span className="text-xs font-medium text-terminal-textMuted">
                {message.type === 'user' ? 'Voce' :
                 message.type === 'assistant' ? 'Claude' :
                 message.type === 'tool_result' ? 'Resultado' :
                 message.type === 'error' ? 'Erro' : 'Sistema'}
              </span>
            )}
            <span className="text-xs text-terminal-textMuted">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>

          <div className="text-sm text-terminal-text whitespace-pre-wrap break-words">
            {message.content}
          </div>

          {message.type === 'tool_use' && message.toolInput !== undefined && message.toolInput !== null ? (
            <div className="mt-2 p-2 bg-terminal-bg rounded border border-terminal-border">
              <pre className="text-xs font-mono text-terminal-textMuted overflow-x-auto">
                {JSON.stringify(message.toolInput, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default MessageItem
