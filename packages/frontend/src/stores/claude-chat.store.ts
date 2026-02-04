import { create } from 'zustand'
import type { ClaudeMessage, DaemonState } from '@/hooks/use-claude-daemon'

interface ClaudeChatState {
  // Messages per container (keyed by containerId)
  messagesByContainer: Record<string, ClaudeMessage[]>
  // Daemon status per container
  daemonStatusByContainer: Record<string, DaemonState | null>
  // Message ID counter per container
  messageIdCounterByContainer: Record<string, number>

  // Actions
  addMessage: (containerId: string, message: ClaudeMessage) => void
  setMessages: (containerId: string, messages: ClaudeMessage[]) => void
  clearMessages: (containerId: string) => void
  setDaemonStatus: (containerId: string, status: DaemonState | null) => void
  getNextMessageId: (containerId: string) => string
}

export const useClaudeChatStore = create<ClaudeChatState>((set, get) => ({
  messagesByContainer: {},
  daemonStatusByContainer: {},
  messageIdCounterByContainer: {},

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
}))
