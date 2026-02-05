import { useEffect, useState } from 'react'
import { metricsWsClient } from '@/lib/websocket'
import { useContainerStore } from '@/stores/container.store'
import type { ContainerMetrics } from '@devforge/shared'

export function useMetrics(containerId?: string) {
  const { updateMetrics } = useContainerStore()
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const handleMetricsUpdate = (metrics: ContainerMetrics) => {
      if (!containerId || metrics.containerId === containerId) {
        updateMetrics(metrics)
      }
    }

    metricsWsClient.connect({
      onMetricsUpdate: handleMetricsUpdate,
      onConnect: () => {
        setIsConnected(true)
        if (containerId) {
          metricsWsClient.subscribeToContainer(containerId)
        }
      },
      onDisconnect: () => {
        setIsConnected(false)
      },
      onError: (error) => {
        console.error('WebSocket error:', error)
      },
    })

    if (containerId && metricsWsClient.isConnected()) {
      metricsWsClient.subscribeToContainer(containerId)
    }

    return () => {
      if (containerId) {
        metricsWsClient.unsubscribeFromContainer(containerId)
      }
    }
  }, [containerId, updateMetrics])

  return {
    isConnected,
  }
}
