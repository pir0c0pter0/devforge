import { z } from 'zod'

/**
 * Default allowed origins for CORS (used in development)
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]

/**
 * Parse ALLOWED_ORIGINS environment variable (comma-separated list)
 */
const parseAllowedOrigins = (value: string | undefined): string[] => {
  if (!value || value === '*') {
    return DEFAULT_ALLOWED_ORIGINS
  }
  return value.split(',').map((origin) => origin.trim()).filter(Boolean)
}

/**
 * Configuration schema with validation
 */
const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  redisUrl: z.string().url().default('redis://localhost:6379'),
  redisPassword: z.string().optional(),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  allowedOrigins: z.array(z.string()).default(DEFAULT_ALLOWED_ORIGINS),
  jobTimeout: z.coerce.number().int().positive().default(300000), // 5 minutes
  maxJobRetries: z.coerce.number().int().min(0).max(10).default(3),
  queueConcurrency: z.coerce.number().int().positive().default(5),
  rateLimit: z.object({
    windowMs: z.coerce.number().int().positive().default(60000), // 1 minute
    maxRequests: z.coerce.number().int().positive().default(100),
  }),
})

export type Config = z.infer<typeof configSchema>

/**
 * Load and validate configuration from environment variables
 */
const loadConfig = (): Config => {
  const rawConfig = {
    nodeEnv: process.env['NODE_ENV'],
    port: process.env['PORT'],
    redisUrl: process.env['REDIS_URL'],
    redisPassword: process.env['REDIS_PASSWORD'],
    logLevel: process.env['LOG_LEVEL'],
    allowedOrigins: parseAllowedOrigins(process.env['ALLOWED_ORIGINS']),
    jobTimeout: process.env['JOB_TIMEOUT'],
    maxJobRetries: process.env['MAX_JOB_RETRIES'],
    queueConcurrency: process.env['QUEUE_CONCURRENCY'],
    rateLimit: {
      windowMs: process.env['RATE_LIMIT_WINDOW_MS'],
      maxRequests: process.env['RATE_LIMIT_MAX_REQUESTS'],
    },
  }

  try {
    const validatedConfig = configSchema.parse(rawConfig)
    return validatedConfig
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Config] Validation failed:')
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`)
      })
      throw new Error('Configuration validation failed')
    }
    throw error
  }
}

/**
 * Validate required environment variables
 */
const validateRequiredEnvVars = (): void => {
  const required: Array<{ key: string; description: string }> = [
    { key: 'REDIS_URL', description: 'Redis connection URL' },
    // JWT_SECRET is optional - when not set, WebSocket auth is disabled (development mode)
  ]

  const missing = required.filter(({ key }) => !process.env[key])

  if (missing.length > 0) {
    console.error('[Config] Missing required environment variables:')
    missing.forEach(({ key, description }) => {
      console.error(`  - ${key}: ${description}`)
    })
    throw new Error('Missing required environment variables')
  }
}

/**
 * Initialize and validate configuration on startup
 */
const initializeConfig = (): Config => {
  validateRequiredEnvVars()
  const cfg = loadConfig()

  // Only log config in development to avoid polluting terminal
  if (cfg.nodeEnv === 'development') {
    // Use stderr to avoid polluting stdout in interactive sessions
    process.stderr.write(`[Config] Environment: ${cfg.nodeEnv}\n`)
    process.stderr.write(`[Config] Port: ${cfg.port}\n`)
    process.stderr.write(`[Config] Log Level: ${cfg.logLevel}\n`)
  }

  return cfg
}

/**
 * Export singleton configuration instance
 */
export const config = initializeConfig()

/**
 * Helper to check if running in production
 */
export const isProduction = (): boolean => {
  return config.nodeEnv === 'production'
}

/**
 * Helper to check if running in development
 */
export const isDevelopment = (): boolean => {
  return config.nodeEnv === 'development'
}

/**
 * Helper to check if running in test
 */
export const isTest = (): boolean => {
  return config.nodeEnv === 'test'
}
