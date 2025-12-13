/**
 * Telemetry Service Interface
 * Handles anonymous usage data collection with PII anonymization
 */

export interface ITelemetryService {
  /**
   * Track a custom event
   * @param eventName The name of the event
   * @param properties Optional event properties
   */
  trackEvent(eventName: string, properties?: Record<string, any>): void

  /**
   * Track an error occurrence
   * @param error The error that occurred
   * @param properties Optional additional context
   */
  trackError(error: Error, properties?: Record<string, any>): void

  /**
   * Track a performance metric
   * @param name The metric name
   * @param value The metric value
   * @param properties Optional additional context
   */
  trackMetric(
    name: string,
    value: number,
    properties?: Record<string, any>
  ): void

  /**
   * Flush all pending telemetry events
   */
  flush(): Promise<void>

  /**
   * Enable or disable telemetry collection
   * @param enabled True to enable, false to disable
   */
  setEnabled(enabled: boolean): void

  /**
   * Check if telemetry is currently enabled
   * @returns True if telemetry is enabled
   */
  isEnabled(): boolean
}

export interface TelemetryEvent {
  eventName: string
  timestamp: number
  sessionId: string
  userId: string
  properties: Record<string, any>
}

export interface TelemetryConfig {
  enabled: boolean
  endpoint?: string
  batchSize: number
  flushInterval: number
}
