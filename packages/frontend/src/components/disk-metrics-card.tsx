'use client'

import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import { apiClient } from '@/lib/api-client'
import { AnimatedDots } from '@/components/ui/animated-dots'
import { IncreaseDiskModal } from '@/components/increase-disk-modal'
import clsx from 'clsx'

interface DiskBreakdown {
  workspace: number
  nodeModules: number
  cache: number
  other: number
  total: number
}

interface DetailedDiskMetrics {
  usage: number
  limit: number
  percentage: number
  alertLevel: 'normal' | 'warning' | 'critical'
  breakdown: DiskBreakdown
  projectPath: string | null
  hasGitRepo: boolean
  collectedAt: string
}

interface DiskMetricsCardProps {
  containerId: string
  containerName: string
  diskUsageGB: number
  diskLimitGB: number
  containerStatus: string
}

export function DiskMetricsCard({
  containerId,
  containerName,
  diskUsageGB,
  diskLimitGB,
  containerStatus,
}: DiskMetricsCardProps) {
  const { t } = useI18n()
  const [detailedMetrics, setDetailedMetrics] = useState<DetailedDiskMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const diskPercent = diskLimitGB > 0 ? (diskUsageGB / diskLimitGB) * 100 : 0
  const isRunning = containerStatus === 'running'

  const fetchDetailedMetrics = useCallback(async () => {
    if (!isRunning) return

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.getDiskMetrics(containerId)
      if (response.success && response.data) {
        setDetailedMetrics(response.data)
      } else {
        setError(response.error || 'Falha ao carregar métricas')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar métricas')
    } finally {
      setLoading(false)
    }
  }, [containerId, isRunning])

  useEffect(() => {
    if (isExpanded && !detailedMetrics && !loading) {
      fetchDetailedMetrics()
    }
  }, [isExpanded, detailedMetrics, loading, fetchDetailedMetrics])

  const handleExpandSuccess = () => {
    setDetailedMetrics(null)
    fetchDetailedMetrics()
  }

  const formatSize = (mb: number): string => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`
    }
    return `${mb.toFixed(0)} MB`
  }

  const getBreakdownPercentage = (value: number, total: number): number => {
    if (total <= 0) return 0
    return (value / total) * 100
  }

  return (
    <>
      <div className="card p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium text-terminal-textMuted">{t.containerDetail.diskUsage}</h3>
          {isRunning && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-terminal-cyan hover:text-terminal-text transition-colors"
            >
              {isExpanded ? '▲' : '▼'} {t.disk.breakdown}
            </button>
          )}
        </div>

        <p className="text-2xl font-bold text-terminal-text">{diskUsageGB.toFixed(2)} GB</p>

        <div className="w-full bg-terminal-border rounded-full h-2 mt-2">
          <div
            className={clsx(
              'h-2 rounded-full transition-all',
              diskPercent > 80 ? 'bg-terminal-red' : diskPercent > 60 ? 'bg-terminal-yellow' : 'bg-terminal-green'
            )}
            style={{ width: `${Math.min(diskPercent, 100)}%` }}
          />
        </div>

        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-terminal-textMuted">{diskLimitGB} {t.containerDetail.gbLimit}</p>
          <p className="text-xs text-terminal-textMuted">{diskPercent.toFixed(1)}%</p>
        </div>

        {/* Expanded breakdown section */}
        {isExpanded && isRunning && (
          <div className="mt-4 pt-4 border-t border-terminal-border">
            {loading ? (
              <div className="text-center py-2">
                <AnimatedDots text={t.common?.loading || 'Carregando'} />
              </div>
            ) : error ? (
              <div className="text-xs text-terminal-red">{error}</div>
            ) : detailedMetrics?.breakdown ? (
              <div className="space-y-3">
                {/* Visual breakdown bar */}
                <div className="w-full h-4 rounded-full overflow-hidden flex bg-terminal-bg border border-terminal-border">
                  {detailedMetrics.breakdown.total > 0 && (
                    <>
                      <div
                        className="h-full bg-terminal-cyan"
                        style={{ width: `${getBreakdownPercentage(detailedMetrics.breakdown.workspace, detailedMetrics.breakdown.total)}%` }}
                        title={`${t.disk.workspace}: ${formatSize(detailedMetrics.breakdown.workspace)}`}
                      />
                      <div
                        className="h-full bg-terminal-magenta"
                        style={{ width: `${getBreakdownPercentage(detailedMetrics.breakdown.nodeModules, detailedMetrics.breakdown.total)}%` }}
                        title={`node_modules: ${formatSize(detailedMetrics.breakdown.nodeModules)}`}
                      />
                      <div
                        className="h-full bg-terminal-yellow"
                        style={{ width: `${getBreakdownPercentage(detailedMetrics.breakdown.cache, detailedMetrics.breakdown.total)}%` }}
                        title={`${t.disk.cache}: ${formatSize(detailedMetrics.breakdown.cache)}`}
                      />
                      <div
                        className="h-full bg-terminal-textMuted"
                        style={{ width: `${getBreakdownPercentage(detailedMetrics.breakdown.other, detailedMetrics.breakdown.total)}%` }}
                        title={`${t.disk.other}: ${formatSize(detailedMetrics.breakdown.other)}`}
                      />
                    </>
                  )}
                </div>

                {/* Legend with values */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-terminal-cyan" />
                    <span className="text-terminal-textMuted">{t.disk.workspace}</span>
                    <span className="font-mono text-terminal-text ml-auto">{formatSize(detailedMetrics.breakdown.workspace)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-terminal-magenta" />
                    <span className="text-terminal-textMuted">node_modules</span>
                    <span className="font-mono text-terminal-text ml-auto">{formatSize(detailedMetrics.breakdown.nodeModules)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-terminal-yellow" />
                    <span className="text-terminal-textMuted">{t.disk.cache}</span>
                    <span className="font-mono text-terminal-text ml-auto">{formatSize(detailedMetrics.breakdown.cache)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-terminal-textMuted" />
                    <span className="text-terminal-textMuted">{t.disk.other}</span>
                    <span className="font-mono text-terminal-text ml-auto">{formatSize(detailedMetrics.breakdown.other)}</span>
                  </div>
                </div>

                {/* Project info */}
                {detailedMetrics.projectPath && (
                  <div className="text-xs text-terminal-textMuted pt-2 border-t border-terminal-border">
                    <div className="flex items-center gap-2">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <span className="font-mono truncate">{detailedMetrics.projectPath}</span>
                    </div>
                    {detailedMetrics.hasGitRepo && (
                      <div className="flex items-center gap-2 mt-1 text-terminal-green">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                        <span>{t.disk.hasGitRepo}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => fetchDetailedMetrics()}
                    className="text-xs text-terminal-cyan hover:text-terminal-text transition-colors"
                    disabled={loading}
                  >
                    ↻ {t.common?.refresh || 'Atualizar'}
                  </button>
                  {diskPercent > 80 && (
                    <button
                      onClick={() => setShowModal(true)}
                      className="text-xs text-terminal-yellow hover:text-terminal-text transition-colors ml-auto"
                    >
                      {t.disk.expandTitle}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-terminal-textMuted text-center py-2">
                {t.container.containerStopped || 'Container parado'}
              </div>
            )}
          </div>
        )}

        {/* Alert for high usage */}
        {!isExpanded && diskPercent > 80 && (
          <div className={clsx(
            'mt-2 text-xs px-2 py-1 rounded',
            diskPercent > 95
              ? 'bg-terminal-red/10 text-terminal-red border border-terminal-red/30'
              : 'bg-terminal-yellow/10 text-terminal-yellow border border-terminal-yellow/30'
          )}>
            {diskPercent > 95 ? t.container.diskCritical : t.container.diskWarning}
            {isRunning && (
              <button
                onClick={() => setShowModal(true)}
                className="ml-2 underline hover:no-underline"
              >
                {t.disk.expandTitle}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      <IncreaseDiskModal
        containerId={containerId}
        containerName={containerName}
        currentUsageMB={diskUsageGB * 1024}
        currentLimitGB={diskLimitGB}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={handleExpandSuccess}
      />
    </>
  )
}
