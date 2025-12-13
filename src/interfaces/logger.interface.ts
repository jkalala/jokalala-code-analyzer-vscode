/**
 * Enhanced Logger Interface
 * Provides structured logging with context, performance tracking, and log management
 */

export interface ILogger {
  /**
   * Log a debug message
   * @param message The message to log
   * @param context Optional context data
   */
  debug(message: string, context?: LogContext): void

  /**
   * Log an info message
   * @param message The message to log
   * @param context Optional context data
   */
  info(message: string, context?: LogContext): void

  /**
   * Log a warning message
   * @param message The message to log
   * @param context Optional context data
   */
  warn(message: string, context?: LogContext): void

  /**
   * Log an error message
   * @param message The message to log
   * @param error Optional error object
   * @param context Optional context data
   */
  error(message: string, error?: Error, context?: LogContext): void

  /**
   * Start a performance timer
   * @param label The timer label
   * @returns Function to stop the timer and log the duration
   */
  startTimer(label: string): () => void

  /**
   * Log a performance metric
   * @param name The metric name
   * @param value The metric value
   * @param unit Optional unit of measurement
   */
  logMetric(name: string, value: number, unit?: string): void

  /**
   * Set the minimum log level
   * @param level The minimum level to log
   */
  setLevel(level: LogLevel): void

  /**
   * Get the current log level
   * @returns The current log level
   */
  getLevel(): LogLevel

  /**
   * Clear all logs
   */
  clear(): void

  /**
   * Export logs as a string
   * @returns Promise resolving to log content
   */
  export(): Promise<string>

  /**
   * Dispose of the logger and release resources
   */
  dispose(): void
}

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

export interface LogContext {
  [key: string]: any
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: {
    name: string
    message: string
    stack?: string
  }
}

export interface PerformanceMetric {
  name: string
  value: number
  unit: string
  timestamp: string
}
