'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

export interface ContainerProgress {
  taskId: string
  containerId?: string
  stage: string
  percentage: number
  message: string
  error?: string
}

interface UseContainerProgressReturn {
  progress: ContainerProgress | null
  socketId: string | null
  isConnected: boolean
  subscribe: (taskId: string) => void
  unsubscribe: () => void
  reset: () => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export function useContainerProgress(): UseContainerProgressReturn {
  const [progress, setProgress] = useState<ContainerProgress | null>(null)
  const [socketId, setSocketId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return

    // Connect to WebSocket /creation namespace
    const socket = io(`${API_URL}/creation`, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setSocketId(socket.id || null)
      setIsConnected(true)
    })

    socket.on('connect_error', (error) => {
      console.error('[Progress] Connection error:', error)
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('container:creation:progress', (data: ContainerProgress) => {
      if (currentTaskIdRef.current === data.taskId) {
        setProgress(data)
      }
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  const subscribe = useCallback((taskId: string) => {
    currentTaskIdRef.current = taskId
    socketRef.current?.emit('subscribe:task', taskId)
  }, [])

  const unsubscribe = useCallback(() => {
    if (currentTaskIdRef.current) {
      socketRef.current?.emit('unsubscribe:task', currentTaskIdRef.current)
      currentTaskIdRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    setProgress(null)
    currentTaskIdRef.current = null
  }, [])

  return {
    progress,
    socketId,
    isConnected,
    subscribe,
    unsubscribe,
    reset,
  }
}
