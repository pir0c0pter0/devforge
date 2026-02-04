import { Queue } from 'bullmq';
import {
  telegramReminderRepository,
  type TelegramReminder,
  type RecurringType,
} from '../repositories/telegram-reminder.repository';
import { calculateDelay, calculateNextOccurrence } from '../utils/time-parser';
import { getRedisConnection } from '../../utils/redis';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger({ service: 'reminder-service' });

/**
 * Queue name for reminder jobs
 */
const QUEUE_NAME = 'telegram-reminders';

/**
 * Reminder job data structure
 */
export interface ReminderJobData {
  readonly reminderId: string;
  readonly chatId: number;
  readonly text: string;
  readonly userId: number;
}

/**
 * Schedule reminder options
 */
export interface ScheduleReminderOptions {
  readonly text: string;
  readonly scheduledFor: Date;
  readonly timezone?: string;
  readonly recurringType?: RecurringType;
  readonly recurringValue?: string;
}

/**
 * Singleton queue instance
 */
let reminderQueue: Queue<ReminderJobData> | null = null;

/**
 * Get or create the reminder queue
 */
function getQueue(): Queue<ReminderJobData> {
  if (!reminderQueue) {
    const connection = getRedisConnection();

    reminderQueue = new Queue<ReminderJobData>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 100,
          age: 86400, // 24 hours
        },
        removeOnFail: {
          count: 50,
        },
      },
    });

    logger.info('Reminder queue created');
  }

  return reminderQueue;
}

/**
 * ReminderService - Manages reminder scheduling and processing
 *
 * Handles:
 * - Creating and scheduling reminders using BullMQ delayed jobs
 * - Cancelling reminders
 * - Processing recurring reminders
 * - User reminder management
 */
class ReminderService {
  /**
   * Schedule a new reminder
   *
   * @param userId - Telegram user ID
   * @param chatId - Telegram chat ID
   * @param options - Reminder options
   * @returns Created reminder
   */
  async scheduleReminder(
    userId: number,
    chatId: number,
    options: ScheduleReminderOptions
  ): Promise<TelegramReminder> {
    const { text, scheduledFor, timezone, recurringType, recurringValue } = options;

    // Calculate delay until scheduled time
    const delay = calculateDelay(scheduledFor);

    // Create reminder in database
    const reminder = telegramReminderRepository.create({
      userId,
      chatId,
      text,
      scheduledFor,
      timezone: timezone || 'America/Sao_Paulo',
      recurringType: recurringType || null,
      recurringValue: recurringValue || undefined,
    });

    // Create BullMQ job with delay
    const queue = getQueue();
    const jobData: ReminderJobData = {
      reminderId: reminder.id,
      chatId: reminder.chatId,
      text: reminder.text,
      userId: reminder.userId,
    };

    const job = await queue.add(
      `reminder-${reminder.id}`,
      jobData,
      {
        delay,
        jobId: reminder.id, // Use reminder ID as job ID for easy lookup
      }
    );

    // Update reminder with job ID
    telegramReminderRepository.update(reminder.id, {
      jobId: job.id,
    });

    logger.info({
      reminderId: reminder.id,
      userId,
      chatId,
      scheduledFor: scheduledFor.toISOString(),
      delay,
      recurring: recurringType,
    }, 'Reminder scheduled');

    return reminder;
  }

  /**
   * Cancel a reminder
   *
   * @param reminderId - Reminder ID
   * @param userId - User ID (for authorization)
   * @returns true if cancelled, false if not found or not owned by user
   */
  async cancelReminder(reminderId: string, userId: number): Promise<boolean> {
    const reminder = telegramReminderRepository.findById(reminderId);

    if (!reminder) {
      logger.warn({ reminderId, userId }, 'Reminder not found for cancellation');
      return false;
    }

    // Check ownership
    if (reminder.userId !== userId) {
      logger.warn({ reminderId, userId, ownerId: reminder.userId }, 'User not authorized to cancel reminder');
      return false;
    }

    // Check if already processed
    if (reminder.status !== 'pending') {
      logger.warn({ reminderId, status: reminder.status }, 'Cannot cancel non-pending reminder');
      return false;
    }

    // Remove job from queue
    if (reminder.jobId) {
      try {
        const queue = getQueue();
        const job = await queue.getJob(reminder.jobId);
        if (job) {
          await job.remove();
          logger.info({ reminderId, jobId: reminder.jobId }, 'Job removed from queue');
        }
      } catch (error) {
        logger.warn({ error, reminderId, jobId: reminder.jobId }, 'Failed to remove job from queue');
      }
    }

    // Mark as cancelled in database
    telegramReminderRepository.cancel(reminderId);

    logger.info({ reminderId, userId }, 'Reminder cancelled');
    return true;
  }

  /**
   * Get all reminders for a user
   *
   * @param userId - Telegram user ID
   * @returns Array of reminders
   */
  getUserReminders(userId: number): readonly TelegramReminder[] {
    return telegramReminderRepository.findByUserId(userId);
  }

  /**
   * Get pending reminders for a user
   *
   * @param userId - Telegram user ID
   * @returns Array of pending reminders
   */
  getPendingReminders(userId: number): readonly TelegramReminder[] {
    return telegramReminderRepository.findPendingByUserId(userId);
  }

  /**
   * Process a reminder after it's been sent
   *
   * This is called by the worker after successfully sending the reminder.
   * Handles:
   * - Marking the reminder as sent
   * - Scheduling next occurrence for recurring reminders
   *
   * @param reminderId - Reminder ID
   */
  async processReminder(reminderId: string): Promise<void> {
    const reminder = telegramReminderRepository.findById(reminderId);

    if (!reminder) {
      logger.error({ reminderId }, 'Reminder not found for processing');
      return;
    }

    // Mark as sent
    telegramReminderRepository.markAsSent(reminderId);

    logger.info({ reminderId, userId: reminder.userId }, 'Reminder marked as sent');

    // Handle recurring reminders
    if (reminder.recurringType && reminder.recurringType !== 'cron') {
      await this.rescheduleRecurring(reminder);
    }
  }

  /**
   * Reschedule a recurring reminder
   *
   * @param reminder - The reminder that was just sent
   * @returns New reminder if rescheduled, null otherwise
   */
  async rescheduleRecurring(reminder: TelegramReminder): Promise<TelegramReminder | null> {
    if (!reminder.recurringType || reminder.recurringType === 'cron') {
      return null;
    }

    // Calculate next occurrence
    const nextDate = calculateNextOccurrence(
      reminder.scheduledFor,
      reminder.recurringType,
      reminder.timezone
    );

    // Create new reminder for next occurrence
    const newReminder = await this.scheduleReminder(
      reminder.userId,
      reminder.chatId,
      {
        text: reminder.text,
        scheduledFor: nextDate,
        timezone: reminder.timezone,
        recurringType: reminder.recurringType,
        recurringValue: reminder.recurringValue || undefined,
      }
    );

    logger.info({
      originalReminderId: reminder.id,
      newReminderId: newReminder.id,
      nextDate: nextDate.toISOString(),
      recurringType: reminder.recurringType,
    }, 'Recurring reminder rescheduled');

    return newReminder;
  }

  /**
   * Mark a reminder as failed
   *
   * @param reminderId - Reminder ID
   * @param error - Error message
   */
  markAsFailed(reminderId: string, error: string): void {
    telegramReminderRepository.markAsFailed(reminderId, error);
    logger.error({ reminderId, error }, 'Reminder marked as failed');
  }

  /**
   * Get reminder by ID
   *
   * @param reminderId - Reminder ID
   * @returns Reminder or null
   */
  getReminder(reminderId: string): TelegramReminder | null {
    return telegramReminderRepository.findById(reminderId);
  }

  /**
   * Get reminder statistics for a user
   *
   * @param userId - Telegram user ID
   * @returns Statistics object
   */
  getUserStats(userId: number): {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    cancelled: number;
  } {
    return telegramReminderRepository.getUserStats(userId);
  }

  /**
   * Get the reminder queue
   * Used by the worker to process jobs
   */
  getQueue(): Queue<ReminderJobData> {
    return getQueue();
  }

  /**
   * Close the queue connection
   * Called during shutdown
   */
  async close(): Promise<void> {
    if (reminderQueue) {
      await reminderQueue.close();
      reminderQueue = null;
      logger.info('Reminder queue closed');
    }
  }
}

// Export singleton instance
export const reminderService = new ReminderService();

// Export class for testing
export { ReminderService };
