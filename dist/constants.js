"use strict";
/**
 * Extension Constants
 * Defines resource limits, timeouts, and default values
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIGURATION_SECTION = exports.VIEW_IDS = exports.COMMAND_IDS = exports.EXTENSION_ID = exports.TELEMETRY_DEFAULTS = exports.DEBOUNCE_DEFAULTS = exports.CIRCUIT_BREAKER_DEFAULTS = exports.RETRY_DEFAULTS = exports.CACHE_DEFAULTS = exports.RESOURCE_LIMITS = void 0;
exports.RESOURCE_LIMITS = {
    /** Maximum file size to analyze (in characters) */
    maxFileSize: 50000,
    /** Maximum number of files in project analysis */
    maxProjectFiles: 40,
    /** Maximum file size for project analysis (in characters) */
    maxProjectFileSize: 120000,
    /** Maximum cache size (in bytes) */
    maxCacheSize: 100 * 1024 * 1024, // 100 MB
    /** Maximum queue size */
    maxQueueSize: 50,
    /** Maximum concurrent requests */
    maxConcurrentRequests: 3,
    /** Maximum retry attempts */
    maxRetries: 3,
    /** Request timeout (in milliseconds) */
    requestTimeout: 60000, // 60 seconds
    /** Health check timeout (in milliseconds) */
    healthCheckTimeout: 15000, // 15 seconds
};
exports.CACHE_DEFAULTS = {
    /** Default cache TTL (in milliseconds) */
    defaultTTL: 30 * 60 * 1000, // 30 minutes
    /** Cache cleanup interval (in milliseconds) */
    cleanupInterval: 5 * 60 * 1000, // 5 minutes
    /** Maximum cache entries */
    maxEntries: 1000,
};
exports.RETRY_DEFAULTS = {
    /** Initial retry delay (in milliseconds) */
    initialDelay: 1000, // 1 second
    /** Maximum retry delay (in milliseconds) */
    maxDelay: 30000, // 30 seconds
    /** Backoff multiplier */
    backoffMultiplier: 2,
};
exports.CIRCUIT_BREAKER_DEFAULTS = {
    /** Failure threshold to open circuit */
    failureThreshold: 5,
    /** Success threshold to close circuit */
    successThreshold: 2,
    /** Timeout for circuit breaker (in milliseconds) */
    timeout: 60000, // 60 seconds
    /** Reset timeout (in milliseconds) */
    resetTimeout: 30000, // 30 seconds
};
exports.DEBOUNCE_DEFAULTS = {
    /** Diagnostic update debounce delay (in milliseconds) */
    diagnosticUpdateDelay: 300,
    /** Configuration change debounce delay (in milliseconds) */
    configChangeDelay: 500,
};
exports.TELEMETRY_DEFAULTS = {
    /** Batch size for telemetry events */
    batchSize: 10,
    /** Flush interval (in milliseconds) */
    flushInterval: 60000, // 60 seconds
};
exports.EXTENSION_ID = 'jokalala-code-analysis';
exports.COMMAND_IDS = {
    analyzeFile: `${exports.EXTENSION_ID}.analyzeFile`,
    analyzeSelection: `${exports.EXTENSION_ID}.analyzeSelection`,
    analyzeProject: `${exports.EXTENSION_ID}.analyzeProject`,
    clearCache: `${exports.EXTENSION_ID}.clearCache`,
    showSettings: `${exports.EXTENSION_ID}.showSettings`,
    submitFeedback: `${exports.EXTENSION_ID}.submitFeedback`,
};
exports.VIEW_IDS = {
    issues: 'jokalala-issues',
    recommendations: 'jokalala-recommendations',
    metrics: 'jokalala-metrics',
};
exports.CONFIGURATION_SECTION = 'jokalala';
//# sourceMappingURL=constants.js.map