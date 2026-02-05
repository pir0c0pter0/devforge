import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { createChildLogger } from '../utils/logger';
import { containerRepository } from '../repositories';
import {
  dockerLogsRepository,
  CreateDockerLogDto,
} from '../repositories/docker-logs.repository';

const logger = createChildLogger({ service: 'docker-logs-collector' });

/**
 * Configuration for log collection
 */
const CONFIG = {
  /** Batch size threshold - flush when this many logs accumulated */
  BATCH_SIZE: 100,
  /** Batch time threshold - flush every N milliseconds */
  BATCH_INTERVAL_MS: 1000,
  /** Cleanup interval - run cleanup every hour */
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000,
  /** Log retention - delete logs older than 24 hours */
  RETENTION_HOURS: 24,
  /** Reconnect delay after stream error */
  RECONNECT_DELAY_MS: 5000,
  /** Max reconnect attempts before giving up */
  MAX_RECONNECT_ATTEMPTS: 3,
};

/**
 * Statistics for the collector service
 */
export interface CollectorStats {
  readonly activeContainers: number;
  readonly logsCollected: number;
  readonly logsPerSecond: number;
  readonly lastCleanup: Date | null;
}

/**
 * Log entry in the buffer
 */
interface LogEntry {
  readonly containerId: string;
  readonly stream: 'stdout' | 'stderr';
  readonly content: string;
  readonly timestamp: Date;
}

/**
 * Container attachment state
 */
interface ContainerAttachment {
  readonly containerId: string;
  readonly dockerId: string;
  cleanup: () => void;
  reconnectAttempts: number;
}

/**
 * Docker logs collector service interface
 */
export interface DockerLogsCollectorService {
  start(): Promise<void>;
  stop(): Promise<void>;
  attachToContainer(containerId: string): Promise<void>;
  detachFromContainer(containerId: string): void;
  isAttached(containerId: string): boolean;
  getStats(): CollectorStats;
  on(event: 'log', listener: (data: { containerId: string; log: LogEntry }) => void): void;
}

/**
 * Sanitize log content before storage
 * Removes ANSI escape codes and control characters
 */
function sanitizeLogContent(content: string): string {
  // Remove ANSI escape codes
  let sanitized = content.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
  // Remove other control characters (except newline and tab)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Trim trailing whitespace
  sanitized = sanitized.trimEnd();
  return sanitized;
}

/**
 * Parse Docker multiplexed stream frame
 * Docker log streams use 8-byte headers:
 * - Byte 0: stream type (1=stdout, 2=stderr)
 * - Bytes 1-3: reserved (0)
 * - Bytes 4-7: payload size (big-endian uint32)
 */
function parseDockerStreamFrame(buffer: Buffer): {
  stream: 'stdout' | 'stderr';
  payload: string;
  remaining: Buffer;
} | null {
  if (buffer.length < 8) {
    return null;
  }

  const streamType = buffer[0];
  const size = buffer.readUInt32BE(4);

  if (buffer.length < 8 + size) {
    return null;
  }

  const payload = buffer.slice(8, 8 + size).toString('utf8');
  const remaining = buffer.slice(8 + size);

  return {
    stream: streamType === 2 ? 'stderr' : 'stdout',
    payload,
    remaining,
  };
}

/**
 * Parse timestamp from Docker log line
 * Format: "2024-02-04T10:30:45.123456789Z message content"
 */
function parseLogTimestamp(line: string): { timestamp: Date; content: string } {
  const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s?/);
  if (match && match[1]) {
    return {
      timestamp: new Date(match[1]),
      content: line.slice(match[0].length),
    };
  }
  return {
    timestamp: new Date(),
    content: line,
  };
}

/**
 * Docker Logs Collector Service
 *
 * Background service that collects Docker container logs 24/7.
 * Features:
 * - Attaches to all running containers on startup
 * - Listens for container start/stop events
 * - Streams logs with timestamps
 * - Sanitizes logs before saving
 * - Batch inserts to DB every 1 second or 100 logs
 * - Cleanup job every hour (deletes logs older than 24h)
 * - Emits WebSocket events for real-time streaming
 */
class DockerLogsCollectorServiceImpl extends EventEmitter implements DockerLogsCollectorService {
  private docker: Docker;
  private isRunning = false;
  private attachments = new Map<string, ContainerAttachment>();
  private logBuffer: LogEntry[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private eventStream: NodeJS.ReadableStream | null = null;
  private logsCollectedTotal = 0;
  private logsCollectedWindow: number[] = [];
  private lastCleanup: Date | null = null;

  constructor() {
    super();
    this.docker = new Docker({
      socketPath: process.env['DOCKER_SOCKET_PATH'] || '/var/run/docker.sock',
    });
  }

  /**
   * Start the collector service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Collector already running');
      return;
    }

    logger.info('Starting Docker logs collector service');
    this.isRunning = true;

    // Start batch flush timer
    this.startBatchTimer();

    // Start cleanup timer
    this.startCleanupTimer();

    // Attach to all running containers
    await this.attachToRunningContainers();

    // Listen for Docker events
    await this.startEventListener();

    // Run initial cleanup
    this.runCleanup();

    logger.info('Docker logs collector service started');
  }

  /**
   * Stop the collector service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Docker logs collector service');
    this.isRunning = false;

    // Stop event listener
    this.stopEventListener();

    // Detach from all containers
    for (const containerId of this.attachments.keys()) {
      this.detachFromContainer(containerId);
    }

    // Stop timers
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Flush remaining logs
    await this.flushLogBuffer();

    logger.info('Docker logs collector service stopped');
  }

  /**
   * Attach to a container's log stream
   */
  async attachToContainer(containerId: string): Promise<void> {
    if (this.attachments.has(containerId)) {
      logger.debug({ containerId }, 'Already attached to container');
      return;
    }

    // Get container info from repository
    const container = containerRepository.findById(containerId);
    if (!container) {
      logger.warn({ containerId }, 'Container not found in repository');
      return;
    }

    if (!container.dockerId) {
      logger.warn({ containerId }, 'Container has no Docker ID');
      return;
    }

    try {
      await this.attachToDockerContainer(containerId, container.dockerId);
      logger.info({ containerId, dockerId: container.dockerId }, 'Attached to container logs');
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to attach to container');
    }
  }

  /**
   * Detach from a container's log stream
   */
  detachFromContainer(containerId: string): void {
    const attachment = this.attachments.get(containerId);
    if (!attachment) {
      return;
    }

    try {
      attachment.cleanup();
    } catch (error) {
      logger.warn({ error, containerId }, 'Error during detachment cleanup');
    }

    this.attachments.delete(containerId);
    logger.debug({ containerId }, 'Detached from container logs');
  }

  /**
   * Check if attached to a container
   */
  isAttached(containerId: string): boolean {
    return this.attachments.has(containerId);
  }

  /**
   * Get collector statistics
   */
  getStats(): CollectorStats {
    // Calculate logs per second from sliding window (last 60 samples)
    const windowSize = Math.min(this.logsCollectedWindow.length, 60);
    const recentLogs = this.logsCollectedWindow.slice(-windowSize);
    const logsPerSecond = windowSize > 0
      ? recentLogs.reduce((a, b) => a + b, 0) / windowSize
      : 0;

    return {
      activeContainers: this.attachments.size,
      logsCollected: this.logsCollectedTotal,
      logsPerSecond: Math.round(logsPerSecond * 100) / 100,
      lastCleanup: this.lastCleanup,
    };
  }

  /**
   * Attach to running containers in the database
   */
  private async attachToRunningContainers(): Promise<void> {
    const runningContainers = containerRepository.findByStatus('running');
    logger.info({ count: runningContainers.length }, 'Attaching to running containers');

    const since = Math.floor((Date.now() - CONFIG.RETENTION_HOURS * 60 * 60 * 1000) / 1000);

    await Promise.allSettled(
      runningContainers.map(async (container) => {
        try {
          await this.attachToDockerContainer(container.id, container.dockerId, since);
        } catch (error) {
          logger.warn({ error, containerId: container.id }, 'Failed to attach to container on startup');
        }
      })
    );
  }

  /**
   * Attach to a Docker container's log stream
   */
  private async attachToDockerContainer(
    containerId: string,
    dockerId: string,
    since?: number
  ): Promise<void> {
    const dockerContainer = this.docker.getContainer(dockerId);

    // Calculate since timestamp (default: 24 hours ago)
    const sinceTimestamp = since ?? Math.floor((Date.now() - CONFIG.RETENTION_HOURS * 60 * 60 * 1000) / 1000);

    return new Promise((resolve, reject) => {
      let stopped = false;
      let stream: NodeJS.ReadableStream | null = null;
      let buffer = Buffer.alloc(0);

      const cleanup = () => {
        stopped = true;
        if (stream) {
          try {
            (stream as any).destroy?.();
          } catch {
            // Ignore cleanup errors
          }
          stream = null;
        }
      };

      dockerContainer.logs(
        {
          follow: true,
          stdout: true,
          stderr: true,
          timestamps: true,
          since: sinceTimestamp,
        },
        (err, logStream) => {
          if (err) {
            reject(err);
            return;
          }

          if (stopped || !logStream) {
            if (logStream) {
              (logStream as any).destroy?.();
            }
            resolve();
            return;
          }

          stream = logStream;

          // Store attachment
          this.attachments.set(containerId, {
            containerId,
            dockerId,
            cleanup,
            reconnectAttempts: 0,
          });

          logStream.on('data', (chunk: Buffer) => {
            buffer = Buffer.concat([buffer, chunk]);

            // Process complete frames
            let frame = parseDockerStreamFrame(buffer);
            while (frame !== null) {
              const { stream: streamType, payload, remaining } = frame;
              buffer = Buffer.from(remaining);

              // Split by lines and process
              const lines = payload.split('\n').filter((l) => l.trim());
              for (const line of lines) {
                const { timestamp, content } = parseLogTimestamp(line);
                const sanitized = sanitizeLogContent(content);

                if (sanitized) {
                  this.addToBuffer({
                    containerId,
                    stream: streamType,
                    content: sanitized,
                    timestamp,
                  });
                }
              }

              frame = parseDockerStreamFrame(buffer);
            }
          });

          logStream.on('error', (error) => {
            logger.error({ error, containerId }, 'Log stream error');
            this.handleStreamError(containerId);
          });

          logStream.on('end', () => {
            logger.debug({ containerId }, 'Log stream ended');
            this.handleStreamEnd(containerId);
          });

          resolve();
        }
      );
    });
  }

  /**
   * Handle stream error - attempt reconnection
   */
  private handleStreamError(containerId: string): void {
    const attachment = this.attachments.get(containerId);
    if (!attachment || !this.isRunning) {
      return;
    }

    attachment.reconnectAttempts++;

    if (attachment.reconnectAttempts > CONFIG.MAX_RECONNECT_ATTEMPTS) {
      logger.warn(
        { containerId, attempts: attachment.reconnectAttempts },
        'Max reconnect attempts reached, giving up'
      );
      this.detachFromContainer(containerId);
      return;
    }

    logger.debug(
      { containerId, attempt: attachment.reconnectAttempts },
      'Scheduling reconnection'
    );

    setTimeout(() => {
      if (!this.isRunning || !this.attachments.has(containerId)) {
        return;
      }

      // Check if container is still running
      const container = containerRepository.findById(containerId);
      if (!container || container.status !== 'running') {
        this.detachFromContainer(containerId);
        return;
      }

      // Re-attach
      this.attachToDockerContainer(containerId, attachment.dockerId).catch((error) => {
        logger.error({ error, containerId }, 'Reconnection failed');
      });
    }, CONFIG.RECONNECT_DELAY_MS);
  }

  /**
   * Handle stream end - container may have stopped
   */
  private handleStreamEnd(containerId: string): void {
    const attachment = this.attachments.get(containerId);
    if (!attachment) {
      return;
    }

    // Check if container is still running
    const container = containerRepository.findById(containerId);
    if (!container || container.status !== 'running') {
      this.detachFromContainer(containerId);
      return;
    }

    // Stream ended but container running - attempt reconnect
    this.handleStreamError(containerId);
  }

  /**
   * Add log entry to buffer
   */
  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    this.logsCollectedTotal++;

    // Track for rate calculation
    if (this.logsCollectedWindow.length > 0) {
      const lastIndex = this.logsCollectedWindow.length - 1;
      const currentValue = this.logsCollectedWindow[lastIndex];
      if (currentValue !== undefined) {
        this.logsCollectedWindow[lastIndex] = currentValue + 1;
      }
    }

    // Emit for real-time streaming
    this.emit('log', { containerId: entry.containerId, log: entry });

    // Flush if batch size reached
    if (this.logBuffer.length >= CONFIG.BATCH_SIZE) {
      this.flushLogBuffer().catch((error) => {
        logger.error({ error }, 'Failed to flush log buffer');
      });
    }
  }

  /**
   * Start batch flush timer
   */
  private startBatchTimer(): void {
    this.batchTimer = setInterval(() => {
      // Track rate window
      this.logsCollectedWindow.push(0);
      if (this.logsCollectedWindow.length > 120) {
        this.logsCollectedWindow.shift();
      }

      // Flush buffer
      this.flushLogBuffer().catch((error) => {
        logger.error({ error }, 'Failed to flush log buffer in timer');
      });
    }, CONFIG.BATCH_INTERVAL_MS);
  }

  /**
   * Flush log buffer to database
   */
  private async flushLogBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }

    // Swap buffer to avoid race conditions
    const logsToFlush = this.logBuffer;
    this.logBuffer = [];

    try {
      const dtos: CreateDockerLogDto[] = logsToFlush.map((entry) => ({
        containerId: entry.containerId,
        stream: entry.stream,
        content: entry.content,
      }));

      const inserted = dockerLogsRepository.createBatch(dtos);

      if (inserted !== dtos.length) {
        logger.warn(
          { expected: dtos.length, actual: inserted },
          'Not all logs were inserted'
        );
      }

      logger.debug({ count: inserted }, 'Flushed logs to database');
    } catch (error) {
      logger.error({ error, count: logsToFlush.length }, 'Failed to insert logs');
      // Put logs back in buffer (limited to prevent memory issues)
      if (this.logBuffer.length + logsToFlush.length <= CONFIG.BATCH_SIZE * 10) {
        this.logBuffer = [...logsToFlush, ...this.logBuffer];
      } else {
        logger.warn({ dropped: logsToFlush.length }, 'Dropping logs due to buffer overflow');
      }
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.runCleanup();
    }, CONFIG.CLEANUP_INTERVAL_MS);
  }

  /**
   * Run cleanup job
   */
  private runCleanup(): void {
    try {
      const deletedCount = dockerLogsRepository.deleteOlderThan(CONFIG.RETENTION_HOURS);
      this.lastCleanup = new Date();

      if (deletedCount > 0) {
        logger.info(
          { deletedCount, retentionHours: CONFIG.RETENTION_HOURS },
          'Cleaned up old Docker logs'
        );
      } else {
        logger.debug('No old Docker logs to cleanup');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup old logs');
    }
  }

  /**
   * Start listening for Docker events
   */
  private async startEventListener(): Promise<void> {
    try {
      const stream = await this.docker.getEvents({
        filters: {
          type: ['container'],
          event: ['start', 'stop', 'die'],
        },
      });

      this.eventStream = stream;

      stream.on('data', (chunk: Buffer) => {
        try {
          const event = JSON.parse(chunk.toString());
          this.handleDockerEvent(event);
        } catch {
          // Ignore parse errors
        }
      });

      stream.on('error', (error) => {
        logger.error({ error }, 'Docker event stream error');
        // Attempt to restart after delay
        if (this.isRunning) {
          setTimeout(() => {
            this.startEventListener().catch((err) => {
              logger.error({ error: err }, 'Failed to restart event listener');
            });
          }, CONFIG.RECONNECT_DELAY_MS);
        }
      });

      logger.debug('Docker event listener started');
    } catch (error) {
      logger.error({ error }, 'Failed to start Docker event listener');
    }
  }

  /**
   * Stop Docker event listener
   */
  private stopEventListener(): void {
    if (this.eventStream) {
      try {
        (this.eventStream as any).destroy?.();
      } catch {
        // Ignore cleanup errors
      }
      this.eventStream = null;
    }
  }

  /**
   * Handle Docker container events
   */
  private handleDockerEvent(event: any): void {
    if (!event || !event.id || !event.Action) {
      return;
    }

    const dockerId = event.id;
    const action = event.Action;

    // Find container by dockerId
    const containers = containerRepository.findAll();
    const container = containers.find((c) => c.dockerId === dockerId);

    if (!container) {
      // Not a managed container
      return;
    }

    logger.debug({ containerId: container.id, action }, 'Docker container event');

    switch (action) {
      case 'start':
        // Attach to newly started container
        this.attachToContainer(container.id).catch((error) => {
          logger.error({ error, containerId: container.id }, 'Failed to attach on container start');
        });
        break;

      case 'stop':
      case 'die':
        // Detach from stopped container
        this.detachFromContainer(container.id);
        break;
    }
  }
}

// Export singleton instance
export const dockerLogsCollectorService: DockerLogsCollectorService = new DockerLogsCollectorServiceImpl();
