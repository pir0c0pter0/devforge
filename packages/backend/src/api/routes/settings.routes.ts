import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { settingsService } from '../../services/settings.service';
import { logger } from '../../utils/logger';
import { authRateLimiter, strictRateLimiter } from '../../middleware/rate-limit';
import { telegramService } from '../../telegram/telegram.service';
import * as fs from 'fs';
import * as path from 'path';

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
router.post('/open-claude-auth', authRateLimiter, (_req: Request, res: Response) => {
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
router.post('/logout-claude', authRateLimiter, async (_req: Request, res: Response) => {
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
router.post('/generate-ssh-key', strictRateLimiter, async (req: Request, res: Response) => {
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

/**
 * GET /api/settings/telegram-config
 * Get Telegram bot configuration (token masked)
 */
router.get('/telegram-config', async (_req: Request, res: Response) => {
  try {
    const token = process.env['TELEGRAM_BOT_TOKEN'] || '';
    const allowedUsers = process.env['TELEGRAM_ALLOWED_USERS'] || '';

    res.json({
      success: true,
      data: {
        hasToken: !!token,
        tokenMasked: token ? `${token.substring(0, 10)}...${token.substring(token.length - 5)}` : '',
        allowedUsers: allowedUsers,
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get Telegram config');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get Telegram config',
    });
  }
});

/**
 * POST /api/settings/telegram-config
 * Save Telegram bot configuration to .env file
 */
router.post('/telegram-config', strictRateLimiter, async (req: Request, res: Response) => {
  try {
    const { token, allowedUsers } = req.body as { token?: string; allowedUsers?: string };

    // Validate token format (optional - only validate if provided)
    if (token && !token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      res.status(400).json({
        success: false,
        error: 'Invalid token format. Expected format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
      });
      return;
    }

    // Validate allowed users format (comma-separated numbers)
    if (allowedUsers) {
      const userIds = allowedUsers.split(',').map(id => id.trim()).filter(Boolean);
      const invalidIds = userIds.filter(id => !/^\d+$/.test(id));
      if (invalidIds.length > 0) {
        res.status(400).json({
          success: false,
          error: `Invalid user IDs: ${invalidIds.join(', ')}. User IDs must be numeric.`,
        });
        return;
      }
    }

    // Find .env file path (backend/.env is 3 levels up from routes)
    const envPath = path.resolve(__dirname, '../../../.env');

    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    // Update or add TELEGRAM_BOT_TOKEN
    if (token !== undefined) {
      if (envContent.includes('TELEGRAM_BOT_TOKEN=')) {
        envContent = envContent.replace(/TELEGRAM_BOT_TOKEN=.*/g, `TELEGRAM_BOT_TOKEN=${token}`);
      } else {
        envContent += `\n# Telegram Bot Configuration\nTELEGRAM_BOT_TOKEN=${token}\n`;
      }
      // Update process.env for immediate effect
      process.env['TELEGRAM_BOT_TOKEN'] = token;
    }

    // Update or add TELEGRAM_ALLOWED_USERS
    if (allowedUsers !== undefined) {
      if (envContent.includes('TELEGRAM_ALLOWED_USERS=')) {
        envContent = envContent.replace(/TELEGRAM_ALLOWED_USERS=.*/g, `TELEGRAM_ALLOWED_USERS=${allowedUsers}`);
      } else {
        envContent += `TELEGRAM_ALLOWED_USERS=${allowedUsers}\n`;
      }
      // Update process.env for immediate effect
      process.env['TELEGRAM_ALLOWED_USERS'] = allowedUsers;
    }

    // Write .env file
    fs.writeFileSync(envPath, envContent, 'utf-8');

    logger.info('Telegram configuration saved to .env file');

    // Restart telegram service if token is set
    if (process.env['TELEGRAM_BOT_TOKEN']) {
      try {
        await telegramService.stop();
        telegramService.reloadConfig(); // Reload config from updated process.env
        await telegramService.start();
        logger.info('Telegram bot restarted with new configuration');

        // Send welcome message to allowed users
        if (telegramService.isRunning() && allowedUsers) {
          const userIds = allowedUsers.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
          const welcomeMessage =
            '🎉 *Bot Configurado com Sucesso\\!*\n\n' +
            '✅ Seu bot DevForge está pronto para uso\\.\n\n' +
            '📋 *Comandos disponíveis:*\n' +
            '• `/help` \\- Lista todos os comandos\n' +
            '• `/list` \\- Lista containers\n' +
            '• `/stats` \\- Estatísticas do container\n' +
            '• `/queue` \\- Fila de instruções\n' +
            '• `/exec <instrução>` \\- Enviar instrução\n\n' +
            '_Digite /help para mais detalhes\\._';

          for (const userId of userIds) {
            try {
              await telegramService.sendMessage(userId, welcomeMessage, { parseMode: 'MarkdownV2' });
              logger.info({ userId }, 'Welcome message sent to user');
            } catch (msgError) {
              logger.warn({ userId, error: msgError }, 'Failed to send welcome message');
            }
          }
        }
      } catch (restartError) {
        logger.warn({ error: restartError }, 'Failed to restart Telegram bot, may need manual restart');
      }
    }

    res.json({
      success: true,
      message: 'Telegram configuration saved successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to save Telegram config');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save Telegram config',
    });
  }
});

export default router;
