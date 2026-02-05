import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { dockerLogsRepository, containerRepository } from '../../repositories';
import { validateParams, validateQuery } from '../../utils/validation';
import { apiLogger as logger } from '../../utils/logger';
import { requireRole, AuthenticatedRequest } from '../../middleware/auth.middleware';

const router: Router = Router();

/**
 * API response helper
 */
const successResponse = (data: unknown, message?: string) => ({
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
 * Docker logs query schema
 */
const DockerLogsQuerySchema = z.object({
  since: z.string()
    .optional()
    .transform((val) => val ? new Date(val) : undefined)
    .refine((val) => val === undefined || !isNaN(val.getTime()), {
      message: 'since must be a valid ISO date string',
    }),
  until: z.string()
    .optional()
    .transform((val) => val ? new Date(val) : undefined)
    .refine((val) => val === undefined || !isNaN(val.getTime()), {
      message: 'until must be a valid ISO date string',
    }),
  stream: z.enum(['stdout', 'stderr'])
    .optional(),
  search: z.string()
    .optional(),
  limit: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 500)
    .refine((val) => !isNaN(val) && val > 0 && val <= 10000, {
      message: 'limit must be a number between 1 and 10000',
    }),
  offset: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 0)
    .refine((val) => !isNaN(val) && val >= 0, {
      message: 'offset must be a non-negative number',
    }),
});

/**
 * Download query schema
 */
const DockerLogsDownloadQuerySchema = z.object({
  since: z.string()
    .optional()
    .transform((val) => val ? new Date(val) : undefined)
    .refine((val) => val === undefined || !isNaN(val.getTime()), {
      message: 'since must be a valid ISO date string',
    }),
  until: z.string()
    .optional()
    .transform((val) => val ? new Date(val) : undefined)
    .refine((val) => val === undefined || !isNaN(val.getTime()), {
      message: 'until must be a valid ISO date string',
    }),
  stream: z.enum(['stdout', 'stderr'])
    .optional(),
  format: z.enum(['json', 'txt'])
    .optional()
    .default('txt'),
});

/**
 * Helper function to verify container ownership/access
 */
const verifyContainerAccess = (containerId: string): boolean => {
  const container = containerRepository.findById(containerId);
  return container !== null;
};

/**
 * GET /api/containers/:id/docker-logs
 * Get docker logs for a container with optional filters and pagination
 */
router.get(
  '/:id/docker-logs',
  validateParams(ContainerIdParamsSchema),
  validateQuery(DockerLogsQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const { since, until, stream, search, limit, offset } = req.query as unknown as {
        since?: Date;
        until?: Date;
        stream?: 'stdout' | 'stderr';
        search?: string;
        limit: number;
        offset: number;
      };

      logger.info({ containerId: id, filters: { since, until, stream, search, limit, offset } }, 'Getting docker logs');

      // Verify container exists
      if (!verifyContainerAccess(id)) {
        logger.warn({ containerId: id }, 'Container not found');
        res.status(404).json(errorResponse('Container not found', 404));
        return;
      }

      // Get logs with pagination
      const result = dockerLogsRepository.getContainerLogs(id, {
        limit,
        offset,
        since,
        stream,
      });

      // Apply search filter if provided (in-memory filtering)
      let filteredLogs = result.logs;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredLogs = result.logs.filter(log =>
          log.content.toLowerCase().includes(searchLower)
        );
      }

      // Apply until filter if provided (in-memory filtering since repository doesn't support it in getContainerLogs)
      if (until) {
        filteredLogs = filteredLogs.filter(log =>
          log.recordedAt <= until
        );
      }

      logger.info({ containerId: id, count: filteredLogs.length, total: result.total }, 'Docker logs retrieved');

      res.json(successResponse({
        logs: filteredLogs,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: result.hasMore,
        },
      }));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to get docker logs');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get docker logs',
          500
        )
      );
    }
  }
);

/**
 * GET /api/containers/:id/docker-logs/stats
 * Get statistics for docker logs of a container
 */
router.get(
  '/:id/docker-logs/stats',
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      logger.info({ containerId: id }, 'Getting docker logs stats');

      // Verify container exists
      if (!verifyContainerAccess(id)) {
        logger.warn({ containerId: id }, 'Container not found');
        res.status(404).json(errorResponse('Container not found', 404));
        return;
      }

      const stats = dockerLogsRepository.getStats(id);

      logger.info({ containerId: id, stats }, 'Docker logs stats retrieved');

      res.json(successResponse(stats));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to get docker logs stats');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get docker logs stats',
          500
        )
      );
    }
  }
);

/**
 * DELETE /api/containers/:id/docker-logs
 * Clear all docker logs for a container (admin only)
 */
router.delete(
  '/:id/docker-logs',
  validateParams(ContainerIdParamsSchema),
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      logger.info({ containerId: id, userId: req.user?.id }, 'Deleting docker logs');

      // Verify container exists
      if (!verifyContainerAccess(id)) {
        logger.warn({ containerId: id }, 'Container not found');
        res.status(404).json(errorResponse('Container not found', 404));
        return;
      }

      const deleted = dockerLogsRepository.deleteByContainerId(id);

      logger.info({ containerId: id, deleted }, 'Docker logs deleted');

      res.json(successResponse({ deleted }, `Deleted ${deleted} log entries`));
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to delete docker logs');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to delete docker logs',
          500
        )
      );
    }
  }
);

/**
 * GET /api/containers/:id/docker-logs/download
 * Download docker logs as a file
 */
router.get(
  '/:id/docker-logs/download',
  validateParams(ContainerIdParamsSchema),
  validateQuery(DockerLogsDownloadQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const { since, until, stream, format } = req.query as unknown as {
        since?: Date;
        until?: Date;
        stream?: 'stdout' | 'stderr';
        format: 'json' | 'txt';
      };

      logger.info({ containerId: id, filters: { since, until, stream, format } }, 'Downloading docker logs');

      // Verify container exists
      if (!verifyContainerAccess(id)) {
        logger.warn({ containerId: id }, 'Container not found');
        res.status(404).json(errorResponse('Container not found', 404));
        return;
      }

      // Get all logs matching filters (no pagination for download)
      const logs = dockerLogsRepository.findAll({
        containerId: id,
        since,
        until,
        stream,
        orderBy: 'recorded_at',
        orderDirection: 'ASC',
      });

      // Get container name for filename
      const container = containerRepository.findById(id);
      const containerName = container?.name || id;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `docker-logs-${containerName}-${timestamp}.${format}`;

      // Set headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(logs, null, 2));
      } else {
        // txt format
        res.setHeader('Content-Type', 'text/plain');
        const txtContent = logs.map(log => {
          const timestamp = log.recordedAt.toISOString();
          const streamLabel = log.stream === 'stderr' ? '[stderr]' : '[stdout]';
          return `${timestamp} ${streamLabel} ${log.content}`;
        }).join('\n');
        res.send(txtContent);
      }

      logger.info({ containerId: id, count: logs.length, format }, 'Docker logs downloaded');
    } catch (error) {
      logger.error({ error, containerId: req.params['id'] }, 'Failed to download docker logs');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to download docker logs',
          500
        )
      );
    }
  }
);

export default router;
