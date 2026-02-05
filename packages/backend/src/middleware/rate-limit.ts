import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Environment variable configuration with defaults
 */
const STANDARD_LIMIT = process.env['RATE_LIMIT_STANDARD']
  ? parseInt(process.env['RATE_LIMIT_STANDARD'], 10)
  : 1000; // Local system: high limit

const STANDARD_WINDOW_MS = process.env['RATE_LIMIT_STANDARD_WINDOW_MS']
  ? parseInt(process.env['RATE_LIMIT_STANDARD_WINDOW_MS'], 10)
  : 60 * 1000; // 1 minute window

const STRICT_LIMIT = process.env['RATE_LIMIT_STRICT']
  ? parseInt(process.env['RATE_LIMIT_STRICT'], 10)
  : 500; // Local system: high limit for writes

const STRICT_WINDOW_MS = process.env['RATE_LIMIT_STRICT_WINDOW_MS']
  ? parseInt(process.env['RATE_LIMIT_STRICT_WINDOW_MS'], 10)
  : 60 * 1000; // 1 minute window

const AUTH_LIMIT = process.env['RATE_LIMIT_AUTH']
  ? parseInt(process.env['RATE_LIMIT_AUTH'], 10)
  : 50; // Local system: higher auth limit

const AUTH_WINDOW_MS = process.env['RATE_LIMIT_AUTH_WINDOW_MS']
  ? parseInt(process.env['RATE_LIMIT_AUTH_WINDOW_MS'], 10)
  : 60 * 1000; // 1 minute

/**
 * Custom error response for rate limit exceeded
 */
interface RateLimitErrorResponse {
  success: false;
  error: string;
  retryAfter: number;
  limit: number;
  remaining: number;
}

/**
 * Creates a standardized rate limit error response
 */
const createRateLimitResponse = (
  req: Request,
  res: Response,
  _next: NextFunction,
  options: Options
): void => {
  const retryAfter = Math.ceil(options.windowMs / 1000);
  const response: RateLimitErrorResponse = {
    success: false,
    error: 'Too many requests, please try again later.',
    retryAfter,
    limit: options.limit as number,
    remaining: 0,
  };

  logger.warn({
    ip: req.ip,
    path: req.path,
    method: req.method,
    limit: options.limit,
    windowMs: options.windowMs,
  }, 'Rate limit exceeded');

  res.status(429).json(response);
};

/**
 * Base configuration for all rate limiters
 */
const baseConfig: Partial<Options> = {
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: createRateLimitResponse,
  skip: (_req: Request) => {
    // Skip rate limiting in test environment
    return process.env['NODE_ENV'] === 'test';
  },
  keyGenerator: (req: Request): string => {
    // Use IP address as the key
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
};

/**
 * Standard rate limiter - 100 requests per 15 minutes
 * Use for general API endpoints (GET requests, listing, etc.)
 */
export const standardRateLimiter: RateLimitRequestHandler = rateLimit({
  ...baseConfig,
  windowMs: STANDARD_WINDOW_MS,
  limit: STANDARD_LIMIT,
  message: 'Too many requests from this IP, please try again after 15 minutes.',
});

/**
 * Strict rate limiter - 20 requests per 15 minutes
 * Use for write operations (POST, PUT, DELETE)
 */
export const strictRateLimiter: RateLimitRequestHandler = rateLimit({
  ...baseConfig,
  windowMs: STRICT_WINDOW_MS,
  limit: STRICT_LIMIT,
  message: 'Too many write requests from this IP, please try again after 15 minutes.',
});

/**
 * Auth rate limiter - 5 requests per minute
 * Use for authentication-related endpoints
 */
export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  ...baseConfig,
  windowMs: AUTH_WINDOW_MS,
  limit: AUTH_LIMIT,
  message: 'Too many authentication attempts, please try again after 1 minute.',
});

/**
 * Create a custom rate limiter with specific settings
 */
export const createRateLimiter = (
  limit: number,
  windowMs: number,
  message?: string
): RateLimitRequestHandler => {
  return rateLimit({
    ...baseConfig,
    windowMs,
    limit,
    message: message || `Too many requests, please try again later.`,
  });
};

/**
 * Export configuration for documentation/debugging
 */
export const rateLimitConfig = {
  standard: {
    limit: STANDARD_LIMIT,
    windowMs: STANDARD_WINDOW_MS,
    windowMinutes: STANDARD_WINDOW_MS / 60000,
  },
  strict: {
    limit: STRICT_LIMIT,
    windowMs: STRICT_WINDOW_MS,
    windowMinutes: STRICT_WINDOW_MS / 60000,
  },
  auth: {
    limit: AUTH_LIMIT,
    windowMs: AUTH_WINDOW_MS,
    windowMinutes: AUTH_WINDOW_MS / 60000,
  },
};
