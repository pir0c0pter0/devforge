import { metricsService } from './metrics.service';
import { metricsRepository, containerRepository, CreateMetricsDto } from '../repositories';
import { logger } from '../utils/logger';

/**
 * Background metrics collection interval (1 minute)
 */
const COLLECTION_INTERVAL_MS = 60 * 1000;

/**
 * Cleanup interval (1 hour)
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Maximum age for metrics records (6 hours)
 */
const MAX_METRICS_AGE_HOURS = 6;

/**
 * Background Metrics Collector Service
 *
 * Singleton service that runs in the background collecting metrics
 * for all running containers every 1 minute and storing them in the database.
 *
 * Features:
 * - Collects metrics every 1 minute for chart history
 * - Stores in database for 5-hour history (300 data points per container)
 * - Automatic cleanup of records older than 6 hours
 * - Handles container start/stop events
 */
class MetricsCollectorService {
  private collectionInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isCollecting = false;
  private isRunning = false;

  /**
   * Start the background metrics collection
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[MetricsCollector] Service already running');
      return;
    }

    logger.info('[MetricsCollector] Starting background metrics collection service');
    this.isRunning = true;

    // Start collection immediately
    this.collectAllMetrics();

    // Schedule regular collection every 1 minute
    this.collectionInterval = setInterval(() => {
      this.collectAllMetrics();
    }, COLLECTION_INTERVAL_MS);

    // Schedule cleanup every 1 hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, CLEANUP_INTERVAL_MS);

    // Run initial cleanup
    this.cleanupOldMetrics();

    logger.info('[MetricsCollector] Background metrics collection started');
  }

  /**
   * Stop the background metrics collection
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('[MetricsCollector] Stopping background metrics collection service');

    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isRunning = false;
    logger.info('[MetricsCollector] Background metrics collection stopped');
  }

  /**
   * Check if the service is running
   */
  getStatus(): { isRunning: boolean; isCollecting: boolean } {
    return {
      isRunning: this.isRunning,
      isCollecting: this.isCollecting,
    };
  }

  /**
   * Collect metrics for all running containers
   */
  private async collectAllMetrics(): Promise<void> {
    if (this.isCollecting) {
      logger.debug('[MetricsCollector] Skipping collection - previous collection still in progress');
      return;
    }

    this.isCollecting = true;

    try {
      // Get all running containers from the database
      const containers = containerRepository.findByStatus('running');

      if (containers.length === 0) {
        logger.debug('[MetricsCollector] No running containers to collect metrics from');
        return;
      }

      logger.debug({ containerCount: containers.length }, '[MetricsCollector] Collecting metrics for running containers');

      // Collect metrics for each container in parallel
      const results = await Promise.allSettled(
        containers.map(async (container) => {
          try {
            await this.collectContainerMetrics(container.id, container.dockerId, container.memoryLimit);
            return { containerId: container.id, success: true };
          } catch (error) {
            logger.warn(
              { error, containerId: container.id },
              '[MetricsCollector] Failed to collect metrics for container'
            );
            return { containerId: container.id, success: false, error };
          }
        })
      );

      const successful = results.filter(
        (r) => r.status === 'fulfilled' && r.value.success
      ).length;
      const failed = results.length - successful;

      if (failed > 0) {
        logger.debug(
          { successful, failed },
          '[MetricsCollector] Metrics collection completed with some failures'
        );
      } else {
        logger.debug(
          { successful },
          '[MetricsCollector] Metrics collection completed successfully'
        );
      }
    } catch (error) {
      logger.error({ error }, '[MetricsCollector] Failed to collect metrics');
    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * Collect and store metrics for a single container
   */
  private async collectContainerMetrics(
    containerId: string,
    dockerId: string,
    memoryLimitMB: number
  ): Promise<void> {
    try {
      // Get metrics from Docker
      const metrics = await metricsService.getContainerMetrics(dockerId);

      // Map active agents to the correct type
      const activeAgents = metrics.activeAgents.map((agent) => ({
        pid: agent.pid,
        command: agent.command,
        cpu: agent.cpu,
        memory: agent.memory,
      }));

      // Create metrics record for storage
      const createDto: CreateMetricsDto = {
        containerId,
        cpuPercent: metrics.cpu.usage,
        memoryUsage: metrics.memory.usage,
        memoryLimit: memoryLimitMB,
        diskUsage: metrics.disk.usage,
        networkRxBytes: metrics.network?.rxBytes,
        networkTxBytes: metrics.network?.txBytes,
        activeAgents,
      };

      // Store in database
      metricsRepository.create(createDto);

      logger.debug(
        {
          containerId,
          cpu: metrics.cpu.usage,
          memory: metrics.memory.usage,
          disk: metrics.disk.usage,
        },
        '[MetricsCollector] Stored metrics for container'
      );
    } catch (error) {
      throw new Error(
        `Failed to collect metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Cleanup old metrics records
   */
  private cleanupOldMetrics(): void {
    try {
      const deletedCount = metricsRepository.cleanupOldMetrics(MAX_METRICS_AGE_HOURS);

      if (deletedCount > 0) {
        logger.info(
          { deletedCount, maxAgeHours: MAX_METRICS_AGE_HOURS },
          '[MetricsCollector] Cleaned up old metrics records'
        );
      } else {
        logger.debug('[MetricsCollector] No old metrics records to cleanup');
      }
    } catch (error) {
      logger.error({ error }, '[MetricsCollector] Failed to cleanup old metrics');
    }
  }

  /**
   * Handle container start event - begin collecting metrics
   * Called by container lifecycle service
   */
  onContainerStart(containerId: string, _dockerId: string): void {
    logger.debug({ containerId }, '[MetricsCollector] Container started - will be included in next collection');
    // No special action needed - container will be picked up in next collection cycle
    // The findByStatus('running') query will include it
  }

  /**
   * Handle container stop event - stop collecting metrics
   * Called by container lifecycle service
   */
  onContainerStop(containerId: string): void {
    logger.debug({ containerId }, '[MetricsCollector] Container stopped - will be excluded from next collection');
    // No special action needed - container will be excluded in next collection cycle
    // The findByStatus('running') query will not include it
  }

  /**
   * Force immediate metrics collection (for testing/debugging)
   */
  async forceCollect(): Promise<void> {
    logger.info('[MetricsCollector] Forcing immediate metrics collection');
    await this.collectAllMetrics();
  }

  /**
   * Force immediate cleanup (for testing/debugging)
   */
  forceCleanup(): number {
    logger.info('[MetricsCollector] Forcing immediate cleanup');
    const deletedCount = metricsRepository.cleanupOldMetrics(MAX_METRICS_AGE_HOURS);
    return deletedCount;
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{
    isRunning: boolean;
    isCollecting: boolean;
    runningContainers: number;
    totalMetricsRecords: number;
  }> {
    const containers = containerRepository.findByStatus('running');
    const totalRecords = metricsRepository.count();

    return {
      ...this.getStatus(),
      runningContainers: containers.length,
      totalMetricsRecords: totalRecords,
    };
  }
}

// Export singleton instance
export const metricsCollectorService = new MetricsCollectorService();
