'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { apiClient } from '@/lib/api-client'
import type { QueueItem, QueueItemStatus, JobDetails } from '@/lib/types'
import { AnimatedDots } from '@/components/ui/animated-dots'
import { SkillAutocomplete } from '@/components/skill-autocomplete'
import { useI18n } from '@/lib/i18n'
import clsx from 'clsx'
import { ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, AlertTriangle, Loader2, Terminal, X, Trash2 } from 'lucide-react'
import { useModal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'

const WS_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface InstructionQueueProps {
  containerId: string
}

// Progress data received from WebSocket
interface ProgressData {
  id: string
  containerId: string
  progress?: number
  stage?: string
  message?: string
  result?: string
  error?: string
  status?: string
}

// Execution log entry
interface LogEntry {
  timestamp: Date
  message: string
  stage?: string
}

// Job progress state with message
interface JobProgressState {
  progress: number
  stage?: string
  message?: string
}

export function InstructionQueue({ containerId }: InstructionQueueProps) {
  const { t, formatCurrency } = useI18n()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newInstruction, setNewInstruction] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedJob, setSelectedJob] = useState<JobDetails | null>(null)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const modal = useModal()
  const toast = useToast()

  // Real-time progress tracking per job with stage and message
  const [jobProgress, setJobProgress] = useState<Record<string, JobProgressState>>({})
  const [jobLogs, setJobLogs] = useState<Record<string, LogEntry[]>>({})
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({})
  const logsEndRef = useRef<Record<string, HTMLDivElement | null>>({})

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

    socket.on('instruction:progress', (data: ProgressData) => {
      console.log('[InstructionQueue] Instruction progress:', data)
      // Update progress for this specific job with stage and message
      if (data.id) {
        setJobProgress(prev => ({
          ...prev,
          [data.id]: {
            progress: data.progress ?? prev[data.id]?.progress ?? 0,
            stage: data.stage ?? prev[data.id]?.stage,
            message: data.message ?? prev[data.id]?.message,
          }
        }))
      }
      // Add log entry if there's a message (from stage updates or result)
      const logMessage = data.message || data.result
      if (data.id && logMessage) {
        setJobLogs(prev => {
          const existingLogs = prev[data.id] || []
          // Avoid duplicate messages
          const lastLog = existingLogs[existingLogs.length - 1]
          if (lastLog?.message === logMessage) {
            return prev
          }
          return {
            ...prev,
            [data.id]: [...existingLogs, {
              timestamp: new Date(),
              message: logMessage,
              stage: data.stage
            }]
          }
        })
      }
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
      waiting: 'bg-terminal-bg text-terminal-textMuted border border-terminal-border',
      pending: 'bg-terminal-bg text-terminal-textMuted border border-terminal-border',
      active: 'bg-blue-500/20 text-blue-400 border border-blue-500/50',
      running: 'bg-blue-500/20 text-blue-400 border border-blue-500/50',
      completed: 'bg-terminal-green/20 text-terminal-green border border-terminal-green/50',
      failed: 'bg-terminal-red/20 text-terminal-red border border-terminal-red/50',
      delayed: 'bg-terminal-yellow/20 text-terminal-yellow border border-terminal-yellow/50',
      'dead-letter': 'bg-terminal-red/20 text-terminal-red border border-terminal-red/50',
    }
    return colors[status] || colors.waiting
  }

  const getStatusIcon = (status: QueueItemStatus): React.ReactNode => {
    const iconClass = 'w-3.5 h-3.5'
    const icons: Record<string, React.ReactNode> = {
      waiting: <Clock className={iconClass} />,
      pending: <Clock className={iconClass} />,
      active: <Loader2 className={clsx(iconClass, 'animate-spin')} />,
      running: <Loader2 className={clsx(iconClass, 'animate-spin')} />,
      completed: <CheckCircle className={iconClass} />,
      failed: <XCircle className={iconClass} />,
      delayed: <Clock className={iconClass} />,
      'dead-letter': <AlertTriangle className={iconClass} />,
    }
    return icons[status] || icons.waiting
  }

  // Toggle logs visibility for a job
  const toggleLogs = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedLogs(prev => ({
      ...prev,
      [jobId]: !prev[jobId]
    }))
  }

  // Handle cancel job (for waiting jobs)
  const handleCancelJob = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const confirmed = await modal.confirm({
      title: t.instructionQueue.cancel,
      message: t.instructionQueue.confirmCancel,
      type: 'warning',
      confirmLabel: t.instructionQueue.cancel,
      cancelLabel: t.common.cancel,
    })

    if (!confirmed) return

    const response = await apiClient.cancelJob(containerId, jobId)

    if (response.success) {
      toast.success(t.instructionQueue.jobCancelled)
      await fetchQueue()
    } else {
      toast.error(response.error || t.instructionQueue.cancelFailed)
    }
  }

  // Handle delete job (for completed/failed jobs)
  const handleDeleteJob = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const confirmed = await modal.confirm({
      title: t.instructionQueue.delete,
      message: t.instructionQueue.confirmDelete,
      type: 'delete',
      confirmLabel: t.instructionQueue.delete,
      cancelLabel: t.common.cancel,
    })

    if (!confirmed) return

    const response = await apiClient.deleteJob(containerId, jobId)

    if (response.success) {
      toast.success(t.instructionQueue.jobDeleted)
      // Close details if this job was selected
      if (selectedJob?.id === jobId) {
        setSelectedJob(null)
      }
      await fetchQueue()
    } else {
      toast.error(response.error || t.instructionQueue.deleteFailed)
    }
  }

  // Auto-scroll logs to bottom when new logs arrive
  useEffect(() => {
    Object.keys(expandedLogs).forEach(jobId => {
      if (expandedLogs[jobId] && logsEndRef.current[jobId]) {
        logsEndRef.current[jobId]?.scrollIntoView({ behavior: 'smooth' })
      }
    })
  }, [jobLogs, expandedLogs])

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

  // Parse Claude stream-json output to extract the complete response
  // Claude Code outputs multiple JSON events: assistant, tool_use, tool_result, result
  // We collect ALL content to ensure nothing is lost, especially for complex tasks like multi-perspective
  const parseClaudeOutput = (stdout: string): { text: string; costUsd?: number; duration?: string; toolsUsed?: string[] } | null => {
    if (!stdout) return null

    try {
      const lines = stdout.split('\n').filter(l => l.trim())
      const allContent: string[] = []
      let finalResult = ''
      let costUsd: number | undefined
      let duration = ''
      const toolsUsed: string[] = []

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)

          // Extract assistant messages - capture ALL of them
          if (parsed.type === 'assistant' && parsed.message?.content) {
            const content = parsed.message.content
            if (Array.isArray(content)) {
              for (const item of content) {
                if (item.type === 'text' && item.text?.trim()) {
                  allContent.push(item.text.trim())
                }
              }
            } else if (typeof content === 'string' && content.trim()) {
              allContent.push(content.trim())
            }
          }

          // Track tool usage
          if (parsed.type === 'tool_use' && parsed.name) {
            if (!toolsUsed.includes(parsed.name)) {
              toolsUsed.push(parsed.name)
            }
          }

          // Extract final result (summary from Claude)
          if (parsed.type === 'result' && parsed.result) {
            finalResult = parsed.result
          }

          // Extract cost info (usually in the last event) - keep as number for formatting
          if (parsed.total_cost_usd !== undefined) {
            costUsd = parsed.total_cost_usd
          }
          if (parsed.duration_ms !== undefined) {
            duration = formatDuration(parsed.duration_ms)
          }
        } catch {
          // Not JSON, skip
        }
      }

      // Build complete response - ALWAYS prefer assistant messages (actual conversation)
      // The finalResult is often just a short summary
      let completeText = ''

      // Remove exact duplicates but keep order
      const seen = new Set<string>()
      const uniqueContent = allContent.filter(msg => {
        if (seen.has(msg)) return false
        seen.add(msg)
        return true
      })

      // If we have assistant messages, use them as the main content
      if (uniqueContent.length > 0) {
        completeText = uniqueContent.join('\n\n')
      }

      // If no assistant messages but have a result, use that
      if (!completeText && finalResult) {
        completeText = finalResult
      }

      // If both exist and result adds value (not just repeating), append it
      if (completeText && finalResult && !completeText.includes(finalResult)) {
        // Only add if result provides additional info
        if (finalResult.length > 50) {
          completeText = completeText + '\n\n---\n\n' + finalResult
        }
      }

      if (completeText) {
        return {
          text: completeText,
          costUsd,
          duration,
          toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
        }
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
    <div className="card overflow-visible">
      {/* Header com overflow visible para autocomplete aparecer para baixo */}
      <div className="p-6 border-b border-terminal-border overflow-visible relative z-20">
        <h3 className="text-lg font-semibold text-terminal-text mb-4">
          {t.instructionQueue.title}
        </h3>

        <form onSubmit={handleSubmit} className="flex gap-2 relative">
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

      <div className="divide-y divide-terminal-border max-h-[400px] overflow-y-auto relative z-10">
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

                    {/* Progress bar for active/running jobs */}
                    {(item.status === 'active' || item.status === 'running') && (
                      <div className="mt-2 space-y-2">
                        {/* Current stage message */}
                        {jobProgress[item.id]?.message && (
                          <div className="flex items-center gap-2 text-xs text-blue-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>{jobProgress[item.id].message}</span>
                          </div>
                        )}

                        {/* Progress bar */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-terminal-textMuted w-16">
                            {t.instructionQueue.progress}:
                          </span>
                          <div className="flex-1 bg-terminal-bg rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${jobProgress[item.id]?.progress || 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-blue-400 font-medium w-10 text-right">
                            {jobProgress[item.id]?.progress || 0}%
                          </span>
                        </div>

                        {/* Execution logs toggle */}
                        <button
                          onClick={(e) => toggleLogs(item.id, e)}
                          className="flex items-center gap-1 text-xs text-terminal-textMuted hover:text-terminal-text transition-colors"
                        >
                          <Terminal className="w-3 h-3" />
                          {expandedLogs[item.id] ? t.instructionQueue.hideLogs : t.instructionQueue.showLogs}
                          {jobLogs[item.id]?.length ? ` (${jobLogs[item.id].length})` : ''}
                        </button>

                        {/* Expandable logs section */}
                        {expandedLogs[item.id] && (
                          <div className="mt-2 bg-terminal-bg rounded p-2 max-h-40 overflow-y-auto font-mono text-xs">
                            {(!jobLogs[item.id] || jobLogs[item.id].length === 0) ? (
                              <p className="text-terminal-textMuted italic">{t.instructionQueue.noLogs}</p>
                            ) : (
                              jobLogs[item.id].map((log, idx) => (
                                <div key={idx} className="flex gap-2 py-0.5">
                                  <span className="text-terminal-textMuted flex-shrink-0">
                                    {log.timestamp.toLocaleTimeString()}
                                  </span>
                                  {log.stage && (
                                    <span className="text-blue-400 flex-shrink-0">[{log.stage}]</span>
                                  )}
                                  <span className="text-terminal-text whitespace-pre-wrap break-all">
                                    {log.message}
                                  </span>
                                </div>
                              ))
                            )}
                            <div ref={(el) => { logsEndRef.current[item.id] = el }} />
                          </div>
                        )}
                      </div>
                    )}

                    {item.finishedAt && (
                      <p className="text-xs text-terminal-textMuted mt-1">
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
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {/* Cancel button for waiting jobs */}
                    {(item.status === 'waiting' || item.status === 'pending') && (
                      <button
                        onClick={(e) => handleCancelJob(item.id, e)}
                        className="p-1.5 text-terminal-textMuted hover:text-terminal-yellow hover:bg-terminal-yellow/10 rounded transition-colors"
                        title={t.instructionQueue.cancel}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete button for completed/failed jobs */}
                    {(item.status === 'completed' || item.status === 'failed' || item.status === 'dead-letter') && (
                      <button
                        onClick={(e) => handleDeleteJob(item.id, e)}
                        className="p-1.5 text-terminal-textMuted hover:text-terminal-red hover:bg-terminal-red/10 rounded transition-colors"
                        title={t.instructionQueue.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    {/* Expand/collapse chevron */}
                    <div className="text-terminal-textMuted">
                      {selectedJob?.id === item.id ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
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
                                  {/* Tools used indicator */}
                                  {parsed.toolsUsed && parsed.toolsUsed.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                      <span className="text-xs text-terminal-textMuted">{t.instructionQueue.tools}:</span>
                                      {parsed.toolsUsed.map((tool, idx) => (
                                        <span key={idx} className="badge badge-gray text-xs">
                                          {tool}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {/* Main response */}
                                  <div className="text-sm text-terminal-text bg-terminal-bg p-3 rounded overflow-x-auto whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                                    {parsed.text}
                                  </div>
                                  {(parsed.costUsd !== undefined || parsed.duration) && (
                                    <div className="flex gap-4 mt-2 text-xs text-terminal-textMuted">
                                      {parsed.costUsd !== undefined && <span>{t.instructionQueue.cost}: <span className="text-terminal-cyan">{formatCurrency(parsed.costUsd)}</span></span>}
                                      {parsed.duration && <span>{t.instructionQueue.apiDuration}: <span className="text-terminal-cyan">{parsed.duration}</span></span>}
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
                            <span>{t.instructionQueue.exitCode}: <span className={selectedJob.result.exitCode === 0 ? 'text-terminal-green' : 'text-terminal-red'}>{selectedJob.result.exitCode}</span></span>
                            <span>{t.instructionQueue.duration}: {formatDuration(selectedJob.result.duration)}</span>
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
                        <span>{t.instructionQueue.attempts}: {selectedJob.attemptsMade}/{selectedJob.maxAttempts}</span>
                        {selectedJob.processedAt && (
                          <span>{t.instructionQueue.processed}: {new Date(selectedJob.processedAt).toLocaleString()}</span>
                        )}
                        {selectedJob.finishedAt && (
                          <span>{t.instructionQueue.finished2}: {new Date(selectedJob.finishedAt).toLocaleString()}</span>
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
