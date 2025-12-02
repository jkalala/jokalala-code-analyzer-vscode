import * as vscode from 'vscode'
import {
  ILogger,
  LogContext,
  LogEntry,
  LogLevel,
  PerformanceMetric,
} from '../interfaces/logger.interface'

export class Logger implements ILogger {
  private readonly channel = vscode.window.createOutputChannel(
    'Jokalala Code Analysis'
  )
  private currentLevel: LogLevel = LogLevel.Info
  private logEntries: LogEntry[] = []
  private readonly maxLogEntries = 1000
  private performanceMetrics: PerformanceMetric[] = []

  /**
   * Log a debug message with optional context
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.Debug, message, undefined, context)
  }

  /**
   * Log an info message with optional context
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.Info, message, undefined, context)
  }

  /**
   * Log a warning message with optional context
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.Warn, message, undefined, context)
  }

  /**
   * Log an error message with optional error object and context
   */
  error(message: string, error?: Error, context?: LogContext): void {
    this.log(LogLevel.Error, message, error, context)
  }

  /**
   * Start a performance timer
   * @param label The timer label
   * @returns Function to stop the timer and log the duration
   */
  startTimer(label: string): () => void {
    const startTime = Date.now()
    return () => {
      const duration = Date.now() - startTime
      this.logMetric(label, duration, 'ms')
    }
  }

  /**
   * Log a performance metric
   */
  logMetric(name: string, value: number, unit: string = 'ms'): void {
    const timestamp = new Date().toISOString()
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp,
    }

    this.performanceMetrics.push(metric)

    // Keep only last 500 metrics
    if (this.performanceMetrics.length > 500) {
      this.performanceMetrics.shift()
    }

    // Log the metric if level allows
    if (this.currentLevel <= LogLevel.Debug) {
      const line = `[${timestamp}] [METRIC] ${name}: ${value}${unit}`
      this.channel.appendLine(line)
    }
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level
    this.info(`Log level set to ${LogLevel[level]}`)
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.currentLevel
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logEntries = []
    this.performanceMetrics = []
    this.channel.clear()
  }

  /**
   * Export logs as a string
   */
  async export(): Promise<string> {
    const lines: string[] = []

    lines.push('=== Jokalala Code Analysis Logs ===')
    lines.push(`Exported at: ${new Date().toISOString()}`)
    lines.push(`Total entries: ${this.logEntries.length}`)
    lines.push('')

    // Export log entries
    lines.push('--- Log Entries ---')
    for (const entry of this.logEntries) {
      lines.push(this.formatLogEntry(entry))
    }

    // Export performance metrics
    if (this.performanceMetrics.length > 0) {
      lines.push('')
      lines.push('--- Performance Metrics ---')
      for (const metric of this.performanceMetrics) {
        lines.push(
          `[${metric.timestamp}] ${metric.name}: ${metric.value}${metric.unit}`
        )
      }
    }

    return lines.join('\n')
  }

  /**
   * Dispose of the logger and release resources
   */
  dispose(): void {
    this.logEntries = []
    this.performanceMetrics = []
    this.channel.dispose()
  }

  /**
   * Internal log method with level filtering and structured logging
   */
  private log(
    level: LogLevel,
    message: string,
    error?: Error,
    context?: LogContext
  ): void {
    // Filter based on log level
    if (level < this.currentLevel) {
      return
    }

    const timestamp = new Date().toISOString()

    // Create structured log entry
    const entry: LogEntry = {
      timestamp,
      level,
      message,
      ...(context && { context }),
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        ...(error.stack && { stack: error.stack }),
      }
    }

    // Store in memory
    this.logEntries.push(entry)

    // Keep only last maxLogEntries
    if (this.logEntries.length > this.maxLogEntries) {
      this.logEntries.shift()
    }

    // Format and output to channel
    const line = this.formatLogEntry(entry)
    this.channel.appendLine(line)

    // Also log to console
    const consoleMethod =
      level === LogLevel.Error
        ? 'error'
        : level === LogLevel.Warn
          ? 'warn'
          : level === LogLevel.Debug
            ? 'debug'
            : 'log'
    console[consoleMethod](line)
  }

  /**
   * Format a log entry for display
   */
  private formatLogEntry(entry: LogEntry): string {
    const levelName = LogLevel[entry.level].toUpperCase()
    let line = `[${entry.timestamp}] [${levelName}] ${entry.message}`

    // Add context if present
    if (entry.context && Object.keys(entry.context).length > 0) {
      try {
        const contextStr = JSON.stringify(entry.context)
        line += ` | Context: ${contextStr}`
      } catch (error) {
        line += ` | Context: [Unable to serialize]`
      }
    }

    // Add error details if present
    if (entry.error) {
      line += `\n  Error: ${entry.error.name}: ${entry.error.message}`
      if (entry.error.stack) {
        line += `\n  Stack: ${entry.error.stack}`
      }
    }

    return line
  }
}
