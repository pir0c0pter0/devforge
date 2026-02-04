/**
 * Time Parser Utility
 *
 * Parses natural language time expressions into Date objects.
 * Supports relative time (10m, 2h, 1d) and absolute time (15:30, tomorrow 9:00).
 */

/**
 * Parsed time result
 */
export interface ParsedTime {
  readonly date: Date;
  readonly isRelative: boolean;
  readonly originalInput: string;
}

/**
 * Relative time units with their multipliers in milliseconds
 */
const TIME_UNITS: Readonly<Record<string, number>> = {
  // Seconds
  s: 1000,
  sec: 1000,
  second: 1000,
  seconds: 1000,
  segundo: 1000,
  segundos: 1000,

  // Minutes
  m: 60 * 1000,
  min: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  minuto: 60 * 1000,
  minutos: 60 * 1000,

  // Hours
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  hora: 60 * 60 * 1000,
  horas: 60 * 60 * 1000,

  // Days
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  dia: 24 * 60 * 60 * 1000,
  dias: 24 * 60 * 60 * 1000,

  // Weeks
  w: 7 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  semana: 7 * 24 * 60 * 60 * 1000,
  semanas: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Day name mappings for "next Monday", "tomorrow", etc.
 */
const DAY_NAMES: Readonly<Record<string, number>> = {
  sunday: 0,
  domingo: 0,
  monday: 1,
  segunda: 1,
  tuesday: 2,
  terca: 2,
  wednesday: 3,
  quarta: 3,
  thursday: 4,
  quinta: 4,
  friday: 5,
  sexta: 5,
  saturday: 6,
  sabado: 6,
};

/**
 * Parse relative time input (e.g., "10m", "2h", "1d")
 *
 * @param input - Time string like "10m", "2 hours", "1d"
 * @returns Milliseconds to add, or null if not a valid relative time
 */
function parseRelativeTime(input: string): number | null {
  // Match patterns like "10m", "2 hours", "30min"
  const match = input.match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (!match) {
    return null;
  }

  const amount = parseInt(match[1] ?? '0', 10);
  const unit = (match[2] ?? '').toLowerCase();

  const multiplier = TIME_UNITS[unit];
  if (!multiplier) {
    return null;
  }

  return amount * multiplier;
}

/**
 * Parse absolute time (e.g., "15:30", "09:00")
 *
 * @param input - Time string like "15:30"
 * @param timezone - Timezone string (default: America/Sao_Paulo)
 * @returns Date object or null if invalid
 */
function parseAbsoluteTime(input: string, timezone: string): Date | null {
  // Match HH:MM format
  const match = input.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2] ?? '0', 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  // Get current date in timezone
  const now = new Date();
  const localDate = new Date(
    now.toLocaleString('en-US', { timeZone: timezone })
  );

  // Set the time
  localDate.setHours(hours, minutes, 0, 0);

  // If the time is in the past today, schedule for tomorrow
  if (localDate.getTime() <= now.getTime()) {
    localDate.setDate(localDate.getDate() + 1);
  }

  return localDate;
}

/**
 * Parse date and time (e.g., "2024-01-15 14:00", "tomorrow 9:00")
 *
 * @param input - Date/time string
 * @param timezone - Timezone string
 * @returns Date object or null if invalid
 */
function parseDateAndTime(input: string, timezone: string): Date | null {
  const lowerInput = input.toLowerCase().trim();

  // Handle "tomorrow HH:MM"
  const tomorrowMatch = lowerInput.match(/^(tomorrow|amanha|amanh[ãa])\s+(\d{1,2}:\d{2})$/);
  if (tomorrowMatch) {
    const timeStr = tomorrowMatch[2] ?? '';
    const time = parseAbsoluteTime(timeStr, timezone);
    if (time) {
      const now = new Date();
      const localNow = new Date(
        now.toLocaleString('en-US', { timeZone: timezone })
      );
      time.setDate(localNow.getDate() + 1);
      return time;
    }
  }

  // Handle day names (e.g., "monday 15:00", "segunda 10:30")
  for (const [dayName, dayNumber] of Object.entries(DAY_NAMES)) {
    const regex = new RegExp(`^${dayName}\\s+(\\d{1,2}:\\d{2})$`, 'i');
    const dayMatch = lowerInput.match(regex);
    if (dayMatch) {
      const timeStr = dayMatch[1] ?? '';
      const time = parseAbsoluteTime(timeStr, timezone);
      if (time) {
        const now = new Date();
        const currentDay = now.getDay();
        let daysToAdd = dayNumber - currentDay;
        if (daysToAdd <= 0) {
          daysToAdd += 7; // Next week
        }
        time.setDate(time.getDate() + daysToAdd - 1); // -1 because parseAbsoluteTime might add a day
        return time;
      }
    }
  }

  // Handle ISO date format "YYYY-MM-DD HH:MM"
  const isoMatch = lowerInput.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/);
  if (isoMatch) {
    const dateStr = isoMatch[1] ?? '';
    const timeStr = isoMatch[2] ?? '';

    const [year, month, day] = dateStr.split('-').map((s) => parseInt(s ?? '0', 10));
    const [hours, minutes] = timeStr.split(':').map((s) => parseInt(s ?? '0', 10));

    if (year && month && day && hours !== undefined && minutes !== undefined) {
      const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  return null;
}

/**
 * Parse time input into a Date object
 *
 * Supported formats:
 * - Relative: 10m, 2h, 1d, 30min, 2 hours
 * - Absolute: 15:30, 09:00
 * - Date+time: tomorrow 9:00, 2024-01-15 14:00
 *
 * @param input - Time string to parse
 * @param timezone - Timezone string (default: America/Sao_Paulo)
 * @returns ParsedTime object or null if invalid
 */
export function parseTime(
  input: string,
  timezone = 'America/Sao_Paulo'
): ParsedTime | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  // Try relative time first
  const relativeMs = parseRelativeTime(trimmed);
  if (relativeMs !== null) {
    const date = new Date(Date.now() + relativeMs);
    return {
      date,
      isRelative: true,
      originalInput: trimmed,
    };
  }

  // Try absolute time
  const absoluteDate = parseAbsoluteTime(trimmed, timezone);
  if (absoluteDate) {
    return {
      date: absoluteDate,
      isRelative: false,
      originalInput: trimmed,
    };
  }

  // Try date + time
  const dateTimeDate = parseDateAndTime(trimmed, timezone);
  if (dateTimeDate) {
    return {
      date: dateTimeDate,
      isRelative: false,
      originalInput: trimmed,
    };
  }

  return null;
}

/**
 * Format a Date to human-readable string in Portuguese
 *
 * @param date - Date to format
 * @param timezone - Timezone string
 * @returns Formatted string like "15:30" or "amanhã às 09:00"
 */
export function formatDateTime(date: Date, timezone = 'America/Sao_Paulo'): string {
  const now = new Date();
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));

  const timeStr = localDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  });

  // Check if same day
  const isToday =
    localDate.getDate() === localNow.getDate() &&
    localDate.getMonth() === localNow.getMonth() &&
    localDate.getFullYear() === localNow.getFullYear();

  if (isToday) {
    return timeStr;
  }

  // Check if tomorrow
  const tomorrow = new Date(localNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    localDate.getDate() === tomorrow.getDate() &&
    localDate.getMonth() === tomorrow.getMonth() &&
    localDate.getFullYear() === tomorrow.getFullYear();

  if (isTomorrow) {
    return `amanhã às ${timeStr}`;
  }

  // Format full date
  const dateStr = localDate.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
  });

  return `${dateStr} às ${timeStr}`;
}

/**
 * Calculate the delay in milliseconds from now to the target date
 *
 * @param targetDate - Target date
 * @returns Milliseconds until target, or 0 if in the past
 */
export function calculateDelay(targetDate: Date): number {
  const delay = targetDate.getTime() - Date.now();
  return Math.max(0, delay);
}

/**
 * Parse recurring type from user input
 *
 * @param input - Recurring type string (daily, weekly, monthly)
 * @returns Normalized recurring type or null
 */
export function parseRecurringType(input: string): 'daily' | 'weekly' | 'monthly' | null {
  const normalized = input.toLowerCase().trim();

  const mappings: Record<string, 'daily' | 'weekly' | 'monthly'> = {
    daily: 'daily',
    diario: 'daily',
    diário: 'daily',
    diariamente: 'daily',

    weekly: 'weekly',
    semanal: 'weekly',
    semanalmente: 'weekly',

    monthly: 'monthly',
    mensal: 'monthly',
    mensalmente: 'monthly',
  };

  return mappings[normalized] || null;
}

/**
 * Calculate next occurrence for recurring reminder
 *
 * @param lastDate - Last occurrence date
 * @param recurringType - Type of recurrence
 * @param timezone - Timezone string
 * @returns Next occurrence date
 */
export function calculateNextOccurrence(
  lastDate: Date,
  recurringType: 'daily' | 'weekly' | 'monthly',
  _timezone = 'America/Sao_Paulo'
): Date {
  const nextDate = new Date(lastDate);

  switch (recurringType) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
  }

  return nextDate;
}
