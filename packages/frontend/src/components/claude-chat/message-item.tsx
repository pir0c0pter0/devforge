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
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    borderClass: 'border-blue-200 dark:border-blue-800',
    iconBgClass: 'bg-blue-100 dark:bg-blue-900/40',
    iconTextClass: 'text-blue-600 dark:text-blue-400',
    Icon: User,
  },
  assistant: {
    bgClass: 'bg-gray-50 dark:bg-terminal-surface',
    borderClass: 'border-gray-200 dark:border-terminal-border',
    iconBgClass: 'bg-gray-100 dark:bg-terminal-bg',
    iconTextClass: 'text-gray-600 dark:text-terminal-text',
    Icon: Bot,
  },
  tool_use: {
    bgClass: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderClass: 'border-yellow-200 dark:border-yellow-800',
    iconBgClass: 'bg-yellow-100 dark:bg-yellow-900/40',
    iconTextClass: 'text-yellow-600 dark:text-yellow-400',
    Icon: Terminal,
  },
  tool_result: {
    bgClass: 'bg-green-50 dark:bg-green-900/20',
    borderClass: 'border-green-200 dark:border-green-800',
    iconBgClass: 'bg-green-100 dark:bg-green-900/40',
    iconTextClass: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
  },
  error: {
    bgClass: 'bg-red-50 dark:bg-red-900/20',
    borderClass: 'border-red-200 dark:border-red-800',
    iconBgClass: 'bg-red-100 dark:bg-red-900/40',
    iconTextClass: 'text-red-600 dark:text-red-400',
    Icon: AlertCircle,
  },
  system: {
    bgClass: 'bg-gray-100 dark:bg-terminal-bg',
    borderClass: 'border-gray-300 dark:border-terminal-border',
    iconBgClass: 'bg-gray-200 dark:bg-terminal-surface',
    iconTextClass: 'text-gray-500 dark:text-terminal-textMuted',
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
