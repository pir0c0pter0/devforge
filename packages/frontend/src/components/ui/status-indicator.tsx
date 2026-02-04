'use client'

import clsx from 'clsx'

export type ContainerStatusType = 'running' | 'stopped' | 'creating' | 'error' | 'exited' | 'paused' | 'restarting'

interface StatusIndicatorProps {
  status: ContainerStatusType
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
}

export function StatusIndicator({ status, size = 'md', showLabel = false, className }: StatusIndicatorProps) {
  const iconSize = sizeClasses[size]

  const renderIcon = () => {
    switch (status) {
      case 'running':
        // Spinning gear icon
        return (
          <div className={clsx('relative', iconSize)}>
            <svg
              className={clsx(iconSize, 'text-terminal-green animate-spin')}
              style={{ animationDuration: '3s' }}
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                fill="currentColor"
                d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM8.5 12a3.5 3.5 0 117 0 3.5 3.5 0 01-7 0z"
              />
              <path
                fill="currentColor"
                fillRule="evenodd"
                d="M12 0c-.702 0-1.32.466-1.513 1.143l-.444 1.563a9.03 9.03 0 00-2.235 1.29l-1.538-.5A1.563 1.563 0 004.39 4.28L3.207 6.22a1.563 1.563 0 00.282 1.934l1.107 1.057a9.108 9.108 0 000 2.578L3.49 12.846a1.563 1.563 0 00-.282 1.934l1.182 1.94a1.563 1.563 0 001.88.784l1.538-.5a9.03 9.03 0 002.235 1.29l.445 1.563A1.563 1.563 0 0012 21h2.362c.702 0 1.32-.466 1.513-1.143l.444-1.563a9.03 9.03 0 002.235-1.29l1.538.5a1.563 1.563 0 001.88-.784l1.181-1.94a1.563 1.563 0 00-.282-1.934l-1.107-1.057a9.108 9.108 0 000-2.578l1.107-1.057a1.563 1.563 0 00.282-1.934l-1.182-1.94a1.563 1.563 0 00-1.88-.784l-1.537.5a9.03 9.03 0 00-2.235-1.29l-.445-1.563A1.563 1.563 0 0012 0h-.001zm.362 2h1.276l.487 1.714a.75.75 0 00.51.507 7.53 7.53 0 012.923 1.688.75.75 0 00.708.143l1.686-.549.638 1.047-1.215 1.16a.75.75 0 00-.198.677 7.608 7.608 0 010 3.226.75.75 0 00.198.677l1.215 1.16-.638 1.047-1.686-.549a.75.75 0 00-.708.143 7.53 7.53 0 01-2.923 1.688.75.75 0 00-.51.507L12.638 20h-1.276l-.487-1.714a.75.75 0 00-.51-.507 7.53 7.53 0 01-2.923-1.688.75.75 0 00-.708-.143l-1.686.549-.638-1.047 1.215-1.16a.75.75 0 00.198-.677 7.608 7.608 0 010-3.226.75.75 0 00-.198-.677l-1.215-1.16.638-1.047 1.686.549a.75.75 0 00.708-.143 7.53 7.53 0 012.923-1.688.75.75 0 00.51-.507L12.362 2z"
                clipRule="evenodd"
              />
            </svg>
            <div className="absolute inset-0 rounded-full bg-terminal-green/20 animate-ping" style={{ animationDuration: '2s' }} />
          </div>
        )

      case 'stopped':
      case 'exited':
        // Pause icon
        return (
          <div className={clsx('relative', iconSize)}>
            <svg
              className={clsx(iconSize, status === 'exited' ? 'text-terminal-yellow' : 'text-terminal-textMuted')}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          </div>
        )

      case 'creating':
      case 'restarting':
        // Loading spinner
        return (
          <div className={clsx('relative', iconSize)}>
            <svg
              className={clsx(iconSize, 'text-terminal-yellow animate-spin')}
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )

      case 'error':
        // Red exclamation
        return (
          <div className={clsx('relative', iconSize)}>
            <svg
              className={clsx(iconSize, 'text-terminal-red')}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <div className="absolute inset-0 rounded-full bg-terminal-red/30 animate-pulse" />
          </div>
        )

      case 'paused':
        // Yellow exclamation (needs attention)
        return (
          <div className={clsx('relative', iconSize)}>
            <svg
              className={clsx(iconSize, 'text-terminal-yellow')}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
          </div>
        )

      default:
        return (
          <div className={clsx(iconSize, 'rounded-full bg-terminal-textMuted')} />
        )
    }
  }

  const getLabel = () => {
    const labels: Record<ContainerStatusType, string> = {
      running: 'Rodando',
      stopped: 'Parado',
      creating: 'Criando',
      error: 'Erro',
      exited: 'Encerrado',
      paused: 'Pausado',
      restarting: 'Reiniciando',
    }
    return labels[status] || status
  }

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      {renderIcon()}
      {showLabel && (
        <span className={clsx(
          'text-xs font-medium',
          status === 'running' && 'text-terminal-green',
          status === 'stopped' && 'text-terminal-textMuted',
          status === 'exited' && 'text-terminal-yellow',
          status === 'creating' && 'text-terminal-yellow',
          status === 'restarting' && 'text-terminal-yellow',
          status === 'error' && 'text-terminal-red',
          status === 'paused' && 'text-terminal-yellow',
        )}>
          {getLabel()}
        </span>
      )}
    </div>
  )
}

export default StatusIndicator
