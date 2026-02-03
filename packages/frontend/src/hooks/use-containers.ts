import { useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { useContainerStore } from '@/stores/container.store'

export function useContainers() {
  const {
    containers,
    isLoading,
    error,
    setContainers,
    setLoading,
    setError,
    updateContainer,
    removeContainer,
  } = useContainerStore()

  const fetchContainers = async () => {
    setLoading(true)
    setError(null)

    const response = await apiClient.listContainers()

    if (response.success && response.data) {
      setContainers(response.data)
    } else {
      setError(response.error || 'Failed to fetch containers')
    }

    setLoading(false)
  }

  const startContainer = async (id: string) => {
    updateContainer(id, { status: 'creating' })

    const response = await apiClient.startContainer(id)

    if (response.success) {
      await fetchContainers()
    } else {
      setError(response.error || 'Failed to start container')
      updateContainer(id, { status: 'stopped' })
    }
  }

  const stopContainer = async (id: string) => {
    updateContainer(id, { status: 'stopped' })

    const response = await apiClient.stopContainer(id)

    if (response.success) {
      await fetchContainers()
    } else {
      setError(response.error || 'Failed to stop container')
      updateContainer(id, { status: 'running' })
    }
  }

  const deleteContainer = async (id: string) => {
    const response = await apiClient.deleteContainer(id)

    if (response.success) {
      removeContainer(id)
    } else {
      setError(response.error || 'Failed to delete container')
    }
  }

  const restartContainer = async (id: string) => {
    updateContainer(id, { status: 'creating' })

    const response = await apiClient.restartContainer(id)

    if (response.success) {
      await fetchContainers()
    } else {
      setError(response.error || 'Failed to restart container')
    }
  }

  useEffect(() => {
    fetchContainers()
  }, [])

  return {
    containers,
    isLoading,
    error,
    fetchContainers,
    startContainer,
    stopContainer,
    deleteContainer,
    restartContainer,
  }
}
