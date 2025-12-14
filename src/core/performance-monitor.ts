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

import { EventEmitter } from 'events'

/**
 * Performance metric types
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary',
}

/**
 * Performance metric
 */
export interface Metric {
  name: string
  type: MetricType
  value: number
  timestamp: number
  labels?: Record<string, string>
  description?: string
  unit?: string
}

/**
 * Timer for measuring operations
 */
export interface Timer {
  id: string
  name: string
  startTime: number
  endTime?: number
  duration?: number
  metadata?: Record<string, unknown>
}

/**
 * Performance snapshot
 */
export interface PerformanceSnapshot {
  timestamp: number
  metrics: {
    analysisTime: {
      average: number
      min: number
      max: number
      p50: number
      p95: number
      p99: number
      count: number
    }
    throughput: {
      filesPerSecond: number
      linesPerSecond: number
      issuesPerSecond: number
    }
    memory: {
      heapUsed: number
      heapTotal: number
      external: number
      rss: number
    }
    cache: {
      hitRate: number
      size: number
      entries: number
    }
    errors: {
      count: number
      rate: number
    }
  }
  operations: {
    total: number
    successful: number
    failed: number
    pending: number
  }
}

/**
 * Performance alert
 */
export interface PerformanceAlert {
  id: string
  type: 'warning' | 'critical'
  metric: string
  threshold: number
  currentValue: number
  message: string
  timestamp: number
  resolved?: boolean
  resolvedAt?: number
}

/**
 * Alert threshold configuration
 */
export interface AlertThreshold {
  metric: string
  warningThreshold: number
  criticalThreshold: number
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  window?: number // Time window in ms
  cooldown?: number // Alert cooldown in ms
}

/**
 * Monitor configuration
 */
export interface MonitorConfig {
  enabled: boolean
  collectInterval: number
  historySize: number
  enableAlerts: boolean
  alertThresholds: AlertThreshold[]
  enableProfiling: boolean
  profilingInterval: number
  enableExport: boolean
  exportInterval: number
  exportEndpoint?: string
}

const DEFAULT_CONFIG: MonitorConfig = {
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
}

/**
 * Histogram for tracking distributions
 */
class Histogram {
  private values: number[] = []
  private sorted: boolean = false
  private maxSize: number

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize
  }

  record(value: number): void {
    this.values.push(value)
    this.sorted = false

    // Trim if over max size
    if (this.values.length > this.maxSize) {
      this.values = this.values.slice(-this.maxSize)
    }
  }

  private ensureSorted(): void {
    if (!this.sorted) {
      this.values.sort((a, b) => a - b)
      this.sorted = true
    }
  }

  percentile(p: number): number {
    if (this.values.length === 0) return 0
    this.ensureSorted()
    const index = Math.ceil((p / 100) * this.values.length) - 1
    return this.values[Math.max(0, index)]
  }

  average(): number {
    if (this.values.length === 0) return 0
    return this.values.reduce((a, b) => a + b, 0) / this.values.length
  }

  min(): number {
    if (this.values.length === 0) return 0
    this.ensureSorted()
    return this.values[0]
  }

  max(): number {
    if (this.values.length === 0) return 0
    this.ensureSorted()
    return this.values[this.values.length - 1]
  }

  count(): number {
    return this.values.length
  }

  sum(): number {
    return this.values.reduce((a, b) => a + b, 0)
  }

  reset(): void {
    this.values = []
    this.sorted = false
  }
}

/**
 * Rate limiter for tracking rates
 */
class RateTracker {
  private events: number[] = []
  private windowMs: number

  constructor(windowMs: number = 60000) {
    this.windowMs = windowMs
  }

  record(): void {
    const now = Date.now()
    this.events.push(now)
    this.cleanup(now)
  }

  getRate(): number {
    const now = Date.now()
    this.cleanup(now)
    return this.events.length / (this.windowMs / 1000) // Events per second
  }

  getCount(): number {
    const now = Date.now()
    this.cleanup(now)
    return this.events.length
  }

  private cleanup(now: number): void {
    const cutoff = now - this.windowMs
    while (this.events.length > 0 && this.events[0] < cutoff) {
      this.events.shift()
    }
  }
}

/**
 * Performance Monitor
 *
 * Comprehensive performance monitoring for the analysis engine.
 */
export class PerformanceMonitor extends EventEmitter {
  private config: MonitorConfig
  private activeTimers: Map<string, Timer> = new Map()
  private analysisTimeHistogram: Histogram
  private filesProcessed: RateTracker
  private linesProcessed: RateTracker
  private issuesFound: RateTracker
  private errors: RateTracker
  private operations: { total: number; successful: number; failed: number; pending: number }
  private snapshots: PerformanceSnapshot[] = []
  private activeAlerts: Map<string, PerformanceAlert> = new Map()
  private alertCooldowns: Map<string, number> = new Map()
  private collectInterval?: NodeJS.Timeout
  private timerCounter: number = 0

  constructor(config: Partial<MonitorConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.analysisTimeHistogram = new Histogram(this.config.historySize)
    this.filesProcessed = new RateTracker()
    this.linesProcessed = new RateTracker()
    this.issuesFound = new RateTracker()
    this.errors = new RateTracker()
    this.operations = { total: 0, successful: 0, failed: 0, pending: 0 }

    if (this.config.enabled) {
      this.startCollection()
    }
  }

  /**
   * Start a timer for an operation
   */
  startTimer(name: string, metadata?: Record<string, unknown>): string {
    const id = `timer-${++this.timerCounter}-${Date.now()}`
    const timer: Timer = {
      id,
      name,
      startTime: performance.now(),
      metadata,
    }
    this.activeTimers.set(id, timer)
    this.operations.pending++
    return id
  }

  /**
   * Stop a timer and record the duration
   */
  stopTimer(id: string, success: boolean = true): number {
    const timer = this.activeTimers.get(id)
    if (!timer) {
      return 0
    }

    timer.endTime = performance.now()
    timer.duration = timer.endTime - timer.startTime

    this.activeTimers.delete(id)
    this.operations.pending--
    this.operations.total++

    if (success) {
      this.operations.successful++
    } else {
      this.operations.failed++
      this.errors.record()
    }

    // Record in histogram if it's an analysis operation
    if (timer.name.includes('analysis')) {
      this.analysisTimeHistogram.record(timer.duration)
    }

    this.emit('timer-stopped', timer)
    return timer.duration
  }

  /**
   * Record a metric
   */
  recordMetric(metric: Omit<Metric, 'timestamp'>): void {
    const fullMetric: Metric = {
      ...metric,
      timestamp: Date.now(),
    }
    this.emit('metric', fullMetric)
  }

  /**
   * Record files processed
   */
  recordFilesProcessed(count: number = 1): void {
    for (let i = 0; i < count; i++) {
      this.filesProcessed.record()
    }
  }

  /**
   * Record lines processed
   */
  recordLinesProcessed(count: number): void {
    for (let i = 0; i < count; i++) {
      this.linesProcessed.record()
    }
  }

  /**
   * Record issues found
   */
  recordIssuesFound(count: number): void {
    for (let i = 0; i < count; i++) {
      this.issuesFound.record()
    }
  }

  /**
   * Record an error
   */
  recordError(): void {
    this.errors.record()
  }

  /**
   * Get current performance snapshot
   */
  getSnapshot(): PerformanceSnapshot {
    const memoryUsage = this.getMemoryUsage()

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
    }
  }

  /**
   * Get snapshot history
   */
  getHistory(): PerformanceSnapshot[] {
    return [...this.snapshots]
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values()).filter(a => !a.resolved)
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values())
  }

  /**
   * Get analysis time statistics
   */
  getAnalysisTimeStats(): {
    average: number
    min: number
    max: number
    p50: number
    p95: number
    p99: number
    count: number
  } {
    return {
      average: this.analysisTimeHistogram.average(),
      min: this.analysisTimeHistogram.min(),
      max: this.analysisTimeHistogram.max(),
      p50: this.analysisTimeHistogram.percentile(50),
      p95: this.analysisTimeHistogram.percentile(95),
      p99: this.analysisTimeHistogram.percentile(99),
      count: this.analysisTimeHistogram.count(),
    }
  }

  /**
   * Get throughput metrics
   */
  getThroughput(): {
    filesPerSecond: number
    linesPerSecond: number
    issuesPerSecond: number
  } {
    return {
      filesPerSecond: this.filesProcessed.getRate(),
      linesPerSecond: this.linesProcessed.getRate(),
      issuesPerSecond: this.issuesFound.getRate(),
    }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.analysisTimeHistogram.reset()
    this.operations = { total: 0, successful: 0, failed: 0, pending: 0 }
    this.activeTimers.clear()
    this.snapshots = []
    this.emit('reset')
  }

  /**
   * Shutdown the monitor
   */
  shutdown(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval)
    }
    this.emit('shutdown')
  }

  // Private methods

  private startCollection(): void {
    this.collectInterval = setInterval(() => {
      this.collectAndStore()
    }, this.config.collectInterval)
  }

  private collectAndStore(): void {
    const snapshot = this.getSnapshot()
    this.snapshots.push(snapshot)

    // Trim history
    if (this.snapshots.length > this.config.historySize) {
      this.snapshots = this.snapshots.slice(-this.config.historySize)
    }

    // Check alerts
    if (this.config.enableAlerts) {
      this.checkAlerts(snapshot)
    }

    this.emit('snapshot', snapshot)
  }

  private checkAlerts(snapshot: PerformanceSnapshot): void {
    for (const threshold of this.config.alertThresholds) {
      const value = this.getMetricValue(snapshot, threshold.metric)
      if (value === undefined) continue

      const alertKey = `${threshold.metric}`
      const existingAlert = this.activeAlerts.get(alertKey)

      // Check cooldown
      const lastAlert = this.alertCooldowns.get(alertKey)
      if (lastAlert && Date.now() - lastAlert < (threshold.cooldown || 60000)) {
        continue
      }

      const isViolation = this.checkThreshold(value, threshold)

      if (isViolation.critical || isViolation.warning) {
        const alert: PerformanceAlert = {
          id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: isViolation.critical ? 'critical' : 'warning',
          metric: threshold.metric,
          threshold: isViolation.critical ? threshold.criticalThreshold : threshold.warningThreshold,
          currentValue: value,
          message: `${threshold.metric} ${this.getOperatorText(threshold.operator)} threshold (${value.toFixed(2)} vs ${isViolation.critical ? threshold.criticalThreshold : threshold.warningThreshold})`,
          timestamp: Date.now(),
        }

        this.activeAlerts.set(alertKey, alert)
        this.alertCooldowns.set(alertKey, Date.now())
        this.emit('alert', alert)
      } else if (existingAlert && !existingAlert.resolved) {
        // Resolve existing alert
        existingAlert.resolved = true
        existingAlert.resolvedAt = Date.now()
        this.emit('alert-resolved', existingAlert)
      }
    }
  }

  private getMetricValue(snapshot: PerformanceSnapshot, path: string): number | undefined {
    const parts = path.split('.')
    let value: unknown = snapshot.metrics

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }

    return typeof value === 'number' ? value : undefined
  }

  private checkThreshold(value: number, threshold: AlertThreshold): { warning: boolean; critical: boolean } {
    const check = (target: number): boolean => {
      switch (threshold.operator) {
        case 'gt': return value > target
        case 'gte': return value >= target
        case 'lt': return value < target
        case 'lte': return value <= target
        case 'eq': return value === target
        default: return false
      }
    }

    return {
      warning: check(threshold.warningThreshold),
      critical: check(threshold.criticalThreshold),
    }
  }

  private getOperatorText(operator: string): string {
    const map: Record<string, string> = {
      gt: 'exceeded',
      gte: 'reached or exceeded',
      lt: 'fell below',
      lte: 'at or below',
      eq: 'equals',
    }
    return map[operator] || operator
  }

  private getMemoryUsage(): { heapUsed: number; heapTotal: number; external: number; rss: number } {
    // VS Code extension environment doesn't have direct access to process.memoryUsage()
    // Return estimated values based on environment
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const mem = process.memoryUsage()
        return {
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          external: mem.external,
          rss: mem.rss,
        }
      }
    } catch {
      // Ignore errors
    }

    // Return zeros if not available
    return {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
    }
  }
}

/**
 * Create a performance monitor instance
 */
export function createPerformanceMonitor(config?: Partial<MonitorConfig>): PerformanceMonitor {
  return new PerformanceMonitor(config)
}

/**
 * Singleton instance
 */
let performanceMonitor: PerformanceMonitor | null = null

export function getPerformanceMonitor(config?: Partial<MonitorConfig>): PerformanceMonitor {
  if (!performanceMonitor) {
    performanceMonitor = new PerformanceMonitor(config)
  }
  return performanceMonitor
}

/**
 * Decorator for timing function execution
 */
export function timed(name?: string) {
  return function (
    _target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value
    const timerName = name || propertyKey

    descriptor.value = async function (...args: unknown[]) {
      const monitor = getPerformanceMonitor()
      const timerId = monitor.startTimer(timerName)

      try {
        const result = await originalMethod.apply(this, args)
        monitor.stopTimer(timerId, true)
        return result
      } catch (error) {
        monitor.stopTimer(timerId, false)
        throw error
      }
    }

    return descriptor
  }
}
