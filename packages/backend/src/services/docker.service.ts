import Docker, { Container, ContainerCreateOptions, ContainerInspectInfo } from 'dockerode';
import { dockerLogger as logger } from '../utils/logger';
import { ContainerStatus } from '../models/container.model';

/**
 * Docker service using Dockerode
 */
export class DockerService {
  private docker: Docker;

  constructor() {
    this.docker = new Docker({
      socketPath: process.env['DOCKER_SOCKET_PATH'] || '/var/run/docker.sock',
    });
  }

  /**
   * Create a new Docker container
   */
  async createContainer(options: ContainerCreateOptions): Promise<Container> {
    try {
      logger.info({ options }, 'Creating Docker container');

      const container = await this.docker.createContainer(options);

      logger.info({
        containerId: container.id,
        name: options.name
      }, 'Docker container created successfully');

      return container;
    } catch (error) {
      logger.error({ error, options }, 'Failed to create Docker container');
      throw new Error(`Failed to create container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Start a Docker container
   */
  async startContainer(containerId: string): Promise<void> {
    try {
      logger.info({ containerId }, 'Starting Docker container');

      const container = this.docker.getContainer(containerId);
      await container.start();

      logger.info({ containerId }, 'Docker container started successfully');
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to start Docker container');
      throw new Error(`Failed to start container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop a Docker container
   */
  async stopContainer(containerId: string, timeout: number = 10): Promise<void> {
    try {
      logger.info({ containerId, timeout }, 'Stopping Docker container');

      const container = this.docker.getContainer(containerId);
      await container.stop({ t: timeout });

      logger.info({ containerId }, 'Docker container stopped successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // If container is already stopped or doesn't exist, that's fine
      if (errorMessage.includes('is not running') ||
          errorMessage.includes('No such container') ||
          errorMessage.includes('304') ||
          (error as any).statusCode === 304 ||
          (error as any).statusCode === 404) {
        logger.warn({ containerId }, 'Container already stopped or not found');
        return;
      }

      logger.error({ error, containerId }, 'Failed to stop Docker container');
      throw new Error(`Failed to stop container: ${errorMessage}`);
    }
  }

  /**
   * Delete a Docker container
   */
  async deleteContainer(containerId: string, force: boolean = false): Promise<void> {
    try {
      logger.info({ containerId, force }, 'Deleting Docker container');

      const container = this.docker.getContainer(containerId);
      await container.remove({ force });

      logger.info({ containerId }, 'Docker container deleted successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // If container doesn't exist in Docker, that's fine - it's already gone
      if (errorMessage.includes('No such container') ||
          errorMessage.includes('404') ||
          (error as any).statusCode === 404) {
        logger.warn({ containerId }, 'Container not found in Docker, may have been already deleted');
        return;
      }

      logger.error({ error, containerId }, 'Failed to delete Docker container');
      throw new Error(`Failed to delete container: ${errorMessage}`);
    }
  }

  /**
   * Get container statistics
   */
  async getContainerStats(containerId: string): Promise<any> {
    try {
      const container = this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });

      return stats;
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to get container stats');
      throw new Error(`Failed to get container stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all containers
   */
  async listContainers(all: boolean = true): Promise<Docker.ContainerInfo[]> {
    try {
      logger.debug({ all }, 'Listing Docker containers');

      const containers = await this.docker.listContainers({ all });

      logger.debug({ count: containers.length }, 'Listed Docker containers');

      return containers;
    } catch (error) {
      logger.error({ error }, 'Failed to list Docker containers');
      throw new Error(`Failed to list containers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute a command in a running container
   */
  async executeCommand(
    containerId: string,
    command: string[],
    options?: { user?: string; workingDir?: string }
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    try {
      logger.info({
        containerId,
        command,
        options
      }, 'Executing command in container');

      const container = this.docker.getContainer(containerId);

      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        User: options?.user,
        WorkingDir: options?.workingDir,
      });

      const stream = await exec.start({ Detach: false });

      let stdout = '';
      let stderr = '';

      return new Promise((resolve, reject) => {
        if (stream instanceof Buffer) {
          stdout = stream.toString();
          exec.inspect().then((info) => {
            resolve({
              exitCode: info.ExitCode || 0,
              stdout,
              stderr,
            });
          }).catch(reject);
          return;
        }

        this.docker.modem.demuxStream(
          stream,
          {
            write: (chunk: Buffer) => {
              stdout += chunk.toString();
            },
          } as NodeJS.WritableStream,
          {
            write: (chunk: Buffer) => {
              stderr += chunk.toString();
            },
          } as NodeJS.WritableStream
        );

        stream.on('end', async () => {
          try {
            const info = await exec.inspect();
            resolve({
              exitCode: info.ExitCode || 0,
              stdout,
              stderr,
            });
          } catch (error) {
            reject(error);
          }
        });

        stream.on('error', reject);
      });
    } catch (error) {
      logger.error({ error, containerId, command }, 'Failed to execute command in container');
      throw new Error(`Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get container logs
   */
  async getContainerLogs(
    containerId: string,
    options?: { tail?: number; since?: number; until?: number }
  ): Promise<string> {
    try {
      logger.debug({ containerId, options }, 'Getting container logs');

      const container = this.docker.getContainer(containerId);

      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: options?.tail || 100,
        since: options?.since,
        until: options?.until,
        timestamps: true,
      });

      return logs.toString();
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to get container logs');
      throw new Error(`Failed to get container logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Inspect container details
   */
  async inspectContainer(containerId: string): Promise<ContainerInspectInfo> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();

      return info;
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to inspect container');
      throw new Error(`Failed to inspect container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get container status
   */
  async getContainerStatus(containerId: string): Promise<ContainerStatus> {
    try {
      const info = await this.inspectContainer(containerId);

      const state = info.State.Status;

      const statusMap: Record<string, ContainerStatus> = {
        'created': 'creating',
        'running': 'running',
        'paused': 'paused',
        'restarting': 'restarting',
        'removing': 'removing',
        'exited': 'exited',
        'dead': 'dead',
      };

      return statusMap[state] || 'stopped';
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to get container status');
      throw new Error(`Failed to get container status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Pause a container
   */
  async pauseContainer(containerId: string): Promise<void> {
    try {
      logger.info({ containerId }, 'Pausing Docker container');

      const container = this.docker.getContainer(containerId);
      await container.pause();

      logger.info({ containerId }, 'Docker container paused successfully');
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to pause Docker container');
      throw new Error(`Failed to pause container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Unpause a container
   */
  async unpauseContainer(containerId: string): Promise<void> {
    try {
      logger.info({ containerId }, 'Unpausing Docker container');

      const container = this.docker.getContainer(containerId);
      await container.unpause();

      logger.info({ containerId }, 'Docker container unpaused successfully');
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to unpause Docker container');
      throw new Error(`Failed to unpause container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Restart a container
   */
  async restartContainer(containerId: string, timeout: number = 10): Promise<void> {
    try {
      logger.info({ containerId, timeout }, 'Restarting Docker container');

      const container = this.docker.getContainer(containerId);
      await container.restart({ t: timeout });

      logger.info({ containerId }, 'Docker container restarted successfully');
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to restart Docker container');
      throw new Error(`Failed to restart container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Copy files to container
   */
  async copyToContainer(
    containerId: string,
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    try {
      logger.info({
        containerId,
        sourcePath,
        destinationPath
      }, 'Copying files to container');

      const container = this.docker.getContainer(containerId);

      const tar = await import('tar-fs');
      const path = await import('path');

      const tarStream = tar.pack(path.dirname(sourcePath), {
        entries: [path.basename(sourcePath)]
      });

      await container.putArchive(tarStream, { path: destinationPath });

      logger.info({ containerId }, 'Files copied to container successfully');
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to copy files to container');
      throw new Error(`Failed to copy files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if Docker daemon is accessible
   */
  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to ping Docker daemon');
      return false;
    }
  }

  /**
   * Check if a Docker image exists
   */
  async imageExists(imageName: string): Promise<boolean> {
    try {
      const image = this.docker.getImage(imageName);
      await image.inspect();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update container resource limits (CPU and Memory)
   * Note: Disk cannot be updated at runtime - only stored in DB
   */
  async updateContainerResources(
    containerId: string,
    options: { memoryBytes?: number; nanoCpus?: number }
  ): Promise<void> {
    try {
      logger.info({ containerId, options }, 'Updating Docker container resources');

      const container = this.docker.getContainer(containerId);

      const updateConfig: any = {};

      if (options.memoryBytes !== undefined) {
        updateConfig.Memory = options.memoryBytes;
        updateConfig.MemorySwap = options.memoryBytes; // Same as memory to disable swap
      }

      if (options.nanoCpus !== undefined) {
        updateConfig.NanoCpus = options.nanoCpus;
      }

      await container.update(updateConfig);

      logger.info({ containerId }, 'Docker container resources updated successfully');
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to update Docker container resources');
      throw new Error(`Failed to update container resources: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a Docker volume
   * Used to clean up workspace volumes when containers are deleted
   */
  async deleteVolume(volumeName: string): Promise<void> {
    try {
      logger.info({ volumeName }, 'Deleting Docker volume');
      const volume = this.docker.getVolume(volumeName);
      await volume.remove();
      logger.info({ volumeName }, 'Docker volume deleted successfully');
    } catch (error: any) {
      // Ignore "not found" errors - volume may not exist
      if (error.statusCode === 404) {
        logger.debug({ volumeName }, 'Docker volume not found, skipping delete');
        return;
      }
      logger.error({ error, volumeName }, 'Failed to delete Docker volume');
      throw new Error(`Failed to delete volume: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stream container logs in real-time
   * Returns a cleanup function to stop streaming
   */
  streamContainerLogs(
    containerId: string,
    onData: (line: string, stream: 'stdout' | 'stderr', timestamp: string) => void,
    options?: { tail?: number }
  ): () => void {
    const container = this.docker.getContainer(containerId);
    let stream: NodeJS.ReadableStream | null = null;
    let stopped = false;

    container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      timestamps: true,
      tail: options?.tail || 100,
    }, (err, logStream) => {
      if (err || stopped || !logStream) {
        if (err) logger.error({ error: err, containerId }, 'Failed to start log stream');
        return;
      }

      stream = logStream;

      // Docker multiplexed stream format:
      // Header (8 bytes): [stream type (1), 0, 0, 0, size (4 bytes big-endian)]
      // stream type: 0 = stdin, 1 = stdout, 2 = stderr
      let buffer = Buffer.alloc(0);

      logStream.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        // Process complete frames
        while (buffer.length >= 8) {
          const header = buffer.slice(0, 8);
          const streamType = header[0]; // 1 = stdout, 2 = stderr
          const size = header.readUInt32BE(4);

          if (buffer.length < 8 + size) {
            // Not enough data yet, wait for more
            break;
          }

          const payload = buffer.slice(8, 8 + size).toString('utf8');
          buffer = buffer.slice(8 + size);

          // Parse timestamp and message
          // Format: "2024-02-04T10:30:45.123456789Z message content\n"
          const timestampMatch = payload.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s?/);
          let timestamp: string;
          let message: string;

          if (timestampMatch && timestampMatch[1]) {
            timestamp = timestampMatch[1];
            message = payload.slice(timestampMatch[0].length);
          } else {
            timestamp = new Date().toISOString();
            message = payload;
          }

          // Remove trailing newline
          message = message.replace(/\n$/, '');

          if (message.trim()) {
            const streamName = streamType === 2 ? 'stderr' : 'stdout';
            onData(message, streamName, timestamp);
          }
        }
      });

      logStream.on('error', (error) => {
        logger.error({ error, containerId }, 'Log stream error');
      });

      logStream.on('end', () => {
        logger.debug({ containerId }, 'Log stream ended');
      });
    });

    // Return cleanup function
    return () => {
      stopped = true;
      if (stream) {
        (stream as any).destroy?.();
        stream = null;
      }
    };
  }
}

// Export singleton instance
export const dockerService = new DockerService();
