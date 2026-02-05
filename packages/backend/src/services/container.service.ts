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
  type UpdateLimitsDto,
} from '../repositories';
import { emitContainerCreationProgress } from './websocket.service';
import { taskService } from './task.service';
import { containerLifecycleService } from './container-lifecycle.service';
import { getQueueStatus, getActiveQueues } from './claude-queue.service';
import { sanitizeRepositoryUrl } from '../validators/repository.validator';
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
 * Sanitize container name to prevent path traversal
 * Only allows alphanumeric, hyphens and underscores
 */
const sanitizeContainerName = (name: string): string => {
  if (!name || name.trim() === '') {
    throw new Error('Nome do container é obrigatório');
  }

  // Remove any path traversal attempts
  const cleaned = name.trim().replace(/\.\./g, '').replace(/[\/\\]/g, '');

  // Only allow safe characters
  const sanitized = cleaned.replace(/[^a-zA-Z0-9_-]/g, '');

  if (sanitized.length === 0) {
    throw new Error('Nome do container deve conter letras ou números');
  }

  if (sanitized.length > 64) {
    throw new Error('Nome do container deve ter no máximo 64 caracteres');
  }

  if (sanitized !== name.trim()) {
    // Log sanitization for security audit
    logger.warn({ original: name, sanitized }, 'Container name was sanitized');
  }

  return sanitized;
};

/**
 * Business logic layer for container management
 */
export class ContainerService {
  // In-memory cache for faster lookups (synced with database)
  private containers: Map<string, Container> = new Map();

  // Lock for delete operations to prevent race conditions
  private deleteLocks: Map<string, Promise<void>> = new Map();

  /**
   * Create a new container with configuration
   */
  async create(config: ContainerConfig, taskId?: string): Promise<Container> {
    let dockerContainerId: string | null = null;
    let containerId: string | null = null;

    try {
      // Update task progress - validating
      if (taskId) {
        taskService.setProgress(taskId, 5, 'Validando configuração do container...');
        emitContainerCreationProgress(taskId, {
          taskId,
          stage: 'validating',
          percentage: 5,
          message: 'Validating container configuration...',
          timestamp: new Date()
        });
      }

      logger.info({ config, taskId }, 'Creating new container');

      // Sanitize inputs for security
      const safeName = sanitizeContainerName(config.name);
      const safeRepoUrl = config.repoUrl ? sanitizeRepositoryUrl(config.repoUrl) : undefined;

      // Use sanitized values
      config = {
        ...config,
        name: safeName,
        repoUrl: safeRepoUrl,
      };

      containerId = uuidv4();
      const containerName = `claude-docker-${config.name}-${Date.now()}`;

      // Create database record FIRST with placeholder dockerId
      // This ensures container appears in list immediately with "creating" status
      const createDto: CreateContainerDto = {
        dockerId: `pending-${containerId}`, // Placeholder until Docker container is created
        name: config.name,
        template: config.template,
        mode: config.mode,
        repoUrl: config.repoUrl,
        repoType: config.repoType,
        sshKeyPath: config.sshKeyPath,
        cpuLimit: config.cpuLimit,
        memoryLimit: config.memoryLimit,
        diskLimit: config.diskLimit,
        config: {
          ...(taskId ? { taskId } : {}),
          ...(config.embeddedDev ? { embeddedDev: config.embeddedDev } : {}),
        },
      };

      const initialEntity = containerRepository.create(createDto);
      containerId = initialEntity.id; // Use the ID from database
      logger.info({ containerId, taskId }, 'Created initial database record');

      // Prepare Docker image based on template
      const image = this.getImageForTemplate(config.template);

      // Prepare environment variables (pass containerId for telegram-send)
      const env = this.prepareEnvironmentVariables(config, containerId);

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
        ExposedPorts: {
          '8080/tcp': {},  // code-server
          '3000/tcp': {},  // dev server
          '5173/tcp': {},  // vite
        },
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

      // Update task progress - creating
      if (taskId) {
        taskService.setProgress(taskId, 20, 'Criando container Docker...');
        emitContainerCreationProgress(taskId, {
          taskId,
          stage: 'creating',
          percentage: 20,
          message: 'Creating Docker container...',
          timestamp: new Date()
        });
      }

      // Create Docker container
      const dockerContainer = await dockerService.createContainer(createOptions);
      dockerContainerId = dockerContainer.id; // Track for rollback

      // Update database with real Docker ID
      containerRepository.update(containerId, { dockerId: dockerContainer.id });
      logger.info({ containerId, dockerId: dockerContainer.id }, 'Updated Docker ID in database');

      // Start container temporarily for setup operations
      const needsClone = config.repoType === 'clone' && config.repoUrl;
      const needsEmbeddedTools = config.embeddedDev?.stm32 || config.embeddedDev?.esp32;
      const needsSetup = needsClone || needsEmbeddedTools;
      if (needsSetup) {
        // Update task progress - starting
        if (taskId) {
          taskService.setProgress(taskId, 35, 'Iniciando container para configuração...');
          emitContainerCreationProgress(taskId, {
            taskId,
            containerId,
            stage: 'starting',
            percentage: 35,
            message: 'Starting container for setup...',
            timestamp: new Date()
          });
        }

        logger.info({ dockerId: dockerContainer.id }, 'Starting container for setup...');
        await dockerService.startContainer(dockerContainer.id);

        // Wait for container to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Clone repository if specified (before copying configs)
      if (needsClone) {
        // Update task progress - cloning
        if (taskId) {
          taskService.setProgress(taskId, 55, 'Clonando repositório...');
          emitContainerCreationProgress(taskId, {
            taskId,
            containerId,
            stage: 'cloning',
            percentage: 55,
            message: 'Cloning repository...',
            timestamp: new Date()
          });
        }

        await this.cloneRepository(dockerContainer.id, config.repoUrl!, config.sshKeyPath);
      }

      // Update task progress - configuring
      if (taskId) {
        taskService.setProgress(taskId, 75, 'Copiando configurações do Claude...');
        emitContainerCreationProgress(taskId, {
          taskId,
          containerId,
          stage: 'configuring',
          percentage: 75,
          message: 'Copying Claude configurations...',
          timestamp: new Date()
        });
      }

      // Copy Claude configs from host to container
      await this.copyClaudeConfigs(dockerContainer.id);

      // Install embedded development tools if configured (STM32, ESP32)
      if (needsEmbeddedTools) {
        if (taskId) {
          taskService.setProgress(taskId, 80, 'Instalando ferramentas de desenvolvimento embarcado...');
          emitContainerCreationProgress(taskId, {
            taskId,
            containerId,
            stage: 'configuring',
            percentage: 80,
            message: 'Installing embedded development tools...',
            timestamp: new Date()
          });
        }

        await this.installEmbeddedTools(dockerContainer.id, config.embeddedDev);
      }

      // Stop container after setup if it was started
      if (needsSetup) {
        // Update task progress - stopping
        if (taskId) {
          taskService.setProgress(taskId, 85, 'Parando container após configuração...');
          emitContainerCreationProgress(taskId, {
            taskId,
            containerId,
            stage: 'stopping',
            percentage: 85,
            message: 'Stopping container after setup...',
            timestamp: new Date()
          });
        }

        // Stop container after setup (user will start it when ready)
        logger.info({ dockerId: dockerContainer.id }, 'Stopping container after setup...');
        await dockerService.stopContainer(dockerContainer.id);
      }

      // Update task progress - saving/finalizing
      if (taskId) {
        taskService.setProgress(taskId, 95, 'Finalizando criação do container...');
        emitContainerCreationProgress(taskId, {
          taskId,
          containerId,
          stage: 'saving',
          percentage: 95,
          message: 'Finalizing container creation...',
          timestamp: new Date()
        });
      }

      // Update container status to stopped (ready to start)
      const updatedEntity = containerRepository.updateStatus(containerId, 'stopped');
      if (!updatedEntity) {
        throw new Error('Failed to update container status');
      }
      const container = entityToContainer(updatedEntity);

      // Update in-memory cache
      this.containers.set(container.id, container);

      // Update task progress - ready
      if (taskId) {
        taskService.complete(taskId, { containerId: container.id });
        emitContainerCreationProgress(taskId, {
          taskId,
          containerId: container.id,
          stage: 'ready',
          percentage: 100,
          message: 'Container created successfully!',
          timestamp: new Date()
        });
      }

      logger.info({
        containerId: container.id,
        dockerId: dockerContainer.id,
        name: config.name,
        taskId
      }, 'Container created successfully');

      return container;
    } catch (error) {
      // Update task progress - error
      if (taskId) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        taskService.fail(taskId, errorMessage);
        emitContainerCreationProgress(taskId, {
          taskId,
          stage: 'error',
          percentage: 0,
          message: 'Container creation failed',
          error: errorMessage,
          timestamp: new Date()
        });
      }
      // Cleanup orphaned Docker container if it was created
      if (dockerContainerId) {
        try {
          logger.warn({ dockerId: dockerContainerId }, 'Rolling back orphaned Docker container');
          await dockerService.deleteContainer(dockerContainerId, true);
          logger.info({ dockerId: dockerContainerId }, 'Rolled back orphaned Docker container');
        } catch (cleanupError) {
          logger.error({ error: cleanupError, dockerId: dockerContainerId },
            'Failed to cleanup orphaned Docker container');
        }
      }

      // Delete database record on failure to allow name reuse
      // (Previously we set status to 'error' which blocked the name)
      if (containerId) {
        try {
          containerRepository.delete(containerId);
          this.containers.delete(containerId);
          logger.info({ containerId }, 'Deleted failed container record to allow name reuse');
        } catch (dbError) {
          // If delete fails, fall back to updating status to error
          try {
            containerRepository.updateStatus(containerId, 'error');
            logger.warn({ containerId }, 'Could not delete, updated container status to error');
          } catch (statusError) {
            logger.error({ error: statusError, containerId },
              'Failed to update container status');
          }
        }
      }

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

      // Sanitize inputs for security
      const safeName = sanitizeContainerName(options.name);
      const safeRepoUrl = options.repoUrl ? sanitizeRepositoryUrl(options.repoUrl) : undefined;

      const template = getTemplateById(templateId);

      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      const containerId = uuidv4();
      const containerName = `claude-docker-${safeName}-${Date.now()}`;

      // Get image from template config
      const image = template.defaultConfig.image;

      // Merge template environment with user-provided environment
      const templateEnv = this.prepareTemplateEnvironment(template, options.environment);

      // Prepare volume mounts
      const config: ContainerConfig = {
        name: safeName,
        template: 'both',
        mode: options.mode,
        repoType: options.repoType,
        repoUrl: safeRepoUrl,
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
        WorkingDir: template.defaultConfig.workingDir ?? '/workspace',
        Tty: true,
        OpenStdin: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        ExposedPorts: {
          '8080/tcp': {},  // code-server
          '3000/tcp': {},  // dev server
          '5173/tcp': {},  // vite
        },
        HostConfig: {
          ...hostConfig,
          Binds: volumes,
        },
        Labels: {
          'claude-docker.id': containerId,
          'claude-docker.name': safeName,
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
      if (options.repoType === 'clone' && safeRepoUrl) {
        await this.cloneRepository(dockerContainer.id, safeRepoUrl, options.sshKeyPath);
      }

      // Create container record in database
      const createDto: CreateContainerDto = {
        dockerId: dockerContainer.id,
        name: safeName,
        template: 'both',
        mode: options.mode,
        repoUrl: safeRepoUrl,
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
        name: safeName,
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
          { user: 'developer', workingDir: '/workspace' }
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
   * Install STM32 development tools
   * Includes: arm-none-eabi-gcc, OpenOCD, ST-Link tools, Cortex-Debug extension
   */
  private async installSTM32Tools(dockerId: string): Promise<void> {
    logger.info({ dockerId }, 'Installing STM32 development tools...');

    // Commands to install STM32 toolchain
    const commands = [
      // Install ARM GCC toolchain and debugging tools
      'sudo apt-get update && sudo apt-get install -y gcc-arm-none-eabi gdb-multiarch openocd stlink-tools cmake ninja-build',
      // Create udev rules for ST-Link (requires restart)
      'sudo bash -c \'echo "SUBSYSTEM==\\"usb\\", ATTRS{idVendor}==\\"0483\\", ATTRS{idProduct}==\\"374b\\", MODE=\\"0666\\"" > /etc/udev/rules.d/99-stlink.rules\'',
      // Verify installation
      'arm-none-eabi-gcc --version',
      'openocd --version || true',
    ];

    for (const command of commands) {
      try {
        logger.debug({ dockerId, command }, 'Executing STM32 setup command');
        const result = await dockerService.executeCommand(
          dockerId,
          ['bash', '-c', command],
          { user: 'developer', workingDir: '/workspace' }
        );

        if (result.exitCode !== 0 && !command.includes('|| true')) {
          logger.warn(
            { dockerId, command, exitCode: result.exitCode, stderr: result.stderr },
            'STM32 setup command returned non-zero exit code'
          );
        }
      } catch (error) {
        logger.warn({ error, dockerId, command }, 'STM32 setup command failed, continuing');
      }
    }

    // Install VS Code extensions for STM32 development
    const extensions = [
      'marus25.cortex-debug',           // Cortex-Debug for ARM debugging
      'ms-vscode.cpptools',             // C/C++ extension
      'ms-vscode.cmake-tools',          // CMake support
      'twxs.cmake',                     // CMake language support
      'dan-c-underwood.arm',            // ARM Assembly syntax
      'mcu-debug.debug-tracker-vscode', // Debug tracker
      'mcu-debug.memory-view',          // Memory viewer
      'mcu-debug.peripheral-viewer',    // Peripheral viewer for STM32
    ];

    await this.installVSCodeExtensions(dockerId, extensions);
    logger.info({ dockerId }, 'STM32 development tools installation completed');
  }

  /**
   * Install ESP32 development tools with PlatformIO
   * Includes: PlatformIO CLI and VS Code extension with full ESP-IDF support
   */
  private async installESP32Tools(dockerId: string): Promise<void> {
    logger.info({ dockerId }, 'Installing ESP32 development tools (PlatformIO)...');

    // Commands to install PlatformIO
    const commands = [
      // Install Python dependencies and PlatformIO
      'pip3 install --user platformio',
      // Add PlatformIO to PATH
      'echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.zshrc',
      // Source the updated PATH
      'export PATH="$HOME/.local/bin:$PATH"',
      // Initialize PlatformIO (downloads core)
      'export PATH="$HOME/.local/bin:$PATH" && pio --version',
      // Pre-install ESP32 platform for faster first project
      'export PATH="$HOME/.local/bin:$PATH" && pio pkg install -g -p espressif32 || true',
      // Install ESP-IDF framework
      'export PATH="$HOME/.local/bin:$PATH" && pio pkg install -g -t framework-espidf || true',
    ];

    for (const command of commands) {
      try {
        logger.debug({ dockerId, command }, 'Executing ESP32 setup command');
        const result = await dockerService.executeCommand(
          dockerId,
          ['bash', '-c', command],
          { user: 'developer', workingDir: '/workspace' }
        );

        if (result.exitCode !== 0 && !command.includes('|| true')) {
          logger.warn(
            { dockerId, command, exitCode: result.exitCode, stderr: result.stderr },
            'ESP32 setup command returned non-zero exit code'
          );
        }
      } catch (error) {
        logger.warn({ error, dockerId, command }, 'ESP32 setup command failed, continuing');
      }
    }

    // Install VS Code extensions for ESP32/PlatformIO development
    const extensions = [
      'platformio.platformio-ide',      // PlatformIO IDE (full ESP32 support)
      'ms-vscode.cpptools',             // C/C++ extension
      'espressif.esp-idf-extension',    // ESP-IDF extension (optional, works with PlatformIO)
    ];

    await this.installVSCodeExtensions(dockerId, extensions);
    logger.info({ dockerId }, 'ESP32 development tools (PlatformIO) installation completed');
  }

  /**
   * Install embedded development tools based on config
   */
  private async installEmbeddedTools(
    dockerId: string,
    embeddedDev?: { stm32?: boolean; esp32?: boolean }
  ): Promise<void> {
    if (!embeddedDev) return;

    if (embeddedDev.stm32) {
      await this.installSTM32Tools(dockerId);
    }

    if (embeddedDev.esp32) {
      await this.installESP32Tools(dockerId);
    }
  }

  /**
   * Wait for VS Code (code-server) to be ready
   * Polls the code-server health endpoint until it responds
   */
  private async waitForVSCodeReady(dockerId: string, timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    logger.debug({ dockerId, timeoutMs }, 'Waiting for VS Code (code-server) to be ready...');

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Use curl to check if code-server is responding on port 8080
        const result = await dockerService.executeCommand(
          dockerId,
          ['curl', '-sf', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:8080/healthz'],
          { user: 'developer' }
        );

        // code-server returns 200 when healthy
        if (result.exitCode === 0 && (result.stdout.includes('200') || result.stdout.includes('302'))) {
          logger.info({ dockerId, elapsed: Date.now() - startTime }, 'VS Code (code-server) is ready');
          return true;
        }
      } catch {
        // Ignore errors during polling
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    logger.warn({ dockerId, timeoutMs }, 'VS Code (code-server) readiness timeout');
    return false;
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

      // Wait for VS Code to be ready (with a shorter timeout for non-task start)
      await this.waitForVSCodeReady(container.dockerId, 20000);

      // Update status in database
      const updatedEntity = containerRepository.updateStatus(containerId, 'running');
      if (!updatedEntity) {
        throw new Error('Failed to update container status');
      }

      const updatedContainer = entityToContainer(updatedEntity);
      this.containers.set(containerId, updatedContainer);

      // Auto-start Claude environment
      try {
        await containerLifecycleService.onContainerStart(containerId, container.dockerId);
      } catch (error) {
        logger.warn({ error, containerId }, 'Failed to auto-start Claude environment - user can start manually');
        // Não falhar o start do container
      }

      logger.info({ containerId }, 'Container started successfully');

      return updatedContainer;
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to start container');
      throw new Error(`Failed to start container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Start a container with task tracking
   * Progress is more granular for better UX feedback
   */
  async startWithTask(containerId: string, taskId: string): Promise<Container> {
    try {
      // Step 1: Validate container exists
      taskService.setProgress(taskId, 5, 'Verificando permissões...');

      // Try cache first, then database
      let container = this.containers.get(containerId);
      taskService.setProgress(taskId, 8, 'Carregando configuração do container...');

      if (!container) {
        const entity = containerRepository.findById(containerId);
        if (entity) {
          container = entityToContainer(entity);
          this.containers.set(containerId, container);
        }
      }

      if (!container) {
        taskService.fail(taskId, `Container não encontrado: ${containerId}`);
        throw new Error(`Container not found: ${containerId}`);
      }

      // Step 2: Prepare Docker operation
      taskService.setProgress(taskId, 10, 'Verificando estado do Docker daemon...');
      logger.info({ containerId, dockerId: container.dockerId }, 'Starting container');

      taskService.setProgress(taskId, 12, 'Conectando ao Docker daemon...');
      taskService.setProgress(taskId, 15, 'Enviando comando de inicialização...');
      taskService.setProgress(taskId, 18, 'Alocando recursos (CPU, memória)...');

      // Step 3: Actually start Docker container
      taskService.setProgress(taskId, 20, 'Iniciando container no Docker...');
      await dockerService.startContainer(container.dockerId);

      // Step 4: Wait for VS Code (code-server) to be ready
      taskService.setProgress(taskId, 30, 'Container Docker iniciado!');
      taskService.setProgress(taskId, 35, 'Aguardando VS Code inicializar...');

      // Poll for VS Code readiness with progress updates
      const vscodeTimeout = 30000; // 30 seconds
      const vscodeStartTime = Date.now();
      let vscodeReady = false;

      while (Date.now() - vscodeStartTime < vscodeTimeout) {
        try {
          const result = await dockerService.executeCommand(
            container.dockerId,
            ['curl', '-sf', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:8080/healthz'],
            { user: 'developer' }
          );

          if (result.exitCode === 0 && (result.stdout.includes('200') || result.stdout.includes('302'))) {
            vscodeReady = true;
            break;
          }
        } catch {
          // Ignore errors during polling
        }

        // Update progress based on elapsed time (35% to 60%)
        const elapsed = Date.now() - vscodeStartTime;
        const progress = 35 + Math.min(25, Math.floor((elapsed / vscodeTimeout) * 25));
        taskService.setProgress(taskId, progress, 'Inicializando VS Code...');

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (vscodeReady) {
        taskService.setProgress(taskId, 60, 'VS Code pronto!');
      } else {
        taskService.setProgress(taskId, 60, 'VS Code ainda inicializando (pode demorar)...');
        logger.warn({ containerId, taskId }, 'VS Code readiness timeout during task, continuing anyway');
      }

      // Step 5: Auto-start Claude environment
      taskService.setProgress(taskId, 65, 'Iniciando ambiente Claude Code...');
      try {
        await containerLifecycleService.onContainerStart(containerId, container.dockerId);
        taskService.setProgress(taskId, 75, 'Ambiente Claude Code iniciado!');
      } catch (error) {
        logger.warn({ error, containerId, taskId }, 'Failed to auto-start Claude environment');
        taskService.setProgress(taskId, 75, 'Ambiente Claude não iniciado (pode iniciar manualmente)');
      }

      // Step 6: Update database
      taskService.setProgress(taskId, 80, 'Atualizando banco de dados...');
      const updatedEntity = containerRepository.updateStatus(containerId, 'running');
      if (!updatedEntity) {
        taskService.fail(taskId, 'Falha ao atualizar status do container');
        throw new Error('Failed to update container status');
      }

      const updatedContainer = entityToContainer(updatedEntity);
      this.containers.set(containerId, updatedContainer);

      // Step 7: Finalize
      taskService.setProgress(taskId, 90, 'Registrando métricas iniciais...');
      taskService.setProgress(taskId, 95, 'Finalizando configuração...');
      taskService.complete(taskId, { containerId });

      logger.info({ containerId, taskId }, 'Container started successfully with task');

      return updatedContainer;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      taskService.fail(taskId, errorMessage);
      logger.error({ error, containerId, taskId }, 'Failed to start container');
      throw new Error(`Failed to start container: ${errorMessage}`);
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

      // Cleanup Claude environment before stopping Docker container
      try {
        await containerLifecycleService.onContainerStop(containerId);
      } catch (error) {
        logger.warn({ error, containerId }, 'Error cleaning up Claude environment before stop');
      }

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
    // Check for existing delete operation (prevent race conditions)
    const existingLock = this.deleteLocks.get(containerId);
    if (existingLock) {
      logger.info({ containerId }, 'Delete already in progress, waiting...');
      await existingLock;
      return; // Already deleted by another request
    }

    const deletePromise = this.performDelete(containerId, force);
    this.deleteLocks.set(containerId, deletePromise);

    try {
      await deletePromise;
    } finally {
      this.deleteLocks.delete(containerId);
    }
  }

  /**
   * Internal delete implementation
   */
  private async performDelete(containerId: string, force: boolean): Promise<void> {
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
        // Container not found in DB - might have been deleted already
        logger.warn({ containerId }, 'Container not found in database, may have been already deleted');
        return;
      }

      logger.info({ containerId, dockerId: container.dockerId, force }, 'Deleting container');

      // Stop container first if running
      if (container.status === 'running') {
        logger.info({ containerId }, 'Stopping container before deletion');
        try {
          await dockerService.stopContainer(container.dockerId);
        } catch (stopError) {
          logger.warn({ error: stopError, containerId }, 'Failed to stop container, trying force delete');
          force = true;
        }
      }

      // Delete from Docker (handles "not found" gracefully)
      await dockerService.deleteContainer(container.dockerId, force);

      // Delete workspace volume (each container has its own named volume)
      const volumeName = `claude-docker-${container.name}-workspace`;
      try {
        await dockerService.deleteVolume(volumeName);
        logger.info({ containerId, volumeName }, 'Workspace volume deleted');
      } catch (volumeError) {
        logger.warn({ error: volumeError, containerId, volumeName },
          'Failed to delete workspace volume, continuing anyway');
      }

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
   * Delete a container with task tracking
   */
  async deleteWithTask(containerId: string, taskId: string, force: boolean = false): Promise<void> {
    // Check for existing delete operation (prevent race conditions)
    const existingLock = this.deleteLocks.get(containerId);
    if (existingLock) {
      logger.info({ containerId, taskId }, 'Delete already in progress, waiting...');
      taskService.setProgress(taskId, 50, 'Aguardando exclusão em andamento...');
      await existingLock;
      taskService.complete(taskId, { containerId, deleted: true });
      return;
    }

    const deletePromise = this.performDeleteWithTask(containerId, taskId, force);
    this.deleteLocks.set(containerId, deletePromise);

    try {
      await deletePromise;
    } finally {
      this.deleteLocks.delete(containerId);
    }
  }

  /**
   * Internal delete implementation with task tracking
   * Progress is more granular for better UX feedback
   */
  private async performDeleteWithTask(containerId: string, taskId: string, _force: boolean): Promise<void> {
    // Always force delete to ensure cleanup
    const force = true;

    try {
      // Step 1: Validate container exists
      taskService.setProgress(taskId, 5, 'Verificando permissões...');

      // Try cache first, then database
      let container = this.containers.get(containerId);
      taskService.setProgress(taskId, 8, 'Carregando informações do container...');

      if (!container) {
        const entity = containerRepository.findById(containerId);
        if (entity) {
          container = entityToContainer(entity);
        }
      }

      if (!container) {
        // Container not found in DB - might have been deleted already
        logger.warn({ containerId, taskId }, 'Container not found in database, may have been already deleted');
        taskService.complete(taskId, { containerId, deleted: true, alreadyDeleted: true });
        return;
      }

      logger.info({ containerId, dockerId: container.dockerId, force, taskId }, 'Deleting container with task');

      // Step 2: Close terminal sessions
      taskService.setProgress(taskId, 12, 'Verificando sessões de terminal ativas...');
      const { terminalService } = await import('./terminal.service');
      taskService.setProgress(taskId, 15, 'Fechando sessões de terminal...');
      const closedSessions = terminalService.closeAllSessionsForContainer(containerId);
      if (closedSessions > 0) {
        logger.info({ containerId, taskId, closedSessions }, 'Closed terminal sessions before deletion');
        taskService.setProgress(taskId, 20, `${closedSessions} sessões de terminal fechadas`);
      }

      // Cleanup Claude environment before deletion
      taskService.setProgress(taskId, 22, 'Limpando ambiente Claude Code...');
      try {
        await containerLifecycleService.onContainerDelete(containerId);
        taskService.setProgress(taskId, 28, 'Ambiente Claude Code limpo!');
      } catch (error) {
        logger.warn({ error, containerId, taskId }, 'Error cleaning up Claude environment before delete');
        taskService.setProgress(taskId, 28, 'Continuando exclusão...');
      }

      // Step 3: Stop container if running
      if (container.status === 'running') {
        taskService.setProgress(taskId, 25, 'Enviando sinal SIGTERM ao container...');
        logger.info({ containerId, taskId }, 'Stopping container before deletion');
        taskService.setProgress(taskId, 30, 'Aguardando desligamento gracioso...');
        try {
          await dockerService.stopContainer(container.dockerId);
          taskService.setProgress(taskId, 40, 'Container parado com sucesso');
        } catch (stopError) {
          logger.warn({ error: stopError, containerId, taskId }, 'Failed to stop container, will force delete');
          taskService.setProgress(taskId, 40, 'Forçando parada do container...');
        }
      } else {
        taskService.setProgress(taskId, 40, 'Container já está parado');
      }

      // Step 4: Delete from Docker
      taskService.setProgress(taskId, 45, 'Conectando ao Docker daemon...');
      taskService.setProgress(taskId, 50, 'Removendo container do Docker...');
      taskService.setProgress(taskId, 55, 'Desalocando recursos de rede...');

      await dockerService.deleteContainer(container.dockerId, force);

      taskService.setProgress(taskId, 65, 'Container removido do Docker daemon');
      taskService.setProgress(taskId, 70, 'Liberando volume de workspace...');

      // Step 4.5: Delete workspace volume (each container has its own named volume)
      const volumeName = `claude-docker-${container.name}-workspace`;
      try {
        await dockerService.deleteVolume(volumeName);
        taskService.setProgress(taskId, 73, 'Volume de workspace removido');
        logger.info({ containerId, taskId, volumeName }, 'Workspace volume deleted');
      } catch (volumeError) {
        logger.warn({ error: volumeError, containerId, taskId, volumeName },
          'Failed to delete workspace volume, continuing anyway');
        taskService.setProgress(taskId, 73, 'Volume não encontrado, continuando...');
      }

      // Step 5: Delete from database
      taskService.setProgress(taskId, 75, 'Removendo registro do banco de dados...');
      containerRepository.delete(containerId);
      taskService.setProgress(taskId, 85, 'Registro removido com sucesso');

      // Step 6: Clear cache
      taskService.setProgress(taskId, 90, 'Limpando cache de métricas...');
      this.containers.delete(containerId);

      // Step 7: Finalize
      taskService.setProgress(taskId, 95, 'Finalizando limpeza...');
      taskService.setProgress(taskId, 100, 'Container excluído com sucesso!');
      taskService.complete(taskId, { containerId, deleted: true });

      logger.info({ containerId, taskId }, 'Container deleted successfully with task');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      taskService.fail(taskId, errorMessage);
      logger.error({ error, containerId, taskId }, 'Failed to delete container');
      throw new Error(`Failed to delete container: ${errorMessage}`);
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

        // Default simple metrics for frontend
        let simpleMetrics = {
          cpu: 0,
          memory: 0,
          disk: 0,
        };
        let activeAgentsCount = 0;

        if (includeMetrics && container.status === 'running') {
          try {
            const fullMetrics = await metricsService.getContainerMetrics(container.dockerId);

            // Calculate disk percentage based on configured limit (not filesystem limit)
            // The df command returns host filesystem size, not container quota
            const configuredDiskLimitMB = container.diskLimit ?? 10240;
            const diskUsageMB = fullMetrics.disk.usage; // This is actual usage in MB
            const diskPercentage = configuredDiskLimitMB > 0
              ? (diskUsageMB / configuredDiskLimitMB) * 100
              : 0;

            // Log warnings for disk usage soft limits
            if (diskPercentage > 95) {
              logger.warn({
                containerId: container.id,
                name: container.name,
                diskUsageMB,
                diskLimitMB: configuredDiskLimitMB,
                diskPercentage: Number(diskPercentage.toFixed(2)),
              }, 'CRITICAL: Container disk usage above 95% (soft limit)');
            } else if (diskPercentage > 80) {
              logger.warn({
                containerId: container.id,
                name: container.name,
                diskUsageMB,
                diskLimitMB: configuredDiskLimitMB,
                diskPercentage: Number(diskPercentage.toFixed(2)),
              }, 'WARNING: Container disk usage above 80% (soft limit)');
            }

            // Return disk in GB (same format as WebSocket for consistency)
            // Frontend expects: cpu=%, memory=MB, disk=GB
            simpleMetrics = {
              cpu: fullMetrics.cpu.usage,
              memory: fullMetrics.memory.usage, // MB (not percentage)
              disk: Number((diskUsageMB / 1024).toFixed(2)), // GB (not percentage)
            };
            activeAgentsCount = fullMetrics.activeAgents?.length ?? 0;
          } catch (error) {
            logger.warn({ error, containerId: container.id }, 'Failed to get metrics for container');
          }
        }

        // Default limits
        const limits = {
          cpuCores: container.cpuLimit ?? 2,
          memoryMB: container.memoryLimit ?? 4096,
          diskGB: Math.round((container.diskLimit ?? 20480) / 1024),
        };

        // Extract taskId from config if container is still creating
        const taskId = entity.status === 'creating' && entity.config?.['taskId']
          ? String(entity.config['taskId'])
          : undefined;

        // Get queue length if queue exists for this container
        let queueLength = 0;
        const activeQueues = getActiveQueues();
        if (activeQueues.includes(container.id) && container.status === 'running') {
          try {
            const queueStatus = await getQueueStatus(container.id);
            queueLength = queueStatus.waiting + queueStatus.active;
          } catch (error) {
            logger.warn({ error, containerId: container.id }, 'Failed to get queue status');
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
          metrics: simpleMetrics,
          limits,
          activeAgents: activeAgentsCount,
          queueLength,
          taskId,
        });
      }

      return items;
    } catch (error) {
      logger.error({ error }, 'Failed to get all containers');
      throw new Error(`Failed to get containers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get container by ID (returns enriched format matching getAll)
   */
  async getById(containerId: string): Promise<ContainerListItem | null> {
    // Always fetch from database to get latest config (including taskId)
    const entity = containerRepository.findById(containerId);
    if (!entity) {
      return null;
    }

    const container = entityToContainer(entity);
    // Update cache
    this.containers.set(containerId, container);

    // Build enriched response matching getAll format
    let simpleMetrics = {
      cpu: 0,
      memory: 0,
      disk: 0,
    };
    let activeAgentsCount = 0;

    if (container.status === 'running') {
      try {
        const fullMetrics = await metricsService.getContainerMetrics(container.dockerId);

        // Calculate disk percentage based on configured limit (not filesystem limit)
        const configuredDiskLimitMB = container.diskLimit ?? 10240;
        const diskUsageMB = fullMetrics.disk.usage;
        const diskPercentage = configuredDiskLimitMB > 0
          ? (diskUsageMB / configuredDiskLimitMB) * 100
          : 0;

        // Log warnings for disk usage soft limits
        if (diskPercentage > 95) {
          logger.warn({
            containerId: container.id,
            name: container.name,
            diskUsageMB,
            diskLimitMB: configuredDiskLimitMB,
            diskPercentage: Number(diskPercentage.toFixed(2)),
          }, 'CRITICAL: Container disk usage above 95% (soft limit)');
        } else if (diskPercentage > 80) {
          logger.warn({
            containerId: container.id,
            name: container.name,
            diskUsageMB,
            diskLimitMB: configuredDiskLimitMB,
            diskPercentage: Number(diskPercentage.toFixed(2)),
          }, 'WARNING: Container disk usage above 80% (soft limit)');
        }

        // Return disk in GB (same format as WebSocket for consistency)
        // Frontend expects: cpu=%, memory=MB, disk=GB
        simpleMetrics = {
          cpu: fullMetrics.cpu.usage,
          memory: fullMetrics.memory.usage, // MB (not percentage)
          disk: Number((diskUsageMB / 1024).toFixed(2)), // GB (not percentage)
        };
        activeAgentsCount = fullMetrics.activeAgents?.length ?? 0;
      } catch (error) {
        logger.warn({ error, containerId: container.id }, 'Failed to get metrics for container');
      }
    }

    const limits = {
      cpuCores: container.cpuLimit ?? 2,
      memoryMB: container.memoryLimit ?? 4096,
      diskGB: Math.round((container.diskLimit ?? 20480) / 1024),
    };

    // Extract taskId from config if container is still creating
    const taskId = entity.status === 'creating' && entity.config?.['taskId']
      ? String(entity.config['taskId'])
      : undefined;

    // Get queue length if queue exists for this container
    let queueLength = 0;
    const activeQueues = getActiveQueues();
    if (activeQueues.includes(container.id) && container.status === 'running') {
      try {
        const queueStatus = await getQueueStatus(container.id);
        queueLength = queueStatus.waiting + queueStatus.active;
      } catch (error) {
        logger.warn({ error, containerId: container.id }, 'Failed to get queue status');
      }
    }

    return {
      id: container.id,
      dockerId: container.dockerId,
      name: container.name,
      template: container.template,
      mode: container.mode,
      status: container.status,
      createdAt: container.createdAt,
      metrics: simpleMetrics,
      limits,
      activeAgents: activeAgentsCount,
      queueLength,
      taskId,
    };
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
   * Get VS Code URL for a running container
   * Returns the URL to access code-server running on port 8080
   */
  async getVSCodeUrl(containerId: string): Promise<{ url: string }> {
    try {
      const container = await this.getById(containerId);

      if (!container) {
        throw new Error(`Container not found: ${containerId}`);
      }

      if (container.status !== 'running') {
        throw new Error(`Container is not running: ${containerId}`);
      }

      // Get the mapped host port for code-server (8080)
      const portInfo = await dockerService.getContainerPort(container.dockerId, 8080);

      if (!portInfo) {
        throw new Error(
          'VS Code port (8080) is not mapped. This container was created before port mapping was implemented. ' +
          'Please delete and recreate the container to enable VS Code access.'
        );
      }

      // Build the URL - use localhost for local access
      // Include ?folder=/workspace to open the project folder automatically
      const hostname = process.env['VSCODE_HOST'] || 'localhost';
      const protocol = process.env['VSCODE_SECURE'] === 'true' ? 'https' : 'http';
      const url = `${protocol}://${hostname}:${portInfo.hostPort}/?folder=/workspace`;

      logger.info(
        { containerId, hostPort: portInfo.hostPort },
        'VS Code URL resolved'
      );

      return { url };
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to get VS Code URL');
      throw new Error(
        `Failed to get VS Code URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
   * Update container resource limits (CPU, Memory, Disk)
   * Note: Disk limit can only be updated in database (not at Docker runtime)
   */
  async updateLimits(containerId: string, limits: UpdateLimitsDto): Promise<ContainerListItem> {
    try {
      // Find container in database
      const entity = containerRepository.findById(containerId);
      if (!entity) {
        throw new Error(`Container não encontrado: ${containerId}`);
      }

      logger.info({ containerId, limits }, 'Updating container resource limits');

      // If container is running, update Docker resources (CPU and Memory only)
      if (entity.status === 'running' && (limits.cpuCores !== undefined || limits.memoryMB !== undefined)) {
        const dockerUpdateOptions: { memoryBytes?: number; nanoCpus?: number } = {};

        if (limits.memoryMB !== undefined) {
          // Convert MB to bytes
          dockerUpdateOptions.memoryBytes = limits.memoryMB * 1024 * 1024;
        }

        if (limits.cpuCores !== undefined) {
          // Convert cores to nanocpus (1 core = 1,000,000,000 nanocpus)
          dockerUpdateOptions.nanoCpus = limits.cpuCores * 1000000000;
        }

        await dockerService.updateContainerResources(entity.dockerId, dockerUpdateOptions);
        logger.info({ containerId, dockerId: entity.dockerId }, 'Docker container resources updated');
      }

      // Update database record
      const updatedEntity = containerRepository.updateLimits(containerId, limits);
      if (!updatedEntity) {
        throw new Error('Falha ao atualizar limites no banco de dados');
      }

      // Update in-memory cache
      const container = entityToContainer(updatedEntity);
      this.containers.set(containerId, container);

      logger.info({ containerId, limits }, 'Container limits updated successfully');

      // Return enriched container format
      return await this.getById(containerId) as ContainerListItem;
    } catch (error) {
      logger.error({ error, containerId, limits }, 'Failed to update container limits');
      throw new Error(`Falha ao atualizar limites: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Get Docker image name for template
   */
  private getImageForTemplate(template: string): string {
    const imageMap: Record<string, string> = {
      'claude': 'claude-docker/claude:latest',
      'vscode': 'claude-docker/both:latest', // vscode image not built separately
      'both': 'claude-docker/both:latest',
    };

    return imageMap[template] || 'claude-docker/claude:latest';
  }

  /**
   * Prepare environment variables
   */
  private prepareEnvironmentVariables(config: ContainerConfig, containerId?: string): string[] {
    const env: string[] = [
      'TERM=xterm-256color',
      `CONTAINER_NAME=${config.name}`,
      `CONTAINER_MODE=${config.mode}`,
      // Linux environment info for Claude
      'LINUX_DISTRIBUTION=debian',
      'LINUX_VERSION=12',
      'PACKAGE_MANAGER=apt-get',
      'SUDO_NOPASSWD=true',
    ];

    // Add container ID for telegram-send script
    if (containerId) {
      env.push(`CONTAINER_ID=${containerId}`);
    }

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

    // Mount workspace - each container gets its own named volume for isolation
    // Using named volume ensures data persists across container restarts
    // Format: claude-docker-{container-name}-workspace
    const volumeName = `claude-docker-${config.name}-workspace`;
    volumes.push(`${volumeName}:/workspace`);

    // Mount Claude credentials (for browser-based auth - Personal/Max/Pro accounts)
    // This shares the host's authenticated session with containers
    // Note: NOT read-only because Claude Code may need to refresh tokens
    const claudeCredentials = path.join(homeDir, '.claude', '.credentials.json');
    const fs = await import('fs/promises');
    try {
      await fs.access(claudeCredentials);
      volumes.push(`${claudeCredentials}:/home/developer/.claude/.credentials.json`);
      logger.info('Claude credentials found, will mount for authentication');
    } catch {
      logger.warn('Claude credentials not found - run "claude" on host to authenticate first');
    }

    // Note: settings.json is copied via copyClaudeConfigs() instead of mounted
    // This allows Claude Code to modify settings inside the container

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
   * Prepare host config with resource limits and security constraints
   *
   * Security hardening applied:
   * 1. CapDrop: ALL - Remove all Linux capabilities (principle of least privilege)
   * 2. CapAdd: Only minimal required capabilities for development
   * 3. SecurityOpt: no-new-privileges - Prevent privilege escalation
   * 4. User: Run as non-root user (developer:1000)
   * 5. PidsLimit: Prevent fork bombs
   * 6. Memory/CPU limits: Prevent resource exhaustion (DoS)
   * 7. Ulimits: Restrict file descriptors and processes
   *
   * Note: ReadonlyRootfs not used because Claude Code needs to write to various
   * system directories during normal operation (npm cache, git operations, etc.)
   */
  private prepareHostConfig(config: ContainerConfig): any {
    return {
      // Resource limits (DoS prevention)
      Memory: config.memoryLimit * 1024 * 1024, // Convert MB to bytes
      MemorySwap: config.memoryLimit * 1024 * 1024 * 2, // 2x memory for swap limit
      NanoCpus: config.cpuLimit * 1000000000, // Convert cores to nanocpus
      PidsLimit: 512, // Prevent fork bombs

      // Security: Drop ALL capabilities and add only what's needed
      // This follows the principle of least privilege
      CapDrop: ['ALL'],
      CapAdd: [
        'CHOWN',      // Required for npm/git operations to change file ownership
        'DAC_OVERRIDE', // Required for file operations as developer user
        'FOWNER',     // Required for npm install operations
        'SETGID',     // Required for sudo operations
        'SETUID',     // Required for sudo operations
        'KILL',       // Required to kill child processes (Claude Code)
        'NET_BIND_SERVICE', // Required for code-server on port 8080
      ],

      // Security: Prevent privilege escalation
      // This blocks setuid binaries and capability escalation
      SecurityOpt: [
        'no-new-privileges:true',
      ],

      // Security: Run as non-root user
      // The container runs as 'developer' (uid 1000) by default
      // Note: Some operations require root, handled via sudo in container
      User: '1000:1000', // developer:developer

      // Security: Restrict ulimits to prevent resource exhaustion
      Ulimits: [
        { Name: 'nofile', Soft: 65536, Hard: 65536 },   // Open file descriptors
        { Name: 'nproc', Soft: 4096, Hard: 8192 },      // Max processes
        { Name: 'core', Soft: 0, Hard: 0 },              // Disable core dumps (security)
      ],

      RestartPolicy: {
        Name: 'unless-stopped',
      },
      StorageOpt: {
        size: `${config.diskLimit}m`,
      },
      // Allow container to reach host services (for telegram-send)
      ExtraHosts: ['host.docker.internal:host-gateway'],
      // Default port bindings for code-server (VS Code)
      PortBindings: {
        '8080/tcp': [{ HostPort: '0' }], // code-server - dynamic port allocation
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

      // Files to copy (including credentials as fallback if mount fails)
      const filesToCopy = ['CLAUDE.md', 'settings.json', 'settings.local.json', '.credentials.json'];

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
   * Clone repository via SSH (converts HTTPS to SSH for private repos)
   */
  private async cloneRepository(
    dockerId: string,
    repoUrl: string,
    _sshKeyPath?: string
  ): Promise<void> {
    try {
      logger.info({ dockerId, repoUrl }, 'Cloning repository');

      // SSH keys are mounted in /home/developer/.ssh but clone runs as root
      // Copy SSH config from developer to root for git operations
      await dockerService.executeCommand(
        dockerId,
        ['sh', '-c', 'mkdir -p /root/.ssh && cp -r /home/developer/.ssh/* /root/.ssh/ 2>/dev/null || true'],
        { user: 'root' }
      );

      // Set correct permissions on SSH keys (required for SSH to work)
      await dockerService.executeCommand(
        dockerId,
        ['sh', '-c', 'chmod 700 /root/.ssh && chmod 600 /root/.ssh/* 2>/dev/null || true'],
        { user: 'root' }
      );

      // Add GitHub/GitLab/Bitbucket to known_hosts to avoid host verification prompts
      await dockerService.executeCommand(
        dockerId,
        ['sh', '-c', 'ssh-keyscan -H github.com gitlab.com bitbucket.org >> /root/.ssh/known_hosts 2>/dev/null || true'],
        { user: 'root' }
      );

      // Configure SSH to not prompt for unknown hosts
      await dockerService.executeCommand(
        dockerId,
        ['sh', '-c', 'echo "StrictHostKeyChecking accept-new" >> /root/.ssh/config 2>/dev/null || true'],
        { user: 'root' }
      );

      // Check if SSH keys exist in the container
      const sshCheck = await dockerService.executeCommand(
        dockerId,
        ['sh', '-c', 'ls /root/.ssh/id_* 2>/dev/null | head -1'],
        { user: 'root' }
      );
      const hasSshKeys = sshCheck.exitCode === 0 && sshCheck.stdout.trim() !== '';

      // Convert HTTPS URL to SSH URL if we have SSH keys (required for private repos)
      let cloneUrl = repoUrl;
      if (hasSshKeys) {
        // Convert https://github.com/user/repo to git@github.com:user/repo
        const httpsMatch = repoUrl.match(/^https:\/\/(github|gitlab|bitbucket)\.(com|org)\/(.+?)(?:\.git)?$/);
        if (httpsMatch) {
          cloneUrl = `git@${httpsMatch[1]}.${httpsMatch[2]}:${httpsMatch[3]}.git`;
          logger.info({ dockerId, originalUrl: repoUrl, sshUrl: cloneUrl }, 'Converted HTTPS URL to SSH for authentication');
        }
      }

      // Clean workspace before cloning (remove any existing content)
      await dockerService.executeCommand(
        dockerId,
        ['sh', '-c', 'rm -rf /workspace/* /workspace/.[!.]* 2>/dev/null || true'],
        { user: 'root' }
      );

      // Clone repository directly into /workspace
      const result = await dockerService.executeCommand(
        dockerId,
        ['git', 'clone', cloneUrl, '.'],
        { user: 'root', workingDir: '/workspace' }
      );

      if (result.exitCode !== 0) {
        throw new Error(`Git clone failed: ${result.stderr}`);
      }

      // Configure git user for commits (use repo info or defaults)
      await dockerService.executeCommand(
        dockerId,
        ['git', 'config', 'user.email', 'claude@docker.local'],
        { user: 'root', workingDir: '/workspace' }
      );
      await dockerService.executeCommand(
        dockerId,
        ['git', 'config', 'user.name', 'Claude Docker'],
        { user: 'root', workingDir: '/workspace' }
      );

      // Set workspace permissions for developer user
      await dockerService.executeCommand(
        dockerId,
        ['chown', '-R', 'developer:developer', '/workspace'],
        { user: 'root' }
      );

      // Mark workspace as safe for git (avoids dubious ownership errors)
      await dockerService.executeCommand(
        dockerId,
        ['git', 'config', '--global', '--add', 'safe.directory', '/workspace'],
        { user: 'root' }
      );

      logger.info({ dockerId }, 'Repository cloned successfully');

      // Configure VS Code settings based on detected project type
      await this.configureVSCodeForProject(dockerId);
    } catch (error) {
      logger.error({ error, dockerId, repoUrl }, 'Failed to clone repository');
      throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Configure VS Code settings based on detected project type
   * Detects: Node.js, TypeScript, Python, Rust, Go, etc.
   */
  private async configureVSCodeForProject(dockerId: string): Promise<void> {
    try {
      logger.info({ dockerId }, 'Configuring VS Code for project');

      // Detect project type by checking for specific files
      const fileChecks = await dockerService.executeCommand(
        dockerId,
        ['sh', '-c', `
          echo "PACKAGE_JSON=$([ -f /workspace/package.json ] && echo 1 || echo 0)"
          echo "TSCONFIG=$([ -f /workspace/tsconfig.json ] && echo 1 || echo 0)"
          echo "CARGO_TOML=$([ -f /workspace/Cargo.toml ] && echo 1 || echo 0)"
          echo "GO_MOD=$([ -f /workspace/go.mod ] && echo 1 || echo 0)"
          echo "PYPROJECT=$([ -f /workspace/pyproject.toml ] && echo 1 || echo 0)"
          echo "REQUIREMENTS=$([ -f /workspace/requirements.txt ] && echo 1 || echo 0)"
          echo "COMPOSER=$([ -f /workspace/composer.json ] && echo 1 || echo 0)"
          echo "GEMFILE=$([ -f /workspace/Gemfile ] && echo 1 || echo 0)"
          echo "POM_XML=$([ -f /workspace/pom.xml ] && echo 1 || echo 0)"
          echo "BUILD_GRADLE=$([ -f /workspace/build.gradle ] && echo 1 || echo 0)"
          echo "CMAKE=$([ -f /workspace/CMakeLists.txt ] && echo 1 || echo 0)"
          echo "C_FILES=$(find /workspace -maxdepth 2 -name '*.c' 2>/dev/null | head -1 | grep -q . && echo 1 || echo 0)"
          echo "CPP_FILES=$(find /workspace -maxdepth 2 -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' 2>/dev/null | head -1 | grep -q . && echo 1 || echo 0)"
          echo "MAKEFILE=$([ -f /workspace/Makefile ] && echo 1 || echo 0)"
        `],
        { user: 'developer', workingDir: '/workspace' }
      );

      const files: Record<string, boolean> = {};
      for (const line of fileChecks.stdout.split('\n')) {
        const [key, value] = line.split('=');
        if (key && value) {
          files[key.trim()] = value.trim() === '1';
        }
      }

      // Build settings based on detected project type
      const additionalSettings: Record<string, unknown> = {};
      const recommendedExtensions: string[] = [];

      // TypeScript/Node.js project
      if (files['TSCONFIG'] || files['PACKAGE_JSON']) {
        additionalSettings['editor.defaultFormatter'] = 'esbenp.prettier-vscode';
        additionalSettings['editor.codeActionsOnSave'] = {
          'source.fixAll.eslint': 'explicit',
          'source.organizeImports': 'explicit'
        };
        additionalSettings['typescript.updateImportsOnFileMove.enabled'] = 'always';
        additionalSettings['javascript.updateImportsOnFileMove.enabled'] = 'always';
        recommendedExtensions.push(
          'esbenp.prettier-vscode',
          'dbaeumer.vscode-eslint',
          'bradlc.vscode-tailwindcss'
        );

        // Check for specific frameworks
        const packageJsonCheck = await dockerService.executeCommand(
          dockerId,
          ['sh', '-c', 'cat /workspace/package.json 2>/dev/null || echo "{}"'],
          { user: 'developer', workingDir: '/workspace' }
        );
        try {
          const packageJson = JSON.parse(packageJsonCheck.stdout);
          const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

          if (deps['next']) {
            recommendedExtensions.push('prisma.prisma');
          }
          if (deps['react'] || deps['react-dom']) {
            additionalSettings['emmet.includeLanguages'] = { 'javascript': 'javascriptreact', 'typescript': 'typescriptreact' };
          }
        } catch {
          // Ignore JSON parse errors
        }
      }

      // Rust project
      if (files['CARGO_TOML']) {
        additionalSettings['editor.defaultFormatter'] = 'rust-lang.rust-analyzer';
        additionalSettings['rust-analyzer.checkOnSave.command'] = 'clippy';
        recommendedExtensions.push(
          'rust-lang.rust-analyzer',
          'tamasfe.even-better-toml',
          'vadimcn.vscode-lldb'
        );
      }

      // Go project
      if (files['GO_MOD']) {
        additionalSettings['editor.defaultFormatter'] = 'golang.go';
        additionalSettings['go.useLanguageServer'] = true;
        additionalSettings['go.lintOnSave'] = 'package';
        additionalSettings['[go]'] = {
          'editor.formatOnSave': true,
          'editor.codeActionsOnSave': {
            'source.organizeImports': 'explicit'
          }
        };
        recommendedExtensions.push('golang.go');
      }

      // Python project
      if (files['PYPROJECT'] || files['REQUIREMENTS']) {
        additionalSettings['python.analysis.typeCheckingMode'] = 'basic';
        additionalSettings['python.formatting.provider'] = 'black';
        additionalSettings['[python]'] = {
          'editor.formatOnSave': true,
          'editor.defaultFormatter': 'ms-python.black-formatter'
        };
        recommendedExtensions.push(
          'ms-python.python',
          'ms-python.vscode-pylance',
          'ms-python.black-formatter'
        );
      }

      // PHP project
      if (files['COMPOSER']) {
        recommendedExtensions.push(
          'bmewburn.vscode-intelephense-client',
          'xdebug.php-debug'
        );
      }

      // Ruby project
      if (files['GEMFILE']) {
        recommendedExtensions.push('shopify.ruby-lsp');
      }

      // Java project
      if (files['POM_XML'] || files['BUILD_GRADLE']) {
        recommendedExtensions.push(
          'vscjava.vscode-java-pack',
          'redhat.java'
        );
      }

      // C/C++ project
      if (files['CMAKE'] || files['C_FILES'] || files['CPP_FILES'] || files['MAKEFILE']) {
        additionalSettings['C_Cpp.default.intelliSenseMode'] = 'linux-gcc-x64';
        additionalSettings['C_Cpp.default.compilerPath'] = '/usr/bin/gcc';
        additionalSettings['C_Cpp.clang_format_fallbackStyle'] = 'Google';
        additionalSettings['[c]'] = {
          'editor.formatOnSave': true,
          'editor.defaultFormatter': 'ms-vscode.cpptools'
        };
        additionalSettings['[cpp]'] = {
          'editor.formatOnSave': true,
          'editor.defaultFormatter': 'ms-vscode.cpptools'
        };
        recommendedExtensions.push(
          'ms-vscode.cpptools',
          'ms-vscode.cmake-tools',
          'twxs.cmake'
        );
      }

      // If we have additional settings, merge them
      if (Object.keys(additionalSettings).length > 0) {
        const settingsPath = '/home/developer/.local/share/code-server/User/settings.json';

        // Read existing settings
        const existingSettingsResult = await dockerService.executeCommand(
          dockerId,
          ['cat', settingsPath],
          { user: 'developer' }
        );

        let existingSettings: Record<string, unknown> = {};
        try {
          existingSettings = JSON.parse(existingSettingsResult.stdout);
        } catch {
          // Use empty object if parse fails
        }

        // Merge settings (additional settings override existing)
        const mergedSettings = { ...existingSettings, ...additionalSettings };

        // Write merged settings
        await dockerService.executeCommand(
          dockerId,
          ['sh', '-c', `cat > ${settingsPath} << 'SETTINGS_EOF'
${JSON.stringify(mergedSettings, null, 2)}
SETTINGS_EOF`],
          { user: 'developer' }
        );

        logger.info({ dockerId, detectedTypes: Object.keys(files).filter(k => files[k]) },
          'VS Code settings configured for project');
      }

      // Create .vscode/extensions.json with recommended extensions
      if (recommendedExtensions.length > 0) {
        await dockerService.executeCommand(
          dockerId,
          ['mkdir', '-p', '/workspace/.vscode'],
          { user: 'developer', workingDir: '/workspace' }
        );

        const extensionsJson = {
          recommendations: recommendedExtensions
        };

        await dockerService.executeCommand(
          dockerId,
          ['sh', '-c', `cat > /workspace/.vscode/extensions.json << 'EXT_EOF'
${JSON.stringify(extensionsJson, null, 2)}
EXT_EOF`],
          { user: 'developer', workingDir: '/workspace' }
        );

        logger.info({ dockerId, extensions: recommendedExtensions },
          'VS Code extension recommendations created');
      }
    } catch (error) {
      logger.warn({ error, dockerId }, 'Failed to configure VS Code for project, continuing anyway');
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

      // Track Docker IDs that exist
      const foundDockerIds = new Set<string>();

      for (const dockerContainer of dockerContainers) {
        const labels = dockerContainer.Labels || {};
        const claudeDockerId = labels['claude-docker.id'];

        foundDockerIds.add(dockerContainer.Id);

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

      // Clean up orphaned database entries (DB records with no matching Docker container)
      for (const entity of dbContainers) {
        if (!foundDockerIds.has(entity.dockerId)) {
          logger.warn({ containerId: entity.id, dockerId: entity.dockerId },
            'Orphaned DB entry found (no Docker container), removing');
          containerRepository.delete(entity.id);
          this.containers.delete(entity.id);
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
