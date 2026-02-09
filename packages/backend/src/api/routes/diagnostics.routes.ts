import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { diagnosticsService } from '../../services/diagnostics.service';
import { logger } from '../../utils/logger';

const router: RouterType = Router();

// SEC-M2: Whitelist of valid diagnostic check names
const VALID_CHECKS = ['docker', 'group', 'images', 'containers', 'redis', 'ssh', 'ports', 'disk'] as const;
type ValidCheck = typeof VALID_CHECKS[number];

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

  // SEC-M2: Validate check parameter against known whitelist before using in response
  if (!check || !VALID_CHECKS.includes(check as ValidCheck)) {
    res.status(400).json({
      success: false,
      error: 'Unknown diagnostic check',
      availableChecks: [...VALID_CHECKS],
    });
    return;
  }

  try {
    let result;

    switch (check as ValidCheck) {
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
