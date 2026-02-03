'use client'

import { useState } from 'react'
import type { Container } from '@/lib/types'
import { apiClient } from '@/lib/api-client'
import { useContainerStore } from '@/stores/container.store'
import { useI18n } from '@/lib/i18n'
import clsx from 'clsx'

interface ContainerCardProps {
  container: Container
}

export function ContainerCard({ container }: ContainerCardProps) {
  const { t } = useI18n()
  const [isDeleting, setIsDeleting] = useState(false)
  const { updateContainer, removeContainer, setError } = useContainerStore()

  const handleStart = async () => {
    updateContainer(container.id, { status: 'creating' })
    const response = await apiClient.startContainer(container.id)

    if (!response.success) {
      setError(response.error || t.container.failedStart)
      updateContainer(container.id, { status: 'stopped' })
    }
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

  const cpuPercent = container.metrics.cpu
  const memoryPercent = (container.metrics.memory / container.limits.memoryMB) * 100
  const diskPercent = (container.metrics.disk / container.limits.diskGB) * 100

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
              {container.metrics.cpu.toFixed(1)}% / {container.limits.cpuCores} {t.container.cores}
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
              {container.metrics.memory.toFixed(0)} MB / {container.limits.memoryMB} MB
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
            <span className="font-medium text-terminal-text">
              {container.metrics.disk.toFixed(2)} GB / {container.limits.diskGB} GB
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
              disabled={isDeleting || container.status === 'creating'}
            >
              {container.status === 'creating' ? t.container.starting : t.container.start}
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
            {isDeleting ? t.container.deleting : t.container.delete}
          </button>
        </div>
      </div>
    </div>
  )
}
