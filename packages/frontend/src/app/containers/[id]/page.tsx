'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { apiClient } from '@/lib/api-client'
import { useMetrics } from '@/hooks/use-metrics'
import { useContainerStore } from '@/stores/container.store'
import { useI18n } from '@/lib/i18n'
import { MetricsChart } from '@/components/metrics-chart'
import { InstructionQueue } from '@/components/instruction-queue'
import { DiskMetricsCard } from '@/components/disk-metrics-card'
import { CpuMetricsCard } from '@/components/cpu-metrics-card'
import { ContainerDetailSkeleton } from '@/components/ui/skeleton'
import { AnimatedDots } from '@/components/ui/animated-dots'
import type { Container } from '@/lib/types'
import clsx from 'clsx'

const InteractiveTerminal = dynamic(
  () => import('@/components/interactive-terminal').then(mod => mod.InteractiveTerminal),
  { ssr: false, loading: () => <LoadingPlaceholder textKey="terminal" /> }
)

const ClaudeChat = dynamic(
  () => import('@/components/claude-chat').then(mod => mod.ClaudeChat),
  { ssr: false, loading: () => <LoadingPlaceholder textKey="claude" /> }
)

const ClaudeCodeLogs = dynamic(
  () => import('@/components/claude-code-logs').then(mod => mod.ClaudeCodeLogs),
  { ssr: false, loading: () => <LoadingPlaceholder textKey="terminal" /> }
)

function LoadingPlaceholder({ textKey }: { textKey: 'terminal' | 'claude' }) {
  const { t } = useI18n()
  const text = textKey === 'terminal' ? t.containerDetail.loadingTerminal : t.containerDetail.loadingClaudeChat
  return <div className="card p-6 text-center"><AnimatedDots text={text} /></div>
}

type TabType = 'overview' | 'metrics' | 'instructions' | 'logs' | 'terminal' | 'settings'
type TerminalSubTab = 'shell' | 'claude'

interface TabConfig {
  id: TabType
  icon: React.ReactNode
}

const tabConfigs: TabConfig[] = [
  {
    id: 'overview',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'metrics',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'instructions',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    id: 'logs',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'terminal',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'settings',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

export default function ContainerDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { t } = useI18n()
  const containerId = params.id as string
  const initialTab = (searchParams.get('tab') as TabType) || 'overview'
  const [containerBase, setContainerBase] = useState<Container | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [terminalSubTab, setTerminalSubTab] = useState<TerminalSubTab>('shell')
  const [vscodeUrl, setVscodeUrl] = useState<string | null>(null)
  const { updateContainer, containers } = useContainerStore()

  // Get real-time metrics from store (updated via WebSocket)
  const storeContainer = useMemo(() => {
    return containers.find(c => c.id === containerId)
  }, [containers, containerId])

  // Merge base container data with real-time metrics from store
  const container = useMemo(() => {
    if (!containerBase) return null
    if (storeContainer?.metrics) {
      return {
        ...containerBase,
        metrics: storeContainer.metrics,
        status: storeContainer.status || containerBase.status,
      }
    }
    return containerBase
  }, [containerBase, storeContainer])

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') as TabType | null
    if (tabFromUrl && tabConfigs.some(tc => tc.id === tabFromUrl)) {
      setActiveTab(tabFromUrl)
    }
  }, [searchParams])

  useMetrics(containerId)

  useEffect(() => {
    const fetchContainer = async () => {
      setIsLoading(true)
      setError(null)

      const response = await apiClient.getContainer(containerId)

      if (response.success && response.data) {
        setContainerBase(response.data)
      } else {
        setError(response.error || t.containerDetail.containerNotFound)
      }

      setIsLoading(false)
    }

    fetchContainer()
  }, [containerId, t.containerDetail.containerNotFound])

  const handleStart = async () => {
    if (!container) return
    updateContainer(container.id, { status: 'creating' })
    const response = await apiClient.startContainer(container.id)
    if (!response.success) {
      setError(response.error || t.container.failedStart)
      updateContainer(container.id, { status: 'stopped' })
    }
  }

  const handleStop = async () => {
    if (!container) return
    updateContainer(container.id, { status: 'stopped' })
    const response = await apiClient.stopContainer(container.id)
    if (!response.success) {
      setError(response.error || t.container.failedStop)
      updateContainer(container.id, { status: 'running' })
    }
  }

  const handleRestart = async () => {
    if (!container) return
    updateContainer(container.id, { status: 'creating' })
    const response = await apiClient.restartContainer(container.id)
    if (!response.success) {
      setError(response.error || t.container.failedStart)
    }
  }

  const handleOpenVSCode = async () => {
    if (!container) return
    const response = await apiClient.openVSCode(container.id)
    if (response.success && response.data?.url) {
      setVscodeUrl(response.data.url)
      setActiveTab('overview')
    } else {
      setError(response.error || t.container.failedVscode)
    }
  }

  const getTabName = (id: TabType): string => {
    return t.containerDetail.tabs[id]
  }

  if (isLoading) {
    return <ContainerDetailSkeleton />
  }

  if (error && !container) {
    return (
      <div className="card p-6">
        <div className="text-center text-terminal-red">
          <svg className="mx-auto h-12 w-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-semibold mb-2">{t.containerDetail.errorLoading}</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!container) {
    return null
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
            <h2 className="text-2xl font-bold text-terminal-text">{container.name}</h2>
            <span className={clsx('badge', statusColors[container.status])}>
              {t.status[container.status as keyof typeof t.status] || container.status}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={clsx('badge', templateColors[container.template])}>
              {t.templates[container.template]}
            </span>
            <span className={clsx('badge', modeColors[container.mode])}>
              {t.modes[container.mode]}
            </span>
            {container.repositoryUrl && (
              <a
                href={container.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="badge badge-gray hover:bg-terminal-border transition-colors"
              >
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                {t.containerDetail.repository}
              </a>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {container.status === 'running' ? (
            <>
              <button onClick={handleStop} className="btn-secondary">{t.container.stop}</button>
              <button onClick={handleRestart} className="btn-secondary">{t.container.restart}</button>
            </>
          ) : (
            <button
              onClick={handleStart}
              className="btn-primary"
              disabled={container.status === 'creating'}
            >
              {container.status === 'creating' ? <AnimatedDots text={t.container.starting} /> : t.container.start}
            </button>
          )}
          {(container.template === 'vscode' || container.template === 'both') && (
            <button onClick={handleOpenVSCode} className="btn-secondary" disabled={container.status !== 'running'}>
              {t.container.vscode}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-terminal-red/10 border border-terminal-red/30 rounded-lg p-4">
          <p className="text-sm text-terminal-red">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-terminal-border">
        <nav className="-mb-px flex space-x-8">
          {tabConfigs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === tab.id
                  ? 'border-terminal-green text-terminal-green'
                  : 'border-transparent text-terminal-textMuted hover:text-terminal-text hover:border-terminal-border'
              )}
            >
              {tab.icon}
              {getTabName(tab.id)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <CpuMetricsCard
              containerId={container.id}
              cpuUsage={container.metrics?.cpu ?? 0}
              cpuLimit={container.limits?.cpuCores ?? 1}
              containerStatus={container.status}
              perCore={container.metrics?.cpuPerCore}
            />

            <div className="card p-6">
              <h3 className="text-sm font-medium text-terminal-textMuted mb-1">{t.containerDetail.memoryUsage}</h3>
              <p className="text-2xl font-bold text-terminal-text">{(container.metrics?.memory ?? 0).toFixed(0)} MB</p>
              {(() => {
                const memLimit = container.limits?.memoryMB ?? 1
                const memPercent = memLimit > 0 ? ((container.metrics?.memory ?? 0) / memLimit) * 100 : 0
                return (
                  <>
                    <div className="w-full bg-terminal-border rounded-full h-2 mt-2">
                      <div className={clsx('h-2 rounded-full transition-all', memPercent > 80 ? 'bg-terminal-red' : memPercent > 60 ? 'bg-terminal-yellow' : 'bg-terminal-green')} style={{ width: `${Math.min(memPercent, 100)}%` }} />
                    </div>
                    <p className="text-xs text-terminal-textMuted mt-1">{container.limits?.memoryMB ?? 0} {t.containerDetail.mbLimit}</p>
                  </>
                )
              })()}
            </div>

            <DiskMetricsCard
              containerId={container.id}
              containerName={container.name}
              diskUsageGB={container.metrics?.disk ?? 0}
              diskLimitGB={container.limits?.diskGB ?? 10}
              containerStatus={container.status}
            />
          </div>

          {/* VS Code Embed */}
          {vscodeUrl && container.status === 'running' && (
            <div className="card overflow-hidden">
              <div className="bg-terminal-bgLight px-4 py-2 flex items-center justify-between border-b border-terminal-border">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
                  </svg>
                  <span className="text-sm font-medium text-terminal-text">{t.containerDetail.vscodeWeb}</span>
                </div>
                <a href={vscodeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400">
                  {t.containerDetail.openInNewTab}
                </a>
              </div>
              <iframe src={vscodeUrl} className="w-full h-[600px] border-0" title="VS Code" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
            </div>
          )}

          {/* Container Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-terminal-text mb-4">{t.containerDetail.containerInfo}</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-terminal-textMuted">{t.containerDetail.containerId}</dt>
                  <dd className="text-sm text-terminal-text font-mono">{container.id}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-terminal-textMuted">{t.containerDetail.createdAt}</dt>
                  <dd className="text-sm text-terminal-text">{new Date(container.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-terminal-textMuted">{t.containerDetail.activeAgents}</dt>
                  <dd className="text-sm text-terminal-text">{container.activeAgents}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-terminal-textMuted">{t.containerDetail.queueLength}</dt>
                  <dd className="text-sm text-terminal-text">{container.queueLength}</dd>
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
            <h3 className="text-lg font-semibold text-terminal-text mb-4">{t.containerDetail.realTimeMetrics}</h3>
            <MetricsChart container={container} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card p-6">
              <h4 className="text-sm font-medium text-terminal-textMuted mb-3">{t.containerDetail.resourceLimits}</h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-terminal-textMuted">{t.containerDetail.cpuCores}</dt>
                  <dd className="text-sm font-medium text-terminal-text">{container.limits?.cpuCores ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-terminal-textMuted">{t.container.memory}</dt>
                  <dd className="text-sm font-medium text-terminal-text">{container.limits?.memoryMB ?? 0} MB</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-terminal-textMuted">{t.container.disk}</dt>
                  <dd className="text-sm font-medium text-terminal-text">{container.limits?.diskGB ?? 0} GB</dd>
                </div>
              </dl>
            </div>

            <div className="card p-6">
              <h4 className="text-sm font-medium text-terminal-textMuted mb-3">{t.containerDetail.currentUsage}</h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-terminal-textMuted">{t.container.cpu}</dt>
                  <dd className="text-sm font-medium text-terminal-text">{(container.metrics?.cpu ?? 0).toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-terminal-textMuted">{t.container.memory}</dt>
                  <dd className="text-sm font-medium text-terminal-text">{(container.metrics?.memory ?? 0).toFixed(0)} MB</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-terminal-textMuted">{t.container.disk}</dt>
                  <dd className="text-sm font-medium text-terminal-text">{(container.metrics?.disk ?? 0).toFixed(2)} GB</dd>
                </div>
              </dl>
            </div>

            <div className="card p-6">
              <h4 className="text-sm font-medium text-terminal-textMuted mb-3">{t.containerDetail.usagePercentage}</h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-terminal-textMuted">{t.container.cpu}</dt>
                  <dd className="text-sm font-medium text-terminal-text">{(container.metrics?.cpu ?? 0).toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-terminal-textMuted">{t.container.memory}</dt>
                  <dd className="text-sm font-medium text-terminal-text">
                    {(() => {
                      const memLimit = container.limits?.memoryMB ?? 1
                      return memLimit > 0 ? (((container.metrics?.memory ?? 0) / memLimit) * 100).toFixed(1) : '0.0'
                    })()}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-terminal-textMuted">{t.container.disk}</dt>
                  <dd className="text-sm font-medium text-terminal-text">
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
        <InstructionQueue containerId={container.id} />
      )}

      {activeTab === 'logs' && (
        <div className="card overflow-hidden">
          {container.status === 'running' ? (
            <ClaudeCodeLogs containerId={container.id} className="h-[600px]" />
          ) : (
            <div className="p-6 text-center">
              <svg className="mx-auto h-12 w-12 text-terminal-textMuted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-semibold text-terminal-text mb-2">{t.containerDetail.logsUnavailable || 'Logs indisponíveis'}</h3>
              <p className="text-sm text-terminal-textMuted">{t.containerDetail.startContainerForLogs || 'Inicie o container para ver os logs do Claude Code'}</p>
            </div>
          )}
        </div>
      )}

      {/* Terminal Tab - Use CSS hidden to preserve state */}
      <div className={clsx('card overflow-hidden', activeTab !== 'terminal' && 'hidden')}>
        {container.status === 'running' ? (
          <>
            {/* Sub-tabs for Terminal */}
            <div className="flex border-b border-terminal-border bg-terminal-bg">
              <button
                onClick={() => setTerminalSubTab('shell')}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2',
                  terminalSubTab === 'shell'
                    ? 'border-terminal-cyan text-terminal-cyan bg-terminal-bgLight'
                    : 'border-transparent text-terminal-textMuted hover:text-terminal-text hover:bg-terminal-bgLight/50'
                )}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {t.containerDetail.subTabs.shell}
              </button>
              <button
                onClick={() => setTerminalSubTab('claude')}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2',
                  terminalSubTab === 'claude'
                    ? 'border-terminal-cyan text-terminal-cyan bg-terminal-bgLight'
                    : 'border-transparent text-terminal-textMuted hover:text-terminal-text hover:bg-terminal-bgLight/50'
                )}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {t.containerDetail.subTabs.claudeCode}
              </button>
            </div>

            {/* Shell - Use CSS hidden to preserve terminal state */}
            <div className={clsx(terminalSubTab !== 'shell' && 'hidden')}>
              <InteractiveTerminal containerId={container.id} onClose={() => setActiveTab('overview')} className="h-[500px]" />
            </div>

            {/* Claude Chat - Use CSS hidden to preserve messages */}
            <div className={clsx('h-[500px]', terminalSubTab !== 'claude' && 'hidden')}>
              <ClaudeChat containerId={container.id} />
            </div>
          </>
        ) : (
          <div className="p-6 text-center">
            <svg className="mx-auto h-12 w-12 text-terminal-textMuted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-terminal-text mb-2">{t.containerDetail.terminalUnavailable}</h3>
            <p className="text-sm text-terminal-textMuted">{t.containerDetail.startContainerForTerminal}</p>
          </div>
        )}
      </div>

      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-terminal-text mb-4">{t.containerDetail.containerSettings}</h3>
            <div className="space-y-4">
              <div>
                <label className="label">{t.containerDetail.containerName}</label>
                <input type="text" className="input" value={container.name} readOnly disabled />
              </div>
              <div>
                <label className="label">{t.containerDetail.template}</label>
                <input type="text" className="input" value={container.template} readOnly disabled />
              </div>
              <div>
                <label className="label">{t.containerDetail.mode}</label>
                <input type="text" className="input" value={container.mode} readOnly disabled />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-terminal-text mb-4">{t.containerDetail.resourceLimitsTitle}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">{t.containerDetail.cpuCores}</label>
                <input type="number" className="input" value={container.limits.cpuCores} readOnly disabled />
              </div>
              <div>
                <label className="label">{t.containerDetail.memoryMb}</label>
                <input type="number" className="input" value={container.limits.memoryMB} readOnly disabled />
              </div>
              <div>
                <label className="label">{t.containerDetail.diskGb}</label>
                <input type="number" className="input" value={container.limits.diskGB} readOnly disabled />
              </div>
            </div>
            <p className="text-sm text-terminal-textMuted mt-4">{t.containerDetail.cannotModifyRunning}</p>
          </div>

          <div className="card p-6 border-terminal-red/30">
            <h3 className="text-lg font-semibold text-terminal-red mb-4">{t.containerDetail.dangerZone}</h3>
            <p className="text-sm text-terminal-textMuted mb-4">{t.containerDetail.dangerZoneWarning}</p>
            <button className="btn-danger">{t.containerDetail.deleteContainer}</button>
          </div>
        </div>
      )}
    </div>
  )
}
