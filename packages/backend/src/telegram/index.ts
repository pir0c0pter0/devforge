/**
 * Telegram Bot Module
 *
 * Provides Telegram bot integration for devforge.
 * Bot allows users to manage containers, send instructions to Claude,
 * and receive notifications via Telegram.
 *
 * @module telegram
 */

// Types
export type {
  SessionData,
  BotContext,
  TelegramConfig,
  CommandHandler,
  BotMiddleware,
  CommandDefinition,
  CallbackData,
  MessageOptions,
  TelegramContainerStatus,
  ITelegramService,
  NotificationType,
  NotificationPayload,
  RateLimitConfig,
} from './telegram.types'

// Service
export { telegramService, TelegramService } from './telegram.service'

// Formatters
export { markdown } from './formatters/markdown.formatter'
export { containerFormatter, type ContainerStats, type InstructionResult } from './formatters/container.formatter'
export { keyboard, parseCallbackData } from './formatters/keyboard.builder'

// Commands
export { BaseCommand } from './commands/base.command'
export type { CommandCategory } from './commands/base.command'
export {
  commandRegistry,
  initializeCommands,
  getCommandMenuDefinitions,
} from './commands'

// Handlers
export { conversationHandler, ConversationHandler, type Intent, type IntentType } from './conversation.handler'
export { messageRouter, MessageRouter } from './message.router'
export { callbackHandler, CallbackHandler } from './callback.handler'

// Services
export {
  reminderService,
  ReminderService,
  type ReminderJobData,
  type ScheduleReminderOptions,
} from './services/reminder.service'

// Workers
export {
  createReminderWorker,
  stopReminderWorker,
  getReminderWorker,
} from './workers/reminder.worker'

// Utils
export {
  parseTime,
  formatDateTime,
  calculateDelay,
  parseRecurringType,
  calculateNextOccurrence,
  type ParsedTime,
} from './utils/time-parser'
