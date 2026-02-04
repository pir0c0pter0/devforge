import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { claudeDaemonService } from '../../services/claude-daemon.service';
import { containerService } from '../../services/container.service';
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
});

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
 * Send instruction to daemon
 */
router.post(
  '/:containerId/instruction',
  strictRateLimiter,
  validateParams(ContainerIdParamsSchema),
  validateBody(InstructionBodySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const containerId = req.params['containerId'] as string;
      const { instruction } = req.body;

      logger.info({ containerId, instructionLength: instruction.length }, 'Sending instruction to daemon');

      await claudeDaemonService.sendInstruction(containerId, instruction);

      logger.info({ containerId }, 'Instruction sent successfully');

      res.json(successResponse({ success: true, message: 'Instruction sent' }));
    } catch (error) {
      logger.error({ error, containerId: req.params['containerId'] }, 'Failed to send instruction');

      const statusCode = error instanceof Error && error.message.includes('not running') ? 400 : 500;

      res.status(statusCode).json(
        errorResponse(
          error instanceof Error ? error.message : 'Failed to send instruction',
          statusCode
        )
      );
    }
  }
);

export default router;
