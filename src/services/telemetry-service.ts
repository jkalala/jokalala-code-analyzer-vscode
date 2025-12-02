/**
 * Telemetry Service Implementation
 * Handles anonymous usage data collection with PII anonymization
 */

import * as crypto from 'crypto'
import * as vscode from 'vscode'
import { TELEMETRY_DEFAULTS } from '../constants'
import { ITelemetryService, TelemetryEvent } from '../interfaces'

export class TelemetryService implements ITelemetryService {
  private enabled: boolean = true
  private eventQueue: TelemetryEvent[] = []
  private sessionId: string
  private userId: string
  private flushTimer?: NodeJS.Timeout
  private readonly batchSize: number
  private readonly flushInterval: number

  constructor(
    private readonly endpoint?: string,
    batchSize: number = TELEMETRY_DEFAULTS.batchSize,
    flushInterval: number = TELEMETRY_DEFAULTS.flushInterval
  ) {
    this.batchSize = batchSize
    this.flushInterval = flushInterval

    // Generate anonymized session and user IDs
    this.sessionId = this.generateSessionId()
    this.userId = this.generateUserId()

    // Start periodic flush
    this.startPeriodicFlush()
  }

  trackEvent(eventName: string, properties?: Record<string, any>): void {
    if (!this.enabled) {
      return
    }

    const event: TelemetryEvent = {
      eventName: this.sanitizeEventName(eventName),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
      properties: this.anonymizeProperties(properties || {}),
    }

    this.eventQueue.push(event)

    // Auto-flush if batch size reached
    if (this.eventQueue.length >= this.batchSize) {
      void this.flush()
    }
  }

  trackError(error: Error, properties?: Record<string, any>): void {
    if (!this.enabled) {
      return
    }

    const errorProperties = {
      errorName: error.name,
      errorMessage: this.sanitizeErrorMessage(error.message),
      errorStack: this.sanitizeStackTrace(error.stack),
      ...this.anonymizeProperties(properties || {}),
    }

    this.trackEvent('error', errorProperties)
  }

  trackMetric(
    name: string,
    value: number,
    properties?: Record<string, any>
  ): void {
    if (!this.enabled) {
      return
    }

    const metricProperties = {
      metricName: this.sanitizeEventName(name),
      metricValue: value,
      ...this.anonymizeProperties(properties || {}),
    }

    this.trackEvent('metric', metricProperties)
  }

  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return
    }

    const eventsToSend = [...this.eventQueue]
    this.eventQueue = []

    if (!this.endpoint) {
      // No endpoint configured, just clear the queue
      return
    }

    try {
      // Send events to telemetry endpoint
      // In a real implementation, this would use axios or fetch
      // For now, we'll just log that we would send
      console.log(
        `[Telemetry] Would send ${eventsToSend.length} events to ${this.endpoint}`
      )
    } catch (error) {
      // Silently fail - telemetry should never break the extension
      console.error('[Telemetry] Failed to send events:', error)
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled

    if (!enabled) {
      // Clear queued events when disabling
      this.eventQueue = []
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = undefined as any
    }

    // Flush remaining events
    void this.flush()
  }

  /**
   * Generate an anonymized session ID
   * Uses a hash of the current timestamp and random data
   */
  private generateSessionId(): string {
    const data = `${Date.now()}-${Math.random()}-${process.pid}`
    return this.hash(data)
  }

  /**
   * Generate an anonymized user ID
   * Uses a hash of the VS Code machine ID
   */
  private generateUserId(): string {
    try {
      const machineId = vscode.env.machineId
      return this.hash(machineId)
    } catch (error) {
      // Fallback to random ID if machine ID is not available
      return this.hash(`fallback-${Date.now()}-${Math.random()}`)
    }
  }

  /**
   * Hash a string using SHA-256
   */
  private hash(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex')
      .substring(0, 16)
  }

  /**
   * Anonymize properties by removing PII
   */
  private anonymizeProperties(
    properties: Record<string, any>
  ): Record<string, any> {
    const anonymized: Record<string, any> = {}

    for (const [key, value] of Object.entries(properties)) {
      // Skip null or undefined values
      if (value === null || value === undefined) {
        continue
      }

      // Anonymize known PII fields
      if (this.isPIIField(key)) {
        anonymized[key] = '[REDACTED]'
        continue
      }

      // Anonymize file paths
      if (typeof value === 'string' && this.looksLikeFilePath(value)) {
        anonymized[key] = this.anonymizeFilePath(value)
        continue
      }

      // Recursively anonymize nested objects
      if (typeof value === 'object' && !Array.isArray(value)) {
        anonymized[key] = this.anonymizeProperties(value)
        continue
      }

      // Keep safe values as-is
      anonymized[key] = value
    }

    return anonymized
  }

  /**
   * Check if a field name indicates PII
   */
  private isPIIField(fieldName: string): boolean {
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
    ]

    return piiPatterns.some(pattern => pattern.test(fieldName))
  }

  /**
   * Check if a string looks like a file path
   */
  private looksLikeFilePath(value: string): boolean {
    // Check for common path patterns
    return (
      value.includes('/') ||
      value.includes('\\') ||
      /^[a-zA-Z]:\\/.test(value) || // Windows absolute path
      value.startsWith('~') || // Unix home directory
      value.startsWith('.')
    ) // Relative path
  }

  /**
   * Anonymize file paths by keeping only the file extension and directory depth
   */
  private anonymizeFilePath(path: string): string {
    const parts = path.split(/[/\\]/)
    const fileName = parts[parts.length - 1]
    const extension =
      fileName && fileName.includes('.')
        ? fileName.substring(fileName.lastIndexOf('.'))
        : ''

    return `<path-depth-${parts.length}>/<file>${extension}`
  }

  /**
   * Sanitize event names to remove special characters
   */
  private sanitizeEventName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
  }

  /**
   * Sanitize error messages to remove potential PII
   */
  private sanitizeErrorMessage(message: string): string {
    // Remove file paths
    let sanitized = message.replace(/[a-zA-Z]:\\[^\s]+/g, '<path>')
    sanitized = sanitized.replace(/\/[^\s]+/g, '<path>')

    // Remove URLs
    sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '<url>')

    // Remove email addresses
    sanitized = sanitized.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '<email>'
    )

    // Remove potential tokens (long alphanumeric strings)
    sanitized = sanitized.replace(/[a-zA-Z0-9]{32,}/g, '<token>')

    return sanitized
  }

  /**
   * Sanitize stack traces to remove file paths
   */
  private sanitizeStackTrace(stack?: string): string | undefined {
    if (!stack) {
      return undefined
    }

    // Remove file paths but keep function names and line numbers
    let sanitized = stack.replace(/[a-zA-Z]:\\[^\s:]+/g, '<path>')
    sanitized = sanitized.replace(/\/[^\s:]+/g, '<path>')

    return sanitized
  }

  /**
   * Start periodic flush timer
   */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      void this.flush()
    }, this.flushInterval)
  }
}
