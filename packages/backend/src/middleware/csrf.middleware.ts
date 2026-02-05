import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { logger } from '../utils/logger';

/**
 * CSRF Protection Middleware
 *
 * Implements double-submit cookie pattern:
 * 1. Server generates random token and sends it in a cookie
 * 2. Client must include the same token in X-CSRF-Token header
 * 3. Server validates cookie value matches header value
 *
 * This protects against CSRF even without session management.
 *
 * SECURITY NOTES:
 * - Token must be sent via secure, HttpOnly cookie
 * - Client reads token from separate endpoint or non-HttpOnly cookie
 * - SameSite=Strict provides additional protection
 * - Combined with CORS origin validation for defense-in-depth
 */

const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32; // 256 bits

/**
 * Generate a cryptographically secure random token
 */
const generateCsrfToken = (): string => {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
};

/**
 * Safe methods that don't require CSRF protection
 * These methods should not modify state
 */
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Paths that are exempt from CSRF validation
 * - Health checks (no state modification)
 * - Webhook endpoints (external services can't send cookies)
 * - Public API endpoints
 */
const CSRF_EXEMPT_PATHS = [
  '/health',
  '/api/health',
  '/api/telegram/webhook', // Telegram webhooks don't send cookies
  '/', // Root endpoint (read-only)
];

/**
 * Check if a path is exempt from CSRF protection
 */
const isExemptPath = (path: string): boolean => {
  return CSRF_EXEMPT_PATHS.some(exemptPath => path === exemptPath || path.startsWith(exemptPath));
};

/**
 * Middleware to generate and set CSRF token cookie
 * Should be applied globally to all requests
 *
 * This ensures every response includes a CSRF token cookie
 * that the client can use for subsequent requests.
 */
export const csrfCookieMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if token already exists in cookie
  let token = req.cookies?.[CSRF_COOKIE_NAME];

  // If no token exists, generate a new one
  if (!token) {
    token = generateCsrfToken();
    logger.debug({ path: req.path }, 'Generated new CSRF token');
  }

  // Set CSRF token cookie
  // SameSite=Strict provides CSRF protection for modern browsers
  // Secure flag requires HTTPS in production
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Client needs to read this for the header
    secure: process.env['NODE_ENV'] === 'production', // HTTPS only in production
    sameSite: 'strict', // Prevent cross-site cookie sending
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  });

  next();
};

/**
 * Middleware to validate CSRF token
 * Should be applied to state-changing routes (POST, PUT, DELETE, PATCH)
 *
 * Validates that:
 * 1. CSRF token exists in cookie
 * 2. CSRF token exists in header
 * 3. Both tokens match (double-submit verification)
 */
export const csrfValidationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip validation for safe methods
  if (SAFE_METHODS.includes(req.method)) {
    next();
    return;
  }

  // Skip validation for exempt paths
  if (isExemptPath(req.path)) {
    logger.debug({ path: req.path, method: req.method }, 'CSRF validation skipped (exempt path)');
    next();
    return;
  }

  // Get token from cookie
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

  // Get token from header
  const headerToken = req.headers[CSRF_HEADER_NAME] as string;

  // Validate token presence
  if (!cookieToken) {
    logger.warn({ path: req.path, method: req.method, ip: req.ip }, 'CSRF validation failed: no cookie token');
    res.status(403).json({
      success: false,
      error: 'CSRF token missing in cookie',
      code: 'CSRF_COOKIE_MISSING',
    });
    return;
  }

  if (!headerToken) {
    logger.warn({ path: req.path, method: req.method, ip: req.ip }, 'CSRF validation failed: no header token');
    res.status(403).json({
      success: false,
      error: 'CSRF token missing in header. Include X-CSRF-Token header.',
      code: 'CSRF_HEADER_MISSING',
    });
    return;
  }

  // Validate tokens match (double-submit verification)
  // Use timing-safe comparison to prevent timing attacks
  if (!timingSafeEqual(cookieToken, headerToken)) {
    logger.warn({ path: req.path, method: req.method, ip: req.ip }, 'CSRF validation failed: token mismatch');
    res.status(403).json({
      success: false,
      error: 'CSRF token validation failed',
      code: 'CSRF_TOKEN_INVALID',
    });
    return;
  }

  logger.debug({ path: req.path, method: req.method }, 'CSRF validation successful');
  next();
};

/**
 * Timing-safe string comparison to prevent timing attacks
 * Compares two strings in constant time regardless of where they differ
 */
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
};

/**
 * Express route handler to get CSRF token
 * Clients can call this to retrieve the current CSRF token
 *
 * This is useful for:
 * - SPAs that need to read the token on page load
 * - Mobile apps that can't read cookies
 * - Testing and debugging
 */
export const getCsrfToken = (req: Request, res: Response): void => {
  const token = req.cookies?.[CSRF_COOKIE_NAME];

  if (!token) {
    // This should not happen if csrfCookieMiddleware is applied globally
    logger.error({ path: req.path }, 'CSRF token not found in cookie');
    res.status(500).json({
      success: false,
      error: 'CSRF token not generated',
      code: 'CSRF_NOT_INITIALIZED',
    });
    return;
  }

  res.json({
    success: true,
    data: {
      csrfToken: token,
    },
  });
};
