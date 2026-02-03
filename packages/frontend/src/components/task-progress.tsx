'use client'

import { useEffect } from 'react'
import clsx from 'clsx'
import type { Task, TaskStatus } from '@/lib/types'
import { useTaskWebSocket } from '@/hooks/use-task-websocket'
import { AnimatedDots } from '@/components/ui/animated-dots'

export interface TaskProgressProps {
  taskId: string
  onComplete?: (task: Task) => void
  onError?: (task: Task) => void
  showDetails?: boolean
}

/**
 * Status indicator configuration
 */
const statusConfig: Record<TaskStatus, {
  badge: string
  label: string
  dotClass: string
}> = {
  pending: {
    badge: 'badge-gray',
    label: 'Pending',
    dotClass: 'bg-terminal-textMuted',
  },
  running: {
    badge: 'badge-cyan',
    label: 'Running',
    dotClass: 'bg-terminal-cyan animate-pulse',
  },
  completed: {
    badge: 'badge-success',
    label: 'Completed',
    dotClass: 'bg-terminal-green',
  },
  failed: {
    badge: 'badge-danger',
    label: 'Failed',
    dotClass: 'bg-terminal-red',
  },
}

/**
 * TaskProgress component displays real-time task progress using WebSocket updates
 */
export function TaskProgress({
  taskId,
  onComplete,
  onError,
  showDetails = false,
}: TaskProgressProps) {
  const { task, isConnected, subscribe, unsubscribe } = useTaskWebSocket({
    onComplete,
    onError,
  })

  // Subscribe to task updates on mount
  useEffect(() => {
    if (taskId) {
      subscribe(taskId)
    }

    return () => {
      unsubscribe()
    }
  }, [taskId, subscribe, unsubscribe])

  // Loading state - waiting for initial task data
  if (!task) {
    return (
      <div className="w-full space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-terminal-textMuted text-sm">
            <AnimatedDots text="Connecting" />
          </span>
          <span className={clsx(
            'inline-flex items-center gap-1.5 text-xs',
            isConnected ? 'text-terminal-green' : 'text-terminal-yellow'
          )}>
            <span className={clsx(
              'w-1.5 h-1.5 rounded-full',
              isConnected ? 'bg-terminal-green' : 'bg-terminal-yellow animate-pulse'
            )} />
            {isConnected ? 'Connected' : 'Connecting'}
          </span>
        </div>
        <div className="w-full bg-terminal-bg border border-terminal-border rounded-full h-2 overflow-hidden">
          <div className="h-full bg-terminal-textMuted/30 animate-pulse" style={{ width: '30%' }} />
        </div>
      </div>
    )
  }

  const config = statusConfig[task.status]
  const isRunning = task.status === 'running' || task.status === 'pending'
  const isFailed = task.status === 'failed'
  const isComplete = task.status === 'completed'

  return (
    <div className="w-full space-y-3">
      {/* Status and progress header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Status dot */}
          <span className={clsx('w-2 h-2 rounded-full', config.dotClass)} />
          {/* Status badge */}
          <span className={clsx('badge text-xs', config.badge)}>
            {config.label}
          </span>
        </div>
        {/* Progress percentage */}
        <span className={clsx(
          'text-sm font-mono font-medium',
          isFailed ? 'text-terminal-red' :
          isComplete ? 'text-terminal-green' : 'text-terminal-cyan'
        )}>
          {task.progress}%
        </span>
      </div>

      {/* Progress message */}
      <div className="flex items-center justify-between text-sm">
        <span className={clsx(
          'truncate max-w-[80%]',
          isFailed ? 'text-terminal-red' : 'text-terminal-textMuted'
        )}>
          {isRunning && !task.message ? (
            <AnimatedDots text="Processing" />
          ) : (
            task.message || 'Waiting...'
          )}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-terminal-bg border border-terminal-border rounded-full h-2 overflow-hidden">
        <div
          className={clsx(
            'h-full transition-all duration-300 ease-out',
            isFailed ? 'bg-terminal-red' :
            isComplete ? 'bg-terminal-green' :
            task.progress > 60 ? 'bg-terminal-cyan' :
            task.progress > 30 ? 'bg-terminal-yellow' : 'bg-terminal-green'
          )}
          style={{ width: `${Math.min(task.progress, 100)}%` }}
        />
      </div>

      {/* Error message if failed */}
      {isFailed && task.error && (
        <div className="p-3 bg-terminal-red/10 border border-terminal-red/30 rounded-lg">
          <div className="flex items-start gap-2">
            <span className="text-terminal-red font-medium text-sm">Error:</span>
            <span className="text-terminal-red/80 text-sm break-words">
              {task.error}
            </span>
          </div>
        </div>
      )}

      {/* Optional details section */}
      {showDetails && (
        <div className="pt-2 border-t border-terminal-border space-y-1.5 text-xs text-terminal-textMuted">
          <div className="flex justify-between">
            <span>Task ID:</span>
            <span className="font-mono text-terminal-text">{task.id.slice(0, 8)}...</span>
          </div>
          <div className="flex justify-between">
            <span>Type:</span>
            <span className="text-terminal-text">{task.type}</span>
          </div>
          {task.createdAt && (
            <div className="flex justify-between">
              <span>Created:</span>
              <span className="text-terminal-text">
                {new Date(task.createdAt).toLocaleTimeString()}
              </span>
            </div>
          )}
          {task.startedAt && (
            <div className="flex justify-between">
              <span>Started:</span>
              <span className="text-terminal-text">
                {new Date(task.startedAt).toLocaleTimeString()}
              </span>
            </div>
          )}
          {task.completedAt && (
            <div className="flex justify-between">
              <span>Completed:</span>
              <span className="text-terminal-text">
                {new Date(task.completedAt).toLocaleTimeString()}
              </span>
            </div>
          )}
          {/* Connection status */}
          <div className="flex justify-between pt-1">
            <span>WebSocket:</span>
            <span className={clsx(
              'flex items-center gap-1',
              isConnected ? 'text-terminal-green' : 'text-terminal-yellow'
            )}>
              <span className={clsx(
                'w-1.5 h-1.5 rounded-full',
                isConnected ? 'bg-terminal-green' : 'bg-terminal-yellow'
              )} />
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default TaskProgress
