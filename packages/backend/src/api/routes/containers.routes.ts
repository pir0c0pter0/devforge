import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { containerService } from '../../services/container.service';
import { taskService } from '../../services/task.service';
import { containerRepository } from '../../repositories';
import { validateBody, validateParams, validateQuery } from '../../utils/validation';
import { CreateContainerRequestSchema } from '../../models/container.model';
import { apiLogger as logger } from '../../utils/logger';

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
  validateBody(CreateContainerRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info({ body: req.body }, 'Creating container');

      // Check for duplicate name
      const existingContainer = containerRepository.findByName(req.body.name);
      if (existingContainer) {
        logger.warn({ name: req.body.name }, 'Container name already exists');
        res.status(409).json(
          errorResponse(`Container com nome "${req.body.name}" já existe`, 409)
        );
        return;
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
          logger.error({ error, taskId: task.id }, 'Failed to create container');
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
 * Start a container
 */
router.post(
  '/:id/start',
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      logger.info({ containerId: id }, 'Starting container');

      const container = await containerService.start(id);

      logger.info({ containerId: id }, 'Container started successfully');

      res.json(successResponse(container, 'Container started successfully'));
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
 * Delete a container
 */
router.delete(
  '/:id',
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const force = req.query['force'] === 'true';

      logger.info({ containerId: id, force }, 'Deleting container');

      await containerService.delete(id, force);

      logger.info({ containerId: id }, 'Container deleted successfully');

      res.json(successResponse({ id, deleted: true }, 'Container deleted successfully'));
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

export default router;
