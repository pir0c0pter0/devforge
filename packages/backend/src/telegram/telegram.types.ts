import { Context, Telegraf } from 'telegraf'

/**
 * Session data stored per user
 * Tracks container selection, activity, and user identity
 */
export interface SessionData {
  /** Currently selected container ID */
  selectedContainerId?: string
  /** Last activity timestamp for session management */
  lastActivity: Date
  /** Telegram user ID */
  userId: number
  /** Telegram username (optional) */
  username?: string
  /** First name (for display) */
  firstName?: string
  /** Last name (optional) */
  lastName?: string
  /** Session mode: conversation (chat with Claude) or container (manage containers) */
  mode: 'conversation' | 'container'
  /** Conversation ID for tracking Claude sessions */
  conversationId?: string
}

/**
 * Extended Context with session data
 * Used throughout the bot for typed access to session
 */
export interface BotContext extends Context {
  session: SessionData
}

/**
 * Rate limit configuration per operation type
 */
export interface RateLimitConfig {
  /** Read operations (list, status) */
  read: number
  /** Write operations (start, stop) */
  write: number
  /** Critical operations (delete, restart) */
  critical: number
}

/**
 * Telegram bot configuration
 */
export interface TelegramConfig {
  /** Bot token from @BotFather */
  token: string
  /** List of allowed Telegram user IDs (for authorization) */
  allowedUsers: number[]
  /** Webhook URL for production (optional, uses polling in dev) */
  webhookUrl?: string
  /** Webhook secret for validation (optional) */
  webhookSecret?: string
  /** Rate limit configuration */
  rateLimits: RateLimitConfig
}

/**
 * Command handler function signature
 */
export type CommandHandler = (ctx: BotContext) => Promise<void>

/**
 * Middleware function signature
 */
export type BotMiddleware = (
  ctx: BotContext,
  next: () => Promise<void>
) => Promise<void>

/**
 * Command definition for registration
 */
export interface CommandDefinition {
  /** Command name (without /) */
  command: string
  /** Description shown in /help and bot menu */
  description: string
  /** Handler function */
  handler: CommandHandler
}

/**
 * Button callback data structure
 */
export interface CallbackData {
  /** Action type */
  action: string
  /** Container ID (optional) */
  containerId?: string
  /** Additional payload */
  payload?: Record<string, unknown>
}

/**
 * Message formatting options
 */
export interface MessageOptions {
  /** Parse mode (HTML or Markdown) */
  parseMode?: 'HTML' | 'MarkdownV2'
  /** Disable link preview */
  disableLinkPreview?: boolean
  /** Reply to message ID */
  replyToMessageId?: number
}

/**
 * Container status for Telegram display
 */
export interface TelegramContainerStatus {
  id: string
  name: string
  status: 'running' | 'stopped' | 'creating' | 'error' | 'unknown'
  dockerId: string
  createdAt: Date
  cpu?: string
  memory?: string
}

/**
 * Bot service interface for dependency injection
 */
export interface ITelegramService {
  /** Start the bot */
  start(): Promise<void>
  /** Stop the bot */
  stop(): Promise<void>
  /** Register a command handler */
  registerCommand(definition: CommandDefinition): void
  /** Send a message to a user */
  sendMessage(userId: number, message: string, options?: MessageOptions): Promise<void>
  /** Check if bot is running */
  isRunning(): boolean
  /** Get bot instance (for testing) */
  getBot(): Telegraf<BotContext> | null
}

/**
 * Telegram notification types
 */
export type NotificationType =
  | 'container:started'
  | 'container:stopped'
  | 'container:error'
  | 'container:created'
  | 'container:deleted'
  | 'instruction:completed'
  | 'instruction:failed'

/**
 * Notification payload
 */
export interface NotificationPayload {
  type: NotificationType
  containerId?: string
  containerName?: string
  message: string
  timestamp: Date
  details?: Record<string, unknown>
}

// ============================================
// Conversation & Message Persistence Types
// ============================================

/**
 * Conversation mode - determines how messages are processed
 */
export type ConversationMode = 'conversation' | 'container'

/**
 * Message role - who sent the message
 */
export type MessageRole = 'user' | 'assistant' | 'system'

/**
 * Telegram conversation entity
 * Represents a conversation session with a user
 */
export interface TelegramConversation {
  /** Unique identifier */
  readonly id: string
  /** Telegram user ID */
  readonly userId: number
  /** Telegram chat ID */
  readonly chatId: number
  /** Current conversation mode */
  readonly mode: ConversationMode
  /** Associated container ID (when in container mode) */
  readonly containerId?: string
  /** Claude session ID for context continuity */
  readonly sessionId?: string
  /** Current context token count */
  readonly contextTokens: number
  /** When the conversation was created */
  readonly createdAt: Date
  /** When the conversation was last updated */
  readonly updatedAt: Date
  /** When the last message was sent */
  readonly lastMessageAt?: Date
}

/**
 * Telegram message entity
 * Represents a single message in a conversation
 */
export interface TelegramMessage {
  /** Unique identifier */
  readonly id: string
  /** Parent conversation ID */
  readonly conversationId: string
  /** Original Telegram message ID (for replies) */
  readonly telegramMessageId?: number
  /** Who sent the message */
  readonly role: MessageRole
  /** Message content */
  readonly content: string
  /** Estimated token count for context management */
  readonly tokenCount: number
  /** Additional metadata (tool calls, etc.) */
  readonly metadata?: Record<string, unknown>
  /** When the message was created */
  readonly createdAt: Date
}
