'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useMetrics } from '@/hooks/use-metrics'
import { useContainerStore } from '@/stores/container.store'
import { MetricsChart } from '@/components/metrics-chart'
import { InstructionQueue } from '@/components/instruction-queue'
import { ContainerDetailSkeleton } from '@/components/ui/skeleton'
import { AnimatedDots } from '@/components/ui/animated-dots'
import type { Container } from '@/lib/types'
import clsx from 'clsx'

type TabType = 'overview' | 'metrics' | 'instructions' | 'logs' | 'settings'

interface TabConfig {
  id: TabType
  name: string
  icon: React.ReactNode
}

const tabs: TabConfig[] = [
  {
    id: 'overview',
    name: 'Overview',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    id: 'metrics',
    name: 'Metrics',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
  {
    id: 'instructions',
    name: 'Instructions',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
    ),
  },
  {
    id: 'logs',
    name: 'Logs',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
]

export default function ContainerDetailPage() {
  const params = useParams()
  const containerId = params.id as string
  const [container, setContainer] = useState<Container | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [vscodeUrl, setVscodeUrl] = useState<string | null>(null)
  const { updateContainer } = useContainerStore()

  useMetrics(containerId)

  useEffect(() => {
    const fetchContainer = async () => {
      setIsLoading(true)
      setError(null)

      const response = await apiClient.getContainer(containerId)

      if (response.success && response.data) {
        setContainer(response.data)
      } else {
        setError(response.error || 'Failed to fetch container')
      }

      setIsLoading(false)
    }

    fetchContainer()

    const interval = setInterval(fetchContainer, 5000)
    return () => clearInterval(interval)
  }, [containerId])

  const handleStart = async () => {
    if (!container) return

    updateContainer(container.id, { status: 'creating' })
    const response = await apiClient.startContainer(container.id)

    if (!response.success) {
      setError(response.error || 'Failed to start container')
      updateContainer(container.id, { status: 'stopped' })
    }
  }

  const handleStop = async () => {
    if (!container) return

    updateContainer(container.id, { status: 'stopped' })
    const response = await apiClient.stopContainer(container.id)

    if (!response.success) {
      setError(response.error || 'Failed to stop container')
      updateContainer(container.id, { status: 'running' })
    }
  }

  const handleRestart = async () => {
    if (!container) return

    updateContainer(container.id, { status: 'creating' })
    const response = await apiClient.restartContainer(container.id)

    if (!response.success) {
      setError(response.error || 'Failed to restart container')
    }
  }

  const handleOpenVSCode = async () => {
    if (!container) return

    const response = await apiClient.openVSCode(container.id)
    if (response.success && response.data?.url) {
      setVscodeUrl(response.data.url)
      setActiveTab('overview')
    } else {
      setError(response.error || 'Failed to open VS Code')
    }
  }

  if (isLoading) {
    return <ContainerDetailSkeleton />
  }

  if (error && !container) {
    return (
      <div className="card p-6">
        <div className="text-center text-danger-600">
          <svg
            className="mx-auto h-12 w-12 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3 className="text-lg font-semibold mb-2">Error Loading Container</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!container) {
    return null
  }

  const statusColors = {
    running: 'badge-success',
    stopped: 'badge-gray',
    creating: 'badge-warning',
    error: 'badge-danger',
  }

  const templateColors = {
    claude: 'badge-primary',
    vscode: 'badge-warning',
    both: 'badge-success',
  }

  const modeColors = {
    interactive: 'badge-primary',
    autonomous: 'badge-warning',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {container.name}
            </h2>
            <span className={clsx('badge', statusColors[container.status])}>
              {container.status}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={clsx('badge', templateColors[container.template])}>
              {container.template}
            </span>
            <span className={clsx('badge', modeColors[container.mode])}>
              {container.mode}
            </span>
            {container.repositoryUrl && (
              <a
                href={container.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="badge badge-gray hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Repository
              </a>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {container.status === 'running' ? (
            <>
              <button onClick={handleStop} className="btn-secondary">
                Stop
              </button>
              <button onClick={handleRestart} className="btn-secondary">
                Restart
              </button>
            </>
          ) : (
            <button
              onClick={handleStart}
              className="btn-primary"
              disabled={container.status === 'creating'}
            >
              {container.status === 'creating' ? <AnimatedDots text="Starting" /> : 'Start'}
            </button>
          )}
          {(container.template === 'vscode' || container.template === 'both') && (
            <button
              onClick={handleOpenVSCode}
              className="btn-secondary"
              disabled={container.status !== 'running'}
            >
              VS Code
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-lg p-4">
          <p className="text-sm text-danger-800 dark:text-danger-200">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              )}
            >
              {tab.icon}
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                CPU Usage
              </h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {(container.metrics?.cpu ?? 0).toFixed(1)}%
              </p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
                <div
                  className={clsx(
                    'h-2 rounded-full transition-all',
                    (container.metrics?.cpu ?? 0) > 80
                      ? 'bg-danger-600'
                      : (container.metrics?.cpu ?? 0) > 60
                      ? 'bg-warning-600'
                      : 'bg-success-600'
                  )}
                  style={{ width: `${Math.min(container.metrics?.cpu ?? 0, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {container.limits?.cpuCores ?? 0} cores allocated
              </p>
            </div>

            <div className="card p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Memory Usage
              </h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {(container.metrics?.memory ?? 0).toFixed(0)} MB
              </p>
              {(() => {
                const memLimit = container.limits?.memoryMB ?? 1
                const memPercent = memLimit > 0 ? ((container.metrics?.memory ?? 0) / memLimit) * 100 : 0
                return (
                  <>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
                      <div
                        className={clsx(
                          'h-2 rounded-full transition-all',
                          memPercent > 80
                            ? 'bg-danger-600'
                            : memPercent > 60
                            ? 'bg-warning-600'
                            : 'bg-success-600'
                        )}
                        style={{ width: `${Math.min(memPercent, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {container.limits?.memoryMB ?? 0} MB limit
                    </p>
                  </>
                )
              })()}
            </div>

            <div className="card p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Disk Usage
              </h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {(container.metrics?.disk ?? 0).toFixed(2)} GB
              </p>
              {(() => {
                const diskLimit = container.limits?.diskGB ?? 1
                const diskPercent = diskLimit > 0 ? ((container.metrics?.disk ?? 0) / diskLimit) * 100 : 0
                return (
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
                    <div
                      className={clsx(
                        'h-2 rounded-full transition-all',
                        diskPercent > 80
                          ? 'bg-danger-600'
                          : diskPercent > 60
                          ? 'bg-warning-600'
                          : 'bg-success-600'
                      )}
                      style={{ width: `${Math.min(diskPercent, 100)}%` }}
                    />
                  </div>
                )
              })()}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {container.limits?.diskGB ?? 0} GB limit
              </p>
            </div>
          </div>

          {/* VS Code Embed */}
          {vscodeUrl && container.status === 'running' && (
            <div className="card overflow-hidden">
              <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    VS Code Web
                  </span>
                </div>
                <a
                  href={vscodeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
                >
                  Open in new tab
                </a>
              </div>
              <iframe
                src={vscodeUrl}
                className="w-full h-[600px] border-0"
                title="VS Code"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
            </div>
          )}

          {/* Container Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Container Info
              </h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-600 dark:text-gray-400">ID</dt>
                  <dd className="text-sm text-gray-900 dark:text-white font-mono">
                    {container.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Created At
                  </dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    {new Date(container.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Active Agents
                  </dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    {container.activeAgents}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Queue Length
                  </dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    {container.queueLength}
                  </dd>
                </div>
              </dl>
            </div>

            <InstructionQueue containerId={container.id} />
          </div>
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Real-time Metrics
            </h3>
            <MetricsChart container={container} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card p-6">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
                Resource Limits
              </h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">CPU Cores</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">
                    {container.limits?.cpuCores ?? 0}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Memory</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">
                    {container.limits?.memoryMB ?? 0} MB
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Disk</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">
                    {container.limits?.diskGB ?? 0} GB
                  </dd>
                </div>
              </dl>
            </div>

            <div className="card p-6">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
                Current Usage
              </h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">CPU</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">
                    {(container.metrics?.cpu ?? 0).toFixed(1)}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Memory</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">
                    {(container.metrics?.memory ?? 0).toFixed(0)} MB
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Disk</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">
                    {(container.metrics?.disk ?? 0).toFixed(2)} GB
                  </dd>
                </div>
              </dl>
            </div>

            <div className="card p-6">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
                Usage Percentage
              </h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">CPU</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">
                    {(container.metrics?.cpu ?? 0).toFixed(1)}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Memory</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">
                    {(() => {
                      const memLimit = container.limits?.memoryMB ?? 1
                      return memLimit > 0 ? (((container.metrics?.memory ?? 0) / memLimit) * 100).toFixed(1) : '0.0'
                    })()}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Disk</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">
                    {(() => {
                      const diskLimit = container.limits?.diskGB ?? 1
                      return diskLimit > 0 ? (((container.metrics?.disk ?? 0) / diskLimit) * 100).toFixed(1) : '0.0'
                    })()}%
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'instructions' && (
        <div className="max-w-3xl">
          <InstructionQueue containerId={container.id} />
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Container Logs
          </h3>
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-100 h-96 overflow-y-auto">
            <p className="text-gray-500">
              [Log streaming will be implemented with WebSocket connection]
            </p>
            <p className="text-gray-400 mt-2">
              {new Date().toISOString()} - Container {container.name} is {container.status}
            </p>
            <p className="text-gray-400">
              {new Date().toISOString()} - CPU: {(container.metrics?.cpu ?? 0).toFixed(1)}% | Memory:{' '}
              {(container.metrics?.memory ?? 0).toFixed(0)} MB
            </p>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Container Settings
            </h3>
            <div className="space-y-4">
              <div>
                <label className="label">Container Name</label>
                <input
                  type="text"
                  className="input"
                  value={container.name}
                  readOnly
                  disabled
                />
              </div>
              <div>
                <label className="label">Template</label>
                <input
                  type="text"
                  className="input"
                  value={container.template}
                  readOnly
                  disabled
                />
              </div>
              <div>
                <label className="label">Mode</label>
                <input
                  type="text"
                  className="input"
                  value={container.mode}
                  readOnly
                  disabled
                />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Resource Limits
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">CPU Cores</label>
                <input
                  type="number"
                  className="input"
                  value={container.limits.cpuCores}
                  readOnly
                  disabled
                />
              </div>
              <div>
                <label className="label">Memory (MB)</label>
                <input
                  type="number"
                  className="input"
                  value={container.limits.memoryMB}
                  readOnly
                  disabled
                />
              </div>
              <div>
                <label className="label">Disk (GB)</label>
                <input
                  type="number"
                  className="input"
                  value={container.limits.diskGB}
                  readOnly
                  disabled
                />
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
              Resource limits cannot be modified while the container is running.
            </p>
          </div>

          <div className="card p-6 border-danger-200 dark:border-danger-800">
            <h3 className="text-lg font-semibold text-danger-600 dark:text-danger-400 mb-4">
              Danger Zone
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Once you delete a container, there is no going back. Please be certain.
            </p>
            <button className="btn-danger">Delete Container</button>
          </div>
        </div>
      )}
    </div>
  )
}
