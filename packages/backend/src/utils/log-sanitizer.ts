/**
 * Docker Log Sanitization Utilities
 *
 * Sanitizes Docker logs before persistence, removing sensitive data like
 * API keys, secrets, credentials, and connection strings.
 *
 * Optimized for high-throughput: handles 1000+ logs per second.
 */

/**
 * Options for sanitization behavior
 */
export interface SanitizeOptions {
  /** Replacement text for redacted content (default: '[REDACTED]') */
  readonly redactWith?: string
  /** Preserve original length with asterisks (default: false) */
  readonly preserveLength?: boolean
}

/**
 * Log entry with content to sanitize
 */
export interface LogEntry {
  readonly content: string
  readonly [key: string]: unknown
}

/**
 * Pre-compiled regex patterns for performance
 * Using non-global where possible for faster single-match detection
 */
const PATTERNS = {
  // API Keys - OpenAI/Anthropic
  skProj: /sk-proj-[a-zA-Z0-9_-]{20,}/g,
  skAnt: /sk-ant-[a-zA-Z0-9_-]{40,}/g,
  skGeneric: /sk-[a-zA-Z0-9]{32,}/g,

  // AWS
  awsAccessKey: /AKIA[0-9A-Z]{16}/g,
  awsSecretKey: /(?:aws_secret_access_key|aws_secret_key)\s*[=:]\s*['"]?([a-zA-Z0-9/+=]{40})['"]?/gi,

  // GitHub
  ghpToken: /ghp_[a-zA-Z0-9]{36}/g,
  ghoToken: /gho_[a-zA-Z0-9]{36}/g,
  githubPat: /github_pat_[a-zA-Z0-9_]{82}/g,

  // Generic API key patterns
  genericApiKey: /(?:api[_-]?key|apikey)\s*[=:]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi,

  // Passwords and secrets
  password: /(?:password|pwd|passwd)\s*[=:]\s*['"]?([^\s'"]{4,})['"]?/gi,
  secret: /(?:secret|token|auth)\s*[=:]\s*['"]?([^\s'"]{8,})['"]?/gi,

  // Bearer and Basic auth
  bearerToken: /bearer\s+([a-zA-Z0-9_\-.]+)/gi,
  basicAuth: /basic\s+([a-zA-Z0-9+/=]+)/gi,

  // Connection strings with credentials
  postgresConn: /postgres(?:ql)?:\/\/([^:]+):([^@]+)@/gi,
  mysqlConn: /mysql:\/\/([^:]+):([^@]+)@/gi,
  mongoConn: /mongodb(?:\+srv)?:\/\/([^:]+):([^@]+)@/gi,
  redisConn: /redis:\/\/(?:([^:]+):)?([^@]+)@/gi,

  // Environment variable patterns
  envKey: /([A-Z][A-Z0-9_]*_KEY)\s*[=:]\s*['"]?([^\s'"]+)['"]?/g,
  envSecret: /([A-Z][A-Z0-9_]*_SECRET)\s*[=:]\s*['"]?([^\s'"]+)['"]?/g,
  envToken: /([A-Z][A-Z0-9_]*_TOKEN)\s*[=:]\s*['"]?([^\s'"]+)['"]?/g,
  envPassword: /([A-Z][A-Z0-9_]*_PASSWORD)\s*[=:]\s*['"]?([^\s'"]+)['"]?/g,

  // JWT tokens
  jwt: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,

  // SSH private keys
  sshPrivateKey: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
} as const

/**
 * Detection-only patterns (no global flag for performance)
 */
const DETECTION_PATTERNS = [
  /sk-proj-[a-zA-Z0-9_-]{20,}/,
  /sk-ant-[a-zA-Z0-9_-]{40,}/,
  /sk-[a-zA-Z0-9]{32,}/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /gho_[a-zA-Z0-9]{36}/,
  /github_pat_[a-zA-Z0-9_]{82}/,
  /(?:password|pwd|passwd|secret|token|auth|api[_-]?key)\s*[=:]/i,
  /bearer\s+[a-zA-Z0-9_\-.]+/i,
  /basic\s+[a-zA-Z0-9+/=]+/i,
  /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/i,
  /[A-Z][A-Z0-9_]*_(?:KEY|SECRET|TOKEN|PASSWORD)\s*[=:]/,
  /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*/,
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/,
]

const DEFAULT_REDACT = '[REDACTED]'

/**
 * Generate asterisks matching original length
 */
function preserveLengthRedaction(original: string, replacement: string): string {
  if (original.length <= replacement.length) {
    return replacement
  }
  return '*'.repeat(original.length)
}

/**
 * Create redaction replacement function
 */
function createReplacer(
  options: SanitizeOptions
): (match: string) => string {
  const redactWith = options.redactWith ?? DEFAULT_REDACT

  return (match: string): string => {
    if (options.preserveLength) {
      return preserveLengthRedaction(match, redactWith)
    }
    return redactWith
  }
}

/**
 * Create key-value redaction replacement function
 * Preserves the key but redacts the value
 */
function createKeyValueReplacer(
  options: SanitizeOptions
): (match: string, _key: string, value: string) => string {
  const redactWith = options.redactWith ?? DEFAULT_REDACT

  return (match: string, _key: string, value: string): string => {
    if (options.preserveLength && value) {
      return match.replace(value, '*'.repeat(value.length))
    }
    return match.replace(value, redactWith)
  }
}

/**
 * Create connection string redaction replacement function
 * Preserves structure but redacts credentials
 */
function createConnStringReplacer(
  options: SanitizeOptions
): (match: string, user: string, pass: string) => string {
  const redactWith = options.redactWith ?? DEFAULT_REDACT

  return (match: string, user: string, pass: string): string => {
    let result = match
    if (user) {
      result = result.replace(user, options.preserveLength ? '*'.repeat(user.length) : redactWith)
    }
    if (pass) {
      result = result.replace(pass, options.preserveLength ? '*'.repeat(pass.length) : redactWith)
    }
    return result
  }
}

/**
 * Sanitize log content by removing sensitive data
 *
 * @param content - Raw log content to sanitize
 * @param options - Sanitization options
 * @returns Sanitized content with sensitive data redacted
 *
 * @example
 * sanitizeLogContent('API_KEY=sk-proj-abc123xyz')
 * // Returns: 'API_KEY=[REDACTED]'
 *
 * @example
 * sanitizeLogContent('password=secret123', { preserveLength: true })
 * // Returns: 'password=*********'
 */
export function sanitizeLogContent(
  content: string,
  options: SanitizeOptions = {}
): string {
  if (!content || typeof content !== 'string') {
    return content
  }

  const simpleReplacer = createReplacer(options)
  const keyValueReplacer = createKeyValueReplacer(options)
  const connStringReplacer = createConnStringReplacer(options)
  const redactWith = options.redactWith ?? DEFAULT_REDACT

  let result = content

  // API Keys - direct replacement
  result = result.replace(PATTERNS.skProj, simpleReplacer)
  result = result.replace(PATTERNS.skAnt, simpleReplacer)
  result = result.replace(PATTERNS.skGeneric, simpleReplacer)
  result = result.replace(PATTERNS.awsAccessKey, simpleReplacer)
  result = result.replace(PATTERNS.ghpToken, simpleReplacer)
  result = result.replace(PATTERNS.ghoToken, simpleReplacer)
  result = result.replace(PATTERNS.githubPat, simpleReplacer)
  result = result.replace(PATTERNS.jwt, simpleReplacer)

  // AWS Secret Key (preserve key name)
  result = result.replace(PATTERNS.awsSecretKey, (match, value) => {
    if (!value) return match
    return options.preserveLength
      ? match.replace(value, '*'.repeat(value.length))
      : match.replace(value, redactWith)
  })

  // Generic API key patterns
  result = result.replace(PATTERNS.genericApiKey, (match, value) => {
    if (!value) return match
    return options.preserveLength
      ? match.replace(value, '*'.repeat(value.length))
      : match.replace(value, redactWith)
  })

  // Passwords and secrets (preserve key name)
  result = result.replace(PATTERNS.password, (match, value) => {
    if (!value) return match
    return options.preserveLength
      ? match.replace(value, '*'.repeat(value.length))
      : match.replace(value, redactWith)
  })
  result = result.replace(PATTERNS.secret, (match, value) => {
    if (!value) return match
    return options.preserveLength
      ? match.replace(value, '*'.repeat(value.length))
      : match.replace(value, redactWith)
  })

  // Bearer and Basic auth
  result = result.replace(PATTERNS.bearerToken, (match, token) => {
    if (!token) return match
    return options.preserveLength
      ? match.replace(token, '*'.repeat(token.length))
      : `Bearer ${redactWith}`
  })
  result = result.replace(PATTERNS.basicAuth, (match, token) => {
    if (!token) return match
    return options.preserveLength
      ? match.replace(token, '*'.repeat(token.length))
      : `Basic ${redactWith}`
  })

  // Connection strings
  result = result.replace(PATTERNS.postgresConn, connStringReplacer)
  result = result.replace(PATTERNS.mysqlConn, connStringReplacer)
  result = result.replace(PATTERNS.mongoConn, connStringReplacer)
  result = result.replace(PATTERNS.redisConn, (match, user, pass) => {
    // Redis may not have user, just password
    const password = pass || user
    if (!password) return match
    return options.preserveLength
      ? match.replace(password, '*'.repeat(password.length))
      : match.replace(password, redactWith)
  })

  // Environment variables
  result = result.replace(PATTERNS.envKey, keyValueReplacer)
  result = result.replace(PATTERNS.envSecret, keyValueReplacer)
  result = result.replace(PATTERNS.envToken, keyValueReplacer)
  result = result.replace(PATTERNS.envPassword, keyValueReplacer)

  // SSH private keys (always fully redact)
  result = result.replace(PATTERNS.sshPrivateKey, '[SSH_PRIVATE_KEY_REDACTED]')

  return result
}

/**
 * Sanitize a batch of log entries
 *
 * @param logs - Array of log entries to sanitize
 * @param options - Sanitization options
 * @returns New array with sanitized content (original unchanged)
 *
 * @example
 * const logs = [
 *   { content: 'Starting with API_KEY=sk-abc', timestamp: Date.now() },
 *   { content: 'Connected to postgres://user:pass@host', timestamp: Date.now() }
 * ]
 * const sanitized = sanitizeLogBatch(logs)
 * // Returns array with redacted content, original logs unchanged
 */
export function sanitizeLogBatch(
  logs: ReadonlyArray<LogEntry>,
  options: SanitizeOptions = {}
): Array<LogEntry> {
  if (!logs || !Array.isArray(logs)) {
    return []
  }

  return logs.map((log) => ({
    ...log,
    content: sanitizeLogContent(log.content, options),
  }))
}

/**
 * Check if content contains sensitive data (fast detection)
 *
 * @param content - Content to check
 * @returns True if sensitive data patterns are detected
 *
 * @example
 * isSensitive('Normal log message') // false
 * isSensitive('API_KEY=sk-proj-abc') // true
 */
export function isSensitive(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false
  }

  // Use non-global patterns for faster single-match detection
  for (const pattern of DETECTION_PATTERNS) {
    if (pattern.test(content)) {
      return true
    }
  }

  return false
}

/**
 * Count sensitive patterns found in content (useful for metrics)
 *
 * @param content - Content to analyze
 * @returns Number of sensitive pattern matches
 */
export function countSensitiveMatches(content: string): number {
  if (!content || typeof content !== 'string') {
    return 0
  }

  let count = 0

  // Check each global pattern
  for (const pattern of Object.values(PATTERNS)) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0
    const matches = content.match(pattern)
    if (matches) {
      count += matches.length
    }
  }

  return count
}

/**
 * Get list of sensitive pattern types found in content
 *
 * @param content - Content to analyze
 * @returns Array of pattern type names found
 */
export function detectSensitiveTypes(content: string): string[] {
  if (!content || typeof content !== 'string') {
    return []
  }

  const found: string[] = []

  for (const [name, pattern] of Object.entries(PATTERNS)) {
    pattern.lastIndex = 0
    if (pattern.test(content)) {
      found.push(name)
    }
  }

  return found
}
