"use strict";
/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by tracking failure rates and opening the circuit
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerManager = exports.CircuitBreaker = exports.CircuitBreakerError = exports.CircuitState = void 0;
var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "CLOSED";
    CircuitState["OPEN"] = "OPEN";
    CircuitState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitState || (exports.CircuitState = CircuitState = {}));
class CircuitBreakerError extends Error {
    constructor(message, state) {
        super(message);
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: state
        });
        this.name = 'CircuitBreakerError';
    }
}
exports.CircuitBreakerError = CircuitBreakerError;
/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
    constructor(name, options = {}) {
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: name
        });
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: CircuitState.CLOSED
        });
        Object.defineProperty(this, "failures", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "successes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "lastFailureTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lastSuccessTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "nextAttemptTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "failureTimestamps", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "failureThreshold", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "successThreshold", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timeout", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "windowSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.failureThreshold = options.failureThreshold || 5;
        this.successThreshold = options.successThreshold || 2;
        this.timeout = options.timeout || 60000; // 1 minute
        this.windowSize = options.windowSize || 60000; // 1 minute
    }
    /**
     * Execute a function with circuit breaker protection
     */
    async execute(fn) {
        // Check if circuit is open
        if (this.state === CircuitState.OPEN) {
            // Check if timeout has elapsed
            if (this.nextAttemptTime && Date.now() >= this.nextAttemptTime) {
                this.state = CircuitState.HALF_OPEN;
                this.successes = 0;
            }
            else {
                throw new CircuitBreakerError(`Circuit breaker is OPEN for ${this.name}. Next attempt at ${new Date(this.nextAttemptTime || 0).toISOString()}`, CircuitState.OPEN);
            }
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    /**
     * Handle successful execution
     */
    onSuccess() {
        this.lastSuccessTime = Date.now();
        if (this.state === CircuitState.HALF_OPEN) {
            this.successes++;
            if (this.successes >= this.successThreshold) {
                this.close();
            }
        }
        else if (this.state === CircuitState.CLOSED) {
            // Reset failure count on success
            this.failures = 0;
            this.failureTimestamps = [];
        }
    }
    /**
     * Handle failed execution
     */
    onFailure() {
        this.lastFailureTime = Date.now();
        this.failures++;
        this.failureTimestamps.push(Date.now());
        // Remove old failures outside the window
        this.cleanupOldFailures();
        if (this.state === CircuitState.HALF_OPEN) {
            // If a failure occurs in half-open state, reopen the circuit
            this.open();
        }
        else if (this.state === CircuitState.CLOSED) {
            // Check if we've exceeded the failure threshold
            if (this.failureTimestamps.length >= this.failureThreshold) {
                this.open();
            }
        }
    }
    /**
     * Remove failures outside the time window
     */
    cleanupOldFailures() {
        const cutoffTime = Date.now() - this.windowSize;
        this.failureTimestamps = this.failureTimestamps.filter(timestamp => timestamp > cutoffTime);
    }
    /**
     * Open the circuit
     */
    open() {
        this.state = CircuitState.OPEN;
        this.nextAttemptTime = Date.now() + this.timeout;
    }
    /**
     * Close the circuit
     */
    close() {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.failureTimestamps = [];
        this.nextAttemptTime = undefined;
    }
    /**
     * Get current circuit breaker statistics
     */
    getStats() {
        const stats = {
            state: this.state,
            failures: this.failureTimestamps.length,
            successes: this.successes,
        };
        if (this.lastFailureTime !== undefined) {
            stats.lastFailureTime = this.lastFailureTime;
        }
        if (this.lastSuccessTime !== undefined) {
            stats.lastSuccessTime = this.lastSuccessTime;
        }
        if (this.nextAttemptTime !== undefined) {
            stats.nextAttemptTime = this.nextAttemptTime;
        }
        return stats;
    }
    /**
     * Reset the circuit breaker
     */
    reset() {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.failureTimestamps = [];
        this.lastFailureTime = undefined;
        this.lastSuccessTime = undefined;
        this.nextAttemptTime = undefined;
    }
    /**
     * Get the current state
     */
    getState() {
        return this.state;
    }
    /**
     * Check if the circuit is open
     */
    isOpen() {
        return this.state === CircuitState.OPEN;
    }
    /**
     * Check if the circuit is closed
     */
    isClosed() {
        return this.state === CircuitState.CLOSED;
    }
    /**
     * Check if the circuit is half-open
     */
    isHalfOpen() {
        return this.state === CircuitState.HALF_OPEN;
    }
}
exports.CircuitBreaker = CircuitBreaker;
/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers for different endpoints
 */
class CircuitBreakerManager {
    constructor() {
        Object.defineProperty(this, "breakers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
    }
    /**
     * Get or create a circuit breaker for an endpoint
     */
    getBreaker(endpoint, options) {
        if (!this.breakers.has(endpoint)) {
            this.breakers.set(endpoint, new CircuitBreaker(endpoint, options));
        }
        return this.breakers.get(endpoint);
    }
    /**
     * Execute a function with circuit breaker protection
     */
    async execute(endpoint, fn, options) {
        const breaker = this.getBreaker(endpoint, options);
        return breaker.execute(fn);
    }
    /**
     * Get statistics for all circuit breakers
     */
    getAllStats() {
        const stats = new Map();
        for (const [endpoint, breaker] of this.breakers.entries()) {
            stats.set(endpoint, breaker.getStats());
        }
        return stats;
    }
    /**
     * Reset a specific circuit breaker
     */
    reset(endpoint) {
        const breaker = this.breakers.get(endpoint);
        if (breaker) {
            breaker.reset();
        }
    }
    /**
     * Reset all circuit breakers
     */
    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }
}
exports.CircuitBreakerManager = CircuitBreakerManager;
//# sourceMappingURL=circuit-breaker.js.map