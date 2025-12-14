"use strict";
/**
 * Core Module - Enterprise-Scale Architecture
 *
 * This module exports all core components for the Jokalala Code Analysis Extension.
 * These components provide world-class security analysis capabilities competing
 * with extensions like Snyk, SonarLint, and Checkmarx.
 *
 * @module core
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
exports.MetricType = exports.timed = exports.getPerformanceMonitor = exports.createPerformanceMonitor = exports.PerformanceMonitor = exports.ReportFormat = exports.getReportGenerator = exports.createReportGenerator = exports.ReportGenerator = exports.ConditionOperator = exports.PatternType = exports.RuleCategory = exports.RuleSeverity = exports.createRulePackFromJSON = exports.createRuleFromJSON = exports.getCustomRuleEngine = exports.createCustomRuleEngine = exports.CustomRuleEngine = exports.SecretType = exports.SecretSeverity = exports.getSecretsDetector = exports.createSecretsDetector = exports.SecretsDetector = exports.AnalysisPhase = exports.StreamEventType = exports.VSCodeStreamAdapter = exports.createStreamingAnalyzer = exports.StreamingAnalyzer = exports.CacheTier = exports.CachePriority = exports.getAnalysisCacheManager = exports.getCacheManager = exports.AnalysisCacheManager = exports.CacheManager = exports.Severity = exports.getOfflineAnalyzer = exports.OfflineAnalyzer = exports.getIncrementalAnalyzer = exports.IncrementalAnalyzer = exports.TaskType = exports.TaskStatus = exports.TaskPriority = exports.shutdownGlobalWorkerPool = exports.initializeGlobalWorkerPool = exports.getGlobalWorkerPool = exports.WorkerPool = void 0;
exports.initializeCoreSystem = initializeCoreSystem;
exports.shutdownCoreSystem = shutdownCoreSystem;
exports.getSystemHealth = getSystemHealth;
// Worker Pool Architecture
var worker_pool_1 = require("./worker-pool");
Object.defineProperty(exports, "WorkerPool", { enumerable: true, get: function () { return worker_pool_1.WorkerPool; } });
Object.defineProperty(exports, "getGlobalWorkerPool", { enumerable: true, get: function () { return worker_pool_1.getGlobalWorkerPool; } });
Object.defineProperty(exports, "initializeGlobalWorkerPool", { enumerable: true, get: function () { return worker_pool_1.initializeGlobalWorkerPool; } });
Object.defineProperty(exports, "shutdownGlobalWorkerPool", { enumerable: true, get: function () { return worker_pool_1.shutdownGlobalWorkerPool; } });
Object.defineProperty(exports, "TaskPriority", { enumerable: true, get: function () { return worker_pool_1.TaskPriority; } });
Object.defineProperty(exports, "TaskStatus", { enumerable: true, get: function () { return worker_pool_1.TaskStatus; } });
Object.defineProperty(exports, "TaskType", { enumerable: true, get: function () { return worker_pool_1.TaskType; } });
// Incremental Analysis Engine
var incremental_analyzer_1 = require("./incremental-analyzer");
Object.defineProperty(exports, "IncrementalAnalyzer", { enumerable: true, get: function () { return incremental_analyzer_1.IncrementalAnalyzer; } });
Object.defineProperty(exports, "getIncrementalAnalyzer", { enumerable: true, get: function () { return incremental_analyzer_1.getIncrementalAnalyzer; } });
// Offline Analysis Engine
var offline_analyzer_1 = require("./offline-analyzer");
Object.defineProperty(exports, "OfflineAnalyzer", { enumerable: true, get: function () { return offline_analyzer_1.OfflineAnalyzer; } });
Object.defineProperty(exports, "getOfflineAnalyzer", { enumerable: true, get: function () { return offline_analyzer_1.getOfflineAnalyzer; } });
Object.defineProperty(exports, "Severity", { enumerable: true, get: function () { return offline_analyzer_1.Severity; } });
// Advanced Caching System
var cache_manager_1 = require("./cache-manager");
Object.defineProperty(exports, "CacheManager", { enumerable: true, get: function () { return cache_manager_1.CacheManager; } });
Object.defineProperty(exports, "AnalysisCacheManager", { enumerable: true, get: function () { return cache_manager_1.AnalysisCacheManager; } });
Object.defineProperty(exports, "getCacheManager", { enumerable: true, get: function () { return cache_manager_1.getCacheManager; } });
Object.defineProperty(exports, "getAnalysisCacheManager", { enumerable: true, get: function () { return cache_manager_1.getAnalysisCacheManager; } });
Object.defineProperty(exports, "CachePriority", { enumerable: true, get: function () { return cache_manager_1.CachePriority; } });
Object.defineProperty(exports, "CacheTier", { enumerable: true, get: function () { return cache_manager_1.CacheTier; } });
// Result Streaming Architecture
var streaming_analyzer_1 = require("./streaming-analyzer");
Object.defineProperty(exports, "StreamingAnalyzer", { enumerable: true, get: function () { return streaming_analyzer_1.StreamingAnalyzer; } });
Object.defineProperty(exports, "createStreamingAnalyzer", { enumerable: true, get: function () { return streaming_analyzer_1.createStreamingAnalyzer; } });
Object.defineProperty(exports, "VSCodeStreamAdapter", { enumerable: true, get: function () { return streaming_analyzer_1.VSCodeStreamAdapter; } });
Object.defineProperty(exports, "StreamEventType", { enumerable: true, get: function () { return streaming_analyzer_1.StreamEventType; } });
Object.defineProperty(exports, "AnalysisPhase", { enumerable: true, get: function () { return streaming_analyzer_1.AnalysisPhase; } });
// Secrets Detection Engine
var secrets_detector_1 = require("./secrets-detector");
Object.defineProperty(exports, "SecretsDetector", { enumerable: true, get: function () { return secrets_detector_1.SecretsDetector; } });
Object.defineProperty(exports, "createSecretsDetector", { enumerable: true, get: function () { return secrets_detector_1.createSecretsDetector; } });
Object.defineProperty(exports, "getSecretsDetector", { enumerable: true, get: function () { return secrets_detector_1.getSecretsDetector; } });
Object.defineProperty(exports, "SecretSeverity", { enumerable: true, get: function () { return secrets_detector_1.SecretSeverity; } });
Object.defineProperty(exports, "SecretType", { enumerable: true, get: function () { return secrets_detector_1.SecretType; } });
// Custom Rule Framework
var custom_rules_1 = require("./custom-rules");
Object.defineProperty(exports, "CustomRuleEngine", { enumerable: true, get: function () { return custom_rules_1.CustomRuleEngine; } });
Object.defineProperty(exports, "createCustomRuleEngine", { enumerable: true, get: function () { return custom_rules_1.createCustomRuleEngine; } });
Object.defineProperty(exports, "getCustomRuleEngine", { enumerable: true, get: function () { return custom_rules_1.getCustomRuleEngine; } });
Object.defineProperty(exports, "createRuleFromJSON", { enumerable: true, get: function () { return custom_rules_1.createRuleFromJSON; } });
Object.defineProperty(exports, "createRulePackFromJSON", { enumerable: true, get: function () { return custom_rules_1.createRulePackFromJSON; } });
Object.defineProperty(exports, "RuleSeverity", { enumerable: true, get: function () { return custom_rules_1.RuleSeverity; } });
Object.defineProperty(exports, "RuleCategory", { enumerable: true, get: function () { return custom_rules_1.RuleCategory; } });
Object.defineProperty(exports, "PatternType", { enumerable: true, get: function () { return custom_rules_1.PatternType; } });
Object.defineProperty(exports, "ConditionOperator", { enumerable: true, get: function () { return custom_rules_1.ConditionOperator; } });
// Advanced Reporting Engine
var report_generator_1 = require("./report-generator");
Object.defineProperty(exports, "ReportGenerator", { enumerable: true, get: function () { return report_generator_1.ReportGenerator; } });
Object.defineProperty(exports, "createReportGenerator", { enumerable: true, get: function () { return report_generator_1.createReportGenerator; } });
Object.defineProperty(exports, "getReportGenerator", { enumerable: true, get: function () { return report_generator_1.getReportGenerator; } });
Object.defineProperty(exports, "ReportFormat", { enumerable: true, get: function () { return report_generator_1.ReportFormat; } });
// Performance Monitoring
var performance_monitor_1 = require("./performance-monitor");
Object.defineProperty(exports, "PerformanceMonitor", { enumerable: true, get: function () { return performance_monitor_1.PerformanceMonitor; } });
Object.defineProperty(exports, "createPerformanceMonitor", { enumerable: true, get: function () { return performance_monitor_1.createPerformanceMonitor; } });
Object.defineProperty(exports, "getPerformanceMonitor", { enumerable: true, get: function () { return performance_monitor_1.getPerformanceMonitor; } });
Object.defineProperty(exports, "timed", { enumerable: true, get: function () { return performance_monitor_1.timed; } });
Object.defineProperty(exports, "MetricType", { enumerable: true, get: function () { return performance_monitor_1.MetricType; } });
/**
 * Initialize all core systems
 */
async function initializeCoreSystem(config) {
    const { initializeGlobalWorkerPool } = await Promise.resolve().then(() => __importStar(require('./worker-pool')));
    const { getCacheManager } = await Promise.resolve().then(() => __importStar(require('./cache-manager')));
    const { getPerformanceMonitor } = await Promise.resolve().then(() => __importStar(require('./performance-monitor')));
    const { getOfflineAnalyzer } = await Promise.resolve().then(() => __importStar(require('./offline-analyzer')));
    const { getSecretsDetector } = await Promise.resolve().then(() => __importStar(require('./secrets-detector')));
    const { getCustomRuleEngine } = await Promise.resolve().then(() => __importStar(require('./custom-rules')));
    // Initialize worker pool
    await initializeGlobalWorkerPool(config?.workerPool);
    // Initialize cache
    getCacheManager(config?.cache);
    // Initialize performance monitor
    getPerformanceMonitor(config?.monitor);
    // Initialize offline analyzer
    getOfflineAnalyzer();
    // Initialize secrets detector
    getSecretsDetector();
    // Initialize custom rule engine
    getCustomRuleEngine();
}
/**
 * Shutdown all core systems
 */
async function shutdownCoreSystem() {
    const { shutdownGlobalWorkerPool } = await Promise.resolve().then(() => __importStar(require('./worker-pool')));
    const { getCacheManager } = await Promise.resolve().then(() => __importStar(require('./cache-manager')));
    const { getPerformanceMonitor } = await Promise.resolve().then(() => __importStar(require('./performance-monitor')));
    // Shutdown in reverse order
    getPerformanceMonitor().shutdown();
    await getCacheManager().shutdown();
    await shutdownGlobalWorkerPool();
}
/**
 * Get system health status
 */
function getSystemHealth() {
    const { getGlobalWorkerPool } = require('./worker-pool');
    const { getCacheManager } = require('./cache-manager');
    const { getPerformanceMonitor } = require('./performance-monitor');
    const workerPool = getGlobalWorkerPool();
    const cache = getCacheManager();
    const monitor = getPerformanceMonitor();
    const workerMetrics = workerPool.getMetrics();
    const cacheStats = cache.getStats();
    const alerts = monitor.getActiveAlerts();
    const components = {
        workerPool: {
            status: workerMetrics.activeWorkers > 0 ? 'healthy' : 'degraded',
            details: `${workerMetrics.activeWorkers} active workers, ${workerMetrics.queuedTasks} queued tasks`,
        },
        cache: {
            status: cacheStats.hitRate > 0.5 ? 'healthy' : 'degraded',
            details: `${(cacheStats.hitRate * 100).toFixed(1)}% hit rate, ${cacheStats.entries} entries`,
        },
        monitor: {
            status: alerts.length === 0 ? 'healthy' : alerts.some((a) => a.type === 'critical') ? 'unhealthy' : 'degraded',
            details: alerts.length > 0 ? `${alerts.length} active alerts` : 'No alerts',
        },
    };
    const hasUnhealthy = Object.values(components).some(c => c.status === 'unhealthy');
    const hasDegraded = Object.values(components).some(c => c.status === 'degraded');
    return {
        status: hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy',
        components,
        timestamp: Date.now(),
    };
}
//# sourceMappingURL=index.js.map