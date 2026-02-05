import { io, Socket } from 'socket.io-client'
import type { ContainerMetrics } from '@claude-docker/shared'

const WS_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export type SocketEventHandler = {
  onMetricsUpdate?: (metrics: ContainerMetrics) => void
  onStatusUpdate?: (data: { containerId: string; status: string; timestamp: Date }) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

class MetricsWebSocketClient {
  private socket: Socket | null = null
  private handlers: SocketEventHandler = {}
  private subscribedContainerId: string | null = null

  connect(handlers: SocketEventHandler = {}): void {
    if (this.socket?.connected) {
      return
    }

    this.handlers = handlers
    // Connect to the /metrics namespace
    this.socket = io(`${WS_URL}/metrics`, {
      transports: ['polling', 'websocket'],
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
      console.log('[WebSocket] Connected to /metrics')
      this.handlers.onConnect?.()

      // Re-subscribe if we were subscribed before disconnect
      if (this.subscribedContainerId) {
        this.socket?.emit('subscribe:container', this.subscribedContainerId)
      }
    })

    this.socket.on('disconnect', () => {
      console.log('[WebSocket] Disconnected from /metrics')
      this.handlers.onDisconnect?.()
    })

    this.socket.on('connect_error', (error: Error) => {
      console.error('[WebSocket] Connection error:', error)
      this.handlers.onError?.(error)
    })

    // Listen for container metrics updates
    this.socket.on('container:metrics', (metrics: ContainerMetrics) => {
      this.handlers.onMetricsUpdate?.(metrics)
    })

    // Listen for container status updates
    this.socket.on('container:status', (data: { containerId: string; status: string; timestamp: Date }) => {
      this.handlers.onStatusUpdate?.(data)
    })
  }

  subscribeToContainer(containerId: string): void {
    if (!this.socket?.connected) {
      console.warn('[WebSocket] Cannot subscribe: not connected')
      // Store for later when we connect
      this.subscribedContainerId = containerId
      return
    }

    // Unsubscribe from previous container if any
    if (this.subscribedContainerId && this.subscribedContainerId !== containerId) {
      this.socket.emit('unsubscribe:container', this.subscribedContainerId)
    }

    this.subscribedContainerId = containerId
    this.socket.emit('subscribe:container', containerId)
    console.log(`[WebSocket] Subscribed to container ${containerId}`)
  }

  unsubscribeFromContainer(containerId: string): void {
    if (!this.socket?.connected) {
      this.subscribedContainerId = null
      return
    }

    this.socket.emit('unsubscribe:container', containerId)
    if (this.subscribedContainerId === containerId) {
      this.subscribedContainerId = null
    }
    console.log(`[WebSocket] Unsubscribed from container ${containerId}`)
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.subscribedContainerId = null
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false
  }

  getSubscribedContainerId(): string | null {
    return this.subscribedContainerId
  }
}

export const metricsWsClient = new MetricsWebSocketClient()

// Backwards compatibility export
export const wsClient = metricsWsClient
