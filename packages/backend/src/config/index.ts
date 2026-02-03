import { z } from 'zod'

/**
 * Configuration schema with validation
 */
const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  redisUrl: z.string().url().default('redis://localhost:6379'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  corsOrigin: z.string().default('*'),
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
    logLevel: process.env['LOG_LEVEL'],
    corsOrigin: process.env['CORS_ORIGIN'],
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

  console.info('[Config] Configuration loaded successfully')
  console.info(`[Config] Environment: ${cfg.nodeEnv}`)
  console.info(`[Config] Port: ${cfg.port}`)
  console.info(`[Config] Redis URL: ${cfg.redisUrl}`)
  console.info(`[Config] Log Level: ${cfg.logLevel}`)

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
