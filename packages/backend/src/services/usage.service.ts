import { logger } from '../utils/logger';
import {
  usageRepository,
  sessionUtils,
  type AggregatedUsage,
} from '../repositories';

const { generateSessionId, getSessionEndTime } = sessionUtils;

/**
 * Parsed usage data from Claude output
 */
interface ParsedUsage {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
}

/**
 * Container usage summary
 */
export interface UsageSummary {
  daily: {
    tokens: number;
    cost: number;
  };
  weekly: {
    tokens: number;
    cost: number;
  };
  session: {
    tokens: number;
    cost: number;
    endsAt: string;
  };
}

/**
 * Default empty aggregation
 */
const EMPTY_AGGREGATION: AggregatedUsage = {
  containerId: '',
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  totalCostUsd: 0,
  recordCount: 0,
};

/**
 * Cleanup interval in milliseconds (24 hours)
 */
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Days to keep usage records (30 days)
 */
const DAYS_TO_KEEP = 30;

/**
 * UsageService handles Claude API token usage tracking
 *
 * Responsibilities:
 * - Parse Claude output to extract usage metrics
 * - Record usage to database
 * - Provide usage summaries (daily, weekly, session)
 * - Manage session-based usage tracking
 * - Cleanup old records
 */
class UsageService {
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Start periodic cleanup of old usage records
   * Runs every 24 hours to delete records older than 30 days
   */
  startCleanupTimer(): void {
    if (this.cleanupInterval) {
      logger.debug('Usage cleanup timer already running');
      return;
    }

    // Run initial cleanup
    this.cleanup(DAYS_TO_KEEP);

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup(DAYS_TO_KEEP);
    }, CLEANUP_INTERVAL_MS);

    logger.info({
      intervalMs: CLEANUP_INTERVAL_MS,
      daysToKeep: DAYS_TO_KEEP,
    }, 'Usage cleanup timer started');
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Usage cleanup timer stopped');
    }
  }

  /**
   * Parse Claude stdout to extract usage information
   *
   * Claude outputs JSON lines in stream-json format. We look for:
   * - type: "result" with usage and total_cost_usd fields
   *
   * @param stdout - Raw stdout from Claude process
   * @returns Parsed usage data or null if not found
   */
  parseClaudeOutput(stdout: string): ParsedUsage | null {
    if (!stdout || typeof stdout !== 'string') {
      return null;
    }

    try {
      // Split by newlines and process each JSON line
      const lines = stdout.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);

          // Look for result type with usage data
          if (parsed.type === 'result') {
            const usage = parsed.usage || {};
            const inputTokens = usage.input_tokens || 0;
            const outputTokens = usage.output_tokens || 0;
            const totalCostUsd = parsed.total_cost_usd || 0;

            if (inputTokens > 0 || outputTokens > 0 || totalCostUsd > 0) {
              logger.debug({
                inputTokens,
                outputTokens,
                totalCostUsd,
              }, 'Parsed Claude usage from result');

              return {
                inputTokens,
                outputTokens,
                totalCostUsd,
              };
            }
          }
        } catch {
          // Not valid JSON, continue to next line
          continue;
        }
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'Failed to parse Claude output for usage');
      return null;
    }
  }

  /**
   * Record usage from a completed instruction
   *
   * @param containerId - Container ID
   * @param instructionId - Optional instruction/job ID
   * @param stdout - Raw stdout from Claude process
   * @returns Created usage entity or null if no usage found
   */
  recordUsageFromOutput(
    containerId: string,
    instructionId: string | undefined,
    stdout: string
  ) {
    const usage = this.parseClaudeOutput(stdout);

    if (!usage) {
      logger.debug({ containerId, instructionId }, 'No usage data found in Claude output');
      return null;
    }

    const sessionId = generateSessionId(containerId);

    const entity = usageRepository.create({
      containerId,
      instructionId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalCostUsd: usage.totalCostUsd,
      sessionId,
    });

    logger.info({
      containerId,
      instructionId,
      sessionId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalCostUsd: usage.totalCostUsd,
    }, 'Usage recorded');

    return entity;
  }

  /**
   * Get usage summary for a container
   *
   * @param containerId - Container ID
   * @returns Usage summary with daily, weekly, and session totals
   */
  getUsageSummary(containerId: string): UsageSummary {
    const daily = usageRepository.getDaily(containerId) || { ...EMPTY_AGGREGATION, containerId };
    const weekly = usageRepository.getWeekly(containerId) || { ...EMPTY_AGGREGATION, containerId };
    const session = usageRepository.getSession(containerId) || { ...EMPTY_AGGREGATION, containerId };
    const sessionEnd = getSessionEndTime();

    return {
      daily: {
        tokens: daily.totalTokens,
        cost: daily.totalCostUsd,
      },
      weekly: {
        tokens: weekly.totalTokens,
        cost: weekly.totalCostUsd,
      },
      session: {
        tokens: session.totalTokens,
        cost: session.totalCostUsd,
        endsAt: sessionEnd.toISOString(),
      },
    };
  }

  /**
   * Get current session ID for a container
   *
   * @param containerId - Container ID
   * @returns Current session ID
   */
  getCurrentSessionId(containerId: string): string {
    return generateSessionId(containerId);
  }

  /**
   * Cleanup old usage records
   * Deletes records older than specified days (default: 30)
   *
   * @param daysToKeep - Number of days to retain (default: 30)
   * @returns Number of records deleted
   */
  cleanup(daysToKeep: number = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysToKeep);

    const deleted = usageRepository.deleteOld(cutoffDate);

    if (deleted > 0) {
      logger.info({ deleted, cutoffDate: cutoffDate.toISOString() }, 'Cleaned up old usage records');
    }

    return deleted;
  }

  /**
   * Delete all usage records for a container
   *
   * @param containerId - Container ID
   * @returns Number of records deleted
   */
  deleteForContainer(containerId: string): number {
    const deleted = usageRepository.deleteByContainerId(containerId);

    if (deleted > 0) {
      logger.info({ containerId, deleted }, 'Deleted usage records for container');
    }

    return deleted;
  }
}

// Export singleton instance
export const usageService = new UsageService();

// Export class for testing
export { UsageService };
