"use strict";
/**
 * Telemetry Service Implementation
 * Handles anonymous usage data collection with PII anonymization
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryService = void 0;
const crypto = __importStar(require("crypto"));
const vscode = __importStar(require("vscode"));
const constants_1 = require("../constants");
class TelemetryService {
    constructor(endpoint, batchSize = constants_1.TELEMETRY_DEFAULTS.batchSize, flushInterval = constants_1.TELEMETRY_DEFAULTS.flushInterval) {
        Object.defineProperty(this, "endpoint", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: endpoint
        });
        Object.defineProperty(this, "enabled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "eventQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "sessionId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "userId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "flushTimer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "batchSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "flushInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.batchSize = batchSize;
        this.flushInterval = flushInterval;
        // Generate anonymized session and user IDs
        this.sessionId = this.generateSessionId();
        this.userId = this.generateUserId();
        // Start periodic flush
        this.startPeriodicFlush();
    }
    trackEvent(eventName, properties) {
        if (!this.enabled) {
            return;
        }
        const event = {
            eventName: this.sanitizeEventName(eventName),
            timestamp: Date.now(),
            sessionId: this.sessionId,
            userId: this.userId,
            properties: this.anonymizeProperties(properties || {}),
        };
        this.eventQueue.push(event);
        // Auto-flush if batch size reached
        if (this.eventQueue.length >= this.batchSize) {
            void this.flush();
        }
    }
    trackError(error, properties) {
        if (!this.enabled) {
            return;
        }
        const errorProperties = {
            errorName: error.name,
            errorMessage: this.sanitizeErrorMessage(error.message),
            errorStack: this.sanitizeStackTrace(error.stack),
            ...this.anonymizeProperties(properties || {}),
        };
        this.trackEvent('error', errorProperties);
    }
    trackMetric(name, value, properties) {
        if (!this.enabled) {
            return;
        }
        const metricProperties = {
            metricName: this.sanitizeEventName(name),
            metricValue: value,
            ...this.anonymizeProperties(properties || {}),
        };
        this.trackEvent('metric', metricProperties);
    }
    async flush() {
        if (this.eventQueue.length === 0) {
            return;
        }
        const eventsToSend = [...this.eventQueue];
        this.eventQueue = [];
        if (!this.endpoint) {
            // No endpoint configured, just clear the queue
            return;
        }
        try {
            // Send events to telemetry endpoint
            // In a real implementation, this would use axios or fetch
            // For now, we'll just log that we would send
            console.log(`[Telemetry] Would send ${eventsToSend.length} events to ${this.endpoint}`);
        }
        catch (error) {
            // Silently fail - telemetry should never break the extension
            console.error('[Telemetry] Failed to send events:', error);
        }
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            // Clear queued events when disabling
            this.eventQueue = [];
        }
    }
    isEnabled() {
        return this.enabled;
    }
    dispose() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
        // Flush remaining events
        void this.flush();
    }
    /**
     * Generate an anonymized session ID
     * Uses a hash of the current timestamp and random data
     */
    generateSessionId() {
        const data = `${Date.now()}-${Math.random()}-${process.pid}`;
        return this.hash(data);
    }
    /**
     * Generate an anonymized user ID
     * Uses a hash of the VS Code machine ID
     */
    generateUserId() {
        try {
            const machineId = vscode.env.machineId;
            return this.hash(machineId);
        }
        catch (error) {
            // Fallback to random ID if machine ID is not available
            return this.hash(`fallback-${Date.now()}-${Math.random()}`);
        }
    }
    /**
     * Hash a string using SHA-256
     */
    hash(data) {
        return crypto
            .createHash('sha256')
            .update(data)
            .digest('hex')
            .substring(0, 16);
    }
    /**
     * Anonymize properties by removing PII
     */
    anonymizeProperties(properties) {
        const anonymized = {};
        for (const [key, value] of Object.entries(properties)) {
            // Skip null or undefined values
            if (value === null || value === undefined) {
                continue;
            }
            // Anonymize known PII fields
            if (this.isPIIField(key)) {
                anonymized[key] = '[REDACTED]';
                continue;
            }
            // Anonymize file paths
            if (typeof value === 'string' && this.looksLikeFilePath(value)) {
                anonymized[key] = this.anonymizeFilePath(value);
                continue;
            }
            // Recursively anonymize nested objects
            if (typeof value === 'object' && !Array.isArray(value)) {
                anonymized[key] = this.anonymizeProperties(value);
                continue;
            }
            // Keep safe values as-is
            anonymized[key] = value;
        }
        return anonymized;
    }
    /**
     * Check if a field name indicates PII
     */
    isPIIField(fieldName) {
        const piiPatterns = [
            /email/i,
            /password/i,
            /token/i,
            /key/i,
            /secret/i,
            /username/i,
            /user.*name/i,
            /api.*key/i,
            /auth/i,
            /credential/i,
        ];
        return piiPatterns.some(pattern => pattern.test(fieldName));
    }
    /**
     * Check if a string looks like a file path
     */
    looksLikeFilePath(value) {
        // Check for common path patterns
        return (value.includes('/') ||
            value.includes('\\') ||
            /^[a-zA-Z]:\\/.test(value) || // Windows absolute path
            value.startsWith('~') || // Unix home directory
            value.startsWith('.')); // Relative path
    }
    /**
     * Anonymize file paths by keeping only the file extension and directory depth
     */
    anonymizeFilePath(path) {
        const parts = path.split(/[/\\]/);
        const fileName = parts[parts.length - 1];
        const extension = fileName && fileName.includes('.')
            ? fileName.substring(fileName.lastIndexOf('.'))
            : '';
        return `<path-depth-${parts.length}>/<file>${extension}`;
    }
    /**
     * Sanitize event names to remove special characters
     */
    sanitizeEventName(name) {
        return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    }
    /**
     * Sanitize error messages to remove potential PII
     */
    sanitizeErrorMessage(message) {
        // Remove file paths
        let sanitized = message.replace(/[a-zA-Z]:\\[^\s]+/g, '<path>');
        sanitized = sanitized.replace(/\/[^\s]+/g, '<path>');
        // Remove URLs
        sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '<url>');
        // Remove email addresses
        sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<email>');
        // Remove potential tokens (long alphanumeric strings)
        sanitized = sanitized.replace(/[a-zA-Z0-9]{32,}/g, '<token>');
        return sanitized;
    }
    /**
     * Sanitize stack traces to remove file paths
     */
    sanitizeStackTrace(stack) {
        if (!stack) {
            return undefined;
        }
        // Remove file paths but keep function names and line numbers
        let sanitized = stack.replace(/[a-zA-Z]:\\[^\s:]+/g, '<path>');
        sanitized = sanitized.replace(/\/[^\s:]+/g, '<path>');
        return sanitized;
    }
    /**
     * Start periodic flush timer
     */
    startPeriodicFlush() {
        this.flushTimer = setInterval(() => {
            void this.flush();
        }, this.flushInterval);
    }
}
exports.TelemetryService = TelemetryService;
//# sourceMappingURL=telemetry-service.js.map