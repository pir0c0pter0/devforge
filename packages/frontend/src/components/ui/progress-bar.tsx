'use client'

import clsx from 'clsx'
import type { ContainerProgress } from '@/hooks/use-container-progress'

interface ProgressBarProps {
  progress: ContainerProgress
  showPercentage?: boolean
  showMessage?: boolean
  className?: string
}

export function ProgressBar({
  progress,
  showPercentage = true,
  showMessage = true,
  className,
}: ProgressBarProps) {
  const isError = progress.stage === 'error'
  const isComplete = progress.stage === 'ready'

  return (
    <div className={clsx('w-full', className)}>
      {showMessage && (
        <div className="flex justify-between items-center mb-1.5">
          <span className={clsx(
            'text-sm',
            isError ? 'text-terminal-red' : 'text-terminal-textMuted'
          )}>
            {progress.error || progress.message}
          </span>
          {showPercentage && (
            <span className={clsx(
              'text-sm font-medium',
              isError ? 'text-terminal-red' :
              isComplete ? 'text-terminal-green' : 'text-terminal-cyan'
            )}>
              {progress.percentage}%
            </span>
          )}
        </div>
      )}
      <div className="w-full bg-terminal-bg rounded-full h-2 overflow-hidden">
        <div
          className={clsx(
            'h-2 rounded-full transition-all duration-500 ease-out',
            isError ? 'bg-terminal-red' :
            isComplete ? 'bg-terminal-green' : 'bg-terminal-cyan'
          )}
          style={{ width: `${Math.min(progress.percentage, 100)}%` }}
        />
      </div>
    </div>
  )
}

export default ProgressBar
