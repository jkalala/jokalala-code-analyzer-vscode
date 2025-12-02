/**
 * Retry Utility with Exponential Backoff
 * Implements retry logic for failed requests
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number
  /** Function to determine if error is retryable */
  isRetryable?: (error: Error) => boolean
}

export interface RetryResult<T> {
  success: boolean
  result?: T | undefined
  error?: Error | undefined
  attempts: number
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  const delay = initialDelay * Math.pow(multiplier, attempt - 1)
  return Math.min(delay, maxDelay)
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Default function to determine if an error is retryable
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase()

  // Network errors are retryable
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('etimedout')
  ) {
    return true
  }

  // Rate limit errors are retryable
  if (message.includes('rate limit') || message.includes('429')) {
    return true
  }

  // Server errors (5xx) are retryable
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  ) {
    return true
  }

  // Cancelled requests are not retryable
  if (message.includes('cancel')) {
    return false
  }

  // Authentication errors are not retryable
  if (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized')
  ) {
    return false
  }

  // Validation errors are not retryable
  if (message.includes('400') || message.includes('validation')) {
    return false
  }

  return false
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    isRetryable = isRetryableError,
  } = options

  let lastError: Error | undefined
  let attempts = 0

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt

    try {
      const result = await fn()
      return {
        success: true,
        result,
        attempts,
      }
    } catch (error) {
      lastError = error as Error

      // Check if we should retry
      if (attempt < maxAttempts && isRetryable(lastError)) {
        const delay = calculateBackoffDelay(
          attempt,
          initialDelay,
          maxDelay,
          backoffMultiplier
        )

        // Wait before retrying
        await sleep(delay)
        continue
      }

      // No more retries or error is not retryable
      break
    }
  }

  return {
    success: false,
    error: lastError,
    attempts,
  }
}

/**
 * Retry decorator for class methods
 */
export function Retry(options: RetryOptions = {}) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const result = await retryWithBackoff(
        () => originalMethod.apply(this, args),
        options
      )

      if (result.success) {
        return result.result
      } else {
        throw result.error
      }
    }

    return descriptor
  }
}
