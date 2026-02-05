import { Redis } from 'ioredis'
import { config } from '../config'
import { createChildLogger } from './logger'

const logger = createChildLogger({ service: 'redis' })

let redisClient: Redis | null = null

/**
 * Get or create Redis connection
 * Implements singleton pattern for connection pooling
 */
export const getRedisConnection = (): Redis => {
  if (!redisClient) {
    const options = {
      maxRetriesPerRequest: null, // Required for BullMQ
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000)
        return delay
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY'
        if (err.message.includes(targetError)) {
          // Reconnect on READONLY error
          return true
        }
        return false
      },
      enableReadyCheck: true,
      lazyConnect: false,
      ...(config.redisPassword && { password: config.redisPassword }),
    }

    redisClient = new Redis(config.redisUrl, options)

    redisClient.on('connect', () => {
      logger.info('Connection established')
    })

    redisClient.on('ready', () => {
      logger.info('Client ready')
    })

    redisClient.on('error', (err: Error) => {
      logger.error({ error: err.message }, 'Connection error')
    })

    redisClient.on('close', () => {
      logger.warn('Connection closed')
    })

    redisClient.on('reconnecting', () => {
      logger.info('Attempting to reconnect...')
    })
  }

  return redisClient
}

/**
 * Close Redis connection gracefully
 */
export const closeRedisConnection = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
    logger.info('Connection closed gracefully')
  }
}

/**
 * Check if Redis connection is alive
 */
export const isRedisConnected = async (): Promise<boolean> => {
  if (!redisClient) {
    return false
  }

  try {
    const result = await redisClient.ping()
    return result === 'PONG'
  } catch {
    return false
  }
}

/**
 * Export singleton instance getter
 */
export default getRedisConnection
