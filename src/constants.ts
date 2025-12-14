/**
 * Extension Constants
 * Defines resource limits, timeouts, and default values
 */

export const RESOURCE_LIMITS = {
  /** Maximum file size to analyze (in characters) */
  maxFileSize: 50_000,

  /** Maximum number of files in project analysis */
  maxProjectFiles: 40,

  /** Maximum file size for project analysis (in characters) */
  maxProjectFileSize: 120_000,

  /** Maximum cache size (in bytes) */
  maxCacheSize: 100 * 1024 * 1024, // 100 MB

  /** Maximum queue size */
  maxQueueSize: 50,

  /** Maximum concurrent requests */
  maxConcurrentRequests: 3,

  /** Maximum retry attempts */
  maxRetries: 3,

  /** Request timeout (in milliseconds) */
  requestTimeout: 60_000, // 60 seconds

  /** Health check timeout (in milliseconds) */
  healthCheckTimeout: 15_000, // 15 seconds
} as const

export const CACHE_DEFAULTS = {
  /** Default cache TTL (in milliseconds) */
  defaultTTL: 30 * 60 * 1000, // 30 minutes

  /** Cache cleanup interval (in milliseconds) */
  cleanupInterval: 5 * 60 * 1000, // 5 minutes

  /** Maximum cache entries */
  maxEntries: 1000,
} as const

export const RETRY_DEFAULTS = {
  /** Initial retry delay (in milliseconds) */
  initialDelay: 1000, // 1 second

  /** Maximum retry delay (in milliseconds) */
  maxDelay: 30_000, // 30 seconds

  /** Backoff multiplier */
  backoffMultiplier: 2,
} as const

export const CIRCUIT_BREAKER_DEFAULTS = {
  /** Failure threshold to open circuit */
  failureThreshold: 5,

  /** Success threshold to close circuit */
  successThreshold: 2,

  /** Timeout for circuit breaker (in milliseconds) */
  timeout: 60_000, // 60 seconds

  /** Reset timeout (in milliseconds) */
  resetTimeout: 30_000, // 30 seconds
} as const

export const DEBOUNCE_DEFAULTS = {
  /** Diagnostic update debounce delay (in milliseconds) */
  diagnosticUpdateDelay: 300,

  /** Configuration change debounce delay (in milliseconds) */
  configChangeDelay: 500,
} as const

export const TELEMETRY_DEFAULTS = {
  /** Batch size for telemetry events */
  batchSize: 10,

  /** Flush interval (in milliseconds) */
  flushInterval: 60_000, // 60 seconds
} as const

export const EXTENSION_ID = 'jokalala-code-analysis' as const

export const COMMAND_IDS = {
  analyzeFile: `${EXTENSION_ID}.analyzeFile`,
  analyzeSelection: `${EXTENSION_ID}.analyzeSelection`,
  analyzeProject: `${EXTENSION_ID}.analyzeProject`,
  clearCache: `${EXTENSION_ID}.clearCache`,
  showSettings: `${EXTENSION_ID}.showSettings`,
  submitFeedback: `${EXTENSION_ID}.submitFeedback`,
} as const

export const VIEW_IDS = {
  issues: 'jokalala-issues',
  recommendations: 'jokalala-recommendations',
  metrics: 'jokalala-metrics',
} as const

export const CONFIGURATION_SECTION = 'jokalala' as const
