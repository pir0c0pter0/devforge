import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { containerService } from '../../services/container.service';
import { taskService } from '../../services/task.service';
import { containerRepository } from '../../repositories';
import { validateBody, validateParams, validateQuery } from '../../utils/validation';
import { CreateContainerRequestSchema } from '../../models/container.model';
import { apiLogger as logger } from '../../utils/logger';
import { strictRateLimiter } from '../../middleware/rate-limit';
import { diskMetricsService } from '../../services/disk-metrics.service';
import { usageService } from '../../services/usage.service';

const router: Router = Router();

/**
 * API response helper
 */
const successResponse = (data: any, message?: string) => ({
  success: true,
  data,
  ...(message && { message }),
});

const errorResponse = (error: string, statusCode: number = 500) => ({
  success: false,
  error,
  statusCode,
});

/**
 * Container ID parameter schema
 */
const ContainerIdParamsSchema = z.object({
  id: z.string().uuid('Invalid container ID format'),
});

/**
 * Container logs query schema
 */
const ContainerLogsQuerySchema = z.object({
  tail: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 100)
    .refine((val) => !isNaN(val) && val > 0 && val <= 10000, {
      message: 'tail must be a number between 1 and 10000',
    }),
});

/**
 * Update container limits schema
 */
const UpdateLimitsSchema = z.object({
  cpuCores: z.number()
    .min(0.5, 'CPU deve ser no mínimo 0.5 cores')
    .max(16, 'CPU deve ser no máximo 16 cores')
    .optional(),
  memoryMB: z.number()
    .int('Memória deve ser um número inteiro')
    .min(512, 'Memória deve ser no mínimo 512 MB')
    .max(32768, 'Memória deve ser no máximo 32768 MB (32 GB)')
    .optional(),
  diskGB: z.number()
    .int('Disco deve ser um número inteiro')
    .min(5, 'Disco deve ser no mínimo 5 GB')
    .max(500, 'Disco deve ser no máximo 500 GB')
    .optional(),
}).refine(
  (data) => data.cpuCores !== undefined || data.memoryMB !== undefined || data.diskGB !== undefined,
  { message: 'Pelo menos um limite deve ser fornecido (cpuCores, memoryMB, ou diskGB)' }
);

/**
 * List containers query schema
 */
const ListContainersQuerySchema = z.object({
  includeMetrics: z.string()
    .optional()
    .transform((val) => val === 'true')
    .default('false'),
});

/**
 * GET /api/containers
 * List all containers with optional metrics
 */
router.get(
  '/',
  validateQuery(ListContainersQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info({ query: req.query }, 'Listing containers');

      const { includeMetrics } = req.query as any;
      const containers = await containerService.getAll(includeMetrics);

      logger.info({ count: containers.length }, 'Containers listed successfully');

      res.json(successResponse(containers));
    } catch (error) {
      logger.error({ error }, 'Failed to list containers');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to list containers',
          500
        )
      );
    }
  }
);

/**
 * POST /api/containers
 * Create a new container
 */
router.post(
  '/',
  strictRateLimiter,
  validateBody(CreateContainerRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info({ body: req.body }, 'Creating container');

      // Check for duplicate name
      const existingContainer = containerRepository.findByName(req.body.name);
      if (existingContainer) {
        // If container is in 'error' status, allow reuse by deleting the failed record
        if (existingContainer.status === 'error') {
          logger.info({ name: req.body.name, existingId: existingContainer.id },
            'Removing failed container record to allow name reuse');
          containerRepository.delete(existingContainer.id);
        } else if (existingContainer.status === 'creating') {
          // Container is being created - tell user to wait
          logger.warn({ name: req.body.name, existingStatus: existingContainer.status },
            'Container name already in use (creating)');
          res.status(409).json(
            errorResponse(`Container "${req.body.name}" está sendo criado. Aguarde a conclusão.`, 409)
          );
          return;
        } else {
          logger.warn({ name: req.body.name }, 'Container name already exists');
          res.status(409).json(
            errorResponse(`Container com nome "${req.body.name}" já existe`, 409)
          );
          return;
        }
      }

      // Create a task for this operation
      const task = taskService.create('create-container');
      logger.info({ taskId: task.id }, 'Created task for container creation');

      // Start the task
      taskService.start(task.id, 'Iniciando criação do container...');

      // Extract container data (taskId is not part of container config)
      const { taskId: _ignoredTaskId, ...containerData } = req.body;

      // Create container asynchronously, passing taskId to save in container config
      containerService.create({ ...containerData, taskId: task.id }, task.id)
        .then((container) => {
          logger.info({ containerId: container.id, taskId: task.id }, 'Container created successfully');
        })
        .catch((error) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ error, taskId: task.id }, 'Failed to create container');
          // CRITICAL: Mark task as failed so frontend doesn't show infinite loading
          taskService.fail(task.id, errorMessage);
        });

      // Return task immediately for polling
      res.status(202).json(successResponse({ taskId: task.id }, 'Container creation started'));
    } catch (error) {
      logger.error({ error, body: req.body }, 'Failed to start container creation');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to start container creation',
          500
        )
      );
    }
  }
);

/**
 * GET /api/containers/:id
 * Get container details
 */
router.get(
  '/:id',
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      logger.info({ containerId: id }, 'Getting container details');

      const container = await containerService.getById(id);

      if (!container) {
        logger.warn({ containerId: id }, 'Container not found');
        res.status(404).json(errorResponse('Container not found', 404));
        return;
      }

      res.json(successResponse(container));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to get container');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get container',
          500
        )
      );
    }
  }
);

/**
 * POST /api/containers/:id/start
 * Start a container (async with task tracking)
 */
router.post(
  '/:id/start',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      logger.info({ containerId: id }, 'Starting container');

      // Create a task for this operation
      const task = taskService.create('start-container');
      logger.info({ taskId: task.id, containerId: id }, 'Created task for container start');

      // Start the task
      taskService.start(task.id, 'Iniciando container...');

      // Update container config with taskId for frontend tracking
      containerRepository.update(id, { config: { taskId: task.id } as any });

      // Start container asynchronously
      containerService.startWithTask(id, task.id)
        .then((_container) => {
          logger.info({ containerId: id, taskId: task.id }, 'Container started successfully');
        })
        .catch((error) => {
          logger.error({ error, containerId: id, taskId: task.id }, 'Failed to start container');
        });

      // Return task immediately for polling
      res.status(202).json(successResponse({ taskId: task.id }, 'Container start initiated'));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to start container');

      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;

      res.status(statusCode).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to start container',
          statusCode
        )
      );
    }
  }
);

/**
 * POST /api/containers/:id/stop
 * Stop a container
 */
router.post(
  '/:id/stop',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      logger.info({ containerId: id }, 'Stopping container');

      const container = await containerService.stop(id);

      logger.info({ containerId: id }, 'Container stopped successfully');

      res.json(successResponse(container, 'Container stopped successfully'));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to stop container');

      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;

      res.status(statusCode).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to stop container',
          statusCode
        )
      );
    }
  }
);

/**
 * POST /api/containers/:id/restart
 * Restart a container
 */
router.post(
  '/:id/restart',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      logger.info({ containerId: id }, 'Restarting container');

      await containerService.stop(id);
      const container = await containerService.start(id);

      logger.info({ containerId: id }, 'Container restarted successfully');

      res.json(successResponse(container, 'Container restarted successfully'));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to restart container');

      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;

      res.status(statusCode).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to restart container',
          statusCode
        )
      );
    }
  }
);

/**
 * DELETE /api/containers/:id
 * Delete a container (async with task tracking)
 */
router.delete(
  '/:id',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const force = req.query['force'] === 'true';

      logger.info({ containerId: id, force }, 'Deleting container');

      // Create a task for this operation
      const task = taskService.create('delete-container');
      logger.info({ taskId: task.id, containerId: id }, 'Created task for container deletion');

      // Start the task
      taskService.start(task.id, 'Iniciando exclusão do container...');

      // Delete container asynchronously
      containerService.deleteWithTask(id, task.id, force)
        .then(() => {
          logger.info({ containerId: id, taskId: task.id }, 'Container deleted successfully');
        })
        .catch((error) => {
          logger.error({ error, containerId: id, taskId: task.id }, 'Failed to delete container');
        });

      // Return task immediately for tracking
      res.status(202).json(successResponse({ taskId: task.id, containerId: id }, 'Container deletion started'));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to delete container');

      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;

      res.status(statusCode).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to delete container',
          statusCode
        )
      );
    }
  }
);

/**
 * GET /api/containers/:id/metrics
 * Get real-time container metrics
 */
router.get(
  '/:id/metrics',
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      logger.debug({ containerId: id }, 'Getting container metrics');

      const metrics = await containerService.getMetrics(id);

      res.json(successResponse(metrics));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to get container metrics');

      const statusCode = error instanceof Error &&
        (error.message.includes('not found') || error.message.includes('not running')) ? 404 : 500;

      res.status(statusCode).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get container metrics',
          statusCode
        )
      );
    }
  }
);

/**
 * GET /api/containers/:id/logs
 * Get container logs
 */
router.get(
  '/:id/logs',
  validateParams(ContainerIdParamsSchema),
  validateQuery(ContainerLogsQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const { tail } = req.query as any;

      logger.info({ containerId: id, tail }, 'Getting container logs');

      const logs = await containerService.getLogs(id, tail);

      res.json(successResponse({ logs }));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to get container logs');

      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;

      res.status(statusCode).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get container logs',
          statusCode
        )
      );
    }
  }
);

/**
 * Metrics history query schema
 */
const MetricsHistoryQuerySchema = z.object({
  hours: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 5)
    .refine((val) => !isNaN(val) && val > 0 && val <= 24, {
      message: 'hours must be a number between 1 and 24',
    }),
  interval: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 1)
    .refine((val) => !isNaN(val) && val >= 1 && val <= 60, {
      message: 'interval must be a number between 1 and 60 minutes',
    }),
});

/**
 * GET /api/containers/:id/metrics/history
 * Get metrics history for charting (default 5 hours)
 */
router.get(
  '/:id/metrics/history',
  validateParams(ContainerIdParamsSchema),
  validateQuery(MetricsHistoryQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const { hours, interval } = req.query as unknown as { hours: number; interval: number };

      logger.debug({ containerId: id, hours, interval }, 'Getting container metrics history');

      // Calculate date range
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - hours * 60 * 60 * 1000);

      // Import metrics repository
      const { metricsRepository } = await import('../../repositories');

      // Get container to verify it exists
      const container = await containerService.getById(id);
      if (!container) {
        res.status(404).json(errorResponse('Container not found', 404));
        return;
      }

      // Get time series data
      const timeSeries = metricsRepository.getTimeSeries(id, {
        fromDate,
        toDate,
        intervalMinutes: interval,
        limit: 300, // Max 300 points for 5 hours at 1 min interval
      });

      // Transform to frontend format (reverse to chronological order)
      const history = [...timeSeries].reverse().map((point) => ({
        timestamp: point.timestamp.toISOString(),
        cpu: Number(point.cpuPercent.toFixed(2)),
        memory: Number(point.memoryUsage.toFixed(2)),
        disk: Number(point.diskUsage.toFixed(2)),
      }));

      logger.info({ containerId: id, points: history.length }, 'Metrics history retrieved');

      res.json(successResponse(history));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to get metrics history');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get metrics history',
          500
        )
      );
    }
  }
);

/**
 * Get detailed disk metrics with breakdown
 * GET /api/containers/:id/disk-metrics
 */
router.get('/:id/disk-metrics', async (req, res) => {
  try {
    const { id } = req.params;

    const container = await containerService.getById(id);
    if (!container) {
      return res.status(404).json({
        success: false,
        error: 'Container not found',
      });
    }

    if (container.status !== 'running') {
      return res.status(400).json({
        success: false,
        error: 'Container must be running to get disk metrics',
      });
    }

    const diskLimitMB = (container.limits?.diskGB || 20) * 1024;
    const metrics = await diskMetricsService.getDetailedMetrics(container.dockerId!, diskLimitMB);

    return res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error({ error, containerId: req.params.id }, 'Failed to get disk metrics');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get disk metrics',
    });
  }
});

/**
 * Get disk cleanup suggestions
 * GET /api/containers/:id/disk-cleanup-suggestions
 */
router.get('/:id/disk-cleanup-suggestions', async (req, res) => {
  try {
    const { id } = req.params;

    const container = await containerService.getById(id);
    if (!container) {
      return res.status(404).json({
        success: false,
        error: 'Container not found',
      });
    }

    if (container.status !== 'running') {
      return res.status(400).json({
        success: false,
        error: 'Container must be running to get cleanup suggestions',
      });
    }

    const suggestions = await diskMetricsService.getCleanupSuggestions(container.dockerId!);

    return res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    logger.error({ error, containerId: req.params.id }, 'Failed to get cleanup suggestions');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get cleanup suggestions',
    });
  }
});

/**
 * PUT /api/containers/:id/limits
 * Update container resource limits (CPU, Memory, Disk)
 * Note: If container is running, CPU and Memory are updated in Docker at runtime
 *       Disk limit can only be updated in the database (takes effect on next start)
 */
router.put(
  '/:id/limits',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  validateBody(UpdateLimitsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const { cpuCores, memoryMB, diskGB } = req.body;

      logger.info({ containerId: id, limits: req.body }, 'Updating container limits');

      // Update limits using container service (handles Docker update if running)
      const updatedContainer = await containerService.updateLimits(id, {
        cpuCores,
        memoryMB,
        diskGB,
      });

      logger.info({ containerId: id, limits: { cpuCores, memoryMB, diskGB } }, 'Container limits updated successfully');

      res.json(successResponse(updatedContainer, 'Limites do container atualizados com sucesso'));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to update container limits');

      const errorMessage = error instanceof Error ? error.message : 'Falha ao atualizar limites do container';
      const statusCode = errorMessage.includes('não encontrado') ? 404 : 500;

      res.status(statusCode).json(
        errorResponse(errorMessage, statusCode)
      );
    }
  }
);

// Rate limit tracking for disk expansion (in-memory, per container)
const diskExpansionRateLimits = new Map<string, number[]>();
const EXPANSION_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EXPANSION_LIMIT_COUNT = 3;

/**
 * Expand disk limit
 * POST /api/containers/:id/expand-disk
 */
router.post('/:id/expand-disk', async (req, res) => {
  try {
    const { id } = req.params;
    const { newLimitMB } = req.body as { newLimitMB: number };

    // Validate input
    if (!newLimitMB || typeof newLimitMB !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'newLimitMB is required and must be a number',
      });
    }

    // Validate limits (1GB to 100GB)
    const MIN_LIMIT_MB = 1024; // 1GB
    const MAX_LIMIT_MB = 102400; // 100GB

    if (newLimitMB < MIN_LIMIT_MB || newLimitMB > MAX_LIMIT_MB) {
      return res.status(400).json({
        success: false,
        error: `Disk limit must be between ${MIN_LIMIT_MB}MB (1GB) and ${MAX_LIMIT_MB}MB (100GB)`,
      });
    }

    // Rate limiting check
    const now = Date.now();
    const containerExpansions = diskExpansionRateLimits.get(id) || [];
    const recentExpansions = containerExpansions.filter(t => now - t < EXPANSION_LIMIT_WINDOW_MS);

    if (recentExpansions.length >= EXPANSION_LIMIT_COUNT) {
      return res.status(429).json({
        success: false,
        error: `Rate limit exceeded. Maximum ${EXPANSION_LIMIT_COUNT} expansions per hour.`,
      });
    }

    const container = await containerService.getById(id);
    if (!container) {
      return res.status(404).json({
        success: false,
        error: 'Container not found',
      });
    }

    const previousLimit = (container.limits?.diskGB || 20) * 1024;

    // Only allow increasing the limit
    if (newLimitMB <= previousLimit) {
      return res.status(400).json({
        success: false,
        error: 'New limit must be greater than current limit',
      });
    }

    // Check host disk space (require 50GB buffer)
    const { execSync } = require('child_process');
    const dfOutput = execSync('df -m / | tail -1').toString();
    const dfParts = dfOutput.trim().split(/\s+/);
    const availableMB = parseInt(dfParts[3] || '0', 10);
    const requiredBuffer = 51200; // 50GB in MB

    if (availableMB < requiredBuffer) {
      return res.status(400).json({
        success: false,
        error: `Insufficient host disk space. Available: ${Math.round(availableMB / 1024)}GB, Required buffer: 50GB`,
      });
    }

    // Update container configuration
    containerRepository.update(id, { diskLimit: newLimitMB });

    // Clear metrics cache
    diskMetricsService.clearCache(container.dockerId!);

    // Get current usage for response
    let currentUsage = 0;
    if (container.status === 'running') {
      try {
        const metrics = await diskMetricsService.getDetailedMetrics(container.dockerId!, newLimitMB);
        currentUsage = metrics.usage;
      } catch {
        // Ignore metrics error
      }
    }

    // Record expansion for rate limiting
    recentExpansions.push(now);
    diskExpansionRateLimits.set(id, recentExpansions);

    logger.info({
      containerId: id,
      previousLimit,
      newLimit: newLimitMB,
      currentUsage,
    }, 'Disk limit expanded');

    return res.json({
      success: true,
      data: {
        previousLimit,
        newLimit: newLimitMB,
        currentUsage,
        newPercentage: newLimitMB > 0 ? Number(((currentUsage / newLimitMB) * 100).toFixed(2)) : 0,
      },
    });
  } catch (error) {
    logger.error({ error, containerId: req.params.id }, 'Failed to expand disk');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to expand disk',
    });
  }
});

/**
 * GET /api/containers/:id/usage
 * Get token usage summary for a container (daily, weekly, session)
 */
router.get(
  '/:id/usage',
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      logger.debug({ containerId: id }, 'Getting container usage summary');

      // Verify container exists
      const container = await containerService.getById(id);
      if (!container) {
        res.status(404).json(errorResponse('Container not found', 404));
        return;
      }

      // Get usage summary
      const usage = usageService.getUsageSummary(id);

      res.json(successResponse(usage));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to get container usage');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get container usage',
          500
        )
      );
    }
  }
);

export default router;
