'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { apiClient } from '@/lib/api-client'
import type { QueueItem, QueueItemStatus, JobDetails } from '@/lib/types'
import { AnimatedDots } from '@/components/ui/animated-dots'
import { SkillAutocomplete } from '@/components/skill-autocomplete'
import { useI18n } from '@/lib/i18n'
import clsx from 'clsx'
import { ChevronDown, ChevronUp } from 'lucide-react'

const WS_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface InstructionQueueProps {
  containerId: string
}

export function InstructionQueue({ containerId }: InstructionQueueProps) {
  const { t } = useI18n()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newInstruction, setNewInstruction] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedJob, setSelectedJob] = useState<JobDetails | null>(null)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const socketRef = useRef<Socket | null>(null)

  const fetchQueue = useCallback(async () => {
    setError(null)

    const response = await apiClient.getQueue(containerId)

    if (response.success && response.data) {
      setQueue(response.data)
    } else {
      setError(response.error || t.instructionQueue.failedFetch)
    }

    setIsLoading(false)
  }, [containerId, t.instructionQueue.failedFetch])

  // WebSocket subscription for real-time updates
  useEffect(() => {
    // Connect to /queue namespace
    const socket = io(`${WS_URL}/queue`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[InstructionQueue] Connected to /queue WebSocket')
      // Subscribe to this container's events
      socket.emit('subscribe:container', containerId)
    })

    // Listen for instruction events and refetch queue
    socket.on('instruction:pending', () => {
      console.log('[InstructionQueue] Instruction pending, refreshing...')
      fetchQueue()
    })

    socket.on('instruction:started', () => {
      console.log('[InstructionQueue] Instruction started, refreshing...')
      fetchQueue()
    })

    socket.on('instruction:completed', () => {
      console.log('[InstructionQueue] Instruction completed, refreshing...')
      fetchQueue()
    })

    socket.on('instruction:failed', () => {
      console.log('[InstructionQueue] Instruction failed, refreshing...')
      fetchQueue()
    })

    socket.on('instruction:progress', () => {
      // Progress updates - could update UI but for now just log
      console.log('[InstructionQueue] Instruction progress...')
    })

    return () => {
      socket.emit('unsubscribe:container', containerId)
      socket.disconnect()
      socketRef.current = null
    }
  }, [containerId, fetchQueue])

  // Initial fetch
  useEffect(() => {
    setIsLoading(true)
    fetchQueue()
  }, [fetchQueue])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newInstruction.trim()) {
      return
    }

    setIsSubmitting(true)
    const response = await apiClient.addToQueue(containerId, newInstruction)

    if (response.success) {
      setNewInstruction('')
      await fetchQueue()
    } else {
      setError(response.error || t.instructionQueue.failedAdd)
    }

    setIsSubmitting(false)
  }

  const handleJobClick = async (jobId: string) => {
    // If clicking same job, close it
    if (selectedJob?.id === jobId) {
      setSelectedJob(null)
      return
    }

    setIsLoadingDetails(true)
    const response = await apiClient.getJobDetails(containerId, jobId)

    if (response.success && response.data) {
      setSelectedJob(response.data)
    } else {
      setError(response.error || t.instructionQueue.failedFetch)
    }

    setIsLoadingDetails(false)
  }

  const getStatusColor = (status: QueueItemStatus): string => {
    const colors: Record<string, string> = {
      waiting: 'badge-gray',
      pending: 'badge-gray',
      active: 'badge-warning',
      running: 'badge-warning',
      completed: 'badge-success',
      failed: 'badge-danger',
      delayed: 'badge-gray',
      'dead-letter': 'badge-danger',
    }
    return colors[status] || 'badge-gray'
  }

  const getStatusIcon = (status: QueueItemStatus): React.ReactNode => {
    const icons: Record<string, React.ReactNode> = {
      waiting: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      pending: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      active: (
        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      ),
      running: (
        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      ),
      completed: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
      failed: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      ),
      delayed: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      'dead-letter': (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      ),
    }
    return icons[status] || icons.waiting
  }

  const getStatusLabel = (status: QueueItemStatus): string => {
    const labels = t.instructionQueue.status
    const labelMap: Record<string, string> = {
      waiting: labels.waiting,
      pending: labels.pending,
      active: labels.active,
      running: labels.running,
      completed: labels.completed,
      failed: labels.failed,
      delayed: labels.delayed,
      'dead-letter': labels.deadLetter,
    }
    return labelMap[status] || status
  }

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  // Parse Claude stream-json output to extract the actual response
  const parseClaudeOutput = (stdout: string): { text: string; cost?: string; duration?: string } | null => {
    if (!stdout) return null

    try {
      const lines = stdout.split('\n').filter(l => l.trim())
      let resultText = ''
      let cost = ''
      let duration = ''

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)

          // Extract result text
          if (parsed.type === 'result' && parsed.result) {
            resultText = parsed.result
          }

          // Extract assistant message
          if (parsed.type === 'assistant' && parsed.message?.content) {
            const content = parsed.message.content
            if (Array.isArray(content)) {
              for (const item of content) {
                if (item.type === 'text') {
                  resultText = item.text
                }
              }
            } else if (typeof content === 'string') {
              resultText = content
            }
          }

          // Extract cost info
          if (parsed.total_cost_usd) {
            cost = `$${parsed.total_cost_usd.toFixed(4)}`
          }
          if (parsed.duration_ms) {
            duration = formatDuration(parsed.duration_ms)
          }
        } catch {
          // Not JSON, skip
        }
      }

      if (resultText) {
        return { text: resultText, cost, duration }
      }
    } catch {
      // Parse failed
    }

    return null
  }

  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent"></div>
          <p className="mt-2 text-sm text-terminal-textMuted">
            <AnimatedDots text={t.instructionQueue.loading} />
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="p-6 border-b border-terminal-border">
        <h3 className="text-lg font-semibold text-terminal-text mb-4">
          {t.instructionQueue.title}
        </h3>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <SkillAutocomplete
            value={newInstruction}
            onChange={setNewInstruction}
            onSubmit={handleSubmit}
            placeholder={t.instructionQueue.placeholder}
            disabled={isSubmitting}
          />
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? <AnimatedDots text={t.instructionQueue.adding} /> : t.instructionQueue.add}
          </button>
        </form>

        {error && (
          <p className="mt-2 text-sm text-terminal-red">{error}</p>
        )}
      </div>

      <div className="divide-y divide-terminal-border max-h-[400px] overflow-y-auto">
        {queue.length === 0 ? (
          <div className="p-6 text-center text-terminal-textMuted">
            {t.instructionQueue.empty}
          </div>
        ) : (
          queue.map((item) => (
            <div key={item.id}>
              <div
                className="p-4 hover:bg-terminal-bg transition-colors cursor-pointer"
                onClick={() => handleJobClick(item.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={clsx('badge', getStatusColor(item.status))}>
                        <span className="mr-1">{getStatusIcon(item.status)}</span>
                        {getStatusLabel(item.status)}
                      </span>
                      <span className="badge badge-gray text-xs">
                        {t.modes[item.mode]}
                      </span>
                      <span className="text-xs text-terminal-textMuted">
                        {t.instructionQueue.created} {new Date(item.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-terminal-text font-medium mb-1">
                      {item.instruction}
                    </p>
                    {item.finishedAt && (
                      <p className="text-xs text-terminal-textMuted">
                        {t.instructionQueue.finished} {new Date(item.finishedAt).toLocaleTimeString()}
                        {item.duration && ` (${formatDuration(item.duration)})`}
                      </p>
                    )}
                    {item.error && (
                      <div className="mt-2 p-2 bg-terminal-red/10 rounded text-xs text-terminal-red">
                        {item.error}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-terminal-textMuted">
                    {selectedJob?.id === item.id ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {selectedJob?.id === item.id && (
                <div className="px-4 pb-4 bg-terminal-bgLight border-t border-terminal-border">
                  {isLoadingDetails ? (
                    <div className="py-4 text-center">
                      <AnimatedDots text={t.instructionQueue.loadingDetails || 'Carregando detalhes'} />
                    </div>
                  ) : (
                    <div className="py-3 space-y-3">
                      {/* Full instruction */}
                      <div>
                        <h4 className="text-xs font-semibold text-terminal-textMuted uppercase mb-1">
                          {t.instructionQueue.fullInstruction || 'Instrução Completa'}
                        </h4>
                        <pre className="text-sm text-terminal-text bg-terminal-bg p-2 rounded overflow-x-auto whitespace-pre-wrap">
                          {selectedJob.instruction}
                        </pre>
                      </div>

                      {/* Result */}
                      {selectedJob.result && (
                        <div>
                          <h4 className="text-xs font-semibold text-terminal-textMuted uppercase mb-1">
                            {t.instructionQueue.result || 'Resultado'}
                          </h4>
                          {(() => {
                            const parsed = parseClaudeOutput(selectedJob.result.stdout)
                            if (parsed) {
                              return (
                                <div className="mb-2">
                                  <div className="text-sm text-terminal-text bg-terminal-bg p-3 rounded overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                                    {parsed.text}
                                  </div>
                                  {(parsed.cost || parsed.duration) && (
                                    <div className="flex gap-4 mt-2 text-xs text-terminal-textMuted">
                                      {parsed.cost && <span>Custo: <span className="text-terminal-cyan">{parsed.cost}</span></span>}
                                      {parsed.duration && <span>Duração API: <span className="text-terminal-cyan">{parsed.duration}</span></span>}
                                    </div>
                                  )}
                                </div>
                              )
                            }
                            // Fallback to raw output if parsing fails
                            return (
                              <>
                                {selectedJob.result.stdout && (
                                  <div className="mb-2">
                                    <span className="text-xs text-terminal-green">stdout:</span>
                                    <pre className="text-sm text-terminal-text bg-terminal-bg p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                                      {selectedJob.result.stdout}
                                    </pre>
                                  </div>
                                )}
                              </>
                            )
                          })()}
                          {selectedJob.result.stderr && (
                            <div>
                              <span className="text-xs text-terminal-yellow">stderr:</span>
                              <pre className="text-sm text-terminal-yellow bg-terminal-bg p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                                {selectedJob.result.stderr}
                              </pre>
                            </div>
                          )}
                          <div className="flex gap-4 mt-2 text-xs text-terminal-textMuted">
                            <span>Exit code: <span className={selectedJob.result.exitCode === 0 ? 'text-terminal-green' : 'text-terminal-red'}>{selectedJob.result.exitCode}</span></span>
                            <span>Duração: {formatDuration(selectedJob.result.duration)}</span>
                          </div>
                        </div>
                      )}

                      {/* Error details */}
                      {selectedJob.error && (
                        <div>
                          <h4 className="text-xs font-semibold text-terminal-red uppercase mb-1">
                            {t.instructionQueue.errorDetails || 'Detalhes do Erro'}
                          </h4>
                          <pre className="text-sm text-terminal-red bg-terminal-red/10 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                            {selectedJob.error}
                          </pre>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="flex flex-wrap gap-4 text-xs text-terminal-textMuted pt-2 border-t border-terminal-border">
                        <span>Tentativas: {selectedJob.attemptsMade}/{selectedJob.maxAttempts}</span>
                        {selectedJob.processedAt && (
                          <span>Processado: {new Date(selectedJob.processedAt).toLocaleString()}</span>
                        )}
                        {selectedJob.finishedAt && (
                          <span>Finalizado: {new Date(selectedJob.finishedAt).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
