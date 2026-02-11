'use client'

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

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function truncateToolResult(content: string, maxLines: number = 8): string {
  const lines = content.split('\n')
  if (lines.length <= maxLines) return content
  return lines.slice(0, maxLines).join('\n') + `\n... (+${lines.length - maxLines} lines)`
}

export function MessageItem({ message }: MessageItemProps) {
  if (message.type === 'system') return null

  return (
    <div className="group font-mono text-sm leading-relaxed">
      {message.type === 'user' && (
        <div className="flex items-start gap-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-start">
              <span className="text-terminal-cyan font-bold select-none flex-shrink-0 mr-2" aria-label="User input">❯</span>
              <span className="text-terminal-text whitespace-pre-wrap break-words">{message.content}</span>
            </div>
          </div>
          <span className="text-xs text-terminal-textMuted/50 ml-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
      )}

      {message.type === 'assistant' && (
        <div className="flex items-start gap-0">
          <div className="flex-1 min-w-0">
            <span className="text-terminal-text whitespace-pre-wrap break-words">{message.content}</span>
          </div>
          <span className="text-xs text-terminal-textMuted/50 ml-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
      )}

      {message.type === 'tool_use' && (
        <div className="flex items-start gap-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-terminal-yellow select-none flex-shrink-0" aria-label="Tool execution">⚡</span>
              <span className="text-terminal-yellow font-medium">{message.toolName || 'Tool'}</span>
            </div>
            {message.toolInput !== undefined && message.toolInput !== null && (
              <pre className="text-xs text-terminal-textMuted/70 mt-0.5 ml-5 overflow-x-auto">
                {JSON.stringify(message.toolInput, null, 2)}
              </pre>
            )}
          </div>
          <span className="text-xs text-terminal-textMuted/50 ml-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
      )}

      {message.type === 'tool_result' && (
        <div className="flex items-start gap-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-start">
              <span className="text-terminal-green select-none flex-shrink-0 mr-1.5" aria-label="Result">✓</span>
              <span className="text-terminal-textMuted/70 text-xs whitespace-pre-wrap break-words">
                {truncateToolResult(message.content)}
              </span>
            </div>
          </div>
          <span className="text-xs text-terminal-textMuted/50 ml-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
      )}

      {message.type === 'error' && (
        <div className="flex items-start gap-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-start">
              <span className="text-terminal-red select-none flex-shrink-0 mr-1.5" aria-label="Error">✗</span>
              <span className="text-terminal-red whitespace-pre-wrap break-words">{message.content}</span>
            </div>
          </div>
          <span className="text-xs text-terminal-textMuted/50 ml-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
      )}
    </div>
  )
}

export default MessageItem
