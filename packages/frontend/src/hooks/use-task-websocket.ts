'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import type { Task } from '@/lib/types'
import { apiClient } from '@/lib/api-client'

/**
 * Task event types matching backend WebSocket events
 */
export enum TaskEvent {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  PROGRESS = 'PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * Payload received from task:event WebSocket messages
 */
export interface TaskEventPayload {
  event: TaskEvent
  task: Task
  timestamp: Date
  meta?: {
    previousStatus?: string
    errorDetails?: string
    estimatedTimeRemaining?: number
  }
}

export interface UseTaskWebSocketOptions {
  /** Callback when task completes */
  onComplete?: (task: Task) => void
  /** Callback when task fails */
  onError?: (task: Task) => void
  /** Callback for any task update */
  onUpdate?: (payload: TaskEventPayload) => void
  /** Enable automatic reconnection (default: true) */
  autoReconnect?: boolean
  /** Maximum reconnection attempts (default: 10) */
  maxReconnectAttempts?: number
  /** Enable fallback to HTTP polling when WebSocket fails (default: true) */
  enableFallback?: boolean
}

export interface UseTaskWebSocketReturn {
  /** Current single-subscribed task */
  task: Task | null
  /** Map of all subscribed tasks (for batch subscriptions) */
  tasks: Map<string, Task>
  /** WebSocket connection status */
  isConnected: boolean
  /** Socket ID when connected */
  socketId: string | null
  /** Whether currently using HTTP polling fallback */
  isUsingFallback: boolean
  /** Subscribe to a single task's updates */
  subscribe: (taskId: string) => void
  /** Unsubscribe from current single task */
  unsubscribe: () => void
  /** Subscribe to multiple tasks at once */
  subscribeBatch: (taskIds: string[]) => void
  /** Unsubscribe from all batch tasks */
  unsubscribeBatch: () => void
  /** Reset all state */
  reset: () => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Exponential backoff parameters
const BASE_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000

// Polling backoff parameters
const BASE_POLL_INTERVAL = 1000
const MAX_POLL_INTERVAL = 30000

// Check if WebSocket is supported in the browser
const isWebSocketSupported = (): boolean => {
  if (typeof window === 'undefined') return false
  return 'WebSocket' in window || 'MozWebSocket' in window
}

export function useTaskWebSocket(
  options: UseTaskWebSocketOptions = {}
): UseTaskWebSocketReturn {
  const {
    onComplete,
    onError,
    onUpdate,
    autoReconnect = true,
    maxReconnectAttempts = 10,
    enableFallback = true,
  } = options

  const [task, setTask] = useState<Task | null>(null)
  const [tasks, setTasks] = useState<Map<string, Task>>(new Map())
  const [isConnected, setIsConnected] = useState(false)
  const [socketId, setSocketId] = useState<string | null>(null)
  const [isUsingFallback, setIsUsingFallback] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)
  const batchTaskIdsRef = useRef<Set<string>>(new Set())
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Polling fallback refs
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollAttemptRef = useRef(0)
  const completedTasksRef = useRef<Set<string>>(new Set())

  // Store callbacks in refs to avoid recreating socket handlers
  const onCompleteRef = useRef(onComplete)
  const onErrorRef = useRef(onError)
  const onUpdateRef = useRef(onUpdate)

  useEffect(() => {
    onCompleteRef.current = onComplete
    onErrorRef.current = onError
    onUpdateRef.current = onUpdate
  }, [onComplete, onError, onUpdate])

  // Calculate reconnection delay with exponential backoff
  const getReconnectDelay = useCallback(() => {
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current),
      MAX_RECONNECT_DELAY
    )
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000
  }, [])

  // Calculate polling interval with exponential backoff
  const getPollInterval = useCallback(() => {
    const interval = Math.min(
      BASE_POLL_INTERVAL * Math.pow(2, pollAttemptRef.current),
      MAX_POLL_INTERVAL
    )
    return interval
  }, [])

  // Clear reconnection timeout
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  // Stop polling fallback
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    pollAttemptRef.current = 0
  }, [])

  // Handle task event updates
  const handleTaskEvent = useCallback((payload: TaskEventPayload) => {
    const { event, task: taskData } = payload

    // Call update callback
    onUpdateRef.current?.(payload)

    // Update single task if subscribed
    if (currentTaskIdRef.current === taskData.id) {
      setTask(taskData)
    }

    // Update batch tasks if subscribed
    if (batchTaskIdsRef.current.has(taskData.id)) {
      setTasks((prev) => {
        const newMap = new Map(prev)
        newMap.set(taskData.id, taskData)
        return newMap
      })
    }

    // Handle completion/failure callbacks
    if (event === TaskEvent.COMPLETED) {
      onCompleteRef.current?.(taskData)
    } else if (event === TaskEvent.FAILED) {
      onErrorRef.current?.(taskData)
    }
  }, [])

  // Determine task event from status change
  const getTaskEventFromStatus = useCallback(
    (taskData: Task, previousStatus?: string): TaskEvent => {
      if (taskData.status === 'completed') return TaskEvent.COMPLETED
      if (taskData.status === 'failed') return TaskEvent.FAILED
      if (taskData.status === 'running' && previousStatus !== 'running') {
        return TaskEvent.PROGRESS
      }
      return TaskEvent.UPDATED
    },
    []
  )

  // Poll a single task via HTTP
  const pollTask = useCallback(
    async (taskId: string): Promise<Task | null> => {
      try {
        const response = await apiClient.getTask(taskId)
        if (response.success && response.data) {
          return response.data
        }
        return null
      } catch (error) {
        console.error('[TaskWS Fallback] Error polling task:', taskId, error)
        return null
      }
    },
    []
  )

  // Start HTTP polling fallback
  const startPollingFallback = useCallback(() => {
    if (!enableFallback) return

    console.log('[TaskWS Fallback] Starting HTTP polling fallback')
    setIsUsingFallback(true)
    pollAttemptRef.current = 0
    completedTasksRef.current.clear()

    const schedulePoll = () => {
      const interval = getPollInterval()
      console.log(`[TaskWS Fallback] Next poll in ${interval}ms`)

      pollingIntervalRef.current = setTimeout(async () => {
        // Collect all task IDs to poll
        const taskIdsToPoll: string[] = []
        if (currentTaskIdRef.current) {
          taskIdsToPoll.push(currentTaskIdRef.current)
        }
        batchTaskIdsRef.current.forEach((id) => taskIdsToPoll.push(id))

        // Filter out already completed tasks
        const activeTasks = taskIdsToPoll.filter(
          (id) => !completedTasksRef.current.has(id)
        )

        if (activeTasks.length === 0) {
          console.log('[TaskWS Fallback] No active tasks to poll, stopping')
          stopPolling()
          return
        }

        // Poll all active tasks in parallel
        const results = await Promise.all(
          activeTasks.map(async (taskId) => {
            const taskData = await pollTask(taskId)
            return { taskId, taskData }
          })
        )

        // Process results
        for (const { taskId, taskData } of results) {
          if (!taskData) continue

          // Get previous task state for comparison
          let previousStatus: string | undefined
          if (currentTaskIdRef.current === taskId) {
            previousStatus = task?.status
          } else {
            previousStatus = tasks.get(taskId)?.status
          }

          // Create event payload
          const event = getTaskEventFromStatus(taskData, previousStatus)
          const payload: TaskEventPayload = {
            event,
            task: taskData,
            timestamp: new Date(),
            meta: { previousStatus },
          }

          // Handle the event
          handleTaskEvent(payload)

          // Track completed tasks
          if (taskData.status === 'completed' || taskData.status === 'failed') {
            completedTasksRef.current.add(taskId)
          }
        }

        // Increase backoff on successful poll (up to max)
        if (pollAttemptRef.current < 5) {
          pollAttemptRef.current++
        }

        // Schedule next poll
        schedulePoll()
      }, interval)
    }

    // Start polling immediately
    schedulePoll()
  }, [
    enableFallback,
    getPollInterval,
    pollTask,
    handleTaskEvent,
    getTaskEventFromStatus,
    stopPolling,
    task,
    tasks,
  ])

  // Store startPollingFallback in a ref to use in effect
  const startPollingFallbackRef = useRef(startPollingFallback)
  useEffect(() => {
    startPollingFallbackRef.current = startPollingFallback
  }, [startPollingFallback])

  // Initialize WebSocket connection
  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return

    // Check WebSocket support - fallback immediately if not supported
    if (!isWebSocketSupported()) {
      console.log('[TaskWS] WebSocket not supported, using HTTP polling fallback')
      if (enableFallback) {
        startPollingFallbackRef.current()
      }
      return
    }

    const connectSocket = () => {
      // Connect to WebSocket /tasks namespace
      const socket = io(`${API_URL}/tasks`, {
        transports: ['websocket', 'polling'],
        reconnection: false, // We handle reconnection manually for exponential backoff
      })

      socketRef.current = socket

      socket.on('connect', () => {
        console.log('[TaskWS] Connected to /tasks namespace:', socket.id)
        setSocketId(socket.id || null)
        setIsConnected(true)
        reconnectAttemptsRef.current = 0

        // Switch back from fallback polling to WebSocket
        if (isUsingFallback) {
          console.log('[TaskWS] WebSocket reconnected, stopping HTTP polling fallback')
          stopPolling()
          setIsUsingFallback(false)
        }

        // Re-subscribe to tasks after reconnection
        if (currentTaskIdRef.current) {
          socket.emit('task:subscribe', { taskId: currentTaskIdRef.current })
        }
        if (batchTaskIdsRef.current.size > 0) {
          socket.emit('task:subscribe:batch', {
            taskIds: Array.from(batchTaskIdsRef.current),
          })
        }
      })

      socket.on('connect_error', (error) => {
        console.error('[TaskWS] Connection error:', error)
        setIsConnected(false)

        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = getReconnectDelay()
          console.log(
            `[TaskWS] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`
          )
          reconnectAttemptsRef.current++

          clearReconnectTimeout()
          reconnectTimeoutRef.current = setTimeout(() => {
            if (socketRef.current) {
              socketRef.current.disconnect()
            }
            connectSocket()
          }, delay)
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          // Max reconnect attempts reached - fallback to HTTP polling
          console.log('[TaskWS] Max reconnect attempts reached, falling back to HTTP polling')
          if (enableFallback && !isUsingFallback) {
            startPollingFallbackRef.current()
          }
        }
      })

      socket.on('disconnect', (reason) => {
        console.log('[TaskWS] Disconnected from /tasks namespace:', reason)
        setIsConnected(false)
        setSocketId(null)

        // Auto-reconnect on unexpected disconnects
        if (
          autoReconnect &&
          reason !== 'io client disconnect' &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          const delay = getReconnectDelay()
          console.log(
            `[TaskWS] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`
          )
          reconnectAttemptsRef.current++

          clearReconnectTimeout()
          reconnectTimeoutRef.current = setTimeout(connectSocket, delay)
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          // Max reconnect attempts reached - fallback to HTTP polling
          console.log('[TaskWS] Max reconnect attempts reached, falling back to HTTP polling')
          if (enableFallback && !isUsingFallback) {
            startPollingFallbackRef.current()
          }
        }
      })

      // Listen for task events
      socket.on('task:event', (payload: TaskEventPayload) => {
        console.log('[TaskWS] Received task:event:', payload)
        handleTaskEvent(payload)
      })
    }

    connectSocket()

    return () => {
      clearReconnectTimeout()
      stopPolling()
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [autoReconnect, maxReconnectAttempts, enableFallback, isUsingFallback, getReconnectDelay, clearReconnectTimeout, stopPolling, handleTaskEvent])

  // Subscribe to a single task
  const subscribe = useCallback(
    async (taskId: string) => {
      console.log(
        '[TaskWS] Subscribing to task:',
        taskId,
        'Socket connected:',
        !!socketRef.current?.connected,
        'Using fallback:',
        isUsingFallback
      )

      // Unsubscribe from previous task if any
      if (currentTaskIdRef.current && currentTaskIdRef.current !== taskId) {
        socketRef.current?.emit('task:unsubscribe', {
          taskId: currentTaskIdRef.current,
        })
      }

      currentTaskIdRef.current = taskId
      setTask(null) // Reset task state for new subscription
      completedTasksRef.current.delete(taskId) // Allow re-polling if re-subscribed

      // IMMEDIATELY fetch task state - handles already-completed tasks
      try {
        const response = await apiClient.getTask(taskId)
        if (response.success && response.data) {
          const taskData = response.data
          setTask(taskData)

          // If task is already completed/failed, trigger callbacks immediately
          if (taskData.status === 'completed') {
            console.log('[TaskWS] Task already completed:', taskId)
            onCompleteRef.current?.(taskData)
            return // Don't subscribe to WebSocket for completed tasks
          } else if (taskData.status === 'failed') {
            console.log('[TaskWS] Task already failed:', taskId)
            onErrorRef.current?.(taskData)
            return // Don't subscribe to WebSocket for failed tasks
          }
        }
      } catch (error) {
        console.error('[TaskWS] Error fetching initial task state:', error)
      }

      if (socketRef.current?.connected) {
        socketRef.current.emit('task:subscribe', { taskId })
      } else if (isUsingFallback && !pollingIntervalRef.current) {
        // Start polling if in fallback mode and not already polling
        startPollingFallbackRef.current()
      }
    },
    [isUsingFallback]
  )

  // Unsubscribe from current single task
  const unsubscribe = useCallback(() => {
    if (currentTaskIdRef.current) {
      console.log('[TaskWS] Unsubscribing from task:', currentTaskIdRef.current)
      socketRef.current?.emit('task:unsubscribe', {
        taskId: currentTaskIdRef.current,
      })
      completedTasksRef.current.add(currentTaskIdRef.current) // Mark as completed to stop polling
      currentTaskIdRef.current = null
      setTask(null)
    }
  }, [])

  // Subscribe to multiple tasks
  const subscribeBatch = useCallback(
    (taskIds: string[]) => {
      console.log(
        '[TaskWS] Subscribing to batch:',
        taskIds,
        'Socket connected:',
        !!socketRef.current?.connected,
        'Using fallback:',
        isUsingFallback
      )

      // Add new task IDs to the set
      taskIds.forEach((id) => {
        batchTaskIdsRef.current.add(id)
        completedTasksRef.current.delete(id) // Allow re-polling if re-subscribed
      })

      if (socketRef.current?.connected) {
        socketRef.current.emit('task:subscribe:batch', { taskIds })
      } else if (isUsingFallback && !pollingIntervalRef.current) {
        // Start polling if in fallback mode and not already polling
        startPollingFallbackRef.current()
      }
    },
    [isUsingFallback]
  )

  // Unsubscribe from all batch tasks
  const unsubscribeBatch = useCallback(() => {
    if (batchTaskIdsRef.current.size > 0) {
      console.log(
        '[TaskWS] Unsubscribing from batch:',
        Array.from(batchTaskIdsRef.current)
      )
      // Mark all batch tasks as completed to stop polling
      batchTaskIdsRef.current.forEach((id) => completedTasksRef.current.add(id))
      // Note: No batch unsubscribe event defined in shared types
      // Unsubscribe from each task individually
      Array.from(batchTaskIdsRef.current).forEach((taskId) => {
        socketRef.current?.emit('task:unsubscribe', { taskId })
      })
      batchTaskIdsRef.current.clear()
      setTasks(new Map())
    }
  }, [])

  // Reset all state
  const reset = useCallback(() => {
    unsubscribe()
    unsubscribeBatch()
    stopPolling()
    completedTasksRef.current.clear()
    setTask(null)
    setTasks(new Map())
  }, [unsubscribe, unsubscribeBatch, stopPolling])

  return {
    task,
    tasks,
    isConnected,
    socketId,
    isUsingFallback,
    subscribe,
    unsubscribe,
    subscribeBatch,
    unsubscribeBatch,
    reset,
  }
}
