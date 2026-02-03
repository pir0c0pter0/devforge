/**
 * Default CPU limit for containers (in cores)
 */
export const DEFAULT_CPU_LIMIT = '2.0'

/**
 * Default memory limit for containers
 */
export const DEFAULT_MEMORY_LIMIT = '4G'

/**
 * Default disk limit for containers
 */
export const DEFAULT_DISK_LIMIT = '20G'

/**
 * Maximum number of containers that can be created
 */
export const MAX_CONTAINERS = 10

/**
 * Timeout for instruction execution (in milliseconds)
 * @default 5 minutes
 */
export const JOB_TIMEOUT = 5 * 60 * 1000

/**
 * Maximum number of retries for failed instructions
 */
export const MAX_RETRIES = 3

/**
 * Interval for collecting and broadcasting metrics (in milliseconds)
 * @default 5 seconds
 */
export const METRICS_INTERVAL = 5000

/**
 * WebSocket event names
 */
export const SOCKET_EVENTS = {
  CONTAINER: {
    METRICS: 'container:metrics',
    STATUS: 'container:status',
  },
  INSTRUCTION: {
    PENDING: 'instruction:pending',
    STARTED: 'instruction:started',
    PROGRESS: 'instruction:progress',
    COMPLETED: 'instruction:completed',
    FAILED: 'instruction:failed',
    CONFIRM: 'instruction:confirm',
  },
  SUBSCRIBE: {
    CONTAINER: 'subscribe:container',
    UNSUBSCRIBE: 'unsubscribe:container',
  },
} as const

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  CONTAINERS: '/api/containers',
  CONTAINER: (id: string) => `/api/containers/${id}`,
  CONTAINER_START: (id: string) => `/api/containers/${id}/start`,
  CONTAINER_STOP: (id: string) => `/api/containers/${id}/stop`,
  CONTAINER_DELETE: (id: string) => `/api/containers/${id}`,
  CONTAINER_METRICS: (id: string) => `/api/containers/${id}/metrics`,
  CONTAINER_INSTRUCTIONS: (id: string) => `/api/containers/${id}/instructions`,
  CONTAINER_QUEUE: (id: string) => `/api/containers/${id}/queue`,
} as const
