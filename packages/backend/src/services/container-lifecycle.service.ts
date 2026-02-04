import { logger } from '../utils/logger'
import * as claudeDaemonService from './claude-daemon.service'
import { healthMonitorService } from './health-monitor.service'
import { destroyQueue, resumeQueue, pauseQueue, getQueueStatus } from './claude-queue.service'
import { getOrCreateWorker, stopWorker } from '../workers/claude.worker'

/**
 * Tempo máximo para aguardar jobs ativos antes de parar container
 */
const MAX_WAIT_FOR_JOBS_MS = 30000

/**
 * Delay entre checks de jobs ativos
 */
const JOB_CHECK_INTERVAL_MS = 1000

/**
 * Container Lifecycle Service
 * Gerencia o ciclo de vida do Claude Code daemon em resposta a eventos de container
 */
class ContainerLifecycleService {
  /**
   * Chamado APÓS container iniciar com sucesso
   * Inicia daemon, health monitor e resume queue
   */
  async onContainerStart(containerId: string, dockerId: string): Promise<void> {
    logger.info({ containerId, dockerId }, 'Container started - initializing Claude environment')

    try {
      // 1. Iniciar Claude daemon
      logger.debug({ containerId }, 'Starting Claude daemon')
      await claudeDaemonService.claudeDaemonService.startDaemon(containerId, dockerId)
      logger.info({ containerId }, 'Claude daemon started')

      // 2. Iniciar health monitoring
      logger.debug({ containerId }, 'Starting health monitoring')
      healthMonitorService.startMonitoring(containerId)

      // 3. Garantir que worker existe
      logger.debug({ containerId }, 'Ensuring worker is running')
      getOrCreateWorker(containerId)

      // 4. Resumir queue (pode estar pausada de stop anterior)
      logger.debug({ containerId }, 'Resuming queue')
      try {
        await resumeQueue(containerId)
      } catch (error) {
        // Queue pode não existir ainda - ok
        logger.debug({ containerId, error }, 'Queue resume skipped (may not exist)')
      }

      logger.info({ containerId }, 'Claude environment initialized successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage, containerId }, 'Failed to initialize Claude environment')

      // Não falhar o start do container - usuário pode iniciar daemon manualmente
      // Emitir evento para notificar frontend
      try {
        const { emitClaudeEvent } = await import('./websocket.service')
        emitClaudeEvent(containerId, {
          type: 'error',
          containerId,
          message: `Failed to auto-start Claude daemon: ${errorMessage}`,
          timestamp: new Date().toISOString()
        })
      } catch {
        // Ignore WebSocket errors
      }
    }
  }

  /**
   * Chamado ANTES de parar o container
   * Pausa queue, aguarda jobs ativos, para daemon e health monitor
   */
  async onContainerStop(containerId: string): Promise<void> {
    logger.info({ containerId }, 'Container stopping - cleaning up Claude environment')

    try {
      // 1. Pausar queue para não aceitar novos jobs
      logger.debug({ containerId }, 'Pausing queue')
      try {
        await pauseQueue(containerId)
      } catch (error) {
        logger.debug({ containerId, error }, 'Queue pause skipped')
      }

      // 2. Aguardar jobs ativos terminarem (max 30s)
      logger.debug({ containerId }, 'Waiting for active jobs to complete')
      await this.waitForActiveJobs(containerId)

      // 3. Parar health monitoring
      logger.debug({ containerId }, 'Stopping health monitoring')
      healthMonitorService.stopMonitoring(containerId)

      // 4. Parar Claude daemon
      logger.debug({ containerId }, 'Stopping Claude daemon')
      try {
        await claudeDaemonService.claudeDaemonService.stopDaemon(containerId)
      } catch (error) {
        logger.warn({ containerId, error }, 'Error stopping daemon (may already be stopped)')
      }

      // 5. Parar worker
      logger.debug({ containerId }, 'Stopping worker')
      try {
        await stopWorker(containerId)
      } catch (error) {
        logger.debug({ containerId, error }, 'Worker stop skipped')
      }

      logger.info({ containerId }, 'Claude environment cleaned up successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage, containerId }, 'Error during Claude environment cleanup')
      // Não falhar - continuar com stop do container
    }
  }

  /**
   * Chamado ANTES de deletar o container
   * Faz cleanup completo incluindo destruir a queue
   */
  async onContainerDelete(containerId: string): Promise<void> {
    logger.info({ containerId }, 'Container deleting - destroying Claude resources')

    try {
      // 1. Fazer stop normal primeiro
      await this.onContainerStop(containerId)

      // 2. Destruir queue completamente (remove jobs pendentes)
      logger.debug({ containerId }, 'Destroying queue')
      try {
        await destroyQueue(containerId)
      } catch (error) {
        logger.debug({ containerId, error }, 'Queue destruction skipped')
      }

      logger.info({ containerId }, 'Claude resources destroyed successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage, containerId }, 'Error destroying Claude resources')
      // Não falhar - continuar com delete do container
    }
  }

  /**
   * Aguarda jobs ativos terminarem (max 30s)
   */
  private async waitForActiveJobs(containerId: string): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < MAX_WAIT_FOR_JOBS_MS) {
      try {
        const status = await getQueueStatus(containerId)

        if (status.active === 0) {
          logger.debug({ containerId }, 'No active jobs - proceeding with stop')
          return
        }

        logger.debug({
          containerId,
          activeJobs: status.active,
          elapsed: Date.now() - startTime
        }, 'Waiting for active jobs')

        await new Promise(resolve => setTimeout(resolve, JOB_CHECK_INTERVAL_MS))
      } catch (error) {
        // Queue pode não existir
        logger.debug({ containerId, error }, 'Queue status check failed - proceeding')
        return
      }
    }

    logger.warn({ containerId }, 'Timeout waiting for active jobs - proceeding with stop anyway')
  }

  /**
   * Inicializa daemons para todos os containers running
   * Chamado no startup do servidor
   */
  async initializeRunningContainers(
    containers: Array<{ id: string; dockerId: string; status: string }>
  ): Promise<void> {
    const runningContainers = containers.filter(c => c.status === 'running')

    logger.info({ count: runningContainers.length }, 'Initializing Claude daemons for running containers')

    const results = await Promise.allSettled(
      runningContainers.map(container =>
        this.onContainerStart(container.id, container.dockerId)
      )
    )

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    logger.info({ succeeded, failed, total: runningContainers.length }, 'Container initialization complete')

    // Log failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const container = runningContainers[index]
        logger.error({
          containerId: container?.id,
          error: result.reason
        }, 'Failed to initialize container')
      }
    })
  }

  /**
   * Cleanup de todos os daemons (para graceful shutdown)
   */
  async shutdownAll(
    containers: Array<{ id: string; status: string }>
  ): Promise<void> {
    const activeContainers = containers.filter(c =>
      c.status === 'running' || c.status === 'starting'
    )

    logger.info({ count: activeContainers.length }, 'Shutting down all Claude daemons')

    await Promise.allSettled(
      activeContainers.map(container => this.onContainerStop(container.id))
    )

    logger.info('All Claude daemons shutdown complete')
  }
}

// Singleton export
export const containerLifecycleService = new ContainerLifecycleService()
