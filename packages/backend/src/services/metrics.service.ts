import { dockerService } from './docker.service';
import { ContainerMetrics } from '../models/container.model';
import { metricsLogger as logger } from '../utils/logger';

/**
 * Active agent process information
 */
interface AgentProcess {
  pid: number;
  command: string;
  cpu: number;
  memory: number;
}

/**
 * Real-time metrics collection service
 */
export class MetricsService {
  /**
   * Collect real-time metrics for a container
   */
  async getContainerMetrics(containerId: string): Promise<ContainerMetrics> {
    try {
      logger.debug({ containerId }, 'Collecting container metrics');

      // Get Docker stats
      const stats = await dockerService.getContainerStats(containerId);

      // Calculate CPU usage percentage
      // Docker returns CPU usage across all cores, so we normalize to 0-100%
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage -
                       (stats.precpu_stats.cpu_usage?.total_usage || 0);
      const systemDelta = stats.cpu_stats.system_cpu_usage -
                         (stats.precpu_stats.system_cpu_usage || 0);
      const cpuCount = stats.cpu_stats.online_cpus || 1;
      // Calculate raw CPU usage (can exceed 100% on multi-core)
      const rawCpuUsage = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;
      // Normalize to percentage of allocated cores (0-100%)
      const cpuUsage = Math.min(rawCpuUsage / cpuCount, 100);

      // Calculate memory usage
      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;
      const memoryUsageMB = memoryUsage / (1024 * 1024);
      const memoryLimitMB = memoryLimit / (1024 * 1024);
      const memoryPercentage = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

      // Get network stats
      const networks = stats.networks || {};
      let rxBytes = 0;
      let txBytes = 0;

      Object.values(networks).forEach((net: any) => {
        rxBytes += net.rx_bytes || 0;
        txBytes += net.tx_bytes || 0;
      });

      // Get disk usage (approximation from blkio stats)
      const diskUsage = await this.getDiskUsage(containerId);

      // Detect active Claude agents
      const activeAgents = await this.detectActiveAgents(containerId);

      const metrics: ContainerMetrics = {
        containerId,
        timestamp: new Date(),
        cpu: {
          usage: Number(cpuUsage.toFixed(2)),
          limit: cpuCount,
        },
        memory: {
          usage: Number(memoryUsageMB.toFixed(2)),
          limit: Number(memoryLimitMB.toFixed(2)),
          percentage: Number(memoryPercentage.toFixed(2)),
        },
        disk: {
          usage: diskUsage.usage,
          limit: diskUsage.limit,
          percentage: diskUsage.percentage,
        },
        network: {
          rxBytes,
          txBytes,
        },
        activeAgents,
      };

      logger.debug({
        containerId,
        metrics: {
          cpu: metrics.cpu.usage,
          memory: metrics.memory.usage,
          agents: metrics.activeAgents.length
        }
      }, 'Container metrics collected');

      return metrics;
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to collect container metrics');
      throw new Error(`Failed to collect metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get disk usage for a container
   * Uses 'du' to measure actual workspace usage (not filesystem size)
   */
  private async getDiskUsage(containerId: string): Promise<{
    usage: number;
    limit: number;
    percentage: number;
  }> {
    try {
      // Execute du command to get actual workspace disk usage in MB
      // Note: df shows filesystem total which includes host disk, du shows actual usage
      const result = await dockerService.executeCommand(
        containerId,
        ['du', '-sm', '/workspace'],
        { user: 'root' }
      );

      // Parse du output
      // Example output:
      // 1234    /workspace
      const output = result.stdout.trim();
      const parts = output.split(/\s+/);

      if (parts.length < 1) {
        return { usage: 0, limit: 0, percentage: 0 };
      }

      const usedStr = parts[0];
      if (!usedStr) {
        return { usage: 0, limit: 0, percentage: 0 };
      }

      const used = parseInt(usedStr, 10) || 0;

      // Note: limit and percentage will be calculated in container.service
      // based on configured disk limit (not filesystem limit)
      return {
        usage: used,
        limit: 0, // Will be set based on container config
        percentage: 0, // Will be calculated based on container config
      };
    } catch (error) {
      logger.warn({ error, containerId }, 'Failed to get disk usage, returning defaults');
      return { usage: 0, limit: 0, percentage: 0 };
    }
  }

  /**
   * Detect active Claude agents by parsing ps aux inside container
   * Improved detection to capture:
   * - Main Claude process (claude command)
   * - Background agents spawned via Task tool
   * - Node.js processes related to Claude
   */
  private async detectActiveAgents(containerId: string): Promise<AgentProcess[]> {
    try {
      // Execute ps command to find Claude processes
      // Using ps aux with full command line
      const result = await dockerService.executeCommand(
        containerId,
        ['ps', 'aux', '--width', '200'],
        { user: 'root' }
      );

      const agents: AgentProcess[] = [];

      // Parse ps aux output
      const lines = result.stdout.trim().split('\n');

      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        if (!line) {
          continue;
        }

        const lineLower = line.toLowerCase();

        // Look for Claude-related processes with improved detection:
        // 1. Direct claude command execution
        // 2. Node.js running claude code
        // 3. Background agents (Task tool spawns)
        // 4. claude-code related processes
        const isClaudeProcess =
          // Direct claude command (main process or subagents)
          lineLower.includes('/claude') ||
          lineLower.includes(' claude ') ||
          line.endsWith(' claude') ||
          // Claude Code specific patterns
          lineLower.includes('claude-code') ||
          lineLower.includes('@anthropic') ||
          // Node.js running claude (background tasks)
          (lineLower.includes('node') && (
            lineLower.includes('subagent') ||
            lineLower.includes('task_id') ||
            lineLower.includes('agent')
          ));

        // Skip non-Claude processes
        if (!isClaudeProcess) {
          continue;
        }

        // Skip ps command itself and grep/pgrep commands
        if (
          lineLower.includes('ps aux') ||
          lineLower.includes('pgrep') ||
          lineLower.includes('grep')
        ) {
          continue;
        }

        const parts = line.split(/\s+/);

        if (parts.length < 11) {
          continue;
        }

        const pidStr = parts[1];
        const cpuStr = parts[2];
        const memStr = parts[3];

        if (!pidStr || !cpuStr || !memStr) {
          continue;
        }

        const pid = parseInt(pidStr, 10);
        const cpu = parseFloat(cpuStr);
        const memory = parseFloat(memStr);
        const command = parts.slice(10).join(' ');

        if (!isNaN(pid)) {
          agents.push({
            pid,
            command: command.substring(0, 100), // Limit command length
            cpu: Number(cpu.toFixed(2)),
            memory: Number(memory.toFixed(2)),
          });
        }
      }

      // Log detected agents for debugging
      if (agents.length > 0) {
        logger.debug({ containerId, agentCount: agents.length, agents: agents.map(a => ({ pid: a.pid, cmd: a.command.substring(0, 50) })) }, 'Detected Claude agents');
      }

      return agents;
    } catch (error) {
      logger.warn({ error, containerId }, 'Failed to detect active agents, returning empty array');
      return [];
    }
  }

  /**
   * Get metrics for multiple containers in parallel
   */
  async getMultipleContainerMetrics(containerIds: string[]): Promise<Map<string, ContainerMetrics>> {
    const metricsMap = new Map<string, ContainerMetrics>();

    const promises = containerIds.map(async (id) => {
      try {
        const metrics = await this.getContainerMetrics(id);
        return { id, metrics };
      } catch (error) {
        logger.error({ error, containerId: id }, 'Failed to get metrics for container');
        return null;
      }
    });

    const results = await Promise.all(promises);

    results.forEach((result) => {
      if (result) {
        metricsMap.set(result.id, result.metrics);
      }
    });

    return metricsMap;
  }

  /**
   * Calculate average metrics over a time period
   */
  async getAverageMetrics(
    containerId: string,
    sampleCount: number = 5,
    intervalMs: number = 1000
  ): Promise<ContainerMetrics> {
    const samples: ContainerMetrics[] = [];

    for (let i = 0; i < sampleCount; i++) {
      try {
        const metrics = await this.getContainerMetrics(containerId);
        samples.push(metrics);

        if (i < sampleCount - 1) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      } catch (error) {
        logger.warn({ error, containerId }, 'Failed to collect sample, skipping');
      }
    }

    if (samples.length === 0) {
      throw new Error('Failed to collect any metrics samples');
    }

    // Calculate averages
    const avgCpu = samples.reduce((sum, s) => sum + s.cpu.usage, 0) / samples.length;
    const avgMemUsage = samples.reduce((sum, s) => sum + s.memory.usage, 0) / samples.length;
    const avgMemPercentage = samples.reduce((sum, s) => sum + s.memory.percentage, 0) / samples.length;
    const avgDiskUsage = samples.reduce((sum, s) => sum + s.disk.usage, 0) / samples.length;
    const avgDiskPercentage = samples.reduce((sum, s) => sum + s.disk.percentage, 0) / samples.length;

    // Use last sample as base
    const lastSample = samples[samples.length - 1]!;

    return {
      ...lastSample,
      cpu: {
        ...lastSample.cpu,
        usage: Number(avgCpu.toFixed(2)),
      },
      memory: {
        ...lastSample.memory,
        usage: Number(avgMemUsage.toFixed(2)),
        percentage: Number(avgMemPercentage.toFixed(2)),
      },
      disk: {
        ...lastSample.disk,
        usage: Number(avgDiskUsage.toFixed(2)),
        percentage: Number(avgDiskPercentage.toFixed(2)),
      },
    };
  }

  /**
   * Stream metrics continuously
   */
  async *streamMetrics(
    containerId: string,
    intervalMs: number = 2000
  ): AsyncGenerator<ContainerMetrics> {
    while (true) {
      try {
        const metrics = await this.getContainerMetrics(containerId);
        yield metrics;
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      } catch (error) {
        logger.error({ error, containerId }, 'Error streaming metrics');
        throw error;
      }
    }
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
