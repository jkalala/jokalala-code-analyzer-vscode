/**
 * Telemetry Service V2 with hardcoded endpoint allowlist
 */

import * as crypto from 'crypto'
import * as vscode from 'vscode'

// SECURITY: Hardcoded allowlist - cannot be overridden by configuration
const ALLOWED_ENDPOINTS = Object.freeze([
  'https://telemetry.jokalala.com/v1/events',
  'https://telemetry.jokalala.io/v1/events',
])

interface TelemetryEvent {
  eventName: string
  timestamp: number
  sessionId: string
  userId: string
  properties: Record<string, unknown>
}

export class TelemetryServiceV2 {
  private enabled = false
  private queue: TelemetryEvent[] = []
  private sessionId: string
  private userId: string
  private readonly endpoint = ALLOWED_ENDPOINTS[0]
  private flushTimer: NodeJS.Timeout | null = null

  constructor(config?: { enabled?: boolean }) {
    this.enabled = config?.enabled ?? false
    this.sessionId = this.hash(`${Date.now()}-${Math.random()}`)
    this.userId = this.hash(vscode.env.machineId)
    this.checkSettings()
  }

  private checkSettings(): void {
    // Respect VS Code global telemetry setting
    this.enabled = this.enabled && vscode.env.isTelemetryEnabled
  }

  private hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16)
  }

  trackEvent(name: string, props?: Record<string, unknown>): void {
    if (!this.enabled) return

    this.queue.push({
      eventName: name.replace(/[^a-zA-Z0-9_.-]/g, '_'),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
      properties: this.anonymize(props || {}),
    })

    if (this.queue.length >= 10) {
      this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 30000)
    }
  }

  trackError(error: Error, props?: Record<string, unknown>): void {
    this.trackEvent('error', {
      errorName: error.name,
      errorMessage: this.sanitize(error.message),
      ...props,
    })
  }

  trackActivation(success: boolean, duration: number): void {
    this.trackEvent('activation', {
      success,
      durationMs: duration,
      extensionVersion: vscode.extensions.getExtension('jokalala.jokalala-code-analysis')?.packageJSON.version,
      vscodeVersion: vscode.version,
      platform: process.platform,
    })
  }

  trackAnalysis(language: string, duration: number, issuesFound: number): void {
    this.trackEvent('analysis', {
      language,
      durationMs: duration,
      issuesFound,
    })
  }

  private anonymize(props: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const piiPatterns = /email|password|token|key|secret|auth|credential|api[_-]?key/i

    for (const [k, v] of Object.entries(props)) {
      if (piiPatterns.test(k)) {
        result[k] = '[REDACTED]'
      } else if (typeof v === 'string' && (v.includes('/') || v.includes('\\'))) {
        result[k] = '<path>'
      } else {
        result[k] = v
      }
    }
    return result
  }

  private sanitize(msg: string): string {
    return msg
      .replace(/[a-zA-Z]:\\[^\s]+/g, '<path>')
      .replace(/\/[^\s]+/g, '<path>')
      .replace(/[a-zA-Z0-9_-]{32,}/g, '<token>')
      .substring(0, 500)
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    if (!this.enabled || !this.queue.length) {
      this.queue = []
      return
    }

    // SECURITY: Validate endpoint against allowlist
    if (!ALLOWED_ENDPOINTS.includes(this.endpoint)) {
      console.warn('Telemetry endpoint not in allowlist, discarding events')
      this.queue = []
      return
    }

    const events = [...this.queue]
    this.queue = []

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      })
    } catch {
      // Silently fail - telemetry should never break the extension
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled && vscode.env.isTelemetryEnabled
    if (!this.enabled) {
      this.queue = []
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }
    this.flush()
  }
}

export const telemetryServiceV2 = new TelemetryServiceV2()
