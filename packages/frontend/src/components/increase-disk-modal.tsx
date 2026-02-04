'use client'

import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import { apiClient } from '@/lib/api-client'
import { AnimatedDots } from '@/components/ui/animated-dots'
import clsx from 'clsx'

interface DiskBreakdown {
  workspace: number
  nodeModules: number
  cache: number
  other: number
  total: number
}

interface CleanupSuggestion {
  type: string
  description: string
  estimatedSavings: number
  command: string
  risk: 'low' | 'medium' | 'high'
}

interface IncreaseDiskModalProps {
  containerId: string
  containerName: string
  currentUsageMB: number
  currentLimitGB: number
  isOpen: boolean
  onClose: () => void
  onSuccess: (newLimitGB: number) => void
}

export function IncreaseDiskModal({
  containerId,
  containerName,
  currentUsageMB,
  currentLimitGB,
  isOpen,
  onClose,
  onSuccess,
}: IncreaseDiskModalProps) {
  const { t } = useI18n()
  const [breakdown, setBreakdown] = useState<DiskBreakdown | null>(null)
  const [suggestions, setSuggestions] = useState<CleanupSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [expanding, setExpanding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIncrease, setSelectedIncrease] = useState<number>(5)
  const [customLimit, setCustomLimit] = useState<string>('')

  const currentLimitMB = currentLimitGB * 1024
  const usagePercent = currentLimitMB > 0 ? (currentUsageMB / currentLimitMB) * 100 : 0

  const fetchMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch detailed metrics
      const metricsRes = await apiClient.getDiskMetrics(containerId)
      if (metricsRes.success && metricsRes.data) {
        setBreakdown(metricsRes.data.breakdown)
      }

      // Fetch cleanup suggestions
      const suggestionsRes = await apiClient.getDiskCleanupSuggestions(containerId)
      if (suggestionsRes.success && suggestionsRes.data) {
        setSuggestions(suggestionsRes.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar métricas')
    } finally {
      setLoading(false)
    }
  }, [containerId])

  useEffect(() => {
    if (isOpen) {
      fetchMetrics()
    }
  }, [isOpen, fetchMetrics])

  const handleExpand = async () => {
    const newLimitGB = customLimit ? parseInt(customLimit, 10) : currentLimitGB + selectedIncrease
    const newLimitMB = newLimitGB * 1024

    if (newLimitMB <= currentLimitMB) {
      setError('Novo limite deve ser maior que o limite atual')
      return
    }

    if (newLimitGB > 100) {
      setError('Limite máximo é 100GB')
      return
    }

    setExpanding(true)
    setError(null)

    try {
      const res = await apiClient.expandDisk(containerId, newLimitMB)

      if (res.success) {
        onSuccess(newLimitGB)
        onClose()
      } else {
        setError(res.error || 'Falha ao expandir disco')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao expandir disco')
    } finally {
      setExpanding(false)
    }
  }

  if (!isOpen) return null

  const alertClass = usagePercent >= 95 ? 'text-terminal-red' : usagePercent >= 80 ? 'text-terminal-yellow' : 'text-terminal-green'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-terminal-card border border-terminal-border rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-terminal-border">
          <h2 className="text-lg font-semibold text-terminal-green">
            {t.disk?.expandTitle || 'Expandir Disco'}
          </h2>
          <button
            onClick={onClose}
            className="text-terminal-textMuted hover:text-terminal-text"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Container info */}
          <div className="text-sm text-terminal-textMuted">
            Container: <span className="text-terminal-cyan">{containerName}</span>
          </div>

          {/* Current usage */}
          <div className="bg-terminal-bg rounded-lg p-4 border border-terminal-border">
            <div className="flex justify-between items-center mb-2">
              <span className="text-terminal-textMuted">{t.disk?.currentUsage || 'Uso Atual'}</span>
              <span className={clsx('font-mono', alertClass)}>
                {(currentUsageMB / 1024).toFixed(2)} GB / {currentLimitGB} GB ({usagePercent.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full bg-terminal-bg border border-terminal-border rounded-full h-2">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  usagePercent >= 95 ? 'bg-terminal-red' :
                  usagePercent >= 80 ? 'bg-terminal-yellow' : 'bg-terminal-green'
                )}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Loading state */}
          {loading ? (
            <div className="text-center py-4">
              <AnimatedDots text={t.common?.loading || 'Carregando'} />
            </div>
          ) : (
            <>
              {/* Breakdown */}
              {breakdown && (
                <div className="bg-terminal-bg rounded-lg p-4 border border-terminal-border">
                  <h3 className="text-sm font-medium text-terminal-text mb-3">
                    {t.disk?.breakdown || 'Detalhamento'}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-terminal-textMuted">Workspace</span>
                      <span className="font-mono text-terminal-text">{(breakdown.workspace / 1024).toFixed(2)} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-terminal-textMuted">node_modules</span>
                      <span className="font-mono text-terminal-cyan">{(breakdown.nodeModules / 1024).toFixed(2)} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-terminal-textMuted">Cache</span>
                      <span className="font-mono text-terminal-yellow">{(breakdown.cache / 1024).toFixed(2)} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-terminal-textMuted">{t.disk?.other || 'Outros'}</span>
                      <span className="font-mono text-terminal-textMuted">{(breakdown.other / 1024).toFixed(2)} GB</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Cleanup suggestions */}
              {suggestions.length > 0 && (
                <div className="bg-terminal-bg rounded-lg p-4 border border-terminal-border">
                  <h3 className="text-sm font-medium text-terminal-text mb-3">
                    {t.disk?.cleanupSuggestions || 'Sugestões de Limpeza'}
                  </h3>
                  <div className="space-y-2">
                    {suggestions.slice(0, 3).map((suggestion, idx) => (
                      <div key={idx} className="text-xs p-2 rounded bg-terminal-card border border-terminal-border">
                        <div className="flex justify-between items-start">
                          <span className="text-terminal-textMuted">{suggestion.description}</span>
                          <span className={clsx(
                            'font-mono ml-2',
                            suggestion.risk === 'low' ? 'text-terminal-green' :
                            suggestion.risk === 'medium' ? 'text-terminal-yellow' : 'text-terminal-red'
                          )}>
                            ~{(suggestion.estimatedSavings / 1024).toFixed(1)} GB
                          </span>
                        </div>
                        <code className="text-xs text-terminal-cyan mt-1 block">{suggestion.command}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick select buttons */}
              <div>
                <h3 className="text-sm font-medium text-terminal-text mb-2">
                  {t.disk?.increaseBy || 'Aumentar em'}
                </h3>
                <div className="flex gap-2">
                  {[5, 10, 20].map((gb) => (
                    <button
                      key={gb}
                      onClick={() => {
                        setSelectedIncrease(gb)
                        setCustomLimit('')
                      }}
                      className={clsx(
                        'flex-1 py-2 px-3 rounded border text-sm font-mono transition-colors',
                        selectedIncrease === gb && !customLimit
                          ? 'bg-terminal-cyan text-terminal-bg border-terminal-cyan'
                          : 'bg-terminal-bg border-terminal-border text-terminal-text hover:border-terminal-cyan'
                      )}
                    >
                      +{gb} GB
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom input */}
              <div>
                <label className="text-sm text-terminal-textMuted block mb-1">
                  {t.disk?.customLimit || 'Limite personalizado (GB)'}
                </label>
                <input
                  type="number"
                  value={customLimit}
                  onChange={(e) => setCustomLimit(e.target.value)}
                  placeholder={String(currentLimitGB + selectedIncrease)}
                  min={currentLimitGB + 1}
                  max={100}
                  className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text font-mono focus:border-terminal-cyan focus:outline-none"
                />
              </div>

              {/* New limit preview */}
              <div className="text-sm text-terminal-textMuted">
                {t.disk?.newLimit || 'Novo limite'}:{' '}
                <span className="text-terminal-green font-mono">
                  {customLimit ? customLimit : currentLimitGB + selectedIncrease} GB
                </span>
              </div>

              {/* Error */}
              {error && (
                <div className="text-sm text-terminal-red bg-terminal-red/10 rounded p-2 border border-terminal-red/30">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-terminal-border">
          <button
            onClick={onClose}
            className="btn-secondary"
            disabled={expanding}
          >
            {t.common?.cancel || 'Cancelar'}
          </button>
          <button
            onClick={handleExpand}
            className="btn-primary"
            disabled={loading || expanding}
          >
            {expanding ? (
              <AnimatedDots text={t.disk?.expanding || 'Expandindo'} />
            ) : (
              t.disk?.expand || 'Expandir'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
