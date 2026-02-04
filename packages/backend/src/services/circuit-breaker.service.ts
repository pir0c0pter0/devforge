/**
 * Circuit Breaker Service
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * when external services or operations fail repeatedly.
 */

import { EventEmitter } from 'events'
import { logger } from '../utils/logger'

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open'

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number
  /** Time in ms to wait before attempting recovery */
  recoveryTimeout: number
  /** Number of successful calls in half-open state to close circuit */
  successThreshold: number
  /** Time window in ms to track failures */
  failureWindowMs: number
  /** Optional name for logging */
  name?: string
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 30_000, // 30 seconds
  successThreshold: 3,
  failureWindowMs: 60_000, // 1 minute
  name: 'default',
}

/**
 * Circuit breaker statistics
 */
export interface CircuitStats {
  state: CircuitState
  failures: number
  successes: number
  lastFailure?: Date
  lastSuccess?: Date
  lastStateChange: Date
  totalRequests: number
  totalFailures: number
  totalSuccesses: number
}

/**
 * Circuit breaker events
 */
export interface CircuitBreakerEvents {
  'state-change': (state: CircuitState, previousState: CircuitState) => void
  'failure': (error: Error) => void
  'success': () => void
  'rejected': () => void
  'recovery-start': () => void
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = 'closed'
  private failures: number[] = []
  private halfOpenSuccesses = 0
  private lastStateChange = new Date()
  private recoveryTimer?: NodeJS.Timeout
  private totalRequests = 0
  private totalFailures = 0
  private totalSuccesses = 0
  private lastFailure?: Date
  private lastSuccess?: Date

  constructor(private config: CircuitBreakerConfig = DEFAULT_CONFIG) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Get circuit statistics
   */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failures: this.failures.length,
      successes: this.halfOpenSuccesses,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    }
  }

  /**
   * Check if circuit allows requests
   */
  canExecute(): boolean {
    this.cleanupOldFailures()

    switch (this.state) {
      case 'closed':
        return true
      case 'open':
        return false
      case 'half-open':
        return true
      default:
        return true
    }
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++

    if (!this.canExecute()) {
      this.emit('rejected')
      logger.warn(
        { circuit: this.config.name, state: this.state },
        'Circuit breaker rejected request'
      )
      throw new CircuitOpenError(
        `Circuit breaker is ${this.state}`,
        this.config.recoveryTimeout
      )
    }

    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  /**
   * Record a successful execution
   */
  recordSuccess(): void {
    this.totalSuccesses++
    this.lastSuccess = new Date()
    this.emit('success')

    if (this.state === 'half-open') {
      this.halfOpenSuccesses++
      logger.debug(
        {
          circuit: this.config.name,
          halfOpenSuccesses: this.halfOpenSuccesses,
          threshold: this.config.successThreshold,
        },
        'Circuit breaker half-open success recorded'
      )

      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.transitionTo('closed')
      }
    } else if (this.state === 'closed') {
      // Clear failures on success in closed state
      this.failures = []
    }
  }

  /**
   * Record a failed execution
   */
  recordFailure(error: Error): void {
    this.totalFailures++
    this.lastFailure = new Date()
    this.failures.push(Date.now())
    this.emit('failure', error)

    logger.debug(
      {
        circuit: this.config.name,
        state: this.state,
        failures: this.failures.length,
        threshold: this.config.failureThreshold,
        error: error.message,
      },
      'Circuit breaker failure recorded'
    )

    if (this.state === 'half-open') {
      // Any failure in half-open state reopens the circuit
      this.transitionTo('open')
      return
    }

    // Check if we should open the circuit
    this.cleanupOldFailures()
    if (this.failures.length >= this.config.failureThreshold) {
      this.transitionTo('open')
    }
  }

  /**
   * Force circuit to a specific state (for testing/admin)
   */
  forceState(state: CircuitState): void {
    logger.warn(
      { circuit: this.config.name, from: this.state, to: state },
      'Circuit breaker state forced'
    )
    this.transitionTo(state)
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.clearRecoveryTimer()
    this.failures = []
    this.halfOpenSuccesses = 0
    this.transitionTo('closed')
    logger.info({ circuit: this.config.name }, 'Circuit breaker reset')
  }

  /**
   * Clean up old failures outside the window
   */
  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs
    this.failures = this.failures.filter((ts) => ts > cutoff)
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return

    const previousState = this.state
    this.state = newState
    this.lastStateChange = new Date()

    logger.info(
      { circuit: this.config.name, from: previousState, to: newState },
      'Circuit breaker state changed'
    )

    this.emit('state-change', newState, previousState)

    // Handle state-specific logic
    switch (newState) {
      case 'open':
        this.startRecoveryTimer()
        break
      case 'half-open':
        this.halfOpenSuccesses = 0
        this.emit('recovery-start')
        break
      case 'closed':
        this.clearRecoveryTimer()
        this.failures = []
        this.halfOpenSuccesses = 0
        break
    }
  }

  /**
   * Start the recovery timer for transitioning from open to half-open
   */
  private startRecoveryTimer(): void {
    this.clearRecoveryTimer()

    this.recoveryTimer = setTimeout(() => {
      if (this.state === 'open') {
        logger.info(
          { circuit: this.config.name },
          'Circuit breaker attempting recovery (half-open)'
        )
        this.transitionTo('half-open')
      }
    }, this.config.recoveryTimeout)
  }

  /**
   * Clear the recovery timer
   */
  private clearRecoveryTimer(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer)
      this.recoveryTimer = undefined
    }
  }

  /**
   * Cleanup when no longer needed
   */
  destroy(): void {
    this.clearRecoveryTimer()
    this.removeAllListeners()
  }
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public retryAfter: number
  ) {
    super(message)
    this.name = 'CircuitOpenError'
  }
}

/**
 * Circuit breaker registry for managing multiple circuits
 */
class CircuitBreakerRegistry {
  private circuits = new Map<string, CircuitBreaker>()

  /**
   * Get or create a circuit breaker
   */
  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let circuit = this.circuits.get(name)

    if (!circuit) {
      circuit = new CircuitBreaker({ ...DEFAULT_CONFIG, ...config, name })
      this.circuits.set(name, circuit)

      // Log state changes
      circuit.on('state-change', (state, previousState) => {
        logger.info(
          { circuit: name, from: previousState, to: state },
          'Circuit breaker state changed'
        )
      })
    }

    return circuit
  }

  /**
   * Get a circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.circuits.get(name)
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats(): Record<string, CircuitStats> {
    const stats: Record<string, CircuitStats> = {}

    this.circuits.forEach((circuit, name) => {
      stats[name] = circuit.getStats()
    })

    return stats
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.circuits.forEach((circuit) => circuit.reset())
  }

  /**
   * Destroy all circuit breakers
   */
  destroyAll(): void {
    this.circuits.forEach((circuit) => circuit.destroy())
    this.circuits.clear()
  }
}

/**
 * Global circuit breaker registry
 */
export const circuitBreakerRegistry = new CircuitBreakerRegistry()

/**
 * Pre-configured circuit breakers for common services
 */
export const circuitBreakers = {
  /** Circuit breaker for Claude daemon operations */
  claudeDaemon: circuitBreakerRegistry.getOrCreate('claude-daemon', {
    failureThreshold: 3,
    recoveryTimeout: 30_000,
    successThreshold: 2,
  }),

  /** Circuit breaker for Docker operations */
  docker: circuitBreakerRegistry.getOrCreate('docker', {
    failureThreshold: 5,
    recoveryTimeout: 60_000,
    successThreshold: 3,
  }),

  /** Circuit breaker for Redis operations */
  redis: circuitBreakerRegistry.getOrCreate('redis', {
    failureThreshold: 3,
    recoveryTimeout: 15_000,
    successThreshold: 2,
  }),

  /** Circuit breaker for external API calls */
  externalApi: circuitBreakerRegistry.getOrCreate('external-api', {
    failureThreshold: 5,
    recoveryTimeout: 60_000,
    successThreshold: 3,
  }),
}
