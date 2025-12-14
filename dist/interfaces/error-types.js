"use strict";
/**
 * Error Types and Classification
 * Defines error types and custom error classes for the extension
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_MESSAGES = exports.ExtensionError = exports.ErrorType = void 0;
var ErrorType;
(function (ErrorType) {
    ErrorType["Network"] = "NETWORK_ERROR";
    ErrorType["Timeout"] = "TIMEOUT_ERROR";
    ErrorType["Authentication"] = "AUTH_ERROR";
    ErrorType["Validation"] = "VALIDATION_ERROR";
    ErrorType["RateLimit"] = "RATE_LIMIT_ERROR";
    ErrorType["ServerError"] = "SERVER_ERROR";
    ErrorType["Configuration"] = "CONFIGURATION_ERROR";
    ErrorType["Cache"] = "CACHE_ERROR";
    ErrorType["Unknown"] = "UNKNOWN_ERROR";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
class ExtensionError extends Error {
    constructor(type, message, options) {
        super(message);
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "code", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "statusCode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "retryable", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "userMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "technicalDetails", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.name = 'ExtensionError';
        this.type = type;
        this.code = options?.code;
        this.statusCode = options?.statusCode;
        this.retryable = options?.retryable ?? false;
        this.userMessage = options?.userMessage ?? message;
        this.technicalDetails = options?.technicalDetails;
        // Maintain proper stack trace
        if (options?.cause && options.cause.stack) {
            this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
        }
    }
    /**
     * Create a network error
     */
    static network(message, cause) {
        return new ExtensionError(ErrorType.Network, message, {
            retryable: true,
            userMessage: 'Unable to connect to the analysis service. Please check your internet connection.',
            ...(cause && { cause }),
        });
    }
    /**
     * Create a timeout error
     */
    static timeout(message, timeout) {
        return new ExtensionError(ErrorType.Timeout, message, {
            retryable: true,
            userMessage: `The analysis request timed out after ${timeout}ms. Try analyzing a smaller code selection.`,
            technicalDetails: { timeout },
        });
    }
    /**
     * Create an authentication error
     */
    static authentication(message) {
        return new ExtensionError(ErrorType.Authentication, message, {
            retryable: false,
            userMessage: 'Authentication failed. Please check your API key in settings.',
            code: 'AUTH_FAILED',
        });
    }
    /**
     * Create a validation error
     */
    static validation(message, details) {
        return new ExtensionError(ErrorType.Validation, message, {
            retryable: false,
            userMessage: 'Invalid configuration. Please review your settings.',
            technicalDetails: details,
        });
    }
    /**
     * Create a rate limit error
     */
    static rateLimit(message, retryAfter) {
        return new ExtensionError(ErrorType.RateLimit, message, {
            retryable: true,
            userMessage: 'Rate limit exceeded. Please wait a moment and try again.',
            technicalDetails: { retryAfter },
        });
    }
    /**
     * Create a server error
     */
    static server(message, statusCode) {
        return new ExtensionError(ErrorType.ServerError, message, {
            retryable: statusCode ? statusCode >= 500 : false,
            userMessage: 'The analysis service encountered an error. Please try again later.',
            ...(statusCode && { statusCode }),
        });
    }
    /**
     * Create a configuration error
     */
    static configuration(message, details) {
        return new ExtensionError(ErrorType.Configuration, message, {
            retryable: false,
            userMessage: 'Configuration error. Please check your settings.',
            technicalDetails: details,
        });
    }
    /**
     * Create a cache error
     */
    static cache(message, cause) {
        return new ExtensionError(ErrorType.Cache, message, {
            retryable: false,
            userMessage: 'Cache operation failed. The extension will continue without caching.',
            ...(cause && { cause }),
        });
    }
    /**
     * Create an unknown error
     */
    static unknown(message, cause) {
        return new ExtensionError(ErrorType.Unknown, message, {
            retryable: false,
            userMessage: 'An unexpected error occurred. Check the output channel for details.',
            ...(cause && { cause }),
        });
    }
}
exports.ExtensionError = ExtensionError;
/**
 * Error messages for user-facing display
 */
exports.ERROR_MESSAGES = {
    [ErrorType.Network]: 'Unable to connect to the analysis service. Please check your internet connection.',
    [ErrorType.Timeout]: 'The analysis request timed out. Try analyzing a smaller code selection.',
    [ErrorType.Authentication]: 'Authentication failed. Please check your API key in settings.',
    [ErrorType.Validation]: 'Invalid configuration. Please review your settings.',
    [ErrorType.RateLimit]: 'Rate limit exceeded. Please wait a moment and try again.',
    [ErrorType.ServerError]: 'The analysis service encountered an error. Please try again later.',
    [ErrorType.Configuration]: 'Configuration error. Please check your settings.',
    [ErrorType.Cache]: 'Cache operation failed. The extension will continue without caching.',
    [ErrorType.Unknown]: 'An unexpected error occurred. Check the output channel for details.',
};
//# sourceMappingURL=error-types.js.map