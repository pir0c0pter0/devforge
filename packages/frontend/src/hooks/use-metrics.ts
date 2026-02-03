import { useEffect } from 'react'
import { wsClient } from '@/lib/websocket'
import { useContainerStore } from '@/stores/container.store'
import type { Metrics, Container } from '@/lib/types'

export function useMetrics(containerId?: string) {
  const { updateMetrics, updateContainer } = useContainerStore()

  useEffect(() => {
    const handleMetricsUpdate = (metrics: Metrics) => {
      if (!containerId || metrics.containerId === containerId) {
        updateMetrics(metrics)
      }
    }

    const handleContainerUpdate = (container: Container) => {
      if (!containerId || container.id === containerId) {
        updateContainer(container.id, container)
      }
    }

    const handleQueueUpdate = (data: { containerId: string; queueLength: number }) => {
      if (!containerId || data.containerId === containerId) {
        updateContainer(data.containerId, { queueLength: data.queueLength })
      }
    }

    wsClient.connect({
      onMetricsUpdate: handleMetricsUpdate,
      onContainerUpdate: handleContainerUpdate,
      onQueueUpdate: handleQueueUpdate,
      onConnect: () => {
        if (containerId) {
          wsClient.subscribeToContainer(containerId)
        }
      },
      onError: (error) => {
        console.error('WebSocket error:', error)
      },
    })

    if (containerId && wsClient.isConnected()) {
      wsClient.subscribeToContainer(containerId)
    }

    return () => {
      if (containerId) {
        wsClient.unsubscribeFromContainer(containerId)
      }
    }
  }, [containerId, updateMetrics, updateContainer])

  return {
    isConnected: wsClient.isConnected(),
  }
}
