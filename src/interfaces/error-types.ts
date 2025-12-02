/**
 * Error Types and Classification
 * Defines error types and custom error classes for the extension
 */

export enum ErrorType {
  Network = 'NETWORK_ERROR',
  Timeout = 'TIMEOUT_ERROR',
  Authentication = 'AUTH_ERROR',
  Validation = 'VALIDATION_ERROR',
  RateLimit = 'RATE_LIMIT_ERROR',
  ServerError = 'SERVER_ERROR',
  Configuration = 'CONFIGURATION_ERROR',
  Cache = 'CACHE_ERROR',
  Unknown = 'UNKNOWN_ERROR',
}

export class ExtensionError extends Error {
  public readonly type: ErrorType
  public readonly code: string | undefined
  public readonly statusCode: number | undefined
  public readonly retryable: boolean
  public readonly userMessage: string
  public readonly technicalDetails?: any

  constructor(
    type: ErrorType,
    message: string,
    options?: {
      code?: string | undefined
      statusCode?: number | undefined
      retryable?: boolean | undefined
      userMessage?: string | undefined
      technicalDetails?: any
      cause?: Error | undefined
    }
  ) {
    super(message)
    this.name = 'ExtensionError'
    this.type = type
    this.code = options?.code
    this.statusCode = options?.statusCode
    this.retryable = options?.retryable ?? false
    this.userMessage = options?.userMessage ?? message
    this.technicalDetails = options?.technicalDetails

    // Maintain proper stack trace
    if (options?.cause && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`
    }
  }

  /**
   * Create a network error
   */
  static network(message: string, cause?: Error): ExtensionError {
    return new ExtensionError(ErrorType.Network, message, {
      retryable: true,
      userMessage:
        'Unable to connect to the analysis service. Please check your internet connection.',
      ...(cause && { cause }),
    })
  }

  /**
   * Create a timeout error
   */
  static timeout(message: string, timeout: number): ExtensionError {
    return new ExtensionError(ErrorType.Timeout, message, {
      retryable: true,
      userMessage: `The analysis request timed out after ${timeout}ms. Try analyzing a smaller code selection.`,
      technicalDetails: { timeout },
    })
  }

  /**
   * Create an authentication error
   */
  static authentication(message: string): ExtensionError {
    return new ExtensionError(ErrorType.Authentication, message, {
      retryable: false,
      userMessage:
        'Authentication failed. Please check your API key in settings.',
      code: 'AUTH_FAILED',
    })
  }

  /**
   * Create a validation error
   */
  static validation(message: string, details?: any): ExtensionError {
    return new ExtensionError(ErrorType.Validation, message, {
      retryable: false,
      userMessage: 'Invalid configuration. Please review your settings.',
      technicalDetails: details,
    })
  }

  /**
   * Create a rate limit error
   */
  static rateLimit(message: string, retryAfter?: number): ExtensionError {
    return new ExtensionError(ErrorType.RateLimit, message, {
      retryable: true,
      userMessage: 'Rate limit exceeded. Please wait a moment and try again.',
      technicalDetails: { retryAfter },
    })
  }

  /**
   * Create a server error
   */
  static server(message: string, statusCode?: number): ExtensionError {
    return new ExtensionError(ErrorType.ServerError, message, {
      retryable: statusCode ? statusCode >= 500 : false,
      userMessage:
        'The analysis service encountered an error. Please try again later.',
      ...(statusCode && { statusCode }),
    })
  }

  /**
   * Create a configuration error
   */
  static configuration(message: string, details?: any): ExtensionError {
    return new ExtensionError(ErrorType.Configuration, message, {
      retryable: false,
      userMessage: 'Configuration error. Please check your settings.',
      technicalDetails: details,
    })
  }

  /**
   * Create a cache error
   */
  static cache(message: string, cause?: Error): ExtensionError {
    return new ExtensionError(ErrorType.Cache, message, {
      retryable: false,
      userMessage:
        'Cache operation failed. The extension will continue without caching.',
      ...(cause && { cause }),
    })
  }

  /**
   * Create an unknown error
   */
  static unknown(message: string, cause?: Error): ExtensionError {
    return new ExtensionError(ErrorType.Unknown, message, {
      retryable: false,
      userMessage:
        'An unexpected error occurred. Check the output channel for details.',
      ...(cause && { cause }),
    })
  }
}

/**
 * Error messages for user-facing display
 */
export const ERROR_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.Network]:
    'Unable to connect to the analysis service. Please check your internet connection.',
  [ErrorType.Timeout]:
    'The analysis request timed out. Try analyzing a smaller code selection.',
  [ErrorType.Authentication]:
    'Authentication failed. Please check your API key in settings.',
  [ErrorType.Validation]: 'Invalid configuration. Please review your settings.',
  [ErrorType.RateLimit]:
    'Rate limit exceeded. Please wait a moment and try again.',
  [ErrorType.ServerError]:
    'The analysis service encountered an error. Please try again later.',
  [ErrorType.Configuration]: 'Configuration error. Please check your settings.',
  [ErrorType.Cache]:
    'Cache operation failed. The extension will continue without caching.',
  [ErrorType.Unknown]:
    'An unexpected error occurred. Check the output channel for details.',
}
