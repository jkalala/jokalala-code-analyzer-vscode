"use strict";
/**
 * Performance Monitoring and Benchmarking System
 *
 * Enterprise-grade performance monitoring for analysis operations.
 * Tracks execution times, memory usage, and provides optimization insights.
 *
 * Features:
 * - Real-time performance metrics
 * - Memory profiling
 * - Bottleneck detection
 * - Performance trending
 * - Alert thresholds
 * - Export to monitoring systems
 *
 * @module core/performance-monitor
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitor = exports.MetricType = void 0;
exports.createPerformanceMonitor = createPerformanceMonitor;
exports.getPerformanceMonitor = getPerformanceMonitor;
exports.timed = timed;
const events_1 = require("events");
/**
 * Performance metric types
 */
var MetricType;
(function (MetricType) {
    MetricType["COUNTER"] = "counter";
    MetricType["GAUGE"] = "gauge";
    MetricType["HISTOGRAM"] = "histogram";
    MetricType["SUMMARY"] = "summary";
})(MetricType || (exports.MetricType = MetricType = {}));
const DEFAULT_CONFIG = {
    enabled: true,
    collectInterval: 5000,
    historySize: 1000,
    enableAlerts: true,
    alertThresholds: [
        { metric: 'analysisTime.average', warningThreshold: 30000, criticalThreshold: 60000, operator: 'gt' },
        { metric: 'memory.heapUsed', warningThreshold: 500 * 1024 * 1024, criticalThreshold: 800 * 1024 * 1024, operator: 'gt' },
        { metric: 'errors.rate', warningThreshold: 0.1, criticalThreshold: 0.25, operator: 'gt' },
        { metric: 'cache.hitRate', warningThreshold: 0.5, criticalThreshold: 0.3, operator: 'lt' },
    ],
    enableProfiling: false,
    profilingInterval: 60000,
    enableExport: false,
    exportInterval: 60000,
};
/**
 * Histogram for tracking distributions
 */
class Histogram {
    constructor(maxSize = 1000) {
        Object.defineProperty(this, "values", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "sorted", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "maxSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.maxSize = maxSize;
    }
    record(value) {
        this.values.push(value);
        this.sorted = false;
        // Trim if over max size
        if (this.values.length > this.maxSize) {
            this.values = this.values.slice(-this.maxSize);
        }
    }
    ensureSorted() {
        if (!this.sorted) {
            this.values.sort((a, b) => a - b);
            this.sorted = true;
        }
    }
    percentile(p) {
        if (this.values.length === 0)
            return 0;
        this.ensureSorted();
        const index = Math.ceil((p / 100) * this.values.length) - 1;
        return this.values[Math.max(0, index)];
    }
    average() {
        if (this.values.length === 0)
            return 0;
        return this.values.reduce((a, b) => a + b, 0) / this.values.length;
    }
    min() {
        if (this.values.length === 0)
            return 0;
        this.ensureSorted();
        return this.values[0];
    }
    max() {
        if (this.values.length === 0)
            return 0;
        this.ensureSorted();
        return this.values[this.values.length - 1];
    }
    count() {
        return this.values.length;
    }
    sum() {
        return this.values.reduce((a, b) => a + b, 0);
    }
    reset() {
        this.values = [];
        this.sorted = false;
    }
}
/**
 * Rate limiter for tracking rates
 */
class RateTracker {
    constructor(windowMs = 60000) {
        Object.defineProperty(this, "events", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "windowMs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.windowMs = windowMs;
    }
    record() {
        const now = Date.now();
        this.events.push(now);
        this.cleanup(now);
    }
    getRate() {
        const now = Date.now();
        this.cleanup(now);
        return this.events.length / (this.windowMs / 1000); // Events per second
    }
    getCount() {
        const now = Date.now();
        this.cleanup(now);
        return this.events.length;
    }
    cleanup(now) {
        const cutoff = now - this.windowMs;
        while (this.events.length > 0 && this.events[0] < cutoff) {
            this.events.shift();
        }
    }
}
/**
 * Performance Monitor
 *
 * Comprehensive performance monitoring for the analysis engine.
 */
class PerformanceMonitor extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "activeTimers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "analysisTimeHistogram", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "filesProcessed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "linesProcessed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "issuesFound", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "errors", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "operations", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "snapshots", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "activeAlerts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "alertCooldowns", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "collectInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timerCounter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.analysisTimeHistogram = new Histogram(this.config.historySize);
        this.filesProcessed = new RateTracker();
        this.linesProcessed = new RateTracker();
        this.issuesFound = new RateTracker();
        this.errors = new RateTracker();
        this.operations = { total: 0, successful: 0, failed: 0, pending: 0 };
        if (this.config.enabled) {
            this.startCollection();
        }
    }
    /**
     * Start a timer for an operation
     */
    startTimer(name, metadata) {
        const id = `timer-${++this.timerCounter}-${Date.now()}`;
        const timer = {
            id,
            name,
            startTime: performance.now(),
            metadata,
        };
        this.activeTimers.set(id, timer);
        this.operations.pending++;
        return id;
    }
    /**
     * Stop a timer and record the duration
     */
    stopTimer(id, success = true) {
        const timer = this.activeTimers.get(id);
        if (!timer) {
            return 0;
        }
        timer.endTime = performance.now();
        timer.duration = timer.endTime - timer.startTime;
        this.activeTimers.delete(id);
        this.operations.pending--;
        this.operations.total++;
        if (success) {
            this.operations.successful++;
        }
        else {
            this.operations.failed++;
            this.errors.record();
        }
        // Record in histogram if it's an analysis operation
        if (timer.name.includes('analysis')) {
            this.analysisTimeHistogram.record(timer.duration);
        }
        this.emit('timer-stopped', timer);
        return timer.duration;
    }
    /**
     * Record a metric
     */
    recordMetric(metric) {
        const fullMetric = {
            ...metric,
            timestamp: Date.now(),
        };
        this.emit('metric', fullMetric);
    }
    /**
     * Record files processed
     */
    recordFilesProcessed(count = 1) {
        for (let i = 0; i < count; i++) {
            this.filesProcessed.record();
        }
    }
    /**
     * Record lines processed
     */
    recordLinesProcessed(count) {
        for (let i = 0; i < count; i++) {
            this.linesProcessed.record();
        }
    }
    /**
     * Record issues found
     */
    recordIssuesFound(count) {
        for (let i = 0; i < count; i++) {
            this.issuesFound.record();
        }
    }
    /**
     * Record an error
     */
    recordError() {
        this.errors.record();
    }
    /**
     * Get current performance snapshot
     */
    getSnapshot() {
        const memoryUsage = this.getMemoryUsage();
        return {
            timestamp: Date.now(),
            metrics: {
                analysisTime: {
                    average: this.analysisTimeHistogram.average(),
                    min: this.analysisTimeHistogram.min(),
                    max: this.analysisTimeHistogram.max(),
                    p50: this.analysisTimeHistogram.percentile(50),
                    p95: this.analysisTimeHistogram.percentile(95),
                    p99: this.analysisTimeHistogram.percentile(99),
                    count: this.analysisTimeHistogram.count(),
                },
                throughput: {
                    filesPerSecond: this.filesProcessed.getRate(),
                    linesPerSecond: this.linesProcessed.getRate(),
                    issuesPerSecond: this.issuesFound.getRate(),
                },
                memory: memoryUsage,
                cache: {
                    hitRate: 0, // To be filled by cache integration
                    size: 0,
                    entries: 0,
                },
                errors: {
                    count: this.errors.getCount(),
                    rate: this.operations.total > 0
                        ? this.errors.getCount() / this.operations.total
                        : 0,
                },
            },
            operations: { ...this.operations },
        };
    }
    /**
     * Get snapshot history
     */
    getHistory() {
        return [...this.snapshots];
    }
    /**
     * Get active alerts
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values()).filter(a => !a.resolved);
    }
    /**
     * Get all alerts
     */
    getAllAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    /**
     * Get analysis time statistics
     */
    getAnalysisTimeStats() {
        return {
            average: this.analysisTimeHistogram.average(),
            min: this.analysisTimeHistogram.min(),
            max: this.analysisTimeHistogram.max(),
            p50: this.analysisTimeHistogram.percentile(50),
            p95: this.analysisTimeHistogram.percentile(95),
            p99: this.analysisTimeHistogram.percentile(99),
            count: this.analysisTimeHistogram.count(),
        };
    }
    /**
     * Get throughput metrics
     */
    getThroughput() {
        return {
            filesPerSecond: this.filesProcessed.getRate(),
            linesPerSecond: this.linesProcessed.getRate(),
            issuesPerSecond: this.issuesFound.getRate(),
        };
    }
    /**
     * Reset all metrics
     */
    reset() {
        this.analysisTimeHistogram.reset();
        this.operations = { total: 0, successful: 0, failed: 0, pending: 0 };
        this.activeTimers.clear();
        this.snapshots = [];
        this.emit('reset');
    }
    /**
     * Shutdown the monitor
     */
    shutdown() {
        if (this.collectInterval) {
            clearInterval(this.collectInterval);
        }
        this.emit('shutdown');
    }
    // Private methods
    startCollection() {
        this.collectInterval = setInterval(() => {
            this.collectAndStore();
        }, this.config.collectInterval);
    }
    collectAndStore() {
        const snapshot = this.getSnapshot();
        this.snapshots.push(snapshot);
        // Trim history
        if (this.snapshots.length > this.config.historySize) {
            this.snapshots = this.snapshots.slice(-this.config.historySize);
        }
        // Check alerts
        if (this.config.enableAlerts) {
            this.checkAlerts(snapshot);
        }
        this.emit('snapshot', snapshot);
    }
    checkAlerts(snapshot) {
        for (const threshold of this.config.alertThresholds) {
            const value = this.getMetricValue(snapshot, threshold.metric);
            if (value === undefined)
                continue;
            const alertKey = `${threshold.metric}`;
            const existingAlert = this.activeAlerts.get(alertKey);
            // Check cooldown
            const lastAlert = this.alertCooldowns.get(alertKey);
            if (lastAlert && Date.now() - lastAlert < (threshold.cooldown || 60000)) {
                continue;
            }
            const isViolation = this.checkThreshold(value, threshold);
            if (isViolation.critical || isViolation.warning) {
                const alert = {
                    id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: isViolation.critical ? 'critical' : 'warning',
                    metric: threshold.metric,
                    threshold: isViolation.critical ? threshold.criticalThreshold : threshold.warningThreshold,
                    currentValue: value,
                    message: `${threshold.metric} ${this.getOperatorText(threshold.operator)} threshold (${value.toFixed(2)} vs ${isViolation.critical ? threshold.criticalThreshold : threshold.warningThreshold})`,
                    timestamp: Date.now(),
                };
                this.activeAlerts.set(alertKey, alert);
                this.alertCooldowns.set(alertKey, Date.now());
                this.emit('alert', alert);
            }
            else if (existingAlert && !existingAlert.resolved) {
                // Resolve existing alert
                existingAlert.resolved = true;
                existingAlert.resolvedAt = Date.now();
                this.emit('alert-resolved', existingAlert);
            }
        }
    }
    getMetricValue(snapshot, path) {
        const parts = path.split('.');
        let value = snapshot.metrics;
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            }
            else {
                return undefined;
            }
        }
        return typeof value === 'number' ? value : undefined;
    }
    checkThreshold(value, threshold) {
        const check = (target) => {
            switch (threshold.operator) {
                case 'gt': return value > target;
                case 'gte': return value >= target;
                case 'lt': return value < target;
                case 'lte': return value <= target;
                case 'eq': return value === target;
                default: return false;
            }
        };
        return {
            warning: check(threshold.warningThreshold),
            critical: check(threshold.criticalThreshold),
        };
    }
    getOperatorText(operator) {
        const map = {
            gt: 'exceeded',
            gte: 'reached or exceeded',
            lt: 'fell below',
            lte: 'at or below',
            eq: 'equals',
        };
        return map[operator] || operator;
    }
    getMemoryUsage() {
        // VS Code extension environment doesn't have direct access to process.memoryUsage()
        // Return estimated values based on environment
        try {
            if (typeof process !== 'undefined' && process.memoryUsage) {
                const mem = process.memoryUsage();
                return {
                    heapUsed: mem.heapUsed,
                    heapTotal: mem.heapTotal,
                    external: mem.external,
                    rss: mem.rss,
                };
            }
        }
        catch {
            // Ignore errors
        }
        // Return zeros if not available
        return {
            heapUsed: 0,
            heapTotal: 0,
            external: 0,
            rss: 0,
        };
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
/**
 * Create a performance monitor instance
 */
function createPerformanceMonitor(config) {
    return new PerformanceMonitor(config);
}
/**
 * Singleton instance
 */
let performanceMonitor = null;
function getPerformanceMonitor(config) {
    if (!performanceMonitor) {
        performanceMonitor = new PerformanceMonitor(config);
    }
    return performanceMonitor;
}
/**
 * Decorator for timing function execution
 */
function timed(name) {
    return function (_target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const timerName = name || propertyKey;
        descriptor.value = async function (...args) {
            const monitor = getPerformanceMonitor();
            const timerId = monitor.startTimer(timerName);
            try {
                const result = await originalMethod.apply(this, args);
                monitor.stopTimer(timerId, true);
                return result;
            }
            catch (error) {
                monitor.stopTimer(timerId, false);
                throw error;
            }
        };
        return descriptor;
    };
}
//# sourceMappingURL=performance-monitor.js.map