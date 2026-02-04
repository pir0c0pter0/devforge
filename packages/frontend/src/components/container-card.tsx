'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import type { Container, Task } from '@/lib/types'
import { apiClient } from '@/lib/api-client'
import { useContainerStore } from '@/stores/container.store'
import { useI18n } from '@/lib/i18n'
import { useModal } from '@/components/ui/modal'
import { AnimatedDots } from '@/components/ui/animated-dots'
import { StatusIndicator } from '@/components/ui/status-indicator'
import type { ContainerStatusType } from '@/components/ui/status-indicator'
import { useTaskWebSocket } from '@/hooks/use-task-websocket'
import { useMetrics } from '@/hooks/use-metrics'
import clsx from 'clsx'

const WS_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ContainerCardProps {
  container: Container
}

export function ContainerCard({ container }: ContainerCardProps) {
  const { t } = useI18n()
  const router = useRouter()
  const modal = useModal()
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [queueStats, setQueueStats] = useState({ queueLength: container.queueLength, activeAgents: container.activeAgents, isExecuting: false })
  const queueSocketRef = useRef<Socket | null>(null)
  const { updateContainer, removeContainer, setError } = useContainerStore()

  // Subscribe to real-time metrics updates for this container
  useMetrics(container.status === 'running' ? container.id : undefined)

  // Subscribe to queue stats updates
  useEffect(() => {
    if (container.status !== 'running') {
      return
    }

    const socket = io(`${WS_URL}/queue`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    })
    queueSocketRef.current = socket

    socket.on('connect', () => {
      socket.emit('subscribe:container', container.id)
    })

    socket.on('queue:stats', (data: { containerId: string; queueLength: number; activeAgents?: number; isExecuting?: boolean }) => {
      if (data.containerId === container.id) {
        setQueueStats(prev => ({
          queueLength: data.queueLength,
          activeAgents: data.activeAgents ?? prev.activeAgents,
          isExecuting: data.isExecuting ?? prev.isExecuting,
        }))
      }
    })

    // Also update on instruction events
    socket.on('instruction:pending', () => setQueueStats(prev => ({ ...prev, queueLength: prev.queueLength + 1 })))
    socket.on('instruction:started', () => setQueueStats(prev => ({ ...prev, isExecuting: true })))
    socket.on('instruction:completed', () => setQueueStats(prev => ({ ...prev, queueLength: Math.max(0, prev.queueLength - 1), isExecuting: false })))
    socket.on('instruction:failed', () => setQueueStats(prev => ({ ...prev, queueLength: Math.max(0, prev.queueLength - 1), isExecuting: false })))

    return () => {
      socket.emit('unsubscribe:container', container.id)
      socket.disconnect()
      queueSocketRef.current = null
    }
  }, [container.id, container.status])

  // Sync queueStats when container props change
  useEffect(() => {
    setQueueStats(prev => ({ queueLength: container.queueLength, activeAgents: container.activeAgents, isExecuting: prev.isExecuting }))
  }, [container.queueLength, container.activeAgents])

  // Handle task completion - refresh container data or remove if deleted
  const handleTaskComplete = useCallback(async (task: Task) => {
    // Check if this was a delete task
    if (deleteTaskId && task.result?.deleted) {
      removeContainer(container.id)
      setDeleteTaskId(null)
      setIsDeleting(false)
      return
    }

    // Otherwise refresh container data
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
  }, [container.id, updateContainer, removeContainer, deleteTaskId])

  // Handle task failure
  const handleTaskError = useCallback((task: Task) => {
    if (deleteTaskId) {
      setError(task.error || t.container.failedDelete)
      setDeleteTaskId(null)
      setIsDeleting(false)
    } else {
      setError(task.error || t.container.failedStart)
      setActiveTaskId(null)
      setIsStarting(false)
    }
  }, [setError, t.container.failedStart, t.container.failedDelete, deleteTaskId])

  // Use WebSocket hook for task updates
  const { task: wsTask, isConnected, subscribe, unsubscribe } = useTaskWebSocket({
    onComplete: handleTaskComplete,
    onError: handleTaskError,
    enableFallback: true,
  })

  // Subscribe to task - DELETE has priority over everything else
  useEffect(() => {
    // If deleting, ONLY subscribe to delete task
    if (deleteTaskId) {
      subscribe(deleteTaskId)
      return () => unsubscribe()
    }

    // If not deleting, subscribe to other tasks
    const taskId = activeTaskId || (container.status === 'creating' ? container.taskId : null)

    if (taskId) {
      subscribe(taskId)
    } else {
      unsubscribe()
    }

    return () => {
      unsubscribe()
    }
  }, [deleteTaskId, activeTaskId, container.status, container.taskId, subscribe, unsubscribe])

  // Sync isStarting state when container status changes
  useEffect(() => {
    if (container.status === 'running' || container.status === 'stopped') {
      setIsStarting(false)
      setActiveTaskId(null)
    }
  }, [container.status])

  // Reset all state when container changes (new container with same position)
  useEffect(() => {
    setIsDeleting(false)
    setDeleteTaskId(null)
    setIsStarting(false)
    setActiveTaskId(null)
  }, [container.id])

  const handleStart = async () => {
    setIsStarting(true)

    const response = await apiClient.startContainer(container.id)

    if (!response.success) {
      modal.showError(
        t.container.failedStart,
        response.error || 'Erro desconhecido ao iniciar container'
      )
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
      modal.showError(
        t.container.failedStop,
        response.error || 'Erro desconhecido ao parar container'
      )
      updateContainer(container.id, { status: 'running' })
    }
  }

  const handleDelete = async () => {
    const confirmed = await modal.confirm({
      title: t.container.confirmDelete,
      message: (
        <p>
          Tem certeza que deseja excluir o container <strong className="text-terminal-text">{container.name}</strong>?
          <br />
          <span className="text-terminal-red text-xs mt-2 block">Esta ação não pode ser desfeita.</span>
        </p>
      ),
      type: 'delete',
      confirmLabel: t.container.delete,
      cancelLabel: 'Cancelar',
    })

    if (!confirmed) {
      return
    }

    // PRIORITY: Reset ALL other state first - delete takes over
    setIsStarting(false)
    setActiveTaskId(null)
    unsubscribe() // Unsubscribe from any current task

    setIsDeleting(true)
    const response = await apiClient.deleteContainer(container.id)

    if (!response.success) {
      modal.showError(
        t.container.failedDelete,
        response.error || 'Erro desconhecido ao excluir container'
      )
      setIsDeleting(false)
      return
    }

    // API now returns taskId - subscribe to WebSocket updates
    const taskId = response.data?.taskId
    if (taskId) {
      setDeleteTaskId(taskId)
    } else {
      // Fallback: remove immediately if no taskId (shouldn't happen)
      removeContainer(container.id)
      setIsDeleting(false)
    }
  }

  // Helper to check if container is stopped and ask to start
  const askToStartIfStopped = async (): Promise<boolean> => {
    if (container.status === 'running') {
      return true // Already running, proceed
    }

    if (container.status === 'stopped' || container.status === 'exited') {
      const shouldStart = await modal.confirm({
        title: t.container.containerStopped,
        message: (
          <p>
            {t.container.containerStoppedMessage}
            <br />
            <span className="text-terminal-cyan text-sm mt-2 block">
              {t.container.askStartContainer}
            </span>
          </p>
        ),
        type: 'warning',
        confirmLabel: t.container.startAndOpen,
        cancelLabel: t.container.cancel,
      })

      if (shouldStart) {
        await handleStart()
        // Wait a bit for container to start
        await new Promise(resolve => setTimeout(resolve, 2000))
        return true
      }
      return false
    }

    // Container is in another state (creating, error, etc.)
    modal.showWarning(
      t.container.containerNotReady,
      t.container.containerNotReadyMessage
    )
    return false
  }

  const handleOpenShell = async () => {
    const canProceed = await askToStartIfStopped()
    if (canProceed) {
      router.push(`/containers/${container.id}?tab=terminal`)
    }
  }

  const handleOpenInstructions = async () => {
    const canProceed = await askToStartIfStopped()
    if (canProceed) {
      router.push(`/containers/${container.id}?tab=instructions`)
    }
  }

  const handleOpenVSCode = async () => {
    const canProceed = await askToStartIfStopped()
    if (!canProceed) return

    const response = await apiClient.openVSCode(container.id)
    if (response.success && response.data?.url) {
      window.open(response.data.url, '_blank')
    } else {
      modal.showError(
        t.container.failedVscode,
        response.error || 'Erro desconhecido ao abrir VS Code'
      )
    }
  }

  const statusColors: Record<string, string> = {
    running: 'badge-success',
    stopped: 'badge-gray',
    creating: 'badge-warning',
    error: 'badge-danger',
    exited: 'badge-warning',
    paused: 'badge-warning',
    restarting: 'badge-warning',
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
    <div className={clsx('card transition-all', isDeleting && !deleteTaskId && 'opacity-50')}>
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
            {/* Progress bar for active operations - DELETE has priority */}
            {(deleteTaskId || (!isDeleting && (activeTaskId || (container.status === 'creating' && container.taskId)))) && (
              <div className="mt-3">
                {wsTask ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className={clsx(
                        'truncate max-w-[200px]',
                        wsTask.status === 'failed' ? 'text-terminal-red' :
                        deleteTaskId ? 'text-terminal-yellow' : 'text-terminal-textMuted'
                      )}>
                        {deleteTaskId && !wsTask.message ? 'Excluindo...' :
                         wsTask.message || (wsTask.status === 'pending' ? 'Aguardando...' : 'Processando...')}
                      </span>
                      <span className={clsx(
                        'font-mono ml-2',
                        wsTask.status === 'failed' ? 'text-terminal-red' :
                        wsTask.status === 'completed' ? 'text-terminal-green' :
                        deleteTaskId ? 'text-terminal-yellow' : 'text-terminal-cyan'
                      )}>
                        {wsTask.progress}%
                      </span>
                    </div>
                    <div className="w-full bg-terminal-bg border border-terminal-border rounded-full h-1.5 overflow-hidden">
                      <div
                        className={clsx(
                          'h-full transition-all duration-300 ease-out',
                          wsTask.status === 'failed' ? 'bg-terminal-red' :
                          wsTask.status === 'completed' ? 'bg-terminal-green' :
                          deleteTaskId ? 'bg-terminal-yellow' : 'bg-terminal-cyan'
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
          <StatusIndicator
          status={container.status as ContainerStatusType}
          size="md"
          className="ml-2 mt-1"
        />
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
                {queueStats.activeAgents}
              </span>
            </div>
            <div>
              <span className="text-terminal-textMuted">{t.container.queue}:</span>
              <span className={clsx('ml-1 font-medium', queueStats.queueLength > 0 ? 'text-terminal-yellow' : 'text-terminal-textMuted')}>
                {queueStats.queueLength}
              </span>
            </div>
          </div>
        </div>

        {/* Status line */}
        {container.status === 'running' && (
          <div className="flex items-center gap-2 text-xs mb-4 px-1">
            {queueStats.isExecuting ? (
              <>
                <span className="w-2 h-2 rounded-full bg-terminal-cyan animate-pulse" />
                <span className="text-terminal-cyan">{t.containerStatus.executing}</span>
              </>
            ) : queueStats.queueLength > 0 ? (
              <>
                <span className="w-2 h-2 rounded-full bg-terminal-yellow" />
                <span className="text-terminal-yellow">
                  {t.containerStatus.queued.replace('{n}', String(queueStats.queueLength))}
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-terminal-textMuted" />
                <span className="text-terminal-textMuted">{t.containerStatus.idle}</span>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
            disabled={isDeleting || container.status === 'creating'}
          >
            {t.container.shell}
          </button>

          <button
            onClick={handleOpenInstructions}
            className="btn-secondary text-sm py-1.5"
            disabled={isDeleting || container.status === 'creating'}
          >
            {t.container.instructions}
          </button>

          {(container.template === 'vscode' || container.template === 'both') && (
            <button
              onClick={handleOpenVSCode}
              className="btn-secondary text-sm py-1.5"
              disabled={isDeleting || container.status === 'creating'}
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
