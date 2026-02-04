import { dockerService } from './docker.service';
import { metricsLogger as logger } from '../utils/logger';
import type {
  DiskBreakdown,
  DiskAlertLevel,
  DetailedDiskMetrics,
  CleanupSuggestion,
} from '@claude-docker/shared';

interface CacheEntry {
  metrics: DetailedDiskMetrics;
  timestamp: number;
}

const CACHE_TTL_MS = 15000; // 15 seconds

export class DiskMetricsService {
  private cache: Map<string, CacheEntry> = new Map();

  /**
   * Get detailed disk metrics with breakdown
   */
  async getDetailedMetrics(containerId: string, diskLimitMB: number): Promise<DetailedDiskMetrics> {
    // Check cache
    const cached = this.cache.get(containerId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      logger.debug({ containerId }, 'Returning cached disk metrics');
      return cached.metrics;
    }

    try {
      logger.debug({ containerId }, 'Collecting detailed disk metrics');

      // Get breakdown in parallel
      const [breakdown, projectPath, hasGitRepo] = await Promise.all([
        this.collectBreakdown(containerId),
        this.getProjectPath(containerId),
        this.checkGitRepo(containerId),
      ]);

      const percentage = diskLimitMB > 0 ? (breakdown.total / diskLimitMB) * 100 : 0;
      const alertLevel = this.calculateAlertLevel(percentage);

      const metrics: DetailedDiskMetrics = {
        usage: breakdown.total,
        limit: diskLimitMB,
        percentage: Number(percentage.toFixed(2)),
        alertLevel,
        breakdown,
        projectPath,
        hasGitRepo,
        collectedAt: new Date(),
      };

      // Update cache
      this.cache.set(containerId, { metrics, timestamp: Date.now() });

      return metrics;
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to collect detailed disk metrics');
      throw error;
    }
  }

  /**
   * Collect disk usage breakdown by category
   */
  private async collectBreakdown(containerId: string): Promise<DiskBreakdown> {
    try {
      // Get total workspace size
      const totalResult = await dockerService.executeCommand(
        containerId,
        ['du', '-sm', '/workspace'],
        { user: 'root' }
      );
      const total = this.parseDuOutput(totalResult.stdout);

      // Get node_modules size (may not exist)
      let nodeModules = 0;
      try {
        const nmResult = await dockerService.executeCommand(
          containerId,
          ['du', '-sm', '/workspace/node_modules'],
          { user: 'root' }
        );
        if (nmResult.exitCode === 0) {
          nodeModules = this.parseDuOutput(nmResult.stdout);
        }
      } catch {
        // node_modules doesn't exist
      }

      // Get cache directories (.cache, .npm, .pnpm-store, etc.)
      let cache = 0;
      const cacheDirs = ['.cache', '.npm', '.pnpm-store', '.yarn/cache'];
      for (const dir of cacheDirs) {
        try {
          const cacheResult = await dockerService.executeCommand(
            containerId,
            ['du', '-sm', `/workspace/${dir}`],
            { user: 'root' }
          );
          if (cacheResult.exitCode === 0) {
            cache += this.parseDuOutput(cacheResult.stdout);
          }
        } catch {
          // Cache dir doesn't exist
        }
      }

      // Also check home directory caches
      const homeCacheDirs = ['.cache', '.npm', '.pnpm-store'];
      for (const dir of homeCacheDirs) {
        try {
          const cacheResult = await dockerService.executeCommand(
            containerId,
            ['du', '-sm', `/home/developer/${dir}`],
            { user: 'root' }
          );
          if (cacheResult.exitCode === 0) {
            cache += this.parseDuOutput(cacheResult.stdout);
          }
        } catch {
          // Cache dir doesn't exist
        }
      }

      // Calculate workspace (excluding node_modules)
      const workspace = Math.max(0, total - nodeModules);

      // Other is what's left after subtracting known categories
      const other = Math.max(0, total - workspace - nodeModules - cache);

      return {
        workspace,
        nodeModules,
        cache,
        other,
        total,
      };
    } catch (error) {
      logger.warn({ error, containerId }, 'Failed to collect disk breakdown');
      return { workspace: 0, nodeModules: 0, cache: 0, other: 0, total: 0 };
    }
  }

  /**
   * Get project path (look for package.json, Cargo.toml, go.mod, etc.)
   */
  private async getProjectPath(containerId: string): Promise<string | null> {
    try {
      const result = await dockerService.executeCommand(
        containerId,
        ['find', '/workspace', '-maxdepth', '2', '-name', 'package.json', '-o', '-name', 'Cargo.toml', '-o', '-name', 'go.mod', '-o', '-name', 'pyproject.toml'],
        { user: 'root' }
      );

      if (result.exitCode === 0 && result.stdout.trim()) {
        const firstMatch = result.stdout.trim().split('\n')[0];
        // Return directory containing the project file
        const path = firstMatch?.replace(/\/[^/]+$/, '') || null;
        return path === '' ? '/workspace' : path;
      }
      return '/workspace';
    } catch {
      return '/workspace';
    }
  }

  /**
   * Check if workspace contains a git repository
   */
  private async checkGitRepo(containerId: string): Promise<boolean> {
    try {
      const result = await dockerService.executeCommand(
        containerId,
        ['test', '-d', '/workspace/.git'],
        { user: 'root' }
      );
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Get cleanup suggestions based on current usage
   */
  async getCleanupSuggestions(containerId: string): Promise<CleanupSuggestion[]> {
    const suggestions: CleanupSuggestion[] = [];

    try {
      // Check node_modules
      const nmResult = await dockerService.executeCommand(
        containerId,
        ['du', '-sm', '/workspace/node_modules'],
        { user: 'root' }
      );
      if (nmResult.exitCode === 0) {
        const size = this.parseDuOutput(nmResult.stdout);
        if (size > 100) {
          suggestions.push({
            type: 'node_modules',
            description: 'Reinstalar node_modules pode liberar espaço de pacotes não utilizados',
            estimatedSavings: Math.round(size * 0.2), // Estimate 20% savings
            command: 'rm -rf node_modules && npm install',
            risk: 'medium',
          });
        }
      }

      // Check npm cache
      const npmCacheResult = await dockerService.executeCommand(
        containerId,
        ['du', '-sm', '/home/developer/.npm'],
        { user: 'root' }
      );
      if (npmCacheResult.exitCode === 0) {
        const size = this.parseDuOutput(npmCacheResult.stdout);
        if (size > 50) {
          suggestions.push({
            type: 'cache',
            description: 'Limpar cache do npm',
            estimatedSavings: size,
            command: 'npm cache clean --force',
            risk: 'low',
          });
        }
      }

      // Check .cache directory
      const cacheResult = await dockerService.executeCommand(
        containerId,
        ['du', '-sm', '/home/developer/.cache'],
        { user: 'root' }
      );
      if (cacheResult.exitCode === 0) {
        const size = this.parseDuOutput(cacheResult.stdout);
        if (size > 100) {
          suggestions.push({
            type: 'cache',
            description: 'Limpar diretório de cache',
            estimatedSavings: size,
            command: 'rm -rf ~/.cache/*',
            risk: 'low',
          });
        }
      }

      // Check git objects (if large repo)
      const gitResult = await dockerService.executeCommand(
        containerId,
        ['du', '-sm', '/workspace/.git'],
        { user: 'root' }
      );
      if (gitResult.exitCode === 0) {
        const size = this.parseDuOutput(gitResult.stdout);
        if (size > 200) {
          suggestions.push({
            type: 'git',
            description: 'Compactar objetos git e remover histórico desnecessário',
            estimatedSavings: Math.round(size * 0.3),
            command: 'git gc --aggressive --prune=now',
            risk: 'low',
          });
        }
      }

      // Check build directories
      const buildDirs = ['dist', 'build', '.next', 'target'];
      for (const dir of buildDirs) {
        try {
          const buildResult = await dockerService.executeCommand(
            containerId,
            ['du', '-sm', `/workspace/${dir}`],
            { user: 'root' }
          );
          if (buildResult.exitCode === 0) {
            const size = this.parseDuOutput(buildResult.stdout);
            if (size > 50) {
              suggestions.push({
                type: 'build',
                description: `Remover diretório de build: ${dir}`,
                estimatedSavings: size,
                command: `rm -rf /workspace/${dir}`,
                risk: 'medium',
              });
            }
          }
        } catch {
          // Dir doesn't exist
        }
      }

    } catch (error) {
      logger.warn({ error, containerId }, 'Failed to generate cleanup suggestions');
    }

    // Sort by estimated savings (highest first)
    return suggestions.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
  }

  /**
   * Parse du -sm output to get size in MB
   */
  private parseDuOutput(output: string): number {
    const parts = output.trim().split(/\s+/);
    return parseInt(parts[0] || '0', 10) || 0;
  }

  /**
   * Calculate alert level based on percentage
   */
  private calculateAlertLevel(percentage: number): DiskAlertLevel {
    if (percentage >= 95) return 'critical';
    if (percentage >= 80) return 'warning';
    return 'normal';
  }

  /**
   * Clear cache for a container
   */
  clearCache(containerId: string): void {
    this.cache.delete(containerId);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.cache.clear();
  }
}

export const diskMetricsService = new DiskMetricsService();
