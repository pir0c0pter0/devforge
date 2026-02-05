import { create } from 'zustand'
import type { ClaudeMessage, DaemonState, ProcessingState } from '@/hooks/use-claude-daemon'

interface ClaudeChatState {
  // Messages per container (keyed by containerId)
  messagesByContainer: Record<string, ClaudeMessage[]>
  // Daemon status per container
  daemonStatusByContainer: Record<string, DaemonState | null>
  // Message ID counter per container
  messageIdCounterByContainer: Record<string, number>
  // Processing state per container (moved from useState in useClaudeDaemon for persistence across tab switches)
  processingStateByContainer: Record<string, ProcessingState>
  // Notification badge per container (shows when Claude completes while on another tab)
  hasNotificationByContainer: Record<string, boolean>

  // Actions
  addMessage: (containerId: string, message: ClaudeMessage) => void
  setMessages: (containerId: string, messages: ClaudeMessage[]) => void
  clearMessages: (containerId: string) => void
  setDaemonStatus: (containerId: string, status: DaemonState | null) => void
  getNextMessageId: (containerId: string) => string
  setProcessingState: (containerId: string, state: ProcessingState) => void
  setHasNotification: (containerId: string, hasNotification: boolean) => void
}

const DEFAULT_PROCESSING_STATE: ProcessingState = {
  isProcessing: false,
  stage: 'idle',
}

export const useClaudeChatStore = create<ClaudeChatState>((set, get) => ({
  messagesByContainer: {},
  daemonStatusByContainer: {},
  messageIdCounterByContainer: {},
  processingStateByContainer: {},
  hasNotificationByContainer: {},

  addMessage: (containerId, message) =>
    set((state) => ({
      messagesByContainer: {
        ...state.messagesByContainer,
        [containerId]: [
          ...(state.messagesByContainer[containerId] || []),
          message,
        ],
      },
    })),

  setMessages: (containerId, messages) =>
    set((state) => ({
      messagesByContainer: {
        ...state.messagesByContainer,
        [containerId]: messages,
      },
    })),

  clearMessages: (containerId) =>
    set((state) => ({
      messagesByContainer: {
        ...state.messagesByContainer,
        [containerId]: [],
      },
      messageIdCounterByContainer: {
        ...state.messageIdCounterByContainer,
        [containerId]: 0,
      },
    })),

  setDaemonStatus: (containerId, status) =>
    set((state) => ({
      daemonStatusByContainer: {
        ...state.daemonStatusByContainer,
        [containerId]: status,
      },
    })),

  getNextMessageId: (containerId) => {
    const state = get()
    const currentCounter = state.messageIdCounterByContainer[containerId] || 0
    const nextCounter = currentCounter + 1

    set((state) => ({
      messageIdCounterByContainer: {
        ...state.messageIdCounterByContainer,
        [containerId]: nextCounter,
      },
    }))

    return `msg-${containerId}-${Date.now()}-${nextCounter}`
  },

  setProcessingState: (containerId, processingState) =>
    set((state) => ({
      processingStateByContainer: {
        ...state.processingStateByContainer,
        [containerId]: processingState,
      },
    })),

  setHasNotification: (containerId, hasNotification) =>
    set((state) => ({
      hasNotificationByContainer: {
        ...state.hasNotificationByContainer,
        [containerId]: hasNotification,
      },
    })),
}))

// Selector helpers
export const getProcessingState = (state: ClaudeChatState, containerId: string): ProcessingState =>
  state.processingStateByContainer[containerId] || DEFAULT_PROCESSING_STATE

export const getHasNotification = (state: ClaudeChatState, containerId: string): boolean =>
  state.hasNotificationByContainer[containerId] || false
