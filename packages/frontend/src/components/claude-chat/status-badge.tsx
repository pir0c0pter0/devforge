'use client'

import clsx from 'clsx'
import { Loader2, AlertCircle } from 'lucide-react'

export type DaemonStatus = 'running' | 'starting' | 'stopping' | 'stopped' | 'error'

export interface StatusBadgeProps {
  daemonStatus: DaemonStatus
  isConnected: boolean
}

const statusConfig: Record<DaemonStatus, {
  label: string
  bgClass: string
  textClass: string
  dotClass: string
  showSpinner?: boolean
  showError?: boolean
}> = {
  running: {
    label: 'Rodando',
    bgClass: 'bg-terminal-green/20',
    textClass: 'text-terminal-green',
    dotClass: 'bg-terminal-green animate-pulse',
  },
  starting: {
    label: 'Iniciando',
    bgClass: 'bg-terminal-yellow/20',
    textClass: 'text-terminal-yellow',
    dotClass: 'bg-terminal-yellow',
    showSpinner: true,
  },
  stopping: {
    label: 'Parando',
    bgClass: 'bg-terminal-yellow/20',
    textClass: 'text-terminal-yellow',
    dotClass: 'bg-terminal-yellow',
    showSpinner: true,
  },
  stopped: {
    label: 'Parado',
    bgClass: 'bg-terminal-textMuted/20',
    textClass: 'text-terminal-textMuted',
    dotClass: 'bg-terminal-textMuted',
  },
  error: {
    label: 'Erro',
    bgClass: 'bg-terminal-red/20',
    textClass: 'text-terminal-red',
    dotClass: 'bg-terminal-red',
    showError: true,
  },
}

export function StatusBadge({ daemonStatus, isConnected }: StatusBadgeProps) {
  // If disconnected, show disconnected status
  if (!isConnected) {
    return (
      <div className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        'bg-terminal-textMuted/20 text-terminal-textMuted'
      )}>
        <span className="w-2 h-2 rounded-full bg-terminal-textMuted" />
        <span>Desconectado</span>
      </div>
    )
  }

  const config = statusConfig[daemonStatus]

  return (
    <div className={clsx(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
      config.bgClass,
      config.textClass
    )}>
      {config.showSpinner ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : config.showError ? (
        <AlertCircle className="w-3 h-3" />
      ) : (
        <span className={clsx('w-2 h-2 rounded-full', config.dotClass)} />
      )}
      <span>{config.label}</span>
    </div>
  )
}

export default StatusBadge
