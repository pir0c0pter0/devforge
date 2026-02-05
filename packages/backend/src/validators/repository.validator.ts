import { z } from 'zod';
import { logger } from '../utils/logger';

/**
 * Whitelist of allowed Git hosts
 * Add your self-hosted GitLab/GitHub Enterprise if needed
 */
const ALLOWED_GIT_HOSTS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  // Add your self-hosted instances here:
  // 'gitlab.example.com',
  // 'github.enterprise.com',
] as const;

/**
 * Dangerous shell metacharacters that could enable command injection
 * These MUST be rejected in any repository URL
 */
const DANGEROUS_SHELL_CHARS = /[;&|`$(){}[\]<>\\!#'"]/;

/**
 * Characters that could be used for encoding attacks
 */
const ENCODING_ATTACK_PATTERNS = [
  /\x00/,           // Null byte
  /\\0/,            // Escaped null byte
  /%00/i,           // URL encoded null byte
  /%2e%2e/i,        // URL encoded ..
  /\r\n/,           // CRLF injection
  /%0d%0a/i,        // URL encoded CRLF
];

/**
 * Result of repository URL validation
 */
export interface RepositoryValidationResult {
  valid: boolean;
  sanitized?: string;
  error?: string;
  warnings?: string[];
}

/**
 * Validates that a URL does not contain dangerous characters
 * This check MUST happen BEFORE URL parsing as the URL class normalizes some attacks
 *
 * @param url - Raw URL string to validate
 * @returns Error message if invalid, undefined if valid
 */
function checkDangerousCharacters(url: string): string | undefined {
  // Check for dangerous shell metacharacters
  if (DANGEROUS_SHELL_CHARS.test(url)) {
    logger.warn(
      { urlPreview: url.substring(0, 50) },
      'Repository URL contains dangerous shell metacharacters'
    );
    return 'URL contains invalid characters that could be used for command injection';
  }

  // Check for encoding attacks
  for (const pattern of ENCODING_ATTACK_PATTERNS) {
    if (pattern.test(url)) {
      logger.warn(
        { urlPreview: url.substring(0, 50), pattern: pattern.toString() },
        'Repository URL contains encoding attack pattern'
      );
      return 'URL contains invalid encoded characters';
    }
  }

  return undefined;
}

/**
 * Check for path traversal attempts
 * This MUST happen BEFORE URL parsing as URL class normalizes .. segments
 *
 * @param url - Raw URL string to check
 * @returns Error message if path traversal detected, undefined otherwise
 */
function checkPathTraversal(url: string): string | undefined {
  // Check raw string for .. patterns (before URL normalization)
  const pathTraversalPatterns = [
    /\.\./,              // Literal ..
    /%2e%2e/i,           // URL encoded ..
    /%252e%252e/i,       // Double URL encoded ..
    /\.%2e/i,            // Mixed encoding .%2e
    /%2e\./i,            // Mixed encoding %2e.
  ];

  for (const pattern of pathTraversalPatterns) {
    if (pattern.test(url)) {
      logger.warn(
        { urlPreview: url.substring(0, 50) },
        'Repository URL contains path traversal attempt'
      );
      return 'Invalid repository path (path traversal detected)';
    }
  }

  return undefined;
}

/**
 * Normalize various Git URL formats to HTTPS
 *
 * Supported formats:
 * - https://github.com/user/repo
 * - https://github.com/user/repo.git
 * - git@github.com:user/repo
 * - git@github.com:user/repo.git
 * - github.com/user/repo
 *
 * @param url - Raw URL to normalize
 * @returns Normalized URL or original if no normalization needed
 */
function normalizeGitUrl(url: string): string {
  let normalized = url;

  // Convert git@host:user/repo format to https://
  // Pattern: git@<host>:<path>
  const sshMatch = normalized.match(
    /^git@([\w.-]+):([\w.-]+(?:\/[\w.-]+)+?)(?:\.git)?$/
  );
  if (sshMatch) {
    const [, host, path] = sshMatch;
    normalized = `https://${host}/${path}`;
  }

  // Add https:// if URL starts with known host without protocol
  const knownHostsPattern = new RegExp(
    `^(${ALLOWED_GIT_HOSTS.map(h => h.replace('.', '\\.')).join('|')})/`
  );
  if (knownHostsPattern.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  return normalized;
}

/**
 * Validate repository path format
 *
 * Valid formats:
 * - /user/repo
 * - /user/repo.git
 * - /org/group/repo (GitLab subgroups)
 *
 * @param pathname - URL pathname to validate
 * @returns Error message if invalid, undefined if valid
 */
function validatePathFormat(pathname: string): string | undefined {
  // Minimum: /org/repo (2 segments)
  // Maximum: Allow multiple levels for GitLab subgroups
  // Characters: alphanumeric, dash, underscore, dot
  const pathPattern = /^\/[\w.-]+(?:\/[\w.-]+)+(?:\.git)?$/;

  if (!pathPattern.test(pathname)) {
    return 'Invalid repository path format. Expected: /org/repo or /org/repo.git';
  }

  // Additional validation: check each segment
  const segments = pathname.split('/').filter(s => s.length > 0);

  // Minimum 2 segments (org/repo)
  if (segments.length < 2) {
    return 'Repository path must include at least organization and repository name';
  }

  // Maximum 10 segments (reasonable limit for subgroups)
  if (segments.length > 10) {
    return 'Repository path has too many segments';
  }

  // Validate each segment
  for (const segment of segments) {
    // No empty segments
    if (segment.length === 0) {
      return 'Repository path contains empty segments';
    }

    // No hidden files/directories (starting with .)
    if (segment.startsWith('.') && segment !== '.git') {
      return 'Repository path cannot contain hidden directories';
    }

    // No special segments
    if (segment === '.' || segment === '..') {
      return 'Invalid repository path (path traversal detected)';
    }

    // Segment length limit
    if (segment.length > 100) {
      return 'Repository path segment too long';
    }

    // Remove .git suffix for final segment check
    const cleanSegment = segment.replace(/\.git$/, '');

    // Validate characters (more strict after normalization)
    if (!/^[\w.-]+$/.test(cleanSegment)) {
      return 'Repository path contains invalid characters';
    }
  }

  return undefined;
}

/**
 * Validates and sanitizes a repository URL
 *
 * Security checks performed:
 * 1. Empty/whitespace URL rejection
 * 2. Dangerous shell metacharacter detection (command injection prevention)
 * 3. Encoding attack detection (null bytes, URL encoding attacks)
 * 4. Path traversal detection (BEFORE URL parsing)
 * 5. Protocol whitelist (only HTTPS and git://)
 * 6. Hostname whitelist (github.com, gitlab.com, bitbucket.org)
 * 7. Path format validation
 * 8. Query string and fragment removal
 *
 * @param url - The repository URL to validate
 * @returns Validation result with sanitized URL if valid
 */
export function validateRepositoryUrl(url: string): RepositoryValidationResult {
  // 1. Handle empty or whitespace-only URLs
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Repository URL is required' };
  }

  const trimmedUrl = url.trim();

  if (trimmedUrl === '') {
    return { valid: false, error: 'Repository URL is required' };
  }

  // 2. Length limit (prevent DoS)
  if (trimmedUrl.length > 2000) {
    return { valid: false, error: 'Repository URL is too long' };
  }

  // 3. Check for dangerous characters BEFORE any parsing
  const dangerousCharError = checkDangerousCharacters(trimmedUrl);
  if (dangerousCharError) {
    return { valid: false, error: dangerousCharError };
  }

  // 4. Check for path traversal BEFORE URL parsing
  const pathTraversalError = checkPathTraversal(trimmedUrl);
  if (pathTraversalError) {
    return { valid: false, error: pathTraversalError };
  }

  try {
    // 5. Normalize URL format
    const normalizedUrl = normalizeGitUrl(trimmedUrl);

    // 6. Parse as URL
    let parsed: URL;
    try {
      parsed = new URL(normalizedUrl);
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }

    // 7. Protocol whitelist
    if (!['https:', 'git:'].includes(parsed.protocol)) {
      logger.warn(
        { urlPreview: trimmedUrl.substring(0, 50), protocol: parsed.protocol },
        'Repository URL uses disallowed protocol'
      );
      return {
        valid: false,
        error: `Only HTTPS and git:// protocols are allowed. Got: ${parsed.protocol}`,
      };
    }

    // 8. Hostname whitelist
    const hostname = parsed.hostname.toLowerCase();
    if (!ALLOWED_GIT_HOSTS.includes(hostname as typeof ALLOWED_GIT_HOSTS[number])) {
      logger.warn(
        { urlPreview: trimmedUrl.substring(0, 50), hostname },
        'Repository URL uses non-whitelisted host'
      );
      return {
        valid: false,
        error: `Git host '${hostname}' is not allowed. Allowed hosts: ${ALLOWED_GIT_HOSTS.join(', ')}`,
      };
    }

    // 9. Validate path format
    const pathError = validatePathFormat(parsed.pathname);
    if (pathError) {
      logger.warn(
        { urlPreview: trimmedUrl.substring(0, 50), pathname: parsed.pathname },
        'Repository URL has invalid path format'
      );
      return { valid: false, error: pathError };
    }

    // 10. Build sanitized URL
    // - Remove query strings (could contain credentials or injection payloads)
    // - Remove fragments
    // - Remove .git suffix (will be added consistently during clone)
    // - Force HTTPS protocol
    let sanitizedPath = parsed.pathname;
    sanitizedPath = sanitizedPath.replace(/\.git$/, '');

    const sanitized = `https://${hostname}${sanitizedPath}`;

    // 11. Collect warnings
    const warnings: string[] = [];
    if (parsed.search) {
      warnings.push('Query parameters were removed from URL');
    }
    if (parsed.hash) {
      warnings.push('Fragment was removed from URL');
    }
    if (parsed.username || parsed.password) {
      warnings.push('Credentials were removed from URL');
      logger.warn(
        { urlPreview: trimmedUrl.substring(0, 30) },
        'Repository URL contained embedded credentials which were removed'
      );
    }

    logger.debug(
      { originalUrl: trimmedUrl.substring(0, 50), sanitizedUrl: sanitized },
      'Repository URL validated successfully'
    );

    return {
      valid: true,
      sanitized,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    logger.error(
      { error, urlPreview: trimmedUrl.substring(0, 50) },
      'Repository URL validation error'
    );
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Sanitize repository URL - throws on invalid URL
 * Use this when you need a simple string return or exception
 *
 * @param url - The repository URL to validate
 * @returns Sanitized URL string
 * @throws Error if URL is invalid
 */
export function sanitizeRepositoryUrl(url: string): string {
  const result = validateRepositoryUrl(url);

  if (!result.valid) {
    throw new Error(result.error || 'Invalid repository URL');
  }

  return result.sanitized!;
}

/**
 * Get the list of allowed Git hosts
 * Useful for displaying in error messages or UI
 */
export function getAllowedGitHosts(): readonly string[] {
  return ALLOWED_GIT_HOSTS;
}

/**
 * Check if a hostname is in the allowed list
 */
export function isAllowedGitHost(hostname: string): boolean {
  return ALLOWED_GIT_HOSTS.includes(
    hostname.toLowerCase() as typeof ALLOWED_GIT_HOSTS[number]
  );
}

/**
 * Zod schema for repository URL validation
 * Use this for input validation in routes
 */
export const repositoryUrlSchema = z
  .string()
  .min(1, 'Repository URL is required')
  .max(2000, 'Repository URL is too long')
  .refine(
    (url) => {
      const result = validateRepositoryUrl(url);
      return result.valid;
    },
    (url) => {
      const result = validateRepositoryUrl(url);
      return { message: result.error || 'Invalid repository URL' };
    }
  )
  .transform((url) => {
    const result = validateRepositoryUrl(url);
    return result.sanitized!;
  });

/**
 * Optional repository URL schema (for update operations)
 */
export const optionalRepositoryUrlSchema = z
  .string()
  .max(2000, 'Repository URL is too long')
  .optional()
  .refine(
    (url) => {
      if (!url) return true;
      const result = validateRepositoryUrl(url);
      return result.valid;
    },
    (url) => {
      if (!url) return { message: '' };
      const result = validateRepositoryUrl(url);
      return { message: result.error || 'Invalid repository URL' };
    }
  )
  .transform((url) => {
    if (!url) return undefined;
    const result = validateRepositoryUrl(url);
    return result.sanitized!;
  });
