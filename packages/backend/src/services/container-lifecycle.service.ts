import { logger } from '../utils/logger'
import { claudeDaemonService } from './claude-daemon.service'
import { healthMonitorService } from './health-monitor.service'
import * as claudeQueueService from './claude-queue.service'
import { getOrCreateWorker, stopWorker } from '../workers/claude.worker'

/**
 * Gerencia o ciclo de vida do ambiente Claude em containers
 *
 * Responsabilidades:
 * - Auto-start daemon quando container inicia
 * - Cleanup quando container para
 * - Destroy recursos quando container é deletado
 */
class ContainerLifecycleService {
  private initializingContainers = new Set<string>()

  /**
   * Chamado APÓS container iniciar com sucesso no Docker
   * Inicializa todo o ambiente Claude
   */
  async onContainerStart(containerId: string, dockerId: string): Promise<void> {
    // Prevenir inicializações paralelas
    if (this.initializingContainers.has(containerId)) {
      logger.warn({ containerId }, 'Container already initializing, skipping')
      return
    }

    this.initializingContainers.add(containerId)

    try {
      logger.info({ containerId, dockerId }, 'Initializing Claude environment for container')

      // 1. Iniciar Claude daemon
      logger.debug({ containerId }, 'Starting Claude daemon...')
      await claudeDaemonService.startDaemon(containerId, dockerId)

      // 2. Aguardar daemon estar pronto
      await this.waitForDaemonReady(containerId, 10000) // 10s timeout

      // 3. Iniciar health monitoring
      logger.debug({ containerId }, 'Starting health monitoring...')
      healthMonitorService.startMonitoring(containerId)

      // 4. Garantir que queue e worker existem
      logger.debug({ containerId }, 'Initializing queue and worker...')
      getOrCreateWorker(containerId)

      // 5. Resumir queue caso estivesse pausada
      try {
        await claudeQueueService.resumeQueue(containerId)
      } catch {
        // Queue pode não existir ainda, ok
      }

      logger.info({ containerId }, 'Claude environment initialized successfully')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage, containerId }, 'Failed to initialize Claude environment')

      // Não propagar erro - container deve continuar mesmo se daemon falhar
      // Health monitor tentará recovery

    } finally {
      this.initializingContainers.delete(containerId)
    }
  }

  /**
   * Chamado ANTES de container parar no Docker
   * Faz cleanup gracioso dos recursos
   */
  async onContainerStop(containerId: string): Promise<void> {
    logger.info({ containerId }, 'Cleaning up Claude environment for container stop')

    try {
      // 1. Pausar queue para não aceitar novos jobs
      logger.debug({ containerId }, 'Pausing queue...')
      try {
        await claudeQueueService.pauseQueue(containerId)
      } catch {
        // Queue pode não existir
      }

      // 2. Aguardar jobs ativos terminarem (max 30s)
      await this.waitForActiveJobs(containerId, 30000)

      // 3. Parar health monitoring
      logger.debug({ containerId }, 'Stopping health monitoring...')
      healthMonitorService.stopMonitoring(containerId)

      // 4. Parar daemon
      logger.debug({ containerId }, 'Stopping Claude daemon...')
      try {
        await claudeDaemonService.stopDaemon(containerId)
      } catch (error) {
        logger.warn({ error, containerId }, 'Failed to stop daemon (may already be stopped)')
      }

      logger.info({ containerId }, 'Claude environment cleaned up for stop')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage, containerId }, 'Error during container stop cleanup')
      // Continuar mesmo com erro
    }
  }

  /**
   * Chamado ANTES de container ser deletado
   * Destrói todos os recursos permanentemente
   */
  async onContainerDelete(containerId: string): Promise<void> {
    logger.info({ containerId }, 'Destroying Claude environment for container deletion')

    try {
      // 1. Primeiro fazer cleanup normal
      await this.onContainerStop(containerId)

      // 2. Destruir queue e worker permanentemente
      logger.debug({ containerId }, 'Destroying queue and worker...')
      try {
        await stopWorker(containerId)
      } catch {
        // Worker pode não existir
      }

      try {
        await claudeQueueService.destroyQueue(containerId)
      } catch {
        // Queue pode não existir
      }

      logger.info({ containerId }, 'Claude environment destroyed')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage, containerId }, 'Error during container delete cleanup')
      // Continuar mesmo com erro - container será deletado de qualquer forma
    }
  }

  /**
   * Aguarda daemon estar pronto para receber instruções
   */
  private async waitForDaemonReady(containerId: string, timeoutMs: number): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      const status = claudeDaemonService.getStatus(containerId)

      if (status && (status.status === 'running' || status.status === 'idle')) {
        logger.debug({ containerId }, 'Daemon is ready')
        return
      }

      if (status && status.status === 'error') {
        throw new Error(`Daemon failed to start: ${status.error}`)
      }

      // Aguardar 500ms antes de verificar novamente
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    logger.warn({ containerId, timeoutMs }, 'Daemon ready timeout - continuing anyway')
  }

  /**
   * Aguarda jobs ativos terminarem
   */
  private async waitForActiveJobs(containerId: string, timeoutMs: number): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await claudeQueueService.getQueueStatus(containerId)

        if (status.active === 0) {
          logger.debug({ containerId }, 'No active jobs, proceeding with stop')
          return
        }

        logger.debug({
          containerId,
          activeJobs: status.active,
          elapsed: Date.now() - startTime
        }, 'Waiting for active jobs to complete...')

      } catch {
        // Queue pode não existir
        return
      }

      // Aguardar 1s antes de verificar novamente
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    logger.warn({ containerId, timeoutMs }, 'Active jobs wait timeout - proceeding with stop anyway')
  }

  /**
   * Verifica se container está sendo inicializado
   */
  isInitializing(containerId: string): boolean {
    return this.initializingContainers.has(containerId)
  }
}

// Singleton export
export const containerLifecycleService = new ContainerLifecycleService()
