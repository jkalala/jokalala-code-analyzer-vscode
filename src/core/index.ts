/**
 * Core Module - Enterprise-Scale Architecture
 *
 * This module exports all core components for the Jokalala Code Analysis Extension.
 * These components provide world-class security analysis capabilities competing
 * with extensions like Snyk, SonarLint, and Checkmarx.
 *
 * @module core
 */

// Worker Pool Architecture
export {
  WorkerPool,
  getGlobalWorkerPool,
  initializeGlobalWorkerPool,
  shutdownGlobalWorkerPool,
  TaskPriority,
  TaskStatus,
  TaskType,
  type WorkerTask,
  type TaskProgress,
  type WorkerStats,
  type WorkerPoolConfig,
  type PoolMetrics,
} from './worker-pool'

// Incremental Analysis Engine
export {
  IncrementalAnalyzer,
  getIncrementalAnalyzer,
  type ChangeRegion,
  type AnalysisScope,
  type DocumentState,
  type IncrementalAnalysisResult,
  type IncrementalAnalyzerConfig,
} from './incremental-analyzer'

// Offline Analysis Engine
export {
  OfflineAnalyzer,
  getOfflineAnalyzer,
  Severity,
  type SecurityIssue,
  type SecurityRule,
  type RulePattern,
  type OfflineAnalysisOptions,
  type OfflineAnalysisResult,
} from './offline-analyzer'

// Advanced Caching System
export {
  CacheManager,
  AnalysisCacheManager,
  getCacheManager,
  getAnalysisCacheManager,
  CachePriority,
  CacheTier,
  type CacheEntry,
  type CacheStats,
  type CacheConfig,
} from './cache-manager'

// Result Streaming Architecture
export {
  StreamingAnalyzer,
  createStreamingAnalyzer,
  VSCodeStreamAdapter,
  StreamEventType,
  AnalysisPhase,
  type StreamMessage,
  type ProgressUpdate,
  type StreamingIssue,
  type StreamConfig,
  type StreamSubscriber,
} from './streaming-analyzer'

// Secrets Detection Engine
export {
  SecretsDetector,
  createSecretsDetector,
  getSecretsDetector,
  SecretSeverity,
  SecretType,
  type DetectedSecret,
  type SecretPattern,
  type SecretDetectionOptions,
  type SecretDetectionResult,
} from './secrets-detector'

// Custom Rule Framework
export {
  CustomRuleEngine,
  createCustomRuleEngine,
  getCustomRuleEngine,
  createRuleFromJSON,
  createRulePackFromJSON,
  RuleSeverity,
  RuleCategory,
  PatternType,
  ConditionOperator,
  type CustomRule,
  type RulePack,
  type RulePattern as CustomRulePattern,
  type RuleCondition,
  type RuleMessage,
  type RuleFix,
  type RuleTestCase,
  type RuleValidationResult,
  type RuleTestResult,
  type RuleMatch,
  type RuleEngineConfig,
} from './custom-rules'

// Advanced Reporting Engine
export {
  ReportGenerator,
  createReportGenerator,
  getReportGenerator,
  ReportFormat,
  type ReportIssue,
  type ReportMetadata,
  type ReportSummary,
  type ReportData,
  type ReportOptions,
} from './report-generator'

// Performance Monitoring
export {
  PerformanceMonitor,
  createPerformanceMonitor,
  getPerformanceMonitor,
  timed,
  MetricType,
  type Metric,
  type Timer,
  type PerformanceSnapshot,
  type PerformanceAlert,
  type AlertThreshold,
  type MonitorConfig,
} from './performance-monitor'

/**
 * Initialize all core systems
 */
export async function initializeCoreSystem(config?: {
  workerPool?: Partial<import('./worker-pool').WorkerPoolConfig>
  cache?: Partial<import('./cache-manager').CacheConfig>
  monitor?: Partial<import('./performance-monitor').MonitorConfig>
}): Promise<void> {
  const { initializeGlobalWorkerPool } = await import('./worker-pool')
  const { getCacheManager } = await import('./cache-manager')
  const { getPerformanceMonitor } = await import('./performance-monitor')
  const { getOfflineAnalyzer } = await import('./offline-analyzer')
  const { getSecretsDetector } = await import('./secrets-detector')
  const { getCustomRuleEngine } = await import('./custom-rules')

  // Initialize worker pool
  await initializeGlobalWorkerPool(config?.workerPool)

  // Initialize cache
  getCacheManager(config?.cache)

  // Initialize performance monitor
  getPerformanceMonitor(config?.monitor)

  // Initialize offline analyzer
  getOfflineAnalyzer()

  // Initialize secrets detector
  getSecretsDetector()

  // Initialize custom rule engine
  getCustomRuleEngine()
}

/**
 * Shutdown all core systems
 */
export async function shutdownCoreSystem(): Promise<void> {
  const { shutdownGlobalWorkerPool } = await import('./worker-pool')
  const { getCacheManager } = await import('./cache-manager')
  const { getPerformanceMonitor } = await import('./performance-monitor')

  // Shutdown in reverse order
  getPerformanceMonitor().shutdown()
  await getCacheManager().shutdown()
  await shutdownGlobalWorkerPool()
}

/**
 * Get system health status
 */
export function getSystemHealth(): {
  status: 'healthy' | 'degraded' | 'unhealthy'
  components: Record<string, { status: string; details?: string }>
  timestamp: number
} {
  const { getGlobalWorkerPool } = require('./worker-pool')
  const { getCacheManager } = require('./cache-manager')
  const { getPerformanceMonitor } = require('./performance-monitor')

  const workerPool = getGlobalWorkerPool()
  const cache = getCacheManager()
  const monitor = getPerformanceMonitor()

  const workerMetrics = workerPool.getMetrics()
  const cacheStats = cache.getStats()
  const alerts = monitor.getActiveAlerts()

  const components: Record<string, { status: string; details?: string }> = {
    workerPool: {
      status: workerMetrics.activeWorkers > 0 ? 'healthy' : 'degraded',
      details: `${workerMetrics.activeWorkers} active workers, ${workerMetrics.queuedTasks} queued tasks`,
    },
    cache: {
      status: cacheStats.hitRate > 0.5 ? 'healthy' : 'degraded',
      details: `${(cacheStats.hitRate * 100).toFixed(1)}% hit rate, ${cacheStats.entries} entries`,
    },
    monitor: {
      status: alerts.length === 0 ? 'healthy' : alerts.some((a: { type: string }) => a.type === 'critical') ? 'unhealthy' : 'degraded',
      details: alerts.length > 0 ? `${alerts.length} active alerts` : 'No alerts',
    },
  }

  const hasUnhealthy = Object.values(components).some(c => c.status === 'unhealthy')
  const hasDegraded = Object.values(components).some(c => c.status === 'degraded')

  return {
    status: hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy',
    components,
    timestamp: Date.now(),
  }
}
