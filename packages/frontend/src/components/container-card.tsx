'use client'

import { useState, useEffect, useRef } from 'react'
import type { Container, Task } from '@/lib/types'
import { apiClient } from '@/lib/api-client'
import { useContainerStore } from '@/stores/container.store'
import { useI18n } from '@/lib/i18n'
import { AnimatedDots } from '@/components/ui/animated-dots'
import clsx from 'clsx'

interface ContainerCardProps {
  container: Container
}

export function ContainerCard({ container }: ContainerCardProps) {
  const { t } = useI18n()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const taskPollingRef = useRef<NodeJS.Timeout | null>(null)
  const startTaskPollingRef = useRef<NodeJS.Timeout | null>(null)
  const { updateContainer, removeContainer, setError } = useContainerStore()

  // Poll task when container is being created (from creation flow)
  useEffect(() => {
    if (container.status === 'creating' && container.taskId) {
      const pollTask = async () => {
        try {
          const response = await apiClient.getTask(container.taskId!)
          if (response.success && response.data) {
            setActiveTask(response.data)

            // If task is done, refresh container status
            if (response.data.status === 'completed' || response.data.status === 'failed') {
              // Fetch updated container
              const containerResponse = await apiClient.getContainer(container.id)
              if (containerResponse.success && containerResponse.data) {
                updateContainer(container.id, containerResponse.data)
              }
              setActiveTask(null)
              return // Stop polling
            }
          }
          // Continue polling
          taskPollingRef.current = setTimeout(pollTask, 1000)
        } catch (error) {
          console.error('Error polling task:', error)
          taskPollingRef.current = setTimeout(pollTask, 2000)
        }
      }

      pollTask()
    } else if (container.status !== 'creating') {
      // Clear task when container is no longer creating
      setActiveTask(null)
    }

    return () => {
      if (taskPollingRef.current) {
        clearTimeout(taskPollingRef.current)
      }
    }
  }, [container.status, container.taskId, container.id, updateContainer])

  useEffect(() => {
    return () => {
      // Cleanup polling timeouts on unmount
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current)
      }
      if (startTaskPollingRef.current) {
        clearTimeout(startTaskPollingRef.current)
      }
    }
  }, [])

  const handleStart = async () => {
    setIsStarting(true)
    setActiveTask({ id: '', type: 'start-container', status: 'pending', progress: 0, message: 'Iniciando...', createdAt: '' })

    const response = await apiClient.startContainer(container.id)

    if (!response.success) {
      setError(response.error || t.container.failedStart)
      setIsStarting(false)
      setActiveTask(null)
      return
    }

    // API returns taskId - poll that task for progress
    const taskId = response.data?.taskId
    if (!taskId) {
      // Fallback to old behavior if no taskId
      setIsStarting(false)
      setActiveTask(null)
      const containerResponse = await apiClient.getContainer(container.id)
      if (containerResponse.success && containerResponse.data) {
        updateContainer(container.id, containerResponse.data)
      }
      return
    }

    // Poll task for progress
    const pollStartTask = async () => {
      try {
        const taskResponse = await apiClient.getTask(taskId)
        if (taskResponse.success && taskResponse.data) {
          setActiveTask(taskResponse.data)

          if (taskResponse.data.status === 'completed') {
            // Fetch updated container
            const containerResponse = await apiClient.getContainer(container.id)
            if (containerResponse.success && containerResponse.data) {
              updateContainer(container.id, containerResponse.data)
            }
            setIsStarting(false)
            setActiveTask(null)
            return
          }

          if (taskResponse.data.status === 'failed') {
            setError(taskResponse.data.error || t.container.failedStart)
            setIsStarting(false)
            setActiveTask(null)
            return
          }
        }
        // Continue polling
        startTaskPollingRef.current = setTimeout(pollStartTask, 500)
      } catch (error) {
        console.error('Error polling start task:', error)
        startTaskPollingRef.current = setTimeout(pollStartTask, 1000)
      }
    }

    pollStartTask()
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
            {/* Progress bar for active operations (creating or starting) */}
            {activeTask && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-terminal-textMuted truncate max-w-[200px]">
                    {activeTask.message}
                  </span>
                  <span className="text-terminal-green font-mono ml-2">
                    {activeTask.progress}%
                  </span>
                </div>
                <div className="w-full bg-terminal-bg border border-terminal-border rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-terminal-green transition-all duration-300 ease-out"
                    style={{ width: `${activeTask.progress}%` }}
                  />
                </div>
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
