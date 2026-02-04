/**
 * Sensitive Data Redaction Utilities
 *
 * Functions to redact sensitive information from logs, outputs, and storage
 * to prevent data leakage and ensure compliance.
 */

import { logger } from './logger'

/**
 * Patterns for detecting sensitive data
 */
const SENSITIVE_PATTERNS = {
  // API Keys and Tokens
  apiKey: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,
  bearerToken: /Bearer\s+([a-zA-Z0-9_\-\.]+)/gi,
  authHeader: /(?:authorization|x-api-key)\s*[:=]\s*['"]?([^\s'"]+)['"]?/gi,

  // Specific API Keys
  anthropicKey: /sk-ant-[a-zA-Z0-9\-_]{40,}/g,
  openaiKey: /sk-[a-zA-Z0-9]{48,}/g,
  githubToken: /gh[pousr]_[a-zA-Z0-9]{36,}/g,
  awsAccessKey: /AKIA[0-9A-Z]{16}/g,
  awsSecretKey: /(?:aws[_-]?secret[_-]?(?:access[_-]?)?key)\s*[:=]\s*['"]?([a-zA-Z0-9/+=]{40})['"]?/gi,

  // Passwords
  password: /(?:password|passwd|pwd|secret)\s*[:=]\s*['"]?([^\s'"]{4,})['"]?/gi,
  connectionString: /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:([^@]+)@/gi,

  // Personal Information
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  ssn: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

  // IP Addresses (internal/private)
  privateIp: /(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})/g,

  // JWT Tokens
  jwt: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,

  // SSH Keys
  sshPrivateKey: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  sshPublicKey: /ssh-(?:rsa|dss|ed25519|ecdsa)\s+[A-Za-z0-9+/=]+/g,

  // Crypto/Wallet
  cryptoWallet: /(?:0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59})/g,

  // Environment Variables in content
  envVar: /(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*['"]?([^\s'"]+)['"]?/g,
}

/**
 * Redaction placeholder
 */
const REDACTED = '[REDACTED]'
const REDACTED_EMAIL = '[EMAIL_REDACTED]'
const REDACTED_KEY = '[KEY_REDACTED]'
const REDACTED_TOKEN = '[TOKEN_REDACTED]'
const REDACTED_PII = '[PII_REDACTED]'

/**
 * Redact sensitive data from a string
 *
 * @param input - String to redact
 * @param options - Redaction options
 * @returns Redacted string
 */
export function redactSensitiveData(
  input: string,
  options: {
    redactEmails?: boolean
    redactApiKeys?: boolean
    redactTokens?: boolean
    redactPii?: boolean
    redactEnvVars?: boolean
    preserveLength?: boolean
  } = {}
): string {
  const {
    redactEmails = true,
    redactApiKeys = true,
    redactTokens = true,
    redactPii = true,
    redactEnvVars = false, // Off by default to not break legitimate env references
  } = options

  let result = input

  // API Keys
  if (redactApiKeys) {
    result = result.replace(SENSITIVE_PATTERNS.anthropicKey, REDACTED_KEY)
    result = result.replace(SENSITIVE_PATTERNS.openaiKey, REDACTED_KEY)
    result = result.replace(SENSITIVE_PATTERNS.githubToken, REDACTED_KEY)
    result = result.replace(SENSITIVE_PATTERNS.awsAccessKey, REDACTED_KEY)
    result = result.replace(SENSITIVE_PATTERNS.awsSecretKey, (_, key) =>
      key ? `aws_secret_key=${REDACTED_KEY}` : REDACTED_KEY
    )
    result = result.replace(SENSITIVE_PATTERNS.apiKey, (match, key) =>
      match.replace(key, REDACTED_KEY)
    )
  }

  // Tokens
  if (redactTokens) {
    result = result.replace(SENSITIVE_PATTERNS.bearerToken, `Bearer ${REDACTED_TOKEN}`)
    result = result.replace(SENSITIVE_PATTERNS.jwt, REDACTED_TOKEN)
    result = result.replace(SENSITIVE_PATTERNS.authHeader, (match, token) =>
      match.replace(token, REDACTED_TOKEN)
    )
  }

  // Passwords and secrets
  if (redactApiKeys) {
    result = result.replace(SENSITIVE_PATTERNS.password, (match, pwd) =>
      match.replace(pwd, REDACTED)
    )
    result = result.replace(SENSITIVE_PATTERNS.connectionString, (match, pwd) =>
      match.replace(pwd, REDACTED)
    )
    result = result.replace(SENSITIVE_PATTERNS.sshPrivateKey, '[SSH_PRIVATE_KEY_REDACTED]')
  }

  // Personal Information
  if (redactPii) {
    result = result.replace(SENSITIVE_PATTERNS.ssn, REDACTED_PII)
    result = result.replace(SENSITIVE_PATTERNS.creditCard, REDACTED_PII)
    result = result.replace(SENSITIVE_PATTERNS.phone, REDACTED_PII)
  }

  // Emails
  if (redactEmails) {
    result = result.replace(SENSITIVE_PATTERNS.email, REDACTED_EMAIL)
  }

  // Environment variables
  if (redactEnvVars) {
    result = result.replace(SENSITIVE_PATTERNS.envVar, (match, varName, value) => {
      // Only redact if the variable name suggests it's sensitive
      const sensitiveVarPatterns = [
        /key/i,
        /secret/i,
        /password/i,
        /token/i,
        /credential/i,
        /auth/i,
      ]
      if (sensitiveVarPatterns.some((p) => p.test(varName))) {
        return match.replace(value, REDACTED)
      }
      return match
    })
  }

  return result
}

/**
 * Redact sensitive data from an object recursively
 *
 * @param obj - Object to redact
 * @param sensitiveKeys - Keys to redact values for
 * @returns Redacted object (new object, original unchanged)
 */
export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  sensitiveKeys: string[] = [
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'apikey',
    'authorization',
    'auth',
    'credential',
    'credentials',
    'privateKey',
    'private_key',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'sessionToken',
    'session_token',
    'sshKey',
    'ssh_key',
    'connectionString',
    'connection_string',
    'databaseUrl',
    'database_url',
  ]
): T {
  if (!obj || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return redactObject(item as Record<string, unknown>, sensitiveKeys)
      }
      if (typeof item === 'string') {
        return redactSensitiveData(item)
      }
      return item
    }) as unknown as T
  }

  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()

    // Check if this key should be redacted
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk.toLowerCase()))) {
      result[key] = REDACTED
      continue
    }

    // Recursively process nested objects
    if (typeof value === 'object' && value !== null) {
      result[key] = redactObject(value as Record<string, unknown>, sensitiveKeys)
    } else if (typeof value === 'string') {
      // Redact sensitive patterns in string values
      result[key] = redactSensitiveData(value)
    } else {
      result[key] = value
    }
  }

  return result as T
}

/**
 * Create a safe logging wrapper that automatically redacts sensitive data
 */
export function createSafeLogger(baseLogger: typeof logger) {
  return {
    info: (obj: Record<string, unknown>, msg?: string) => {
      baseLogger.info(redactObject(obj), msg)
    },
    warn: (obj: Record<string, unknown>, msg?: string) => {
      baseLogger.warn(redactObject(obj), msg)
    },
    error: (obj: Record<string, unknown>, msg?: string) => {
      baseLogger.error(redactObject(obj), msg)
    },
    debug: (obj: Record<string, unknown>, msg?: string) => {
      baseLogger.debug(redactObject(obj), msg)
    },
  }
}

/**
 * Redact Claude output for safe logging/storage
 *
 * @param output - Claude CLI output
 * @returns Redacted output
 */
export function redactClaudeOutput(output: string): string {
  return redactSensitiveData(output, {
    redactEmails: true,
    redactApiKeys: true,
    redactTokens: true,
    redactPii: true,
    redactEnvVars: true,
  })
}

/**
 * Check if a string contains sensitive data
 *
 * @param input - String to check
 * @returns True if sensitive data is detected
 */
export function containsSensitiveData(input: string): boolean {
  const patterns = [
    SENSITIVE_PATTERNS.anthropicKey,
    SENSITIVE_PATTERNS.openaiKey,
    SENSITIVE_PATTERNS.githubToken,
    SENSITIVE_PATTERNS.awsAccessKey,
    SENSITIVE_PATTERNS.jwt,
    SENSITIVE_PATTERNS.sshPrivateKey,
    SENSITIVE_PATTERNS.password,
    SENSITIVE_PATTERNS.ssn,
    SENSITIVE_PATTERNS.creditCard,
  ]

  for (const pattern of patterns) {
    // Reset regex state
    pattern.lastIndex = 0
    if (pattern.test(input)) {
      return true
    }
  }

  return false
}

/**
 * Mask a value showing only first and last N characters
 *
 * @param value - Value to mask
 * @param visibleStart - Characters visible at start
 * @param visibleEnd - Characters visible at end
 * @returns Masked value
 */
export function maskValue(
  value: string,
  visibleStart = 4,
  visibleEnd = 4
): string {
  if (!value || value.length <= visibleStart + visibleEnd) {
    return '***'
  }

  const start = value.slice(0, visibleStart)
  const end = value.slice(-visibleEnd)
  const maskLength = Math.min(10, value.length - visibleStart - visibleEnd)

  return `${start}${'*'.repeat(maskLength)}${end}`
}
