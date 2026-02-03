'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { apiClient } from '@/lib/api-client'
import type { Task } from '@/lib/types'

export interface UseTaskPollingOptions {
  pollInterval?: number
  onComplete?: (task: Task) => void
  onError?: (task: Task) => void
}

export function useTaskPolling(
  taskId: string | null,
  options: UseTaskPollingOptions = {}
) {
  const { pollInterval = 1000, onComplete, onError } = options
  const [task, setTask] = useState<Task | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const completedRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsPolling(false)
  }, [])

  const startPolling = useCallback(
    async (id: string) => {
      stopPolling()
      setIsPolling(true)
      completedRef.current = false

      const poll = async () => {
        try {
          const response = await apiClient.getTask(id)
          if (response.success && response.data) {
            setTask(response.data)

            // Stop polling if task is done
            if (response.data.status === 'completed') {
              if (!completedRef.current) {
                completedRef.current = true
                onComplete?.(response.data)
              }
              stopPolling()
            } else if (response.data.status === 'failed') {
              if (!completedRef.current) {
                completedRef.current = true
                onError?.(response.data)
              }
              stopPolling()
            }
          }
        } catch (error) {
          console.error('Error polling task:', error)
        }
      }

      // Poll immediately, then at interval
      await poll()
      intervalRef.current = setInterval(poll, pollInterval)
    },
    [pollInterval, onComplete, onError, stopPolling]
  )

  useEffect(() => {
    if (taskId) {
      startPolling(taskId)
    }
    return stopPolling
  }, [taskId, startPolling, stopPolling])

  return { task, isPolling, startPolling, stopPolling }
}
