import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Environment variable configuration with defaults
 */
const CLAUDE_INSTRUCTION_LIMIT = process.env['RATE_LIMIT_CLAUDE_INSTRUCTION']
  ? parseInt(process.env['RATE_LIMIT_CLAUDE_INSTRUCTION'], 10)
  : 10;

const CLAUDE_INSTRUCTION_WINDOW_MS = process.env['RATE_LIMIT_CLAUDE_INSTRUCTION_WINDOW_MS']
  ? parseInt(process.env['RATE_LIMIT_CLAUDE_INSTRUCTION_WINDOW_MS'], 10)
  : 60 * 1000; // 1 minute

const CLAUDE_DAEMON_LIMIT = process.env['RATE_LIMIT_CLAUDE_DAEMON']
  ? parseInt(process.env['RATE_LIMIT_CLAUDE_DAEMON'], 10)
  : 5;

const CLAUDE_DAEMON_WINDOW_MS = process.env['RATE_LIMIT_CLAUDE_DAEMON_WINDOW_MS']
  ? parseInt(process.env['RATE_LIMIT_CLAUDE_DAEMON_WINDOW_MS'], 10)
  : 60 * 1000; // 1 minute

/**
 * Custom error response for rate limit exceeded
 */
interface ClaudeRateLimitErrorResponse {
  success: false;
  error: string;
  retryAfter: number;
}

/**
 * Base configuration for Claude rate limiters
 */
const baseClaudeConfig: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req: Request) => {
    // Skip rate limiting in test environment
    return process.env['NODE_ENV'] === 'test';
  },
};

/**
 * Rate limit para instruções Claude: 10 por minuto por container
 * Uses container ID as key instead of IP to prevent abuse per container
 */
export const claudeInstructionLimiter: RateLimitRequestHandler = rateLimit({
  ...baseClaudeConfig,
  windowMs: CLAUDE_INSTRUCTION_WINDOW_MS,
  limit: CLAUDE_INSTRUCTION_LIMIT,
  keyGenerator: (req: Request): string => {
    // Rate limit por container, não por IP
    return req.params['containerId'] || req.body?.containerId || req.ip || 'unknown';
  },
  handler: (req: Request, res: Response, _next: NextFunction, options: Options): void => {
    const retryAfter = Math.ceil(options.windowMs / 1000);
    const response: ClaudeRateLimitErrorResponse = {
      success: false,
      error: 'Too many instructions. Please wait before sending more.',
      retryAfter,
    };

    logger.warn({
      containerId: req.params['containerId'],
      ip: req.ip,
      limit: options.limit,
      windowMs: options.windowMs,
    }, 'Claude instruction rate limit exceeded');

    res.status(429).json(response);
  },
});

/**
 * Rate limit para operações de daemon (start/stop): 5 por minuto
 * Uses container ID as key to prevent rapid start/stop abuse
 */
export const claudeDaemonOperationLimiter: RateLimitRequestHandler = rateLimit({
  ...baseClaudeConfig,
  windowMs: CLAUDE_DAEMON_WINDOW_MS,
  limit: CLAUDE_DAEMON_LIMIT,
  keyGenerator: (req: Request): string => {
    return req.params['containerId'] || req.ip || 'unknown';
  },
  handler: (req: Request, res: Response, _next: NextFunction, options: Options): void => {
    const retryAfter = Math.ceil(options.windowMs / 1000);
    const response: ClaudeRateLimitErrorResponse = {
      success: false,
      error: 'Too many daemon operations. Please wait.',
      retryAfter,
    };

    logger.warn({
      containerId: req.params['containerId'],
      ip: req.ip,
      limit: options.limit,
      windowMs: options.windowMs,
    }, 'Claude daemon operation rate limit exceeded');

    res.status(429).json(response);
  },
});

/**
 * Export configuration for documentation/debugging
 */
export const claudeRateLimitConfig = {
  instruction: {
    limit: CLAUDE_INSTRUCTION_LIMIT,
    windowMs: CLAUDE_INSTRUCTION_WINDOW_MS,
    windowSeconds: CLAUDE_INSTRUCTION_WINDOW_MS / 1000,
  },
  daemonOperation: {
    limit: CLAUDE_DAEMON_LIMIT,
    windowMs: CLAUDE_DAEMON_WINDOW_MS,
    windowSeconds: CLAUDE_DAEMON_WINDOW_MS / 1000,
  },
};
