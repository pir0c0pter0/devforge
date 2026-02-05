'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useContainers } from '@/hooks/use-containers'
import { useMetrics } from '@/hooks/use-metrics'
import { ContainerCard } from '@/components/container-card'
import { useI18n } from '@/lib/i18n'

export default function HomePage() {
  const { t } = useI18n()
  const { containers, isLoading, error } = useContainers()
  useMetrics()

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

  if (containers.length === 0) {
    return (
      <div className="card p-12">
        <div className="text-center">
          <Image
            src="/logo-icon.png"
            alt="DevForge"
            width={64}
            height={64}
            className="mx-auto mb-4 opacity-50"
          />
          <h3 className="text-lg font-semibold text-terminal-text mb-2">
            {t.dashboard.noContainersYet}
          </h3>
          <p className="text-terminal-textMuted mb-6">
            {t.dashboard.getStarted}
          </p>
          <Link href="/containers/new" className="btn-primary inline-block">
            + {t.dashboard.createContainer}
          </Link>
        </div>
      </div>
    )
  }

  const runningContainers = containers.filter((c) => c.status === 'running')
  const totalActiveAgents = containers.reduce((sum, c) => sum + c.activeAgents, 0)
  const totalQueueLength = containers.reduce((sum, c) => sum + c.queueLength, 0)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-terminal-green terminal-glow mb-2">
          {t.dashboard.title}
        </h2>
        <p className="text-terminal-textMuted">
          {t.dashboard.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stats-label">
                {t.dashboard.totalContainers}
              </p>
              <p className="stats-value mt-1">
                {containers.length}
              </p>
            </div>
            <div className="w-10 h-10 bg-terminal-green/10 border border-terminal-green/30 rounded flex items-center justify-center">
              <span className="text-terminal-green">#</span>
            </div>
          </div>
        </div>

        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stats-label">
                {t.dashboard.running}
              </p>
              <p className="stats-value mt-1">
                {runningContainers.length}
              </p>
            </div>
            <div className="w-10 h-10 bg-terminal-green/10 border border-terminal-green/30 rounded flex items-center justify-center">
              <div className="status-dot status-running"></div>
            </div>
          </div>
        </div>

        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stats-label">
                {t.dashboard.activeAgents}
              </p>
              <p className="text-2xl font-bold text-terminal-cyan mt-1">
                {totalActiveAgents}
              </p>
            </div>
            <div className="w-10 h-10 bg-terminal-cyan/10 border border-terminal-cyan/30 rounded flex items-center justify-center">
              <span className="text-terminal-cyan">@</span>
            </div>
          </div>
        </div>

        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stats-label">
                {t.dashboard.queueLength}
              </p>
              <p className="text-2xl font-bold text-terminal-yellow mt-1">
                {totalQueueLength}
              </p>
            </div>
            <div className="w-10 h-10 bg-terminal-yellow/10 border border-terminal-yellow/30 rounded flex items-center justify-center">
              <span className="text-terminal-yellow">=</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-terminal-text mb-4">
          <span className="text-terminal-green">$</span> {t.dashboard.containers}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {containers.map((container) => (
            <ContainerCard key={container.id} container={container} />
          ))}
        </div>
      </div>
    </div>
  )
}
