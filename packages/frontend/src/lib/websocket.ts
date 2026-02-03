import { io, Socket } from 'socket.io-client'
import type { Metrics, Container } from './types'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'

export type SocketEventHandler = {
  onMetricsUpdate?: (metrics: Metrics) => void
  onContainerUpdate?: (container: Container) => void
  onQueueUpdate?: (data: { containerId: string; queueLength: number }) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

class WebSocketClient {
  private socket: Socket | null = null
  private handlers: SocketEventHandler = {}

  connect(handlers: SocketEventHandler = {}): void {
    if (this.socket?.connected) {
      return
    }

    this.handlers = handlers
    this.socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    })

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    if (!this.socket) return

    this.socket.on('connect', () => {
      this.handlers.onConnect?.()
    })

    this.socket.on('disconnect', () => {
      this.handlers.onDisconnect?.()
    })

    this.socket.on('error', (error: Error) => {
      this.handlers.onError?.(error)
    })

    this.socket.on('metrics:update', (metrics: Metrics) => {
      this.handlers.onMetricsUpdate?.(metrics)
    })

    this.socket.on('container:update', (container: Container) => {
      this.handlers.onContainerUpdate?.(container)
    })

    this.socket.on('queue:update', (data: { containerId: string; queueLength: number }) => {
      this.handlers.onQueueUpdate?.(data)
    })
  }

  subscribeToContainer(containerId: string, interval?: number): void {
    this.socket?.emit('subscribe:metrics', { containerId, interval: interval ?? 2000 })
  }

  unsubscribeFromContainer(_containerId: string): void {
    this.socket?.emit('unsubscribe:metrics')
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false
  }
}

export const wsClient = new WebSocketClient()
