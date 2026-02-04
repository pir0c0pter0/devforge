import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { claudeDaemonService } from '../../services/claude-daemon.service';
import { containerService } from '../../services/container.service';
import {
  queueInstruction,
  getQueueStatus,
  getJob,
  getJobHistory,
  getDeadLetterJobs,
  cancelJob,
  retryJob,
  clearQueue,
  pauseQueue,
  resumeQueue,
} from '../../services/claude-queue.service';
import { apiLogger as logger } from '../../utils/logger';
import { validateBody, validateParams } from '../../utils/validation';
import { strictRateLimiter } from '../../middleware/rate-limit';

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
  containerId: z.string().uuid('Invalid container ID format'),
});

/**
 * Instruction body schema
 */
const InstructionBodySchema = z.object({
  instruction: z.string().min(1, 'Instruction cannot be empty'),
  mode: z.enum(['interactive', 'autonomous']).optional().default('interactive'),
});

// Note: JobIdParamsSchema and HistoryQuerySchema are not used because
// these endpoints use simple string extraction from req.params/query
// for flexibility. The validation is done by the service layer.

/**
 * GET /api/claude-daemon/list
 * List all active daemons
 * NOTE: This route MUST be before /:containerId routes to avoid matching
 */
router.get(
  '/list',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.info('Listing all active Claude daemons');

      const daemons = claudeDaemonService.listDaemons();

      logger.info({ count: daemons.length }, 'Active daemons listed successfully');

      res.json(successResponse(daemons));
    } catch (error) {
      logger.error({ error }, 'Failed to list daemons');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to list daemons',
          500
        )
      );
    }
  }
);

/**
 * GET /api/claude-daemon/:containerId/status
 * Get daemon status for a container
 */
router.get(
  '/:containerId/status',
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;

      logger.info({ containerId }, 'Getting daemon status');

      const state = claudeDaemonService.getStatus(containerId);

      if (!state) {
        // Return stopped status if no daemon running
        res.json(successResponse({ containerId, status: 'stopped' }));
        return;
      }

      res.json(successResponse(state));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'] }, 'Failed to get daemon status');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get daemon status',
          500
        )
      );
    }
  }
);

/**
 * POST /api/claude-daemon/:containerId/start
 * Start daemon for a container
 */
router.post(
  '/:containerId/start',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;

      logger.info({ containerId }, 'Starting daemon');

      // Fetch container to validate it exists and get dockerId
      const container = await containerService.getById(containerId);

      if (!container) {
        logger.warn({ containerId }, 'Container not found');
        res.status(404).json(errorResponse('Container not found', 404));
        return;
      }

      if (container.status !== 'running') {
        logger.warn({ containerId, status: container.status }, 'Container is not running');
        res.status(400).json(
          errorResponse(`Container is not running. Current status: ${container.status}`, 400)
        );
        return;
      }

      // Start the daemon
      const state = await claudeDaemonService.startDaemon(containerId, container.dockerId);

      logger.info({ containerId, status: state.status }, 'Daemon started successfully');

      res.json(successResponse(state, 'Daemon started successfully'));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'] }, 'Failed to start daemon');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to start daemon',
          500
        )
      );
    }
  }
);

/**
 * POST /api/claude-daemon/:containerId/stop
 * Stop daemon for a container
 */
router.post(
  '/:containerId/stop',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;

      logger.info({ containerId }, 'Stopping daemon');

      await claudeDaemonService.stopDaemon(containerId);

      logger.info({ containerId }, 'Daemon stopped successfully');

      res.json(successResponse({ containerId, status: 'stopped' }, 'Daemon stopped successfully'));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'] }, 'Failed to stop daemon');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to stop daemon',
          500
        )
      );
    }
  }
);

/**
 * POST /api/claude-daemon/:containerId/instruction
 * Send instruction to daemon via queue
 */
router.post(
  '/:containerId/instruction',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  validateBody(InstructionBodySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;
      const { instruction, mode = 'interactive' } = req.body;

      logger.info({
        containerId,
        instructionLength: instruction.length,
        mode
      }, 'Queueing instruction');

      // Adicionar instrução na fila (em vez de envio direto)
      const jobInfo = await queueInstruction(
        containerId,
        instruction,
        mode as 'interactive' | 'autonomous'
      );

      logger.info({
        containerId,
        jobId: jobInfo.id,
        position: jobInfo.position,
        mode
      }, 'Instruction queued');

      // Retornar 202 Accepted (processamento assíncrono)
      res.status(202).json(
        successResponse(
          {
            jobId: jobInfo.id,
            position: jobInfo.position,
            status: jobInfo.status
          },
          'Instruction queued successfully'
        )
      );
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'] }, 'Failed to queue instruction');

      const statusCode = error instanceof Error && error.message.includes('not running') ? 400 : 500;

      res.status(statusCode).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to queue instruction',
          statusCode
        )
      );
    }
  }
);

/**
 * GET /api/claude-daemon/:containerId/queue
 * Get queue status for a container
 */
router.get(
  '/:containerId/queue',
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;

      logger.debug({ containerId }, 'Getting queue status');

      const status = await getQueueStatus(containerId);

      res.json(successResponse(status));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'] }, 'Failed to get queue status');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get queue status',
          500
        )
      );
    }
  }
);

/**
 * GET /api/claude-daemon/:containerId/queue/history
 * Get job history for a container
 */
router.get(
  '/:containerId/queue/history',
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;
      const limit = parseInt(req.query['limit'] as string) || 50;

      logger.debug({ containerId, limit }, 'Getting queue history');

      const history = await getJobHistory(containerId, Math.min(limit, 200));

      res.json(successResponse(history));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'] }, 'Failed to get queue history');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get queue history',
          500
        )
      );
    }
  }
);

/**
 * GET /api/claude-daemon/:containerId/queue/dlq
 * Get Dead Letter Queue jobs for a container
 */
router.get(
  '/:containerId/queue/dlq',
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;
      const limit = parseInt(req.query['limit'] as string) || 20;

      logger.debug({ containerId, limit }, 'Getting DLQ jobs');

      const dlqJobs = await getDeadLetterJobs(containerId, Math.min(limit, 100));

      res.json(successResponse(dlqJobs));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'] }, 'Failed to get DLQ jobs');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get DLQ jobs',
          500
        )
      );
    }
  }
);

/**
 * GET /api/claude-daemon/:containerId/queue/jobs/:jobId
 * Get specific job details
 */
router.get(
  '/:containerId/queue/jobs/:jobId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;
      const jobId = req.params['jobId'] as string;

      logger.debug({ containerId, jobId }, 'Getting job details');

      const job = await getJob(containerId, jobId);

      if (!job) {
        res.status(404).json(errorResponse('Job not found', 404));
        return;
      }

      res.json(successResponse(job));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'], jobId: req.params['jobId'] }, 'Failed to get job');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to get job',
          500
        )
      );
    }
  }
);

/**
 * POST /api/claude-daemon/:containerId/queue/jobs/:jobId/cancel
 * Cancel a pending or delayed job
 */
router.post(
  '/:containerId/queue/jobs/:jobId/cancel',
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;
      const jobId = req.params['jobId'] as string;

      logger.info({ containerId, jobId }, 'Cancelling job');

      const cancelled = await cancelJob(containerId, jobId);

      if (!cancelled) {
        res.status(400).json(
          errorResponse('Cannot cancel job. It may not exist or is already being processed.', 400)
        );
        return;
      }

      logger.info({ containerId, jobId }, 'Job cancelled successfully');

      res.json(successResponse({ jobId, status: 'cancelled' }, 'Job cancelled successfully'));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'], jobId: req.params['jobId'] }, 'Failed to cancel job');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to cancel job',
          500
        )
      );
    }
  }
);

/**
 * POST /api/claude-daemon/:containerId/queue/jobs/:jobId/retry
 * Retry a failed job
 */
router.post(
  '/:containerId/queue/jobs/:jobId/retry',
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;
      const jobId = req.params['jobId'] as string;

      logger.info({ containerId, jobId }, 'Retrying job');

      const retried = await retryJob(containerId, jobId);

      if (!retried) {
        res.status(400).json(
          errorResponse('Cannot retry job. It may not exist or is not in a failed state.', 400)
        );
        return;
      }

      logger.info({ containerId, jobId }, 'Job retry initiated');

      res.json(successResponse({ jobId, status: 'retrying' }, 'Job retry initiated'));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'], jobId: req.params['jobId'] }, 'Failed to retry job');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to retry job',
          500
        )
      );
    }
  }
);

/**
 * DELETE /api/claude-daemon/:containerId/queue
 * Clear all pending jobs from queue
 */
router.delete(
  '/:containerId/queue',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;

      logger.info({ containerId }, 'Clearing queue');

      const removedCount = await clearQueue(containerId);

      logger.info({ containerId, removedCount }, 'Queue cleared');

      res.json(successResponse({ removedCount }, `Queue cleared. ${removedCount} jobs removed.`));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'] }, 'Failed to clear queue');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to clear queue',
          500
        )
      );
    }
  }
);

/**
 * POST /api/claude-daemon/:containerId/queue/pause
 * Pause queue processing (jobs are still accepted but not processed)
 */
router.post(
  '/:containerId/queue/pause',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;

      logger.info({ containerId }, 'Pausing queue');

      await pauseQueue(containerId);

      res.json(successResponse({ containerId, paused: true }, 'Queue paused'));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'] }, 'Failed to pause queue');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to pause queue',
          500
        )
      );
    }
  }
);

/**
 * POST /api/claude-daemon/:containerId/queue/resume
 * Resume queue processing
 */
router.post(
  '/:containerId/queue/resume',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;

      logger.info({ containerId }, 'Resuming queue');

      await resumeQueue(containerId);

      res.json(successResponse({ containerId, paused: false }, 'Queue resumed'));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'] }, 'Failed to resume queue');

      res.status(500).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to resume queue',
          500
        )
      );
    }
  }
);

export default router;
