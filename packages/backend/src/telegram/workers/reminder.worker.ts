import { Worker, Job } from 'bullmq';
import type { Telegraf, Context } from 'telegraf';
import type { Update } from 'telegraf/types';
import { getRedisConnection } from '../../utils/redis';
import { reminderService, type ReminderJobData } from '../services/reminder.service';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger({ service: 'reminder-worker' });

/**
 * Queue name - must match the one in reminder.service.ts
 */
const QUEUE_NAME = 'telegram-reminders';

/**
 * Max attempts before giving up
 */
const MAX_ATTEMPTS = 3;

/**
 * Worker instance
 */
let reminderWorker: Worker<ReminderJobData> | null = null;

/**
 * Create and start the reminder worker
 *
 * @param bot - Telegraf bot instance for sending messages
 * @returns The worker instance
 */
export function createReminderWorker<C extends Context<Update>>(bot: Telegraf<C>): Worker<ReminderJobData> {
  if (reminderWorker) {
    logger.warn('Reminder worker already exists, returning existing instance');
    return reminderWorker;
  }

  const connection = getRedisConnection();

  reminderWorker = new Worker<ReminderJobData>(
    QUEUE_NAME,
    async (job: Job<ReminderJobData>) => {
      const { reminderId, chatId, text, userId } = job.data;

      logger.info({
        jobId: job.id,
        reminderId,
        chatId,
        userId,
        attemptsMade: job.attemptsMade,
      }, 'Processing reminder job');

      try {
        // Send the reminder message
        await bot.telegram.sendMessage(
          chatId,
          `\u{23F0} *Lembrete:* ${escapeMarkdown(text)}`,
          { parse_mode: 'MarkdownV2' }
        );

        logger.info({
          jobId: job.id,
          reminderId,
          chatId,
        }, 'Reminder sent successfully');

        // Mark reminder as sent and handle recurring
        await reminderService.processReminder(reminderId);

        return {
          success: true,
          sentAt: new Date(),
          reminderId,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logger.error({
          jobId: job.id,
          reminderId,
          chatId,
          error: errorMessage,
          attemptsMade: job.attemptsMade,
        }, 'Failed to send reminder');

        // Check if this is the last attempt
        if (job.attemptsMade >= MAX_ATTEMPTS - 1) {
          // Mark as permanently failed
          reminderService.markAsFailed(reminderId, errorMessage);

          // Try to notify user about the failure
          try {
            await bot.telegram.sendMessage(
              chatId,
              `\u{26A0} *Erro no lembrete*\n\nNão foi possível enviar o lembrete:\n_"${escapeMarkdown(text.slice(0, 100))}..."_\n\nErro: ${escapeMarkdown(errorMessage)}`,
              { parse_mode: 'MarkdownV2' }
            );
          } catch (notifyError) {
            logger.warn({ reminderId, notifyError }, 'Failed to notify user about reminder failure');
          }
        }

        // Re-throw to trigger BullMQ retry
        throw new Error(`Failed to send reminder: ${errorMessage}`);
      }
    },
    {
      connection,
      concurrency: 5, // Process up to 5 reminders in parallel
      limiter: {
        max: 30, // Max 30 jobs per minute (Telegram rate limit safe)
        duration: 60000,
      },
    }
  );

  // Event handlers
  reminderWorker.on('completed', (job) => {
    logger.info({
      jobId: job.id,
      reminderId: job.data.reminderId,
    }, 'Reminder job completed');
  });

  reminderWorker.on('failed', (job, error) => {
    if (job) {
      logger.error({
        jobId: job.id,
        reminderId: job.data.reminderId,
        error: error.message,
        attemptsMade: job.attemptsMade,
      }, 'Reminder job failed');
    } else {
      logger.error({ error: error.message }, 'Reminder job failed without job data');
    }
  });

  reminderWorker.on('error', (error) => {
    logger.error({ error: error.message }, 'Reminder worker error');
  });

  reminderWorker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Reminder job stalled');
  });

  logger.info('Reminder worker created and running');

  return reminderWorker;
}

/**
 * Stop the reminder worker
 */
export async function stopReminderWorker(): Promise<void> {
  if (reminderWorker) {
    logger.info('Stopping reminder worker');
    await reminderWorker.close();
    reminderWorker = null;
    logger.info('Reminder worker stopped');
  }
}

/**
 * Get the reminder worker instance
 */
export function getReminderWorker(): Worker<ReminderJobData> | null {
  return reminderWorker;
}

/**
 * Escape special characters for MarkdownV2
 */
function escapeMarkdown(text: string): string {
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let escaped = text;
  for (const char of specialChars) {
    escaped = escaped.split(char).join(`\\${char}`);
  }
  return escaped;
}
