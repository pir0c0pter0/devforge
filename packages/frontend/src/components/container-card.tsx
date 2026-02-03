'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Container, Task } from '@/lib/types'
import { apiClient } from '@/lib/api-client'
import { useContainerStore } from '@/stores/container.store'
import { useI18n } from '@/lib/i18n'
import { AnimatedDots } from '@/components/ui/animated-dots'
import { useTaskWebSocket } from '@/hooks/use-task-websocket'
import { useMetrics } from '@/hooks/use-metrics'
import clsx from 'clsx'

interface ContainerCardProps {
  container: Container
}

export function ContainerCard({ container }: ContainerCardProps) {
  const { t } = useI18n()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const { updateContainer, removeContainer, setError } = useContainerStore()

  // Subscribe to real-time metrics updates for this container
  useMetrics(container.status === 'running' ? container.id : undefined)

  // Handle task completion - refresh container data
  const handleTaskComplete = useCallback(async (_task: Task) => {
    try {
      const containerResponse = await apiClient.getContainer(container.id)
      if (containerResponse.success && containerResponse.data) {
        updateContainer(container.id, containerResponse.data)
      }
    } catch (error) {
      console.error('Error fetching container after task completion:', error)
    }
    setActiveTaskId(null)
    setIsStarting(false)
  }, [container.id, updateContainer])

  // Handle task failure
  const handleTaskError = useCallback((task: Task) => {
    setError(task.error || t.container.failedStart)
    setActiveTaskId(null)
    setIsStarting(false)
  }, [setError, t.container.failedStart])

  // Use WebSocket hook for task updates
  const { task: wsTask, isConnected, subscribe, unsubscribe } = useTaskWebSocket({
    onComplete: handleTaskComplete,
    onError: handleTaskError,
    enableFallback: true,
  })

  // Subscribe to task when container is being created or starting
  useEffect(() => {
    const taskId = activeTaskId || (container.status === 'creating' ? container.taskId : null)

    if (taskId) {
      subscribe(taskId)
    } else {
      unsubscribe()
    }

    return () => {
      unsubscribe()
    }
  }, [activeTaskId, container.status, container.taskId, subscribe, unsubscribe])

  // Sync isStarting state when container status changes
  useEffect(() => {
    if (container.status === 'running' || container.status === 'stopped') {
      setIsStarting(false)
      setActiveTaskId(null)
    }
  }, [container.status])

  const handleStart = async () => {
    setIsStarting(true)

    const response = await apiClient.startContainer(container.id)

    if (!response.success) {
      setError(response.error || t.container.failedStart)
      setIsStarting(false)
      return
    }

    // API returns taskId - subscribe to WebSocket updates
    const taskId = response.data?.taskId
    if (!taskId) {
      // Fallback to old behavior if no taskId - refresh container directly
      setIsStarting(false)
      try {
        const containerResponse = await apiClient.getContainer(container.id)
        if (containerResponse.success && containerResponse.data) {
          updateContainer(container.id, containerResponse.data)
        }
      } catch (error) {
        console.error('Error fetching container:', error)
      }
      return
    }

    // Subscribe to task updates via WebSocket
    setActiveTaskId(taskId)
  }

  const handleStop = async () => {
    updateContainer(container.id, { status: 'stopped' })
    const response = await apiClient.stopContainer(container.id)

    if (!response.success) {
      setError(response.error || t.container.failedStop)
      updateContainer(container.id, { status: 'running' })
    }
  }

  const handleDelete = async () => {
    if (!confirm(`${t.container.confirmDelete} "${container.name}"?`)) {
      return
    }

    setIsDeleting(true)
    const response = await apiClient.deleteContainer(container.id)

    if (response.success) {
      removeContainer(container.id)
    } else {
      setError(response.error || t.container.failedDelete)
      setIsDeleting(false)
    }
  }

  const handleOpenShell = async () => {
    const response = await apiClient.openShell(container.id)
    if (response.success && response.data?.url) {
      window.open(response.data.url, '_blank')
    } else {
      setError(response.error || t.container.failedShell)
    }
  }

  const handleOpenVSCode = async () => {
    const response = await apiClient.openVSCode(container.id)
    if (response.success && response.data?.url) {
      window.open(response.data.url, '_blank')
    } else {
      setError(response.error || t.container.failedVscode)
    }
  }

  const statusColors = {
    running: 'badge-success',
    stopped: 'badge-gray',
    creating: 'badge-warning',
    error: 'badge-danger',
  }

  const templateColors = {
    claude: 'badge-cyan',
    vscode: 'badge-warning',
    both: 'badge-success',
  }

  const modeColors = {
    interactive: 'badge-cyan',
    autonomous: 'badge-warning',
  }

  const cpuPercent = container.metrics?.cpu ?? 0
  const memoryMB = container.limits?.memoryMB ?? 1
  const diskGB = container.limits?.diskGB ?? 1
  const memoryPercent = memoryMB > 0 ? ((container.metrics?.memory ?? 0) / memoryMB) * 100 : 0
  const diskPercent = diskGB > 0 ? ((container.metrics?.disk ?? 0) / diskGB) * 100 : 0

  return (
    <div className={clsx('card transition-all', isDeleting && 'opacity-50')}>
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-terminal-green truncate mb-2">
              <span className="text-terminal-textMuted">&gt;</span> {container.name}
            </h3>
            <div className="flex flex-wrap gap-2">
              <span className={clsx('badge', statusColors[container.status])}>
                {t.status[container.status]}
              </span>
              <span className={clsx('badge', templateColors[container.template])}>
                {t.templates[container.template]}
              </span>
              <span className={clsx('badge', modeColors[container.mode])}>
                {t.modes[container.mode]}
              </span>
            </div>
            {/* Progress bar for active operations (creating or starting) - using WebSocket */}
            {(activeTaskId || (container.status === 'creating' && container.taskId)) && (
              <div className="mt-3">
                {wsTask ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className={clsx(
                        'truncate max-w-[200px]',
                        wsTask.status === 'failed' ? 'text-terminal-red' : 'text-terminal-textMuted'
                      )}>
                        {wsTask.message || (wsTask.status === 'pending' ? 'Aguardando...' : 'Processando...')}
                      </span>
                      <span className={clsx(
                        'font-mono ml-2',
                        wsTask.status === 'failed' ? 'text-terminal-red' :
                        wsTask.status === 'completed' ? 'text-terminal-green' : 'text-terminal-cyan'
                      )}>
                        {wsTask.progress}%
                      </span>
                    </div>
                    <div className="w-full bg-terminal-bg border border-terminal-border rounded-full h-1.5 overflow-hidden">
                      <div
                        className={clsx(
                          'h-full transition-all duration-300 ease-out',
                          wsTask.status === 'failed' ? 'bg-terminal-red' :
                          wsTask.status === 'completed' ? 'bg-terminal-green' : 'bg-terminal-cyan'
                        )}
                        style={{ width: `${wsTask.progress}%` }}
                      />
                    </div>
                    {/* Connection status indicator */}
                    {!isConnected && (
                      <div className="flex items-center gap-1 text-xs text-terminal-yellow mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-terminal-yellow animate-pulse" />
                        Reconectando...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-terminal-textMuted">
                        <AnimatedDots text="Conectando" />
                      </span>
                      <span className="text-terminal-cyan font-mono ml-2">0%</span>
                    </div>
                    <div className="w-full bg-terminal-bg border border-terminal-border rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-terminal-textMuted/30 animate-pulse" style={{ width: '10%' }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={clsx(
            'status-dot ml-2 mt-1',
            container.status === 'running' && 'status-running',
            container.status === 'stopped' && 'status-stopped',
            container.status === 'error' && 'status-error',
            container.status === 'creating' && 'status-creating'
          )} />
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-terminal-textMuted">{t.container.cpu}</span>
            <span className="font-medium text-terminal-text">
              {(container.metrics?.cpu ?? 0).toFixed(1)}% / {container.limits?.cpuCores ?? 0} {t.container.cores}
            </span>
          </div>
          <div className="w-full bg-terminal-bg rounded h-1.5">
            <div
              className={clsx(
                'h-1.5 rounded transition-all',
                cpuPercent > 80
                  ? 'bg-terminal-red'
                  : cpuPercent > 60
                  ? 'bg-terminal-yellow'
                  : 'bg-terminal-green'
              )}
              style={{ width: `${Math.min(cpuPercent, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-terminal-textMuted">{t.container.memory}</span>
            <span className="font-medium text-terminal-text">
              {(container.metrics?.memory ?? 0).toFixed(0)} MB / {container.limits?.memoryMB ?? 0} MB
            </span>
          </div>
          <div className="w-full bg-terminal-bg rounded h-1.5">
            <div
              className={clsx(
                'h-1.5 rounded transition-all',
                memoryPercent > 80
                  ? 'bg-terminal-red'
                  : memoryPercent > 60
                  ? 'bg-terminal-yellow'
                  : 'bg-terminal-green'
              )}
              style={{ width: `${Math.min(memoryPercent, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-terminal-textMuted">{t.container.disk}</span>
            <span className={clsx(
              'font-medium',
              diskPercent > 95 ? 'text-terminal-red' :
              diskPercent > 80 ? 'text-terminal-yellow' : 'text-terminal-text'
            )}>
              {(container.metrics?.disk ?? 0).toFixed(2)} GB / {container.limits?.diskGB ?? 0} GB
              <span className="text-terminal-textMuted text-xs ml-1">({t.container.softLimit})</span>
            </span>
          </div>
          <div className="w-full bg-terminal-bg rounded h-1.5">
            <div
              className={clsx(
                'h-1.5 rounded transition-all',
                diskPercent > 80
                  ? 'bg-terminal-red'
                  : diskPercent > 60
                  ? 'bg-terminal-yellow'
                  : 'bg-terminal-green'
              )}
              style={{ width: `${Math.min(diskPercent, 100)}%` }}
            />
          </div>
          {/* Disk usage alerts */}
          {diskPercent > 95 && (
            <div className="mt-1 text-xs text-terminal-red flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-terminal-red rounded-full animate-pulse"></span>
              {t.container.diskCritical}
            </div>
          )}
          {diskPercent > 80 && diskPercent <= 95 && (
            <div className="mt-1 text-xs text-terminal-yellow flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-terminal-yellow rounded-full"></span>
              {t.container.diskWarning}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-sm mb-4 pt-4 border-t border-terminal-border">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-terminal-textMuted">{t.container.agents}:</span>
              <span className="ml-1 font-medium text-terminal-cyan">
                {container.activeAgents}
              </span>
            </div>
            <div>
              <span className="text-terminal-textMuted">{t.container.queue}:</span>
              <span className="ml-1 font-medium text-terminal-yellow">
                {container.queueLength}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {container.status === 'running' ? (
            <button
              onClick={handleStop}
              className="btn-secondary text-sm py-1.5"
              disabled={isDeleting}
            >
              {t.container.stop}
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="btn-primary text-sm py-1.5"
              disabled={isDeleting || container.status === 'creating' || isStarting}
            >
              {(container.status === 'creating' || isStarting) ? (
                <AnimatedDots text={t.container.starting} />
              ) : (
                t.container.start
              )}
            </button>
          )}

          <button
            onClick={handleOpenShell}
            className="btn-secondary text-sm py-1.5"
            disabled={container.status !== 'running' || isDeleting}
          >
            {t.container.shell}
          </button>

          {(container.template === 'vscode' || container.template === 'both') && (
            <button
              onClick={handleOpenVSCode}
              className="btn-secondary text-sm py-1.5"
              disabled={container.status !== 'running' || isDeleting}
            >
              {t.container.vscode}
            </button>
          )}

          <button
            onClick={handleDelete}
            className="btn-danger text-sm py-1.5"
            disabled={isDeleting}
          >
            {isDeleting ? <AnimatedDots text={t.container.deleting} /> : t.container.delete}
          </button>
        </div>
      </div>
    </div>
  )
}
