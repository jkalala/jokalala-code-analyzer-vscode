"use strict";
/**
 * Retry Utility with Exponential Backoff
 * Implements retry logic for failed requests
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateBackoffDelay = calculateBackoffDelay;
exports.sleep = sleep;
exports.isRetryableError = isRetryableError;
exports.retryWithBackoff = retryWithBackoff;
exports.Retry = Retry;
/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt, initialDelay, maxDelay, multiplier) {
    const delay = initialDelay * Math.pow(multiplier, attempt - 1);
    return Math.min(delay, maxDelay);
}
/**
 * Sleep for a specified duration
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Default function to determine if an error is retryable
 */
function isRetryableError(error) {
    const message = error.message.toLowerCase();
    // Network errors are retryable
    if (message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('etimedout')) {
        return true;
    }
    // Rate limit errors are retryable
    if (message.includes('rate limit') || message.includes('429')) {
        return true;
    }
    // Server errors (5xx) are retryable
    if (message.includes('500') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')) {
        return true;
    }
    // Cancelled requests are not retryable
    if (message.includes('cancel')) {
        return false;
    }
    // Authentication errors are not retryable
    if (message.includes('401') ||
        message.includes('403') ||
        message.includes('unauthorized')) {
        return false;
    }
    // Validation errors are not retryable
    if (message.includes('400') || message.includes('validation')) {
        return false;
    }
    return false;
}
/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff(fn, options = {}) {
    const { maxAttempts = 3, initialDelay = 1000, maxDelay = 30000, backoffMultiplier = 2, isRetryable = isRetryableError, } = options;
    let lastError;
    let attempts = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        attempts = attempt;
        try {
            const result = await fn();
            return {
                success: true,
                result,
                attempts,
            };
        }
        catch (error) {
            lastError = error;
            // Check if we should retry
            if (attempt < maxAttempts && isRetryable(lastError)) {
                const delay = calculateBackoffDelay(attempt, initialDelay, maxDelay, backoffMultiplier);
                // Wait before retrying
                await sleep(delay);
                continue;
            }
            // No more retries or error is not retryable
            break;
        }
    }
    return {
        success: false,
        error: lastError,
        attempts,
    };
}
/**
 * Retry decorator for class methods
 */
function Retry(options = {}) {
    return function (_target, _propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const result = await retryWithBackoff(() => originalMethod.apply(this, args), options);
            if (result.success) {
                return result.result;
            }
            else {
                throw result.error;
            }
        };
        return descriptor;
    };
}
//# sourceMappingURL=retry.js.map