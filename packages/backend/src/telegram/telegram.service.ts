import { Telegraf, session } from 'telegraf'
import { Update } from 'telegraf/types'
import { createChildLogger } from '../utils/logger'
import type {
  BotContext,
  TelegramConfig,
  CommandDefinition,
  MessageOptions,
  SessionData,
  ITelegramService,
  NotificationPayload,
} from './telegram.types'
import { messageRouter } from './message.router'
import { callbackHandler } from './callback.handler'
import { initializeCommands, getCommandMenuDefinitions, commandRegistry } from './commands'

/**
 * Telegram service logger
 */
const logger = createChildLogger({ service: 'telegram' })

/**
 * Default rate limits (requests per minute)
 */
const DEFAULT_RATE_LIMITS = {
  read: 30,
  write: 5,
  critical: 2,
}

/**
 * Parse comma-separated user IDs from environment variable
 */
const parseAllowedUsers = (value: string | undefined): number[] => {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id))
}

/**
 * Load Telegram configuration from environment variables
 */
const loadTelegramConfig = (): TelegramConfig | null => {
  const token = process.env['TELEGRAM_BOT_TOKEN']

  if (!token) {
    logger.info('TELEGRAM_BOT_TOKEN not set, Telegram bot will not start')
    return null
  }

  const allowedUsers = parseAllowedUsers(process.env['TELEGRAM_ALLOWED_USERS'])

  if (allowedUsers.length === 0) {
    logger.warn('TELEGRAM_ALLOWED_USERS not set, bot will reject all users')
  }

  const config: TelegramConfig = {
    token,
    allowedUsers,
    webhookUrl: process.env['TELEGRAM_WEBHOOK_URL'],
    webhookSecret: process.env['TELEGRAM_WEBHOOK_SECRET'],
    rateLimits: {
      read: parseInt(process.env['TELEGRAM_RATE_LIMIT_READ'] || '', 10) || DEFAULT_RATE_LIMITS.read,
      write: parseInt(process.env['TELEGRAM_RATE_LIMIT_WRITE'] || '', 10) || DEFAULT_RATE_LIMITS.write,
      critical: parseInt(process.env['TELEGRAM_RATE_LIMIT_CRITICAL'] || '', 10) || DEFAULT_RATE_LIMITS.critical,
    },
  }

  return config
}

/**
 * Create default session data for new users
 */
const createDefaultSession = (userId: number, username?: string, firstName?: string, lastName?: string): SessionData => {
  return {
    userId,
    username,
    firstName,
    lastName,
    lastActivity: new Date(),
    selectedContainerId: undefined,
  }
}

/**
 * TelegramService manages the Telegram bot lifecycle and message handling.
 *
 * Features:
 * - Singleton pattern for single bot instance
 * - Session management for user context
 * - Supports both polling (dev) and webhook (prod) modes
 * - Authorization via allowed user IDs
 * - Rate limiting per operation type
 * - Graceful startup and shutdown
 */
class TelegramService implements ITelegramService {
  private bot: Telegraf<BotContext> | null = null
  private config: TelegramConfig | null = null
  private running = false
  private commands: Map<string, CommandDefinition> = new Map()
  private notificationSubscribers: Map<number, Set<string>> = new Map()

  constructor() {
    this.config = loadTelegramConfig()
  }

  /**
   * Start the Telegram bot
   * Initializes session middleware, registers commands, and starts polling/webhook
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Telegram bot is already running')
      return
    }

    if (!this.config) {
      logger.info('Telegram bot not configured, skipping start')
      return
    }

    try {
      logger.info('Starting Telegram bot')

      // Create bot instance
      this.bot = new Telegraf<BotContext>(this.config.token)

      // Initialize session middleware
      this.bot.use(session({
        defaultSession: () => createDefaultSession(0),
      }))

      // Initialize session data from context
      this.bot.use(async (ctx, next) => {
        if (ctx.from) {
          // Update or create session with user info
          ctx.session = {
            ...ctx.session,
            userId: ctx.from.id,
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name,
            lastActivity: new Date(),
          }
        }
        await next()
      })

      // Authorization middleware
      this.bot.use(async (ctx, next) => {
        const userId = ctx.from?.id

        if (!userId) {
          logger.warn('Message received without user ID')
          return
        }

        if (this.config && this.config.allowedUsers.length > 0 && !this.config.allowedUsers.includes(userId)) {
          logger.warn({ userId, username: ctx.from?.username }, 'Unauthorized user attempted access')
          await ctx.reply('Acesso negado. Você não está autorizado a usar este bot.')
          return
        }

        await next()
      })

      // Clear and re-initialize command system (for restart support)
      commandRegistry.clear()
      initializeCommands()

      // Register stored commands
      this.registerStoredCommands()

      // Register message handler (for both commands and natural language)
      this.bot.on('message', async (ctx) => {
        try {
          await messageRouter.route(ctx)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
          logger.error({ error }, 'Message handler error')
          await ctx.reply(`\u{26A0}\u{FE0F} Erro: ${errorMessage}`)
        }
      })

      // Register callback query handler (for inline keyboard buttons)
      this.bot.on('callback_query', async (ctx) => {
        try {
          await callbackHandler.handle(ctx)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
          logger.error({ error }, 'Callback handler error')
          await ctx.answerCbQuery(`\u{26A0} Erro: ${errorMessage.slice(0, 200)}`)
        }
      })

      // Error handler
      this.bot.catch((err, ctx) => {
        logger.error({ error: err, update: ctx.update }, 'Telegram bot error')
      })

      // Start bot (polling or webhook)
      if (this.config.webhookUrl) {
        await this.startWebhook()
      } else {
        await this.startPolling()
      }

      this.running = true
      logger.info('Telegram bot started successfully')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage }, 'Failed to start Telegram bot')
      throw error
    }
  }

  /**
   * Stop the Telegram bot
   */
  async stop(): Promise<void> {
    if (!this.running || !this.bot) {
      logger.debug('Telegram bot is not running')
      return
    }

    try {
      logger.info('Stopping Telegram bot')
      this.bot.stop('Graceful shutdown')
      this.running = false
      this.bot = null
      logger.info('Telegram bot stopped')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage }, 'Error stopping Telegram bot')
      throw error
    }
  }

  /**
   * Register a command handler
   * Commands are stored and registered when bot starts
   */
  registerCommand(definition: CommandDefinition): void {
    this.commands.set(definition.command, definition)

    // If bot is already running, register immediately
    if (this.bot && this.running) {
      this.bot.command(definition.command, definition.handler)
      logger.debug({ command: definition.command }, 'Command registered')
    }
  }

  /**
   * Send a message to a specific user
   */
  async sendMessage(userId: number, message: string, options?: MessageOptions): Promise<void> {
    if (!this.bot || !this.running) {
      logger.warn('Cannot send message: bot not running')
      return
    }

    try {
      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: options?.parseMode,
        link_preview_options: options?.disableLinkPreview ? { is_disabled: true } : undefined,
        reply_parameters: options?.replyToMessageId ? { message_id: options.replyToMessageId } : undefined,
      })

      logger.debug({ userId, messageLength: message.length }, 'Message sent')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ userId, error: errorMessage }, 'Failed to send message')
      throw error
    }
  }

  /**
   * Broadcast a notification to all allowed users
   */
  async broadcastNotification(payload: NotificationPayload): Promise<void> {
    if (!this.config || !this.bot || !this.running) {
      return
    }

    const message = this.formatNotification(payload)

    const sendPromises = this.config.allowedUsers.map(async (userId) => {
      try {
        await this.sendMessage(userId, message, { parseMode: 'HTML' })
      } catch (error) {
        logger.warn({ userId, error }, 'Failed to send notification to user')
      }
    })

    await Promise.allSettled(sendPromises)
  }

  /**
   * Check if the bot is running
   */
  isRunning(): boolean {
    return this.running
  }

  /**
   * Handle incoming update from webhook
   * Called by the webhook endpoint in telegram.routes.ts
   */
  async handleUpdate(update: Update): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot is not initialized')
    }

    await this.bot.handleUpdate(update)
  }

  /**
   * Get bot status information
   */
  async getStatus(): Promise<{
    isRunning: boolean
    mode: 'webhook' | 'polling' | 'not_configured'
    allowedUsers: number
    webhookUrl?: string
  }> {
    if (!this.config) {
      return {
        isRunning: false,
        mode: 'not_configured',
        allowedUsers: 0,
      }
    }

    return {
      isRunning: this.running,
      mode: this.config.webhookUrl ? 'webhook' : 'polling',
      allowedUsers: this.config.allowedUsers.length,
      webhookUrl: this.config.webhookUrl,
    }
  }

  /**
   * Get the bot instance (for testing or advanced usage)
   */
  getBot(): Telegraf<BotContext> | null {
    return this.bot
  }

  /**
   * Get configuration (for testing)
   */
  getConfig(): TelegramConfig | null {
    return this.config ? { ...this.config } : null
  }

  /**
   * Subscribe a user to notifications for a container
   */
  subscribeToContainer(userId: number, containerId: string): void {
    const userSubs = this.notificationSubscribers.get(userId) || new Set()
    userSubs.add(containerId)
    this.notificationSubscribers.set(userId, userSubs)
    logger.debug({ userId, containerId }, 'User subscribed to container notifications')
  }

  /**
   * Unsubscribe a user from container notifications
   */
  unsubscribeFromContainer(userId: number, containerId: string): void {
    const userSubs = this.notificationSubscribers.get(userId)
    if (userSubs) {
      userSubs.delete(containerId)
      if (userSubs.size === 0) {
        this.notificationSubscribers.delete(userId)
      }
    }
  }

  /**
   * Get list of users subscribed to a container
   */
  getContainerSubscribers(containerId: string): number[] {
    const subscribers: number[] = []
    for (const [userId, containers] of this.notificationSubscribers) {
      if (containers.has(containerId)) {
        subscribers.push(userId)
      }
    }
    return subscribers
  }

  /**
   * Start polling mode (for development)
   */
  private async startPolling(): Promise<void> {
    if (!this.bot) return

    logger.info('Starting Telegram bot in polling mode')

    // Launch returns a promise that resolves when polling starts
    this.bot.launch({
      dropPendingUpdates: true,
    }).catch((error) => {
      logger.error({ error }, 'Polling error')
    })

    logger.info('Telegram bot polling started')
  }

  /**
   * Start webhook mode (for production)
   */
  private async startWebhook(): Promise<void> {
    if (!this.bot || !this.config?.webhookUrl) return

    logger.info({ webhookUrl: this.config.webhookUrl }, 'Starting Telegram bot in webhook mode')

    // Set webhook
    await this.bot.telegram.setWebhook(this.config.webhookUrl, {
      secret_token: this.config.webhookSecret,
    })

    logger.info('Telegram webhook configured')
  }

  /**
   * Register all stored commands with the bot
   */
  private registerStoredCommands(): void {
    if (!this.bot) return

    for (const [command, definition] of this.commands) {
      this.bot.command(command, definition.handler)
      logger.debug({ command }, 'Command registered')
    }

    // Set commands menu in Telegram
    // Combine stored commands with auto-registered commands
    const storedCommands = Array.from(this.commands.values()).map((def) => ({
      command: def.command,
      description: def.description,
    }))
    const autoCommands = getCommandMenuDefinitions()

    // Merge, preferring stored commands (user-defined) over auto-registered
    const commandMap = new Map<string, { command: string; description: string }>()
    for (const cmd of autoCommands) {
      commandMap.set(cmd.command, cmd)
    }
    for (const cmd of storedCommands) {
      commandMap.set(cmd.command, cmd)
    }

    const commandList = Array.from(commandMap.values())

    if (commandList.length > 0) {
      this.bot.telegram.setMyCommands(commandList).catch((error) => {
        logger.warn({ error }, 'Failed to set bot commands menu')
      })
    }
  }

  /**
   * Format notification payload into a user-friendly message
   */
  private formatNotification(payload: NotificationPayload): string {
    const emoji = this.getNotificationEmoji(payload.type)
    const timestamp = payload.timestamp.toLocaleTimeString('pt-BR')

    let message = `${emoji} <b>${this.getNotificationTitle(payload.type)}</b>\n\n`

    if (payload.containerName) {
      message += `Container: <code>${payload.containerName}</code>\n`
    }

    message += `${payload.message}\n`
    message += `\n<i>${timestamp}</i>`

    return message
  }

  /**
   * Get emoji for notification type
   */
  private getNotificationEmoji(type: string): string {
    const emojis: Record<string, string> = {
      'container:started': '✅',
      'container:stopped': '⏹️',
      'container:error': '❌',
      'container:created': '🆕',
      'container:deleted': '🗑️',
      'instruction:completed': '✨',
      'instruction:failed': '⚠️',
    }
    return emojis[type] || '📢'
  }

  /**
   * Get title for notification type
   */
  private getNotificationTitle(type: string): string {
    const titles: Record<string, string> = {
      'container:started': 'Container Iniciado',
      'container:stopped': 'Container Parado',
      'container:error': 'Erro no Container',
      'container:created': 'Container Criado',
      'container:deleted': 'Container Excluído',
      'instruction:completed': 'Instrução Concluída',
      'instruction:failed': 'Instrução Falhou',
    }
    return titles[type] || 'Notificação'
  }

  /**
   * Reload configuration from environment
   * Useful for testing or dynamic config updates
   */
  reloadConfig(): void {
    const newConfig = loadTelegramConfig()
    if (newConfig) {
      this.config = newConfig
      logger.info('Telegram configuration reloaded')
    }
  }
}

/**
 * Singleton instance of TelegramService
 */
export const telegramService = new TelegramService()

/**
 * Export class for testing
 */
export { TelegramService }
