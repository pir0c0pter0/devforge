'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useI18n } from '@/lib/i18n'
import { apiClient } from '@/lib/api-client'
import { AnimatedDots } from '@/components/ui/animated-dots'

const AUTO_REFRESH_INTERVAL_MS = 300000 // 5 minutes

interface UsageData {
  daily: { tokens: number; cost: number }
  weekly: { tokens: number; cost: number }
  session: { tokens: number; cost: number; endsAt: string }
}

interface UsageStatsCardProps {
  containerId: string
  containerStatus: string
}

export function UsageStatsCard({ containerId, containerStatus }: UsageStatsCardProps) {
  const { t } = useI18n()
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<string>('')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const isRunning = containerStatus === 'running'

  const fetchUsageData = useCallback(async (showLoading = true) => {
    if (!isRunning) return

    if (showLoading) setLoading(true)
    setError(null)

    try {
      const response = await apiClient.getContainerUsage(containerId)
      if (response.success && response.data) {
        setUsageData(response.data)
      } else {
        // If endpoint doesn't exist yet, show "no data"
        setError(response.error || null)
        setUsageData(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : null)
      setUsageData(null)
    } finally {
      setLoading(false)
    }
  }, [containerId, isRunning])

  // Calculate countdown to session reset
  const updateCountdown = useCallback(() => {
    if (!usageData?.session?.endsAt) {
      setCountdown('')
      return
    }

    const endsAt = new Date(usageData.session.endsAt)
    const now = new Date()
    const diff = endsAt.getTime() - now.getTime()

    if (diff <= 0) {
      setCountdown('')
      // Refresh data when session expires
      fetchUsageData(false)
      return
    }

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) {
      setCountdown(`${hours}h ${minutes}m`)
    } else {
      setCountdown(`${minutes}m`)
    }
  }, [usageData?.session?.endsAt, fetchUsageData])

  // Auto-fetch on mount and auto-refresh every 5 minutes
  useEffect(() => {
    if (isRunning) {
      fetchUsageData(true)

      intervalRef.current = setInterval(() => {
        fetchUsageData(false)
      }, AUTO_REFRESH_INTERVAL_MS)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning, fetchUsageData])

  // Update countdown every minute
  useEffect(() => {
    updateCountdown()

    countdownIntervalRef.current = setInterval(updateCountdown, 60000)

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
    }
  }, [updateCountdown])

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`
    }
    return tokens.toLocaleString()
  }

  const formatCost = (cost: number): string => {
    return `$${cost.toFixed(2)}`
  }

  // Calendar icon for daily
  const CalendarIcon = () => (
    <svg className="w-5 h-5 text-terminal-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )

  // CalendarDays icon for weekly
  const CalendarDaysIcon = () => (
    <svg className="w-5 h-5 text-terminal-magenta" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
    </svg>
  )

  // Clock icon for session
  const ClockIcon = () => (
    <svg className="w-5 h-5 text-terminal-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-terminal-textMuted">{t.usage?.title || 'Uso de Tokens'}</h3>
      </div>

      {!isRunning ? (
        <div className="text-center py-4">
          <p className="text-sm text-terminal-textMuted">{t.usage?.noData || 'Sem dados'}</p>
        </div>
      ) : loading && !usageData ? (
        <div className="text-center py-4">
          <AnimatedDots text={t.common?.loading || 'Carregando'} />
        </div>
      ) : error && !usageData ? (
        <div className="text-center py-4">
          <p className="text-sm text-terminal-textMuted">{t.usage?.noData || 'Sem dados'}</p>
        </div>
      ) : usageData ? (
        <div className="space-y-4">
          {/* Daily Usage */}
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <CalendarIcon />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-terminal-textMuted">{t.usage?.daily || 'Total Diario'}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-terminal-text">
                  {formatTokens(usageData.daily.tokens)}
                </span>
                <span className="text-xs text-terminal-textMuted">{t.usage?.tokens || 'tokens'}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-mono text-terminal-cyan">
                {formatCost(usageData.daily.cost)}
              </span>
            </div>
          </div>

          {/* Weekly Usage */}
          <div className="flex items-center gap-3 pt-3 border-t border-terminal-border">
            <div className="flex-shrink-0">
              <CalendarDaysIcon />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-terminal-textMuted">{t.usage?.weekly || 'Total Semanal'}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-terminal-text">
                  {formatTokens(usageData.weekly.tokens)}
                </span>
                <span className="text-xs text-terminal-textMuted">{t.usage?.tokens || 'tokens'}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-mono text-terminal-magenta">
                {formatCost(usageData.weekly.cost)}
              </span>
            </div>
          </div>

          {/* Session Usage */}
          <div className="flex items-center gap-3 pt-3 border-t border-terminal-border">
            <div className="flex-shrink-0">
              <ClockIcon />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-terminal-textMuted">{t.usage?.session || 'Total Sessao'}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-terminal-text">
                  {formatTokens(usageData.session.tokens)}
                </span>
                <span className="text-xs text-terminal-textMuted">{t.usage?.tokens || 'tokens'}</span>
              </div>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="text-sm font-mono text-terminal-yellow">
                {formatCost(usageData.session.cost)}
              </span>
              {countdown && (
                <span className="text-xs text-terminal-textMuted">
                  {t.usage?.resetsIn || 'Reseta em'} {countdown}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-terminal-textMuted">{t.usage?.noData || 'Sem dados'}</p>
        </div>
      )}
    </div>
  )
}
