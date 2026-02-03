'use client'

import Link from 'next/link'
import { useContainers } from '@/hooks/use-containers'
import { useMetrics } from '@/hooks/use-metrics'
import { ContainerCard } from '@/components/container-card'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import type { ContainerStatus, TemplateType } from '@/lib/types'

export default function ContainersPage() {
  const { t } = useI18n()
  const { containers, isLoading, error } = useContainers()
  useMetrics()

  const [statusFilter, setStatusFilter] = useState<ContainerStatus | 'all'>('all')
  const [templateFilter, setTemplateFilter] = useState<TemplateType | 'all'>('all')

  const filteredContainers = containers.filter((container) => {
    if (statusFilter !== 'all' && container.status !== statusFilter) {
      return false
    }
    if (templateFilter !== 'all' && container.template !== templateFilter) {
      return false
    }
    return true
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-terminal-green border-t-transparent"></div>
          <p className="mt-4 text-terminal-textMuted">{t.dashboard.loadingContainers}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-6">
        <div className="text-center text-terminal-red">
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
          <h3 className="text-lg font-semibold mb-2">{t.dashboard.errorLoading}</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-terminal-green terminal-glow mb-2">
            <span className="text-terminal-textMuted">$</span> {t.containersList.title}
          </h2>
          <p className="text-terminal-textMuted">
            {t.containersList.subtitle}
          </p>
        </div>
        <Link href="/containers/new" className="btn-primary">
          + {t.containersList.newContainer}
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="label">{t.containersList.status}</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ContainerStatus | 'all')}
              className="input min-w-[150px]"
            >
              <option value="all">{t.containersList.allStatus}</option>
              <option value="running">{t.status.running}</option>
              <option value="stopped">{t.status.stopped}</option>
              <option value="creating">{t.status.creating}</option>
              <option value="error">{t.status.error}</option>
            </select>
          </div>

          <div>
            <label className="label">{t.containersList.template}</label>
            <select
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value as TemplateType | 'all')}
              className="input min-w-[150px]"
            >
              <option value="all">{t.containersList.allTemplates}</option>
              <option value="claude">{t.templates.claude}</option>
              <option value="vscode">{t.templates.vscode}</option>
              <option value="both">{t.templates.both}</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setStatusFilter('all')
                setTemplateFilter('all')
              }}
              className="btn-secondary"
            >
              {t.containersList.clearFilters}
            </button>
          </div>
        </div>
      </div>

      {filteredContainers.length === 0 ? (
        <div className="card p-12">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 text-terminal-textMuted mb-4 flex items-center justify-center text-4xl">
              [ ]
            </div>
            <h3 className="text-lg font-semibold text-terminal-text mb-2">
              {t.containersList.noContainersFound}
            </h3>
            <p className="text-terminal-textMuted mb-6">
              {containers.length === 0
                ? t.dashboard.getStarted
                : t.containersList.adjustFilters}
            </p>
            {containers.length === 0 && (
              <Link href="/containers/new" className="btn-primary inline-block">
                + {t.dashboard.createContainer}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContainers.map((container) => (
            <ContainerCard key={container.id} container={container} />
          ))}
        </div>
      )}
    </div>
  )
}
