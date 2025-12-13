"use strict";
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
exports.Logger = void 0;
const vscode = __importStar(require("vscode"));
const logger_interface_1 = require("../interfaces/logger.interface");
class Logger {
    constructor() {
        Object.defineProperty(this, "channel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: vscode.window.createOutputChannel('Jokalala Code Analysis')
        });
        Object.defineProperty(this, "currentLevel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: logger_interface_1.LogLevel.Info
        });
        Object.defineProperty(this, "logEntries", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "maxLogEntries", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1000
        });
        Object.defineProperty(this, "performanceMetrics", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    /**
     * Log a debug message with optional context
     */
    debug(message, context) {
        this.log(logger_interface_1.LogLevel.Debug, message, undefined, context);
    }
    /**
     * Log an info message with optional context
     */
    info(message, context) {
        this.log(logger_interface_1.LogLevel.Info, message, undefined, context);
    }
    /**
     * Log a warning message with optional context
     */
    warn(message, context) {
        this.log(logger_interface_1.LogLevel.Warn, message, undefined, context);
    }
    /**
     * Log an error message with optional error object and context
     */
    error(message, error, context) {
        this.log(logger_interface_1.LogLevel.Error, message, error, context);
    }
    /**
     * Start a performance timer
     * @param label The timer label
     * @returns Function to stop the timer and log the duration
     */
    startTimer(label) {
        const startTime = Date.now();
        return () => {
            const duration = Date.now() - startTime;
            this.logMetric(label, duration, 'ms');
        };
    }
    /**
     * Log a performance metric
     */
    logMetric(name, value, unit = 'ms') {
        const timestamp = new Date().toISOString();
        const metric = {
            name,
            value,
            unit,
            timestamp,
        };
        this.performanceMetrics.push(metric);
        // Keep only last 500 metrics
        if (this.performanceMetrics.length > 500) {
            this.performanceMetrics.shift();
        }
        // Log the metric if level allows
        if (this.currentLevel <= logger_interface_1.LogLevel.Debug) {
            const line = `[${timestamp}] [METRIC] ${name}: ${value}${unit}`;
            this.channel.appendLine(line);
        }
    }
    /**
     * Set the minimum log level
     */
    setLevel(level) {
        this.currentLevel = level;
        this.info(`Log level set to ${logger_interface_1.LogLevel[level]}`);
    }
    /**
     * Get the current log level
     */
    getLevel() {
        return this.currentLevel;
    }
    /**
     * Clear all logs
     */
    clear() {
        this.logEntries = [];
        this.performanceMetrics = [];
        this.channel.clear();
    }
    /**
     * Export logs as a string
     */
    async export() {
        const lines = [];
        lines.push('=== Jokalala Code Analysis Logs ===');
        lines.push(`Exported at: ${new Date().toISOString()}`);
        lines.push(`Total entries: ${this.logEntries.length}`);
        lines.push('');
        // Export log entries
        lines.push('--- Log Entries ---');
        for (const entry of this.logEntries) {
            lines.push(this.formatLogEntry(entry));
        }
        // Export performance metrics
        if (this.performanceMetrics.length > 0) {
            lines.push('');
            lines.push('--- Performance Metrics ---');
            for (const metric of this.performanceMetrics) {
                lines.push(`[${metric.timestamp}] ${metric.name}: ${metric.value}${metric.unit}`);
            }
        }
        return lines.join('\n');
    }
    /**
     * Dispose of the logger and release resources
     */
    dispose() {
        this.logEntries = [];
        this.performanceMetrics = [];
        this.channel.dispose();
    }
    /**
     * Internal log method with level filtering and structured logging
     */
    log(level, message, error, context) {
        // Filter based on log level
        if (level < this.currentLevel) {
            return;
        }
        const timestamp = new Date().toISOString();
        // Create structured log entry
        const entry = {
            timestamp,
            level,
            message,
            ...(context && { context }),
        };
        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                ...(error.stack && { stack: error.stack }),
            };
        }
        // Store in memory
        this.logEntries.push(entry);
        // Keep only last maxLogEntries
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries.shift();
        }
        // Format and output to channel
        const line = this.formatLogEntry(entry);
        this.channel.appendLine(line);
        // Also log to console
        const consoleMethod = level === logger_interface_1.LogLevel.Error
            ? 'error'
            : level === logger_interface_1.LogLevel.Warn
                ? 'warn'
                : level === logger_interface_1.LogLevel.Debug
                    ? 'debug'
                    : 'log';
        console[consoleMethod](line);
    }
    /**
     * Format a log entry for display
     */
    formatLogEntry(entry) {
        const levelName = logger_interface_1.LogLevel[entry.level].toUpperCase();
        let line = `[${entry.timestamp}] [${levelName}] ${entry.message}`;
        // Add context if present
        if (entry.context && Object.keys(entry.context).length > 0) {
            try {
                const contextStr = JSON.stringify(entry.context);
                line += ` | Context: ${contextStr}`;
            }
            catch (error) {
                line += ` | Context: [Unable to serialize]`;
            }
        }
        // Add error details if present
        if (entry.error) {
            line += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
            if (entry.error.stack) {
                line += `\n  Stack: ${entry.error.stack}`;
            }
        }
        return line;
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map