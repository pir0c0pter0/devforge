import { create } from 'zustand'
import type { Container, Metrics } from '@/lib/types'

interface ContainerState {
  containers: Container[]
  selectedContainer: Container | null
  isLoading: boolean
  error: string | null

  setContainers: (containers: Container[]) => void
  addContainer: (container: Container) => void
  updateContainer: (id: string, updates: Partial<Container>) => void
  removeContainer: (id: string) => void
  setSelectedContainer: (container: Container | null) => void
  updateMetrics: (metrics: Metrics) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

export const useContainerStore = create<ContainerState>((set) => ({
  containers: [],
  selectedContainer: null,
  isLoading: false,
  error: null,

  setContainers: (containers) =>
    set({
      containers,
      error: null,
    }),

  addContainer: (container) =>
    set((state) => ({
      containers: [...state.containers, container],
    })),

  updateContainer: (id, updates) =>
    set((state) => ({
      containers: state.containers.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
      selectedContainer:
        state.selectedContainer?.id === id
          ? { ...state.selectedContainer, ...updates }
          : state.selectedContainer,
    })),

  removeContainer: (id) =>
    set((state) => ({
      containers: state.containers.filter((c) => c.id !== id),
      selectedContainer:
        state.selectedContainer?.id === id ? null : state.selectedContainer,
    })),

  setSelectedContainer: (container) =>
    set({
      selectedContainer: container,
    }),

  updateMetrics: (metrics) =>
    set((state) => ({
      containers: state.containers.map((c) =>
        c.id === metrics.containerId
          ? {
              ...c,
              metrics: {
                cpu: metrics.cpu,
                memory: metrics.memory,
                disk: metrics.disk,
              },
            }
          : c
      ),
      selectedContainer:
        state.selectedContainer?.id === metrics.containerId
          ? {
              ...state.selectedContainer,
              metrics: {
                cpu: metrics.cpu,
                memory: metrics.memory,
                disk: metrics.disk,
              },
            }
          : state.selectedContainer,
    })),

  setLoading: (isLoading) =>
    set({
      isLoading,
    }),

  setError: (error) =>
    set({
      error,
    }),

  clearError: () =>
    set({
      error: null,
    }),
}))
