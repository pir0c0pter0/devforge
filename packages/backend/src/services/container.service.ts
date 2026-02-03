import { ContainerCreateOptions } from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { dockerService } from './docker.service';
import { metricsService } from './metrics.service';
import {
  Container,
  ContainerConfig,
  ContainerListItem,
  ContainerMetrics,
  ContainerStatus
} from '../models/container.model';
import { containerLogger as logger } from '../utils/logger';
import {
  getTemplateById,
  ContainerTemplate,
  CreateFromTemplateRequest,
} from '../templates';
import {
  containerRepository,
  type ContainerEntity,
  type CreateContainerDto,
} from '../repositories';
import * as path from 'path';
import * as os from 'os';

/**
 * Convert repository entity to service model
 */
const entityToContainer = (entity: ContainerEntity): Container => ({
  id: entity.id,
  dockerId: entity.dockerId,
  name: entity.name,
  template: entity.template,
  mode: entity.mode,
  status: entity.status,
  repoUrl: entity.repoUrl,
  repoType: entity.repoType,
  sshKeyPath: entity.sshKeyPath,
  cpuLimit: entity.cpuLimit,
  memoryLimit: entity.memoryLimit,
  diskLimit: entity.diskLimit,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  startedAt: entity.startedAt,
  stoppedAt: entity.stoppedAt,
});

/**
 * Business logic layer for container management
 */
export class ContainerService {
  // In-memory cache for faster lookups (synced with database)
  private containers: Map<string, Container> = new Map();

  /**
   * Create a new container with configuration
   */
  async create(config: ContainerConfig): Promise<Container> {
    try {
      logger.info({ config }, 'Creating new container');

      const containerId = uuidv4();
      const containerName = `claude-docker-${config.name}-${Date.now()}`;

      // Prepare Docker image based on template
      const image = this.getImageForTemplate(config.template);

      // Prepare environment variables
      const env = this.prepareEnvironmentVariables(config);

      // Prepare volume mounts
      const volumes = await this.prepareVolumes(config);

      // Prepare resource limits
      const hostConfig = this.prepareHostConfig(config);

      // Create Docker container options
      const createOptions: ContainerCreateOptions = {
        name: containerName,
        Image: image,
        Env: env,
        WorkingDir: '/workspace',
        Tty: true,
        OpenStdin: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {
          ...hostConfig,
          Binds: volumes,
        },
        Labels: {
          'claude-docker.id': containerId,
          'claude-docker.name': config.name,
          'claude-docker.template': config.template,
          'claude-docker.mode': config.mode,
        },
      };

      // Create Docker container
      const dockerContainer = await dockerService.createContainer(createOptions);

      // Copy Claude configs from host to container
      await this.copyClaudeConfigs(dockerContainer.id);

      // Clone repository if specified
      if (config.repoType === 'clone' && config.repoUrl) {
        await this.cloneRepository(dockerContainer.id, config.repoUrl, config.sshKeyPath);
      }

      // Create container record in database
      const createDto: CreateContainerDto = {
        dockerId: dockerContainer.id,
        name: config.name,
        template: config.template,
        mode: config.mode,
        repoUrl: config.repoUrl,
        repoType: config.repoType,
        sshKeyPath: config.sshKeyPath,
        cpuLimit: config.cpuLimit,
        memoryLimit: config.memoryLimit,
        diskLimit: config.diskLimit,
      };

      const entity = containerRepository.create(createDto);
      const container = entityToContainer(entity);

      // Update in-memory cache
      this.containers.set(container.id, container);

      logger.info({
        containerId: container.id,
        dockerId: dockerContainer.id,
        name: config.name
      }, 'Container created successfully');

      return container;
    } catch (error) {
      logger.error({ error, config }, 'Failed to create container');
      throw new Error(`Failed to create container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new container from a template
   */
  async createFromTemplate(
    templateId: string,
    options: Omit<CreateFromTemplateRequest, 'templateId'>
  ): Promise<Container> {
    try {
      logger.info({ templateId, options }, 'Creating container from template');

      const template = getTemplateById(templateId);

      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      const containerId = uuidv4();
      const containerName = `claude-docker-${options.name}-${Date.now()}`;

      // Get image from template config
      const image = template.defaultConfig.image;

      // Merge template environment with user-provided environment
      const templateEnv = this.prepareTemplateEnvironment(template, options.environment);

      // Prepare volume mounts
      const config: ContainerConfig = {
        name: options.name,
        template: 'both',
        mode: options.mode,
        repoType: options.repoType,
        repoUrl: options.repoUrl,
        sshKeyPath: options.sshKeyPath,
        cpuLimit: options.cpuLimit ?? template.defaultConfig.resources?.cpuLimit ?? 2,
        memoryLimit: options.memoryLimit ?? template.defaultConfig.resources?.memoryLimit ?? 4096,
        diskLimit: options.diskLimit ?? template.defaultConfig.resources?.diskLimit ?? 20480,
      };

      const volumes = await this.prepareVolumes(config);

      // Prepare host config with template ports
      const hostConfig = this.prepareHostConfigWithPorts(config, template);

      // Create Docker container options
      const createOptions: ContainerCreateOptions = {
        name: containerName,
        Image: image,
        Env: templateEnv,
        WorkingDir: template.defaultConfig.workingDir ?? '/home/developer/workspace',
        Tty: true,
        OpenStdin: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {
          ...hostConfig,
          Binds: volumes,
        },
        Labels: {
          'claude-docker.id': containerId,
          'claude-docker.name': options.name,
          'claude-docker.template': templateId,
          'claude-docker.mode': options.mode,
          'claude-docker.from-template': 'true',
        },
      };

      // Create Docker container
      const dockerContainer = await dockerService.createContainer(createOptions);

      // Copy Claude configs from host to container
      await this.copyClaudeConfigs(dockerContainer.id);

      // Clone repository if specified
      if (options.repoType === 'clone' && options.repoUrl) {
        await this.cloneRepository(dockerContainer.id, options.repoUrl, options.sshKeyPath);
      }

      // Create container record in database
      const createDto: CreateContainerDto = {
        dockerId: dockerContainer.id,
        name: options.name,
        template: 'both',
        mode: options.mode,
        repoUrl: options.repoUrl,
        repoType: options.repoType,
        sshKeyPath: options.sshKeyPath,
        cpuLimit: config.cpuLimit,
        memoryLimit: config.memoryLimit,
        diskLimit: config.diskLimit,
      };

      const entity = containerRepository.create(createDto);
      const container = entityToContainer(entity);

      // Update in-memory cache
      this.containers.set(container.id, container);

      // Start the container
      await dockerService.startContainer(dockerContainer.id);

      // Run post-create commands
      await this.runPostCreateCommands(dockerContainer.id, template);

      // Install VS Code extensions
      await this.installVSCodeExtensions(dockerContainer.id, template.defaultConfig.extensions);

      // Update container status in database
      const updatedEntity = containerRepository.updateStatus(container.id, 'running');
      if (!updatedEntity) {
        throw new Error('Failed to update container status');
      }

      const updatedContainer = entityToContainer(updatedEntity);
      this.containers.set(container.id, updatedContainer);

      logger.info({
        containerId: container.id,
        dockerId: dockerContainer.id,
        name: options.name,
        templateId,
      }, 'Container created from template successfully');

      return updatedContainer;
    } catch (error) {
      logger.error({ error, templateId, options }, 'Failed to create container from template');
      throw new Error(`Failed to create container from template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Prepare environment variables from template and user overrides
   */
  private prepareTemplateEnvironment(
    template: ContainerTemplate,
    userEnv?: Record<string, string>
  ): string[] {
    const env: string[] = ['TERM=xterm-256color'];

    // Add template environment variables
    for (const [key, value] of Object.entries(template.defaultConfig.environment)) {
      env.push(`${key}=${value}`);
    }

    // Add user-provided environment variables (override template values)
    if (userEnv) {
      for (const [key, value] of Object.entries(userEnv)) {
        // Remove existing key if present
        const existingIndex = env.findIndex((e) => e.startsWith(`${key}=`));
        if (existingIndex !== -1) {
          env.splice(existingIndex, 1);
        }
        env.push(`${key}=${value}`);
      }
    }

    return env;
  }

  /**
   * Prepare host config with template ports
   */
  private prepareHostConfigWithPorts(config: ContainerConfig, template: ContainerTemplate): any {
    const baseConfig = this.prepareHostConfig(config);

    // Add port bindings from template
    if (template.defaultConfig.ports) {
      const portBindings: Record<string, Array<{ HostPort: string }>> = {};

      for (const [containerPort, hostPort] of Object.entries(template.defaultConfig.ports)) {
        portBindings[`${containerPort}/tcp`] = [{ HostPort: String(hostPort) }];
      }

      return {
        ...baseConfig,
        PortBindings: portBindings,
      };
    }

    return baseConfig;
  }

  /**
   * Run post-create commands from template
   */
  private async runPostCreateCommands(
    dockerId: string,
    template: ContainerTemplate
  ): Promise<void> {
    const commands = template.defaultConfig.postCreateCommands;

    if (!commands || commands.length === 0) {
      return;
    }

    logger.info({ dockerId, commandCount: commands.length }, 'Running post-create commands');

    for (const command of commands) {
      try {
        logger.debug({ dockerId, command }, 'Executing post-create command');

        const result = await dockerService.executeCommand(
          dockerId,
          ['bash', '-c', command],
          { user: 'developer', workingDir: '/home/developer/workspace' }
        );

        if (result.exitCode !== 0) {
          logger.warn(
            { dockerId, command, exitCode: result.exitCode, stderr: result.stderr },
            'Post-create command returned non-zero exit code'
          );
        }
      } catch (error) {
        logger.warn({ error, dockerId, command }, 'Post-create command failed, continuing');
      }
    }

    logger.info({ dockerId }, 'Post-create commands completed');
  }

  /**
   * Install VS Code extensions
   */
  private async installVSCodeExtensions(
    dockerId: string,
    extensions: string[]
  ): Promise<void> {
    if (!extensions || extensions.length === 0) {
      return;
    }

    logger.info({ dockerId, extensionCount: extensions.length }, 'Installing VS Code extensions');

    for (const extension of extensions) {
      try {
        logger.debug({ dockerId, extension }, 'Installing VS Code extension');

        const result = await dockerService.executeCommand(
          dockerId,
          ['code-server', '--install-extension', extension],
          { user: 'developer' }
        );

        if (result.exitCode !== 0) {
          logger.warn(
            { dockerId, extension, exitCode: result.exitCode, stderr: result.stderr },
            'Extension installation returned non-zero exit code'
          );
        }
      } catch (error) {
        logger.warn({ error, dockerId, extension }, 'Extension installation failed, continuing');
      }
    }

    logger.info({ dockerId }, 'VS Code extensions installation completed');
  }

  /**
   * Start a container
   */
  async start(containerId: string): Promise<Container> {
    try {
      // Try cache first, then database
      let container = this.containers.get(containerId);
      if (!container) {
        const entity = containerRepository.findById(containerId);
        if (entity) {
          container = entityToContainer(entity);
          this.containers.set(containerId, container);
        }
      }

      if (!container) {
        throw new Error(`Container not found: ${containerId}`);
      }

      logger.info({ containerId, dockerId: container.dockerId }, 'Starting container');

      await dockerService.startContainer(container.dockerId);

      // Update status in database
      const updatedEntity = containerRepository.updateStatus(containerId, 'running');
      if (!updatedEntity) {
        throw new Error('Failed to update container status');
      }

      const updatedContainer = entityToContainer(updatedEntity);
      this.containers.set(containerId, updatedContainer);

      logger.info({ containerId }, 'Container started successfully');

      return updatedContainer;
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to start container');
      throw new Error(`Failed to start container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop a container
   */
  async stop(containerId: string): Promise<Container> {
    try {
      // Try cache first, then database
      let container = this.containers.get(containerId);
      if (!container) {
        const entity = containerRepository.findById(containerId);
        if (entity) {
          container = entityToContainer(entity);
          this.containers.set(containerId, container);
        }
      }

      if (!container) {
        throw new Error(`Container not found: ${containerId}`);
      }

      logger.info({ containerId, dockerId: container.dockerId }, 'Stopping container');

      await dockerService.stopContainer(container.dockerId);

      // Update status in database
      const updatedEntity = containerRepository.updateStatus(containerId, 'stopped');
      if (!updatedEntity) {
        throw new Error('Failed to update container status');
      }

      const updatedContainer = entityToContainer(updatedEntity);
      this.containers.set(containerId, updatedContainer);

      logger.info({ containerId }, 'Container stopped successfully');

      return updatedContainer;
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to stop container');
      throw new Error(`Failed to stop container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a container
   */
  async delete(containerId: string, force: boolean = false): Promise<void> {
    try {
      // Try cache first, then database
      let container = this.containers.get(containerId);
      if (!container) {
        const entity = containerRepository.findById(containerId);
        if (entity) {
          container = entityToContainer(entity);
        }
      }

      if (!container) {
        throw new Error(`Container not found: ${containerId}`);
      }

      logger.info({ containerId, dockerId: container.dockerId, force }, 'Deleting container');

      await dockerService.deleteContainer(container.dockerId, force);

      // Delete from database
      containerRepository.delete(containerId);

      // Remove from cache
      this.containers.delete(containerId);

      logger.info({ containerId }, 'Container deleted successfully');
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to delete container');
      throw new Error(`Failed to delete container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all containers with metrics
   */
  async getAll(includeMetrics: boolean = false): Promise<ContainerListItem[]> {
    try {
      logger.debug({ includeMetrics }, 'Getting all containers');

      // Fetch from database
      const entities = containerRepository.findAll();
      const items: ContainerListItem[] = [];

      for (const entity of entities) {
        const container = entityToContainer(entity);
        // Update cache
        this.containers.set(container.id, container);

        let metrics: ContainerMetrics | undefined;

        if (includeMetrics && container.status === 'running') {
          try {
            metrics = await metricsService.getContainerMetrics(container.dockerId);
          } catch (error) {
            logger.warn({ error, containerId: container.id }, 'Failed to get metrics for container');
          }
        }

        items.push({
          id: container.id,
          dockerId: container.dockerId,
          name: container.name,
          template: container.template,
          mode: container.mode,
          status: container.status,
          createdAt: container.createdAt,
          metrics,
        });
      }

      return items;
    } catch (error) {
      logger.error({ error }, 'Failed to get all containers');
      throw new Error(`Failed to get containers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get container by ID
   */
  async getById(containerId: string): Promise<Container | null> {
    // Try cache first
    const cached = this.containers.get(containerId);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const entity = containerRepository.findById(containerId);
    if (!entity) {
      return null;
    }

    const container = entityToContainer(entity);
    this.containers.set(containerId, container);
    return container;
  }

  /**
   * Get container metrics
   */
  async getMetrics(containerId: string): Promise<ContainerMetrics> {
    try {
      const container = await this.getById(containerId);

      if (!container) {
        throw new Error(`Container not found: ${containerId}`);
      }

      if (container.status !== 'running') {
        throw new Error(`Container is not running: ${containerId}`);
      }

      return await metricsService.getContainerMetrics(container.dockerId);
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to get container metrics');
      throw new Error(`Failed to get metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get container logs
   */
  async getLogs(containerId: string, tail?: number): Promise<string> {
    try {
      const container = await this.getById(containerId);

      if (!container) {
        throw new Error(`Container not found: ${containerId}`);
      }

      return await dockerService.getContainerLogs(container.dockerId, { tail });
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to get container logs');
      throw new Error(`Failed to get logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get Docker image name for template
   */
  private getImageForTemplate(template: string): string {
    const imageMap: Record<string, string> = {
      'claude': 'claude-docker/claude:latest',
      'vscode': 'claude-docker/vscode:latest',
      'both': 'claude-docker/full:latest',
    };

    return imageMap[template] || 'claude-docker/claude:latest';
  }

  /**
   * Prepare environment variables
   */
  private prepareEnvironmentVariables(config: ContainerConfig): string[] {
    const env: string[] = [
      'TERM=xterm-256color',
      `CONTAINER_NAME=${config.name}`,
      `CONTAINER_MODE=${config.mode}`,
    ];

    if (config.repoUrl) {
      env.push(`REPO_URL=${config.repoUrl}`);
    }

    return env;
  }

  /**
   * Prepare volume mounts
   */
  private async prepareVolumes(config: ContainerConfig): Promise<string[]> {
    const volumes: string[] = [];
    const homeDir = os.homedir();

    // Mount workspace
    volumes.push('/var/lib/docker/volumes/workspace:/workspace');

    // Mount Claude credentials (for browser-based auth - Personal/Max/Pro accounts)
    // This shares the host's authenticated session with containers
    const claudeCredentials = path.join(homeDir, '.claude', '.credentials.json');
    const fs = await import('fs/promises');
    try {
      await fs.access(claudeCredentials);
      volumes.push(`${claudeCredentials}:/home/developer/.claude/.credentials.json:ro`);
      logger.info('Claude credentials found, will mount for authentication');
    } catch {
      logger.warn('Claude credentials not found - run "claude" on host to authenticate first');
    }

    // Mount Claude settings and configs (read-only for safety)
    const claudeSettings = path.join(homeDir, '.claude', 'settings.json');
    try {
      await fs.access(claudeSettings);
      volumes.push(`${claudeSettings}:/home/developer/.claude/settings.json:ro`);
    } catch {
      // Settings file is optional
    }

    // Mount SSH directory for git operations
    const sshDir = path.join(homeDir, '.ssh');
    try {
      await fs.access(sshDir);
      volumes.push(`${sshDir}:/home/developer/.ssh:ro`);
      logger.info('SSH directory found, will mount for git authentication');
    } catch {
      logger.warn('SSH directory not found');
    }

    // Mount gitconfig
    const gitconfig = path.join(homeDir, '.gitconfig');
    try {
      await fs.access(gitconfig);
      volumes.push(`${gitconfig}:/home/developer/.gitconfig:ro`);
    } catch {
      // Gitconfig is optional
    }

    // Mount SSH keys if specific path provided
    if (config.sshKeyPath) {
      const sshKeyPath = config.sshKeyPath.replace('~', homeDir);
      volumes.push(`${sshKeyPath}:/home/developer/.ssh/id_rsa:ro`);
    }

    return volumes;
  }

  /**
   * Prepare host config with resource limits
   */
  private prepareHostConfig(config: ContainerConfig): any {
    return {
      Memory: config.memoryLimit * 1024 * 1024, // Convert MB to bytes
      NanoCpus: config.cpuLimit * 1000000000, // Convert cores to nanocpus
      RestartPolicy: {
        Name: 'unless-stopped',
      },
      StorageOpt: {
        size: `${config.diskLimit}m`,
      },
    };
  }

  /**
   * Copy Claude configs from host (~/.claude) to container
   * Copies skills, agents, rules, commands, hooks, CLAUDE.md etc.
   * Note: .credentials.json is mounted as a volume (not copied) for live auth sync
   */
  private async copyClaudeConfigs(dockerId: string): Promise<void> {
    try {
      logger.info({ dockerId }, 'Copying Claude configs to container');

      const claudeConfigPath = path.join(os.homedir(), '.claude');
      const fs = await import('fs/promises');

      // Check if .claude directory exists
      try {
        await fs.access(claudeConfigPath);
      } catch {
        logger.warn('Claude config directory not found, skipping');
        return;
      }

      // Create .claude directory structure in container
      await dockerService.executeCommand(
        dockerId,
        ['mkdir', '-p', '/home/developer/.claude/agents', '/home/developer/.claude/skills',
         '/home/developer/.claude/rules', '/home/developer/.claude/commands',
         '/home/developer/.claude/hooks', '/home/developer/.claude/get-shit-done',
         '/home/developer/.claude/plugins'],
        { user: 'root' }
      );

      // Directories to copy (exclude credentials, cache, history, session-env)
      const dirsToСopy = ['agents', 'skills', 'rules', 'commands', 'hooks', 'get-shit-done', 'plugins'];

      // Files to copy
      const filesToCopy = ['CLAUDE.md', 'settings.json', 'settings.local.json'];

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Copy directories
      for (const dir of dirsToСopy) {
        const srcDir = path.join(claudeConfigPath, dir);
        try {
          await fs.access(srcDir);
          const files = await fs.readdir(srcDir);
          if (files.length > 0) {
            await execAsync(`docker cp "${srcDir}/." "${dockerId}:/home/developer/.claude/${dir}/"`);
            logger.debug({ dir, dockerId }, 'Copied Claude config directory');
          }
        } catch {
          // Directory doesn't exist or is empty, skip
        }
      }

      // Copy individual files
      for (const file of filesToCopy) {
        const srcFile = path.join(claudeConfigPath, file);
        try {
          await fs.access(srcFile);
          await execAsync(`docker cp "${srcFile}" "${dockerId}:/home/developer/.claude/${file}"`);
          logger.debug({ file, dockerId }, 'Copied Claude config file');
        } catch {
          // File doesn't exist, skip
        }
      }

      // Fix permissions
      await dockerService.executeCommand(
        dockerId,
        ['chown', '-R', 'developer:developer', '/home/developer/.claude'],
        { user: 'root' }
      );

      logger.info({ dockerId }, 'Claude configs copied successfully');
    } catch (error) {
      logger.warn({ error, dockerId }, 'Failed to copy Claude configs, continuing anyway');
    }
  }

  /**
   * Clone repository via SSH
   */
  private async cloneRepository(
    dockerId: string,
    repoUrl: string,
    sshKeyPath?: string
  ): Promise<void> {
    try {
      logger.info({ dockerId, repoUrl }, 'Cloning repository');

      // Configure git for SSH if SSH key is provided
      if (sshKeyPath) {
        await dockerService.executeCommand(
          dockerId,
          ['chmod', '600', '/root/.ssh/id_rsa'],
          { user: 'root' }
        );

        await dockerService.executeCommand(
          dockerId,
          ['ssh-keyscan', '-H', 'github.com'],
          { user: 'root' }
        );
      }

      // Clone repository
      const result = await dockerService.executeCommand(
        dockerId,
        ['git', 'clone', repoUrl, '/workspace/repo'],
        { user: 'root', workingDir: '/workspace' }
      );

      if (result.exitCode !== 0) {
        throw new Error(`Git clone failed: ${result.stderr}`);
      }

      logger.info({ dockerId }, 'Repository cloned successfully');
    } catch (error) {
      logger.error({ error, dockerId, repoUrl }, 'Failed to clone repository');
      throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync containers from Docker daemon and database
   */
  async syncContainers(): Promise<void> {
    try {
      logger.info('Syncing containers from Docker daemon and database');

      // First, load all containers from database into cache
      const dbContainers = containerRepository.findAll();
      for (const entity of dbContainers) {
        const container = entityToContainer(entity);
        this.containers.set(container.id, container);
      }

      // Then, sync Docker state
      const dockerContainers = await dockerService.listContainers(true);

      for (const dockerContainer of dockerContainers) {
        const labels = dockerContainer.Labels || {};
        const claudeDockerId = labels['claude-docker.id'];

        if (claudeDockerId) {
          // Check if container exists in database
          const existing = containerRepository.findById(claudeDockerId);

          if (!existing) {
            // Container found in Docker but not in database - create it
            const createDto: CreateContainerDto = {
              dockerId: dockerContainer.Id,
              name: labels['claude-docker.name'] || 'unknown',
              template: (labels['claude-docker.template'] || 'claude') as any,
              mode: (labels['claude-docker.mode'] || 'interactive') as any,
              repoType: 'empty',
              cpuLimit: 2,
              memoryLimit: 2048,
              diskLimit: 10240,
            };

            const entity = containerRepository.create(createDto);
            const status = this.mapDockerStatus(dockerContainer.State);
            containerRepository.updateStatus(entity.id, status);

            const container = entityToContainer(containerRepository.findById(entity.id)!);
            this.containers.set(claudeDockerId, container);

            logger.debug({ containerId: claudeDockerId }, 'Container recovered from Docker to database');
          } else {
            // Container exists - update status if changed
            const dockerStatus = this.mapDockerStatus(dockerContainer.State);
            if (existing.status !== dockerStatus) {
              containerRepository.updateStatus(claudeDockerId, dockerStatus);
              const updated = containerRepository.findById(claudeDockerId)!;
              this.containers.set(claudeDockerId, entityToContainer(updated));
              logger.debug({ containerId: claudeDockerId, oldStatus: existing.status, newStatus: dockerStatus }, 'Container status updated');
            }
          }
        }
      }

      logger.info({ count: this.containers.size }, 'Containers synced successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to sync containers');
    }
  }

  /**
   * Map Docker status to ContainerStatus
   */
  private mapDockerStatus(state: string): ContainerStatus {
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
  }
}

// Export singleton instance
export const containerService = new ContainerService();
