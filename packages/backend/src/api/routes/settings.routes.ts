import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { settingsService } from '../../services/settings.service';
import { logger } from '../../utils/logger';

const router: RouterType = Router();

/**
 * GET /api/settings/claude-status
 * Get Claude Code authentication status
 */
router.get('/claude-status', async (_req: Request, res: Response) => {
  try {
    const status = await settingsService.getClaudeStatus();
    res.json(status);
  } catch (error) {
    logger.error({ error }, 'Failed to get Claude status');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get Claude status',
    });
  }
});

/**
 * GET /api/settings/system-status
 * Get system status
 */
router.get('/system-status', async (_req: Request, res: Response) => {
  try {
    const status = await settingsService.getSystemStatus();
    res.json(status);
  } catch (error) {
    logger.error({ error }, 'Failed to get system status');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get system status',
    });
  }
});

/**
 * GET /api/settings/config
 * Get configuration
 */
router.get('/config', (_req: Request, res: Response) => {
  try {
    const config = settingsService.getConfig();
    res.json(config);
  } catch (error) {
    logger.error({ error }, 'Failed to get config');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get config',
    });
  }
});

/**
 * POST /api/settings/open-claude-auth
 * Get instructions to open Claude auth
 */
router.post('/open-claude-auth', (_req: Request, res: Response) => {
  try {
    const instructions = settingsService.getAuthInstructions();
    res.json({ instructions });
  } catch (error) {
    logger.error({ error }, 'Failed to get auth instructions');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get auth instructions',
    });
  }
});

/**
 * POST /api/settings/logout-claude
 * Logout from Claude
 */
router.post('/logout-claude', async (_req: Request, res: Response) => {
  try {
    const result = await settingsService.logoutClaude();
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error({ error }, 'Failed to logout from Claude');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to logout',
    });
  }
});

/**
 * POST /api/settings/generate-ssh-key
 * Generate SSH key
 */
router.post('/generate-ssh-key', async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }

    const result = await settingsService.generateSshKey(email);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error({ error }, 'Failed to generate SSH key');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate SSH key',
    });
  }
});

export default router;
