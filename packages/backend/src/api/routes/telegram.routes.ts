import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { telegramService } from '../../telegram/telegram.service'
import { apiLogger as logger } from '../../utils/logger'
import { validateBody } from '../../utils/validation'
import { strictRateLimiter } from '../../middleware/rate-limit'

const router: Router = Router()

/**
 * API response helper
 */
const successResponse = (data: unknown, message?: string) => ({
  success: true,
  data,
  ...(message && { message }),
})

const errorResponse = (error: string, statusCode: number = 500) => ({
  success: false,
  error,
  statusCode,
})

/**
 * Send message body schema
 */
const SendMessageBodySchema = z.object({
  userId: z.number().int().positive('User ID must be a positive integer'),
  message: z.string().min(1, 'Message cannot be empty').max(4096, 'Message too long'),
})

/**
 * POST /api/telegram/webhook
 * Receives updates from Telegram (webhook mode)
 *
 * This endpoint is called by Telegram when using webhook mode.
 * The secret token (X-Telegram-Bot-Api-Secret-Token header) is validated
 * by the Telegraf library if configured.
 */
router.post(
  '/webhook',
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Optional: Validate secret token header
      // The Telegraf library handles this internally if webhookSecret is configured
      const secretToken = req.headers['x-telegram-bot-api-secret-token']
      logger.debug({ hasSecretToken: Boolean(secretToken) }, 'Telegram webhook received')

      await telegramService.handleUpdate(req.body)

      // Telegram expects 200 OK response
      res.sendStatus(200)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage }, 'Telegram webhook error')

      // Even on error, we should respond with 200 to avoid Telegram retrying
      // Log the error but don't expose it to Telegram
      res.sendStatus(200)
    }
  }
)

/**
 * GET /api/telegram/status
 * Get current bot status
 */
router.get(
  '/status',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.debug('Getting Telegram bot status')

      const status = await telegramService.getStatus()

      res.json(successResponse(status))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage }, 'Failed to get Telegram bot status')

      res.status(500).json(
        errorResponse(
          errorMessage,
          500
        )
      )
    }
  }
)

/**
 * POST /api/telegram/send
 * Send a message to a specific user (admin endpoint)
 *
 * This endpoint can be used by admin systems to send notifications
 * to specific Telegram users.
 */
router.post(
  '/send',
  strictRateLimiter,
  validateBody(SendMessageBodySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, message } = req.body

      logger.info({ userId, messageLength: message.length }, 'Sending Telegram message')

      await telegramService.sendMessage(userId, message, {
        parseMode: 'HTML',
      })

      logger.info({ userId }, 'Telegram message sent successfully')

      res.json(successResponse({ userId, sent: true }, 'Message sent successfully'))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage }, 'Failed to send Telegram message')

      res.status(500).json(
        errorResponse(
          errorMessage,
          500
        )
      )
    }
  }
)

/**
 * POST /api/telegram/broadcast
 * Send a notification to all allowed users
 */
router.post(
  '/broadcast',
  strictRateLimiter,
  validateBody(z.object({
    type: z.enum([
      'container:started',
      'container:stopped',
      'container:error',
      'container:created',
      'container:deleted',
      'instruction:completed',
      'instruction:failed',
    ]),
    message: z.string().min(1, 'Message cannot be empty'),
    containerId: z.string().optional(),
    containerName: z.string().optional(),
  })),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { type, message, containerId, containerName } = req.body

      logger.info({ type, containerId }, 'Broadcasting Telegram notification')

      await telegramService.broadcastNotification({
        type,
        message,
        containerId,
        containerName,
        timestamp: new Date(),
      })

      logger.info({ type }, 'Telegram notification broadcasted')

      res.json(successResponse({ broadcasted: true }, 'Notification broadcasted successfully'))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage }, 'Failed to broadcast Telegram notification')

      res.status(500).json(
        errorResponse(
          errorMessage,
          500
        )
      )
    }
  }
)

export default router
