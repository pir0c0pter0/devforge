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
      logger.error({ error, containerId }, 'Failed to stop Docker container');
      throw new Error(`Failed to stop container: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      logger.error({ error, containerId }, 'Failed to delete Docker container');
      throw new Error(`Failed to delete container: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
}

// Export singleton instance
export const dockerService = new DockerService();
