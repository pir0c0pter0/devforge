import { logger } from '../utils/logger'
import { claudeDaemonService } from './claude-daemon.service'
import type { DaemonState } from '@claude-docker/shared'

/**
 * Health event types for Claude Daemon monitoring
 */
type HealthEventType = 'health' | 'recovering' | 'recovered' | 'recovery_failed'

/**
 * Health event payload sent to frontend
 */
interface HealthEvent extends Record<string, unknown> {
  type: HealthEventType
  containerId: string
  status?: string
  message: string
  timestamp: string
  attempts?: number
  lastError?: string
}

/**
 * Health status for a monitored container
 */
interface HealthStatus {
  containerId: string
  healthy: boolean
  lastCheck: Date
  consecutiveFailures: number
  lastError?: string
  recovering: boolean
}

/**
 * Monitor configuration options
 */
interface MonitorConfig {
  checkIntervalMs: number      // Interval between health checks (default: 30s)
  maxRecoveryAttempts: number  // Maximum recovery attempts (default: 3)
  recoveryDelayMs: number      // Delay between recovery attempts (default: 5s)
}

const DEFAULT_CONFIG: MonitorConfig = {
  checkIntervalMs: 30000,      // 30 seconds
  maxRecoveryAttempts: 3,
  recoveryDelayMs: 5000,       // 5 seconds
}

/**
 * Health Monitor Service
 *
 * Monitors Claude Daemon health, attempts auto-recovery, and notifies users
 * when recovery fails after maximum attempts.
 */
class HealthMonitorService {
  private healthStatus = new Map<string, HealthStatus>()
  private monitorIntervals = new Map<string, NodeJS.Timeout>()
  private config: MonitorConfig = { ...DEFAULT_CONFIG }
  private eventEmitter: ((containerId: string, event: Record<string, unknown>) => void) | null = null

  /**
   * Set the event emitter function for sending health events
   * This will be called from websocket.service.ts during initialization
   */
  setEventEmitter(emitter: (containerId: string, event: Record<string, unknown>) => void): void {
    this.eventEmitter = emitter
  }

  /**
   * Emit a health event to the frontend
   */
  private emitEvent(containerId: string, event: HealthEvent): void {
    if (this.eventEmitter) {
      // HealthEvent extends Record<string, unknown>, safe to pass
      this.eventEmitter(containerId, event as Record<string, unknown>)
    } else {
      logger.warn({ containerId, event }, 'Event emitter not set, cannot emit health event')
    }
  }

  /**
   * Start monitoring health for a container
   */
  startMonitoring(containerId: string): void {
    if (this.monitorIntervals.has(containerId)) {
      logger.debug({ containerId }, 'Monitor already running')
      return
    }

    // Initialize health status
    this.healthStatus.set(containerId, {
      containerId,
      healthy: true,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      recovering: false,
    })

    // Start periodic health checks
    const interval = setInterval(
      () => this.performHealthCheck(containerId),
      this.config.checkIntervalMs
    )

    this.monitorIntervals.set(containerId, interval)

    logger.info({ containerId, intervalMs: this.config.checkIntervalMs }, 'Health monitoring started')

    // Perform first check immediately
    this.performHealthCheck(containerId)
  }

  /**
   * Stop monitoring a container
   */
  stopMonitoring(containerId: string): void {
    const interval = this.monitorIntervals.get(containerId)
    if (interval) {
      clearInterval(interval)
      this.monitorIntervals.delete(containerId)
      this.healthStatus.delete(containerId)
      logger.info({ containerId }, 'Health monitoring stopped')
    }
  }

  /**
   * Perform health check on a container
   */
  private async performHealthCheck(containerId: string): Promise<void> {
    const status = this.healthStatus.get(containerId)
    if (!status || status.recovering) {
      return // Skip if not exists or currently recovering
    }

    try {
      const daemonStatus: DaemonState | null = claudeDaemonService.getStatus(containerId)

      if (daemonStatus && daemonStatus.status === 'running') {
        // Daemon is healthy
        if (!status.healthy || status.consecutiveFailures > 0) {
          logger.info({ containerId }, 'Daemon recovered and healthy')
          this.emitEvent(containerId, {
            type: 'health',
            containerId,
            status: 'healthy',
            message: 'Claude daemon is running normally',
            timestamp: new Date().toISOString()
          })
        }

        status.healthy = true
        status.consecutiveFailures = 0
        status.lastError = undefined
      } else {
        // Daemon is not running
        throw new Error(`Daemon status: ${daemonStatus?.status || 'not found'}`)
      }

      status.lastCheck = new Date()

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      status.healthy = false
      status.consecutiveFailures++
      status.lastError = errorMessage
      status.lastCheck = new Date()

      logger.warn({
        containerId,
        failures: status.consecutiveFailures,
        error: errorMessage
      }, 'Health check failed')

      // Attempt recovery
      await this.attemptRecovery(containerId)
    }
  }

  /**
   * Attempt to recover a failed daemon
   */
  private async attemptRecovery(containerId: string): Promise<void> {
    const status = this.healthStatus.get(containerId)
    if (!status) return

    if (status.consecutiveFailures > this.config.maxRecoveryAttempts) {
      // Exceeded maximum attempts - notify user
      logger.error({
        containerId,
        attempts: status.consecutiveFailures
      }, 'Recovery failed - notifying user')

      this.emitEvent(containerId, {
        type: 'recovery_failed',
        containerId,
        message: `Claude daemon failed after ${this.config.maxRecoveryAttempts} recovery attempts. Manual intervention required.`,
        attempts: status.consecutiveFailures,
        lastError: status.lastError,
        timestamp: new Date().toISOString()
      })

      // Stop monitoring to avoid spam
      this.stopMonitoring(containerId)
      return
    }

    // Mark as recovering
    status.recovering = true

    logger.info({
      containerId,
      attempt: status.consecutiveFailures
    }, 'Attempting daemon recovery')

    this.emitEvent(containerId, {
      type: 'recovering',
      containerId,
      message: `Attempting to recover Claude daemon (attempt ${status.consecutiveFailures}/${this.config.maxRecoveryAttempts})`,
      attempts: status.consecutiveFailures,
      timestamp: new Date().toISOString()
    })

    try {
      // Stop daemon if in bad state
      try {
        await claudeDaemonService.stopDaemon(containerId)
      } catch {
        // Ignore error - daemon may already be stopped
      }

      // Wait before restarting
      await new Promise(resolve => setTimeout(resolve, this.config.recoveryDelayMs))

      // Get container's dockerId from daemon service state or repository
      const existingState = claudeDaemonService.getStatus(containerId)
      if (!existingState) {
        throw new Error('Cannot recover: no existing daemon state found')
      }

      // Restart daemon (we need the dockerId, which should be in the container repository)
      // Import containerRepository to get dockerId
      const { containerRepository } = await import('../repositories')
      const container = containerRepository.findById(containerId)
      if (!container || !container.dockerId) {
        throw new Error('Cannot recover: container not found or has no Docker ID')
      }

      await claudeDaemonService.startDaemon(containerId, container.dockerId)

      // Verify it started
      await new Promise(resolve => setTimeout(resolve, 2000))
      const newStatus = claudeDaemonService.getStatus(containerId)

      if (newStatus && newStatus.status === 'running') {
        logger.info({ containerId }, 'Daemon recovered successfully')
        status.healthy = true
        status.consecutiveFailures = 0
        status.lastError = undefined

        this.emitEvent(containerId, {
          type: 'recovered',
          containerId,
          message: 'Claude daemon recovered successfully',
          timestamp: new Date().toISOString()
        })
      } else {
        throw new Error('Daemon did not start after recovery attempt')
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ containerId, error: errorMessage }, 'Recovery attempt failed')
      status.lastError = errorMessage
    } finally {
      status.recovering = false
    }
  }

  /**
   * Get health status for a container
   */
  getHealthStatus(containerId: string): HealthStatus | undefined {
    return this.healthStatus.get(containerId)
  }

  /**
   * Get all health statuses
   */
  getAllHealthStatus(): HealthStatus[] {
    return Array.from(this.healthStatus.values())
  }

  /**
   * Stop all monitors
   */
  stopAllMonitoring(): void {
    for (const [containerId] of this.monitorIntervals) {
      this.stopMonitoring(containerId)
    }
    logger.info('All health monitors stopped')
  }

  /**
   * Update monitor configuration
   */
  updateConfig(newConfig: Partial<MonitorConfig>): void {
    Object.assign(this.config, newConfig)
    logger.info({ config: this.config }, 'Health monitor config updated')
  }

  /**
   * Get current configuration
   */
  getConfig(): MonitorConfig {
    return { ...this.config }
  }

  /**
   * Destrói o serviço completamente
   * Chamado durante graceful shutdown
   */
  destroy(): void {
    this.stopAllMonitoring()
    this.eventEmitter = null
    logger.info('Health monitor service destroyed')
  }
}

/**
 * Singleton instance
 */
export const healthMonitorService = new HealthMonitorService()

/**
 * Export types for use in other modules
 */
export type { HealthStatus, MonitorConfig, HealthEvent, HealthEventType }
