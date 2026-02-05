import pino from 'pino';
import path from 'path';
import fs from 'fs';

// Ensure audit log directory exists
const auditLogDir = process.env['AUDIT_LOG_DIR'] || '/var/log/claude-docker';

// Create directory if it doesn't exist (with error handling for non-root environments)
try {
  if (!fs.existsSync(auditLogDir)) {
    fs.mkdirSync(auditLogDir, { recursive: true });
  }
} catch (error) {
  // Fallback to local logs directory if /var/log is not writable
  const fallbackDir = path.join(process.cwd(), 'logs', 'audit');
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  console.warn(`Cannot write to ${auditLogDir}, using fallback: ${fallbackDir}`);
}

// Determine the actual log directory to use
const getAuditLogDir = (): string => {
  try {
    fs.accessSync(auditLogDir, fs.constants.W_OK);
    return auditLogDir;
  } catch {
    return path.join(process.cwd(), 'logs', 'audit');
  }
};

const actualLogDir = getAuditLogDir();

// Create pino destination for audit logs
const auditLogPath = path.join(actualLogDir, 'audit.log');

const auditLogger = pino(
  {
    name: 'audit',
    level: 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination({
    dest: auditLogPath,
    sync: false, // Async for better performance
    mkdir: true, // Create directory if needed
  })
);

/**
 * Audit event structure for security logging
 */
export interface AuditEvent {
  action: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
}

/**
 * Sanitize sensitive data from audit logs
 * Prevents logging of passwords, tokens, secrets, etc.
 */
const sanitizeDetails = (details?: Record<string, unknown>): Record<string, unknown> | undefined => {
  if (!details) return undefined;

  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'authorization',
    'auth',
    'credential',
    'private',
    'key',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

/**
 * Log an audit event for security tracking
 * All security-relevant actions should be logged through this function
 */
export function logAuditEvent(event: AuditEvent): void {
  const sanitizedEvent = {
    ...event,
    details: sanitizeDetails(event.details),
    timestamp: new Date().toISOString(),
    service: 'claude-docker',
    version: process.env['APP_VERSION'] || 'unknown',
  };

  if (event.success) {
    auditLogger.info(sanitizedEvent, `AUDIT: ${event.action}`);
  } else {
    auditLogger.warn(sanitizedEvent, `AUDIT FAILED: ${event.action}`);
  }
}

/**
 * Predefined audit actions for consistent logging
 * Use these constants instead of raw strings for type safety
 */
export const AuditActions = {
  // Authentication events
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_FAILED: 'auth.failed',
  AUTH_TOKEN_EXPIRED: 'auth.token_expired',
  AUTH_TOKEN_INVALID: 'auth.token_invalid',

  // Container lifecycle events
  CONTAINER_CREATE: 'container.create',
  CONTAINER_DELETE: 'container.delete',
  CONTAINER_START: 'container.start',
  CONTAINER_STOP: 'container.stop',
  CONTAINER_RESTART: 'container.restart',
  CONTAINER_EXEC: 'container.exec',

  // Resource modifications
  CONTAINER_LIMITS_UPDATE: 'container.limits_update',
  CONTAINER_DISK_EXPAND: 'container.disk_expand',

  // Instructions queue
  INSTRUCTION_SEND: 'instruction.send',
  INSTRUCTION_BLOCKED: 'instruction.blocked',
  INSTRUCTION_COMPLETE: 'instruction.complete',

  // Terminal access
  TERMINAL_OPEN: 'terminal.open',
  TERMINAL_CLOSE: 'terminal.close',
  TERMINAL_COMMAND: 'terminal.command',

  // Telegram integration
  TELEGRAM_MESSAGE: 'telegram.message',
  TELEGRAM_BLOCKED: 'telegram.blocked',
  TELEGRAM_RATE_LIMITED: 'telegram.rate_limited',

  // VS Code access
  VSCODE_ACCESS: 'vscode.access',

  // API access
  API_ACCESS_DENIED: 'api.access_denied',
  API_RATE_LIMITED: 'api.rate_limited',
} as const;

/**
 * Type for audit action values
 */
export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

/**
 * Helper to extract client info from Express request
 */
export function extractClientInfo(req: {
  ip?: string;
  headers?: {
    'x-forwarded-for'?: string;
    'x-real-ip'?: string;
    'user-agent'?: string;
  };
}): { ip: string; userAgent: string } {
  const forwarded = req.headers?.['x-forwarded-for'];
  const realIp = req.headers?.['x-real-ip'];
  const directIp = req.ip;

  // Get first IP from forwarded header if present
  const ip = forwarded
    ? String(forwarded).split(',')[0]?.trim() || 'unknown'
    : realIp
      ? String(realIp)
      : directIp || 'unknown';

  const userAgent = req.headers?.['user-agent'] || 'unknown';

  return { ip, userAgent };
}

/**
 * Get the audit log file path (useful for log rotation tools)
 */
export function getAuditLogPath(): string {
  return auditLogPath;
}

/**
 * Flush audit logs (call before graceful shutdown)
 */
export function flushAuditLogs(): void {
  auditLogger.flush();
}
