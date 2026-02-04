'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import clsx from 'clsx'

interface CpuMetricsCardProps {
  containerId: string
  cpuUsage: number
  cpuLimit: number
  containerStatus: string
  perCore?: number[]
}

export function CpuMetricsCard({
  cpuUsage,
  cpuLimit,
  containerStatus,
  perCore,
}: CpuMetricsCardProps) {
  const { t } = useI18n()
  const [localPerCore, setLocalPerCore] = useState<number[] | undefined>(perCore)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const isRunning = containerStatus === 'running'
  const coreCount = cpuLimit || 1

  // Update local state when props change
  useEffect(() => {
    if (perCore) {
      setLocalPerCore(perCore)
      setLastUpdated(new Date())
    }
  }, [perCore])

  const formatLastUpdated = (date: Date): string => {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const getColorClass = (usage: number): string => {
    if (usage > 80) return 'bg-terminal-red'
    if (usage > 60) return 'bg-terminal-yellow'
    return 'bg-terminal-green'
  }

  const getTextColorClass = (usage: number): string => {
    if (usage > 80) return 'text-terminal-red'
    if (usage > 60) return 'text-terminal-yellow'
    return 'text-terminal-green'
  }

  // Limit display to configured core count
  const displayCores = localPerCore?.slice(0, Math.ceil(coreCount)) || []

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-terminal-textMuted">{t.containerDetail.cpuUsage}</h3>
        {lastUpdated && isRunning && (
          <span className="text-xs text-terminal-textMuted">
            {formatLastUpdated(lastUpdated)}
          </span>
        )}
      </div>

      <p className="text-2xl font-bold text-terminal-text">{cpuUsage.toFixed(1)}%</p>

      <div className="w-full bg-terminal-border rounded-full h-2 mt-2">
        <div
          className={clsx(
            'h-2 rounded-full transition-all',
            getColorClass(cpuUsage)
          )}
          style={{ width: `${Math.min(cpuUsage, 100)}%` }}
        />
      </div>

      <p className="text-xs text-terminal-textMuted mt-1">{coreCount} {t.containerDetail.coresAllocated}</p>

      {/* Per-core breakdown */}
      {isRunning && displayCores.length > 0 && (
        <div className="mt-4 pt-4 border-t border-terminal-border">
          <h4 className="text-xs font-medium text-terminal-textMuted mb-3">
            {t.cpu?.perCore || 'Por Core'}
          </h4>

          <div className="space-y-2">
            {displayCores.map((usage, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs text-terminal-textMuted w-12">
                  Core {index}
                </span>
                <div className="flex-1 bg-terminal-bg border border-terminal-border rounded-full h-2">
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all',
                      getColorClass(usage)
                    )}
                    style={{ width: `${Math.min(usage, 100)}%` }}
                  />
                </div>
                <span className={clsx('text-xs font-mono w-12 text-right', getTextColorClass(usage))}>
                  {usage.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>

          {/* Summary stats */}
          {displayCores.length > 1 && (
            <div className="mt-3 pt-2 border-t border-terminal-border/50 grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <span className="text-terminal-textMuted">{t.cpu?.min || 'Min'}</span>
                <p className="font-mono text-terminal-green">{Math.min(...displayCores).toFixed(0)}%</p>
              </div>
              <div className="text-center">
                <span className="text-terminal-textMuted">{t.cpu?.avg || 'Média'}</span>
                <p className="font-mono text-terminal-cyan">
                  {(displayCores.reduce((a, b) => a + b, 0) / displayCores.length).toFixed(0)}%
                </p>
              </div>
              <div className="text-center">
                <span className="text-terminal-textMuted">{t.cpu?.max || 'Max'}</span>
                <p className={clsx('font-mono', getTextColorClass(Math.max(...displayCores)))}>
                  {Math.max(...displayCores).toFixed(0)}%
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
