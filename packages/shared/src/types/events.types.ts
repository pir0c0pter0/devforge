import type { ContainerMetrics } from './metrics.types'
import type { Instruction } from './instruction.types'
import type { ContainerStatus } from './container.types'

/**
 * Metrics event data sent from server to client
 */
export type MetricsEventData = ContainerMetrics

/**
 * Instruction event data sent from server to client
 */
export type InstructionEventData = Instruction

/**
 * Container status change event data
 */
export interface ContainerStatusEventData {
  /** Container ID */
  containerId: string
  /** New status */
  status: ContainerStatus
  /** Timestamp of status change */
  timestamp: Date
}

/**
 * Events sent from server to client
 */
export interface ServerToClientEvents {
  /** Real-time container metrics update */
  'container:metrics': (data: MetricsEventData) => void
  /** Container status changed */
  'container:status': (data: ContainerStatusEventData) => void
  /** New instruction added to queue */
  'instruction:pending': (data: InstructionEventData) => void
  /** Instruction started executing */
  'instruction:started': (data: InstructionEventData) => void
  /** Instruction execution progress update */
  'instruction:progress': (data: InstructionEventData) => void
  /** Instruction completed successfully */
  'instruction:completed': (data: InstructionEventData) => void
  /** Instruction execution failed */
  'instruction:failed': (data: InstructionEventData) => void
  /** Instruction confirmed by user (interactive mode) */
  'instruction:confirmed': (data: { instructionId: string; approved: boolean }) => void
  /** Container log line */
  log: (log: { timestamp: Date; message: string; stream: 'stdout' | 'stderr' }) => void
}

/**
 * Events sent from client to server
 */
export interface ClientToServerEvents {
  /** Subscribe to container updates */
  'subscribe:container': (containerId: string) => void
  /** Unsubscribe from container updates */
  'unsubscribe:container': (containerId: string) => void
  /** Confirm or reject instruction execution (interactive mode) */
  'instruction:confirm': (instructionId: string, approved: boolean) => void
}
