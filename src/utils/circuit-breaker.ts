/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by tracking failure rates and opening the circuit
 */

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Circuit is open, requests fail immediately
  HALF_OPEN = 'HALF_OPEN', // Testing if service has recovered
}

export interface CircuitBreakerOptions {
  /** Failure threshold to open the circuit (default: 5) */
  failureThreshold?: number
  /** Success threshold to close the circuit from half-open (default: 2) */
  successThreshold?: number
  /** Time in ms to wait before attempting recovery (default: 60000) */
  timeout?: number
  /** Window size in ms for tracking failures (default: 60000) */
  windowSize?: number
}

export interface CircuitBreakerStats {
  state: CircuitState
  failures: number
  successes: number
  lastFailureTime?: number | undefined
  lastSuccessTime?: number | undefined
  nextAttemptTime?: number | undefined
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public state: CircuitState
  ) {
    super(message)
    this.name = 'CircuitBreakerError'
  }
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failures: number = 0
  private successes: number = 0
  private lastFailureTime: number | undefined
  private lastSuccessTime: number | undefined
  private nextAttemptTime: number | undefined
  private failureTimestamps: number[] = []

  private readonly failureThreshold: number
  private readonly successThreshold: number
  private readonly timeout: number
  private readonly windowSize: number

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions = {}
  ) {
    this.failureThreshold = options.failureThreshold || 5
    this.successThreshold = options.successThreshold || 2
    this.timeout = options.timeout || 60000 // 1 minute
    this.windowSize = options.windowSize || 60000 // 1 minute
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has elapsed
      if (this.nextAttemptTime && Date.now() >= this.nextAttemptTime) {
        this.state = CircuitState.HALF_OPEN
        this.successes = 0
      } else {
        throw new CircuitBreakerError(
          `Circuit breaker is OPEN for ${this.name}. Next attempt at ${new Date(
            this.nextAttemptTime || 0
          ).toISOString()}`,
          CircuitState.OPEN
        )
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now()

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++

      if (this.successes >= this.successThreshold) {
        this.close()
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failures = 0
      this.failureTimestamps = []
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.lastFailureTime = Date.now()
    this.failures++
    this.failureTimestamps.push(Date.now())

    // Remove old failures outside the window
    this.cleanupOldFailures()

    if (this.state === CircuitState.HALF_OPEN) {
      // If a failure occurs in half-open state, reopen the circuit
      this.open()
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we've exceeded the failure threshold
      if (this.failureTimestamps.length >= this.failureThreshold) {
        this.open()
      }
    }
  }

  /**
   * Remove failures outside the time window
   */
  private cleanupOldFailures(): void {
    const cutoffTime = Date.now() - this.windowSize
    this.failureTimestamps = this.failureTimestamps.filter(
      timestamp => timestamp > cutoffTime
    )
  }

  /**
   * Open the circuit
   */
  private open(): void {
    this.state = CircuitState.OPEN
    this.nextAttemptTime = Date.now() + this.timeout
  }

  /**
   * Close the circuit
   */
  private close(): void {
    this.state = CircuitState.CLOSED
    this.failures = 0
    this.successes = 0
    this.failureTimestamps = []
    this.nextAttemptTime = undefined
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const stats: CircuitBreakerStats = {
      state: this.state,
      failures: this.failureTimestamps.length,
      successes: this.successes,
    }

    if (this.lastFailureTime !== undefined) {
      stats.lastFailureTime = this.lastFailureTime
    }

    if (this.lastSuccessTime !== undefined) {
      stats.lastSuccessTime = this.lastSuccessTime
    }

    if (this.nextAttemptTime !== undefined) {
      stats.nextAttemptTime = this.nextAttemptTime
    }

    return stats
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED
    this.failures = 0
    this.successes = 0
    this.failureTimestamps = []
    this.lastFailureTime = undefined
    this.lastSuccessTime = undefined
    this.nextAttemptTime = undefined
  }

  /**
   * Get the current state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Check if the circuit is open
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN
  }

  /**
   * Check if the circuit is closed
   */
  isClosed(): boolean {
    return this.state === CircuitState.CLOSED
  }

  /**
   * Check if the circuit is half-open
   */
  isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers for different endpoints
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map()

  /**
   * Get or create a circuit breaker for an endpoint
   */
  getBreaker(
    endpoint: string,
    options?: CircuitBreakerOptions
  ): CircuitBreaker {
    if (!this.breakers.has(endpoint)) {
      this.breakers.set(endpoint, new CircuitBreaker(endpoint, options))
    }
    return this.breakers.get(endpoint)!
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    endpoint: string,
    fn: () => Promise<T>,
    options?: CircuitBreakerOptions
  ): Promise<T> {
    const breaker = this.getBreaker(endpoint, options)
    return breaker.execute(fn)
  }

  /**
   * Get statistics for all circuit breakers
   */
  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>()
    for (const [endpoint, breaker] of this.breakers.entries()) {
      stats.set(endpoint, breaker.getStats())
    }
    return stats
  }

  /**
   * Reset a specific circuit breaker
   */
  reset(endpoint: string): void {
    const breaker = this.breakers.get(endpoint)
    if (breaker) {
      breaker.reset()
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset()
    }
  }
}
