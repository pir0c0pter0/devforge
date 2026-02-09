import { logger } from '../utils/logger';
import { dockerService } from './docker.service';
import { VSCodeConfig } from '../config/vscode.config';

export interface VSCodeHealthStatus {
  ready: boolean;
  containerId: string;
  dockerId: string;
  lastCheck: Date;
  uptime?: number;
  error?: string;
}

export interface HealthCheckOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  onProgress?: (elapsed: number, total: number) => void;
}

class VSCodeHealthService {
  private readonly HEALTH_ENDPOINT = 'http://localhost:8080/healthz';
  private readonly DEFAULT_TIMEOUT_MS = 30000;
  private readonly POLL_INTERVAL_MS = 1000;
  private readonly HEALTHY_STATUS_CODES = ['200', '302'];

  // Cache de status por container
  private statusCache = new Map<string, VSCodeHealthStatus>();

  async checkHealth(dockerId: string): Promise<boolean> {
    try {
      const result = await dockerService.executeCommand(
        dockerId,
        ['curl', '-sf', '-o', '/dev/null', '-w', '%{http_code}', this.HEALTH_ENDPOINT],
        { user: 'developer' }
      );

      const isHealthy = result.exitCode === 0 &&
        this.HEALTHY_STATUS_CODES.some(code => result.stdout.includes(code));

      return isHealthy;
    } catch (error) {
      logger.debug({ dockerId, error }, 'VS Code health check failed');
      return false;
    }
  }

  /**
   * Get full healthz response including heartbeat timestamp.
   * The heartbeat is updated by the browser client, so a recent heartbeat
   * means the workbench JS has loaded and is actively running.
   */
  async getHeartbeat(dockerId: string): Promise<{ alive: boolean; lastHeartbeat: number | null }> {
    try {
      const result = await dockerService.executeCommand(
        dockerId,
        ['curl', '-sf', this.HEALTH_ENDPOINT],
        { user: 'developer' }
      );

      if (result.exitCode !== 0) {
        return { alive: false, lastHeartbeat: null };
      }

      const data = JSON.parse(result.stdout.trim());
      return {
        alive: data.status === 'alive',
        lastHeartbeat: data.lastHeartbeat ?? null,
      };
    } catch (error) {
      logger.debug({ dockerId, error }, 'VS Code heartbeat check failed');
      return { alive: false, lastHeartbeat: null };
    }
  }

  async waitUntilReady(
    dockerId: string,
    containerId: string,
    options: HealthCheckOptions = {}
  ): Promise<VSCodeHealthStatus> {
    const {
      timeoutMs = this.DEFAULT_TIMEOUT_MS,
      pollIntervalMs = this.POLL_INTERVAL_MS,
      onProgress
    } = options;

    const startTime = Date.now();
    let lastError: Error | undefined;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const isHealthy = await this.checkHealth(dockerId);

        if (isHealthy) {
          // Stabilization: wait and verify again to ensure VS Code is truly ready
          const stabilizationMs = VSCodeConfig.STABILIZATION_DELAY_MS;
          logger.debug({ dockerId, stabilizationMs }, 'First health check passed, waiting for stabilization...');
          await this.sleep(stabilizationMs);

          const confirmHealthy = await this.checkHealth(dockerId);
          if (confirmHealthy) {
            const status: VSCodeHealthStatus = {
              ready: true,
              containerId,
              dockerId,
              lastCheck: new Date(),
              uptime: Date.now() - startTime
            };

            this.statusCache.set(containerId, status);
            logger.info({ containerId, dockerId, elapsed: Date.now() - startTime }, 'VS Code is ready (confirmed after stabilization)');

            return status;
          }

          logger.debug({ dockerId }, 'VS Code health check passed but stabilization confirmation failed, continuing polling');
        }
      } catch (error) {
        lastError = error as Error;
        logger.debug({ dockerId, error }, 'Health check attempt failed');
      }

      // Progress callback
      if (onProgress) {
        onProgress(Date.now() - startTime, timeoutMs);
      }

      await this.sleep(pollIntervalMs);
    }

    // Timeout
    const status: VSCodeHealthStatus = {
      ready: false,
      containerId,
      dockerId,
      lastCheck: new Date(),
      error: lastError?.message || `Timeout after ${timeoutMs}ms`
    };

    this.statusCache.set(containerId, status);
    logger.warn({ containerId, dockerId, timeoutMs }, 'VS Code readiness timeout');

    return status;
  }

  getStatus(containerId: string): VSCodeHealthStatus | undefined {
    return this.statusCache.get(containerId);
  }

  clearStatus(containerId: string): void {
    this.statusCache.delete(containerId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const vscodeHealthService = new VSCodeHealthService();
