import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { diagnosticsService } from '../../services/diagnostics.service';
import { logger } from '../../utils/logger';

const router: RouterType = Router();

/**
 * GET /api/diagnostics
 * Run all system diagnostics
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    logger.info('Running system diagnostics');
    const result = await diagnosticsService.runAll();

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to run diagnostics');

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run diagnostics',
    });
  }
});

/**
 * GET /api/diagnostics/:check
 * Run a specific diagnostic check
 */
router.get('/:check', async (req: Request, res: Response) => {
  const { check } = req.params;

  try {
    let result;

    switch (check) {
      case 'docker':
        result = await diagnosticsService.checkDockerDaemon();
        break;
      case 'group':
        result = await diagnosticsService.checkDockerGroup();
        break;
      case 'images':
        result = await diagnosticsService.checkDockerImages();
        break;
      case 'containers':
        result = await diagnosticsService.checkOrphanContainers();
        break;
      case 'redis':
        result = await diagnosticsService.checkRedis();
        break;
      case 'ssh':
        result = await diagnosticsService.checkSshKeys();
        break;
      case 'ports':
        result = await diagnosticsService.checkPorts();
        break;
      case 'disk':
        result = await diagnosticsService.checkDiskSpace();
        break;
      default:
        res.status(400).json({
          success: false,
          error: `Unknown check: ${check}`,
          availableChecks: [
            'docker',
            'group',
            'images',
            'containers',
            'redis',
            'ssh',
            'ports',
            'disk',
          ],
        });
        return;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error({ error, check }, 'Failed to run diagnostic check');

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run diagnostic check',
    });
  }
});

export default router;
