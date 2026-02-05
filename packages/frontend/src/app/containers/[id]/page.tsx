'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { apiClient } from '@/lib/api-client'
import { useMetrics } from '@/hooks/use-metrics'
import { useContainerStore } from '@/stores/container.store'
import { useClaudeChatStore, getProcessingState, getHasNotification } from '@/stores/claude-chat.store'
import { useI18n } from '@/lib/i18n'
import { MetricsChart } from '@/components/metrics-chart'
import { InstructionQueue } from '@/components/instruction-queue'
import { DiskMetricsCard } from '@/components/disk-metrics-card'
import { CpuMetricsCard } from '@/components/cpu-metrics-card'
import { UsageStatsCard } from '@/components/usage-stats-card'
import { ContainerDetailSkeleton } from '@/components/ui/skeleton'
import { AnimatedDots } from '@/components/ui/animated-dots'
import type { Container } from '@/lib/types'
import clsx from 'clsx'

interface ResourceLimitsForm {
  cpuCores: number
  memoryMB: number
  diskGB: number
}

const InteractiveTerminal = dynamic(
  () => import('@/components/interactive-terminal').then(mod => mod.InteractiveTerminal),
  { ssr: false, loading: () => <LoadingPlaceholder textKey="terminal" /> }
)

const ClaudeChat = dynamic(
  () => import('@/components/claude-chat').then(mod => mod.ClaudeChat),
  { ssr: false, loading: () => <LoadingPlaceholder textKey="claude" /> }
)

const ContainerLogs = dynamic(
  () => import('@/components/container-logs').then(mod => mod.ContainerLogs),
  { ssr: false, loading: () => <LoadingPlaceholder textKey="terminal" /> }
)

const IDEView = dynamic(
  () => import('@/components/ide-view').then(mod => mod.IDEView),
  { ssr: false, loading: () => <LoadingPlaceholder textKey="terminal" /> }
)

function LoadingPlaceholder({ textKey }: { textKey: 'terminal' | 'claude' }) {
  const { t } = useI18n()
  const text = textKey === 'terminal' ? t.containerDetail.loadingTerminal : t.containerDetail.loadingClaudeChat
  return <div className="card p-6 text-center"><AnimatedDots text={text} /></div>
}

type TabType = 'overview' | 'ide' | 'metrics' | 'instructions' | 'logs' | 'terminal' | 'claudeCode' | 'settings'

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
    id: 'ide',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
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
    id: 'claudeCode',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
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
  const [vscodeUrl, setVscodeUrl] = useState<string | null>(null)
  const { updateContainer, containers, addContainer } = useContainerStore()

  // Claude processing state for notification badge
  const claudeProcessingState = useClaudeChatStore((state) => getProcessingState(state, containerId))
  const hasClaudeNotification = useClaudeChatStore((state) => getHasNotification(state, containerId))
  const setHasNotification = useClaudeChatStore((state) => state.setHasNotification)
  const prevIsProcessingRef = useRef(claudeProcessingState.isProcessing)

  // Track when Claude finishes processing while on another tab
  useEffect(() => {
    const wasProcessing = prevIsProcessingRef.current
    const isProcessing = claudeProcessingState.isProcessing

    // If just finished processing and we're not on the Claude tab, show notification
    if (wasProcessing && !isProcessing && activeTab !== 'claudeCode') {
      setHasNotification(containerId, true)
    }

    prevIsProcessingRef.current = isProcessing
  }, [claudeProcessingState.isProcessing, activeTab, containerId, setHasNotification])

  // Clear notification when switching to Claude tab
  useEffect(() => {
    if (activeTab === 'claudeCode' && hasClaudeNotification) {
      setHasNotification(containerId, false)
    }
  }, [activeTab, hasClaudeNotification, containerId, setHasNotification])

  // Resource limits editor state
  const [isEditingLimits, setIsEditingLimits] = useState(false)
  const [isSavingLimits, setIsSavingLimits] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [saveProgress, setSaveProgress] = useState<string | null>(null)
  const [limitsForm, setLimitsForm] = useState<ResourceLimitsForm>({
    cpuCores: 1,
    memoryMB: 2048,
    diskGB: 20,
  })
  const [limitsError, setLimitsError] = useState<string | null>(null)
  const [limitsSuccess, setLimitsSuccess] = useState<string | null>(null)

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

  // Add container to store when loaded from API (so WebSocket updates can find it)
  useEffect(() => {
    if (containerBase && !storeContainer) {
      addContainer(containerBase)
    }
  }, [containerBase, storeContainer, addContainer])

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
      setActiveTab('ide')
    } else {
      setError(response.error || t.container.failedVscode)
    }
  }

  // Auto-fetch VS Code URL when IDE tab is selected and container is running
  useEffect(() => {
    if (activeTab === 'ide' && container?.status === 'running' && !vscodeUrl) {
      const fetchVSCodeUrl = async () => {
        const response = await apiClient.openVSCode(container.id)
        if (response.success && response.data?.url) {
          setVscodeUrl(response.data.url)
        }
      }
      fetchVSCodeUrl()
    }
  }, [activeTab, container?.id, container?.status, vscodeUrl])

  // Initialize limits form when container loads or when entering edit mode
  const startEditingLimits = useCallback(() => {
    if (container) {
      setLimitsForm({
        cpuCores: container.limits.cpuCores,
        memoryMB: container.limits.memoryMB,
        diskGB: container.limits.diskGB,
      })
      setLimitsError(null)
      setLimitsSuccess(null)
      setIsEditingLimits(true)
    }
  }, [container])

  const cancelEditingLimits = useCallback(() => {
    setIsEditingLimits(false)
    setLimitsError(null)
  }, [])

  // Validate limits form
  const validateLimitsForm = (): boolean => {
    if (limitsForm.cpuCores < 0.5 || limitsForm.cpuCores > 16) {
      setLimitsError(t.containerDetail.cpuRange)
      return false
    }
    if (limitsForm.memoryMB < 512 || limitsForm.memoryMB > 32768) {
      setLimitsError(t.containerDetail.memoryRange)
      return false
    }
    if (limitsForm.diskGB < 5 || limitsForm.diskGB > 500) {
      setLimitsError(t.containerDetail.diskRange)
      return false
    }
    return true
  }

  const handleSaveLimits = async () => {
    if (!container) return
    if (!validateLimitsForm()) return

    // If container is running, show confirmation modal
    if (container.status === 'running') {
      setShowConfirmModal(true)
      return
    }

    // Container is stopped, save directly
    await performSaveLimits(false)
  }

  // Perform the actual save (optionally stopping and restarting)
  const performSaveLimits = async (needsRestart: boolean) => {
    if (!container) return

    setIsSavingLimits(true)
    setLimitsError(null)
    setLimitsSuccess(null)
    setShowConfirmModal(false)

    try {
      // Step 1: Stop container if running
      if (needsRestart) {
        setSaveProgress(t.containerDetail.stoppingContainer)
        updateContainer(container.id, { status: 'stopped' })
        const stopResponse = await apiClient.stopContainer(container.id)
        if (!stopResponse.success) {
          throw new Error(stopResponse.error || t.container.failedStop)
        }
        // Wait a moment for container to fully stop
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // Step 2: Apply new limits
      setSaveProgress(t.containerDetail.applyingChanges)
      const response = await apiClient.updateContainerLimits(container.id, {
        cpuCores: limitsForm.cpuCores,
        memoryMB: limitsForm.memoryMB,
        diskGB: limitsForm.diskGB,
      })

      if (!response.success || !response.data) {
        throw new Error(response.error || t.containerDetail.limitsUpdateFailed)
      }

      // Update local container state
      setContainerBase(prev => prev ? {
        ...prev,
        limits: {
          cpuCores: response.data!.limits.cpuCores,
          memoryMB: response.data!.limits.memoryMB,
          diskGB: response.data!.limits.diskGB,
        }
      } : null)

      // Step 3: Restart container if it was running
      if (needsRestart) {
        setSaveProgress(t.containerDetail.restartingContainer)
        updateContainer(container.id, { status: 'creating' })
        const startResponse = await apiClient.startContainer(container.id)
        if (!startResponse.success) {
          // Don't throw - limits were saved, just couldn't restart
          setLimitsError(t.container.failedStart)
        } else {
          // Wait for container to be fully running and refresh data
          await new Promise(resolve => setTimeout(resolve, 2000))

          // Reload complete container data from API
          const refreshResponse = await apiClient.getContainer(container.id)
          if (refreshResponse.success && refreshResponse.data) {
            setContainerBase(refreshResponse.data)
            updateContainer(container.id, {
              status: refreshResponse.data.status,
              dockerId: refreshResponse.data.dockerId,
            })
          }
        }
      }

      setLimitsSuccess(t.containerDetail.limitsUpdated)
      setIsEditingLimits(false)
      setTimeout(() => setLimitsSuccess(null), 3000)
    } catch (err) {
      setLimitsError(err instanceof Error ? err.message : t.containerDetail.limitsUpdateFailed)
    } finally {
      setIsSavingLimits(false)
      setSaveProgress(null)
    }
  }

  const handleLimitsFormChange = (field: keyof ResourceLimitsForm, value: number) => {
    setLimitsForm(prev => ({ ...prev, [field]: value }))
    setLimitsError(null)
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
                'relative flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === tab.id
                  ? 'border-terminal-green text-terminal-green'
                  : 'border-transparent text-terminal-textMuted hover:text-terminal-text hover:border-terminal-border'
              )}
            >
              {tab.icon}
              {getTabName(tab.id)}
              {/* Notification badge for Claude Code tab */}
              {tab.id === 'claudeCode' && hasClaudeNotification && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-terminal-green rounded-full animate-pulse" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
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

            <UsageStatsCard
              containerId={container.id}
              containerStatus={container.status}
            />
          </div>


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

      {/* IDE Tab - VS Code (uses CSS hidden to preserve iframe state across tab switches) */}
      <div className={clsx('card overflow-hidden', activeTab !== 'ide' && 'hidden')} style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
        {vscodeUrl ? (
          <IDEView
            vscodeUrl={vscodeUrl}
            containerStatus={container.status}
            containerId={containerId}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <svg className="mx-auto h-16 w-16 text-terminal-textMuted mb-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
              </svg>
              <h3 className="text-lg font-semibold text-terminal-text mb-2">VS Code não iniciado</h3>
              <p className="text-sm text-terminal-textMuted mb-4">Clique no botão abaixo para abrir o VS Code</p>
              <button
                onClick={handleOpenVSCode}
                className="btn-primary"
                disabled={container.status !== 'running'}
              >
                {t.container.vscode}
              </button>
            </div>
          </div>
        )}
      </div>

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
        <div className="card overflow-hidden" style={{ height: 'calc(100vh - 340px)', minHeight: '400px' }}>
          {container.status === 'running' ? (
            <ContainerLogs containerId={container.id} className="h-full" />
          ) : (
            <div className="p-6 text-center">
              <svg className="mx-auto h-12 w-12 text-terminal-textMuted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-semibold text-terminal-text mb-2">{t.containerDetail.logsUnavailable}</h3>
              <p className="text-sm text-terminal-textMuted">{t.containerDetail.startContainerForLogs}</p>
            </div>
          )}
        </div>
      )}

      {/* Terminal Tab - Shell only, use CSS hidden to preserve state */}
      <div className={clsx('card overflow-hidden', activeTab !== 'terminal' && 'hidden')} style={{ height: 'calc(100vh - 340px)', minHeight: '400px' }}>
        {container.status === 'running' ? (
          <InteractiveTerminal containerId={container.id} onClose={() => setActiveTab('overview')} className="h-full" />
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

      {/* Claude Code Tab - Uses CSS hidden to preserve state across tab switches (like Terminal/IDE) */}
      <div className={clsx('card overflow-hidden', activeTab !== 'claudeCode' && 'hidden')} style={{ height: 'calc(100vh - 340px)', minHeight: '400px' }}>
        {container.status === 'running' ? (
          <ClaudeChat containerId={container.id} />
        ) : (
          <div className="p-6 text-center">
            <svg className="mx-auto h-12 w-12 text-terminal-textMuted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-terminal-text mb-2">{t.claudeChat.title} {t.containerDetail.terminalUnavailable.toLowerCase()}</h3>
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-terminal-text">{t.containerDetail.resourceLimitsTitle}</h3>
              {!isEditingLimits && (
                <button
                  onClick={startEditingLimits}
                  className="btn-secondary text-sm"
                >
                  <svg className="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  {t.containerDetail.editLimits}
                </button>
              )}
            </div>

            {/* Success message */}
            {limitsSuccess && (
              <div className="mb-4 p-3 bg-terminal-green/10 border border-terminal-green/30 rounded-lg">
                <p className="text-sm text-terminal-green flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {limitsSuccess}
                </p>
              </div>
            )}

            {/* Error message */}
            {limitsError && (
              <div className="mb-4 p-3 bg-terminal-red/10 border border-terminal-red/30 rounded-lg">
                <p className="text-sm text-terminal-red">{limitsError}</p>
              </div>
            )}

            {isEditingLimits ? (
              /* Edit Mode */
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* CPU Cores */}
                  <div>
                    <label className="label">{t.containerDetail.cpuCores}</label>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min="0.5"
                        max="16"
                        step="0.5"
                        value={limitsForm.cpuCores}
                        onChange={(e) => handleLimitsFormChange('cpuCores', parseFloat(e.target.value))}
                        className="w-full h-2 bg-terminal-border rounded-lg appearance-none cursor-pointer accent-terminal-green"
                        disabled={isSavingLimits}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0.5"
                          max="16"
                          step="0.5"
                          value={limitsForm.cpuCores}
                          onChange={(e) => handleLimitsFormChange('cpuCores', parseFloat(e.target.value) || 0.5)}
                          className="input w-24"
                          disabled={isSavingLimits}
                        />
                        <span className="text-xs text-terminal-textMuted">{t.containerDetail.cpuRange}</span>
                      </div>
                    </div>
                  </div>

                  {/* Memory MB */}
                  <div>
                    <label className="label">{t.containerDetail.memoryMb}</label>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min="512"
                        max="32768"
                        step="256"
                        value={limitsForm.memoryMB}
                        onChange={(e) => handleLimitsFormChange('memoryMB', parseInt(e.target.value))}
                        className="w-full h-2 bg-terminal-border rounded-lg appearance-none cursor-pointer accent-terminal-green"
                        disabled={isSavingLimits}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="512"
                          max="32768"
                          step="256"
                          value={limitsForm.memoryMB}
                          onChange={(e) => handleLimitsFormChange('memoryMB', parseInt(e.target.value) || 512)}
                          className="input w-24"
                          disabled={isSavingLimits}
                        />
                        <span className="text-xs text-terminal-textMuted">{t.containerDetail.memoryRange}</span>
                      </div>
                    </div>
                  </div>

                  {/* Disk GB */}
                  <div>
                    <label className="label">{t.containerDetail.diskGb}</label>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min="5"
                        max="500"
                        step="1"
                        value={limitsForm.diskGB}
                        onChange={(e) => handleLimitsFormChange('diskGB', parseInt(e.target.value))}
                        className="w-full h-2 bg-terminal-border rounded-lg appearance-none cursor-pointer accent-terminal-green"
                        disabled={isSavingLimits}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="5"
                          max="500"
                          step="1"
                          value={limitsForm.diskGB}
                          onChange={(e) => handleLimitsFormChange('diskGB', parseInt(e.target.value) || 5)}
                          className="input w-24"
                          disabled={isSavingLimits}
                        />
                        <span className="text-xs text-terminal-textMuted">{t.containerDetail.diskRange}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-2 pt-4 border-t border-terminal-border">
                  <button
                    onClick={cancelEditingLimits}
                    className="btn-secondary"
                    disabled={isSavingLimits}
                  >
                    {t.containerDetail.cancelEdit}
                  </button>
                  <button
                    onClick={handleSaveLimits}
                    className="btn-primary"
                    disabled={isSavingLimits}
                  >
                    {isSavingLimits ? (
                      <AnimatedDots text={t.common.loading} />
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t.containerDetail.saveLimits}
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="label">{t.containerDetail.cpuCores}</label>
                    <div className="input bg-terminal-bgLight cursor-not-allowed">{container.limits.cpuCores}</div>
                  </div>
                  <div>
                    <label className="label">{t.containerDetail.memoryMb}</label>
                    <div className="input bg-terminal-bgLight cursor-not-allowed">{container.limits.memoryMB}</div>
                  </div>
                  <div>
                    <label className="label">{t.containerDetail.diskGb}</label>
                    <div className="input bg-terminal-bgLight cursor-not-allowed">{container.limits.diskGB}</div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="card p-6 border-terminal-red/30">
            <h3 className="text-lg font-semibold text-terminal-red mb-4">{t.containerDetail.dangerZone}</h3>
            <p className="text-sm text-terminal-textMuted mb-4">{t.containerDetail.dangerZoneWarning}</p>
            <button className="btn-danger">{t.containerDetail.deleteContainer}</button>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Resource Limits */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 max-w-md mx-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-terminal-yellow/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-terminal-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-terminal-text">{t.containerDetail.confirmSaveTitle}</h3>
            </div>

            <p className="text-sm text-terminal-text mb-3">{t.containerDetail.confirmSaveMessage}</p>
            <p className="text-sm text-terminal-yellow mb-4 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {t.containerDetail.confirmSaveWarning}
            </p>

            {/* Show progress during save */}
            {saveProgress && (
              <div className="mb-4 p-3 bg-terminal-cyan/10 border border-terminal-cyan/30 rounded-lg">
                <p className="text-sm text-terminal-cyan flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {saveProgress}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="btn-secondary"
                disabled={isSavingLimits}
              >
                {t.containerDetail.cancelButton}
              </button>
              <button
                onClick={() => performSaveLimits(true)}
                className="btn-warning"
                disabled={isSavingLimits}
              >
                {isSavingLimits ? (
                  <AnimatedDots text={saveProgress || t.common.loading} />
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {t.containerDetail.confirmSaveButton}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
