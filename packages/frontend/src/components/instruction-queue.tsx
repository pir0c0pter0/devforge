'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import type { QueueItem } from '@/lib/types'
import { AnimatedDots } from '@/components/ui/animated-dots'
import clsx from 'clsx'

interface InstructionQueueProps {
  containerId: string
}

export function InstructionQueue({ containerId }: InstructionQueueProps) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newInstruction, setNewInstruction] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchQueue = async () => {
    setIsLoading(true)
    setError(null)

    const response = await apiClient.getQueue(containerId)

    if (response.success && response.data) {
      setQueue(response.data)
    } else {
      setError(response.error || 'Failed to fetch queue')
    }

    setIsLoading(false)
  }

  useEffect(() => {
    fetchQueue()
  }, [containerId])

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
      setError(response.error || 'Failed to add instruction')
    }

    setIsSubmitting(false)
  }

  const statusColors = {
    pending: 'badge-gray',
    running: 'badge-warning',
    completed: 'badge-success',
    failed: 'badge-danger',
  }

  const statusIcons = {
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
  }

  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent"></div>
          <p className="mt-2 text-sm text-terminal-textMuted">
            <AnimatedDots text="Loading queue" />
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="p-6 border-b border-terminal-border">
        <h3 className="text-lg font-semibold text-terminal-text mb-4">
          Instruction Queue
        </h3>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={newInstruction}
            onChange={(e) => setNewInstruction(e.target.value)}
            placeholder="Enter instruction..."
            className="input flex-1"
            disabled={isSubmitting}
          />
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? <AnimatedDots text="Adding" /> : 'Add'}
          </button>
        </form>

        {error && (
          <p className="mt-2 text-sm text-terminal-red">{error}</p>
        )}
      </div>

      <div className="divide-y divide-terminal-border max-h-[400px] overflow-y-auto">
        {queue.length === 0 ? (
          <div className="p-6 text-center text-terminal-textMuted">
            No instructions in queue
          </div>
        ) : (
          queue.map((item) => (
            <div key={item.id} className="p-4 hover:bg-terminal-bg transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={clsx('badge', statusColors[item.status])}>
                      <span className="mr-1">{statusIcons[item.status]}</span>
                      {item.status}
                    </span>
                    <span className="text-xs text-terminal-textMuted">
                      Added {new Date(item.addedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-terminal-text font-medium mb-1">
                    {item.instruction}
                  </p>
                  {item.startedAt && (
                    <p className="text-xs text-terminal-textMuted">
                      Started {new Date(item.startedAt).toLocaleTimeString()}
                    </p>
                  )}
                  {item.completedAt && (
                    <p className="text-xs text-terminal-textMuted">
                      Completed {new Date(item.completedAt).toLocaleTimeString()}
                    </p>
                  )}
                  {item.result && (
                    <div className="mt-2 p-2 bg-terminal-bgLight rounded text-xs font-mono">
                      {item.result}
                    </div>
                  )}
                  {item.error && (
                    <div className="mt-2 p-2 bg-terminal-red/10 rounded text-xs text-terminal-red">
                      {item.error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
