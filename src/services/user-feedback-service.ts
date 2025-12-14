/**
 * User Feedback Service
 *
 * Collects anonymous feedback from users about vulnerability findings.
 * This data is used to:
 * 1. Track accuracy of vulnerability detection
 * 2. Improve false positive detection
 * 3. Train better models over time
 * 4. Track user engagement metrics
 */

import * as vscode from 'vscode'
import * as crypto from 'crypto'

/**
 * User action types for feedback
 */
export type UserAction =
  | 'ACCEPTED'      // User confirmed vulnerability is real
  | 'REJECTED'      // User marked as false positive
  | 'FIXED'         // User applied a fix
  | 'IGNORED'       // User dismissed without action
  | 'VIEWED'        // User viewed details
  | 'COPIED_FIX'    // User copied fix code

/**
 * User feedback entry
 */
export interface UserFeedback {
  id: string
  vulnerabilityId: string
  vulnerabilityType: string
  severity: string
  confidence: number
  userAction: UserAction
  timestamp: number
  userIdHash: string           // Anonymous user identifier
  sessionId: string
  language?: string | undefined
  fileName?: string | undefined            // Anonymized (just extension)
  lineCount?: number | undefined
  fixApplied?: string | undefined          // Which fix approach was used
  timeToAction?: number | undefined        // Milliseconds from display to action
  metadata?: Record<string, unknown> | undefined
}

/**
 * Aggregated accuracy metrics
 */
export interface AccuracyMetrics {
  totalFeedback: number
  acceptedCount: number
  rejectedCount: number
  fixedCount: number
  acceptanceRate: number       // accepted / (accepted + rejected)
  byVulnerabilityType: Record<string, {
    total: number
    accepted: number
    rejected: number
    acceptanceRate: number
  }>
  byLanguage: Record<string, {
    total: number
    accepted: number
    rejected: number
  }>
  bySeverity: Record<string, {
    total: number
    accepted: number
    rejected: number
  }>
}

/**
 * User Feedback Service class
 */
export class UserFeedbackService {
  private feedbackBuffer: UserFeedback[] = []
  private viewTimestamps: Map<string, number> = new Map()
  private userIdHash: string
  private sessionId: string
  private readonly BUFFER_SIZE = 50
  private readonly FLUSH_INTERVAL_MS = 300000 // 5 minutes
  private flushTimer: NodeJS.Timeout | null = null
  private storageKey = 'jokalala.userFeedback'
  private metricsKey = 'jokalala.accuracyMetrics'
  private globalState: vscode.Memento | null = null
  private telemetryEnabled: boolean = true

  constructor() {
    // Generate anonymous user ID hash
    this.userIdHash = this.generateUserIdHash()
    this.sessionId = crypto.randomUUID()
  }

  /**
   * Initialize with VSCode extension context
   */
  initialize(context: vscode.ExtensionContext): void {
    this.globalState = context.globalState

    // Load existing feedback from storage
    this.loadFromStorage()

    // Check telemetry opt-out
    const config = vscode.workspace.getConfiguration('jokalala')
    this.telemetryEnabled = config.get('enableTelemetry', true)

    // Start periodic flush
    this.startFlushTimer()

    // Register for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('jokalala.enableTelemetry')) {
          this.telemetryEnabled = vscode.workspace
            .getConfiguration('jokalala')
            .get('enableTelemetry', true)
        }
      })
    )

    console.log('[UserFeedback] Service initialized')
  }

  /**
   * Generate anonymous user ID hash
   */
  private generateUserIdHash(): string {
    try {
      // Use machine ID if available for consistency across sessions
      const machineId = vscode.env.machineId || crypto.randomUUID()
      return crypto
        .createHash('sha256')
        .update(machineId)
        .digest('hex')
        .substring(0, 16)
    } catch {
      return crypto.randomUUID().substring(0, 16)
    }
  }

  /**
   * Record when a vulnerability is viewed
   */
  recordView(vulnerabilityId: string): void {
    this.viewTimestamps.set(vulnerabilityId, Date.now())
  }

  /**
   * Record user feedback on a vulnerability
   */
  recordFeedback(
    vulnerabilityId: string,
    vulnerabilityType: string,
    severity: string,
    confidence: number,
    action: UserAction,
    options?: {
      language?: string | undefined
      fileName?: string | undefined
      lineCount?: number | undefined
      fixApplied?: string | undefined
      metadata?: Record<string, unknown> | undefined
    }
  ): void {
    if (!this.telemetryEnabled) {
      console.log('[UserFeedback] Telemetry disabled, skipping feedback')
      return
    }

    // Calculate time to action
    const viewTime = this.viewTimestamps.get(vulnerabilityId)
    const timeToAction = viewTime ? Date.now() - viewTime : undefined

    // Anonymize file name (keep only extension)
    const anonymizedFileName = options?.fileName
      ? `.${options.fileName.split('.').pop()}`
      : undefined

    const feedback: UserFeedback = {
      id: crypto.randomUUID(),
      vulnerabilityId,
      vulnerabilityType,
      severity,
      confidence,
      userAction: action,
      timestamp: Date.now(),
      userIdHash: this.userIdHash,
      sessionId: this.sessionId,
      language: options?.language,
      fileName: anonymizedFileName,
      lineCount: options?.lineCount,
      fixApplied: options?.fixApplied,
      timeToAction,
      metadata: options?.metadata
    }

    this.feedbackBuffer.push(feedback)
    this.updateLocalMetrics(feedback)

    console.log(`[UserFeedback] Recorded ${action} for ${vulnerabilityType}`)

    // Flush if buffer is full
    if (this.feedbackBuffer.length >= this.BUFFER_SIZE) {
      void this.flush()
    }
  }

  /**
   * Record that user accepted a vulnerability as real
   */
  recordAccepted(
    vulnerabilityId: string,
    vulnerabilityType: string,
    severity: string,
    confidence: number,
    language?: string
  ): void {
    this.recordFeedback(
      vulnerabilityId,
      vulnerabilityType,
      severity,
      confidence,
      'ACCEPTED',
      { language }
    )
  }

  /**
   * Record that user rejected a vulnerability as false positive
   */
  recordRejected(
    vulnerabilityId: string,
    vulnerabilityType: string,
    severity: string,
    confidence: number,
    language?: string,
    reason?: string
  ): void {
    this.recordFeedback(
      vulnerabilityId,
      vulnerabilityType,
      severity,
      confidence,
      'REJECTED',
      { language, metadata: { reason } }
    )
  }

  /**
   * Record that user fixed a vulnerability
   */
  recordFixed(
    vulnerabilityId: string,
    vulnerabilityType: string,
    severity: string,
    confidence: number,
    fixApplied: string,
    language?: string
  ): void {
    this.recordFeedback(
      vulnerabilityId,
      vulnerabilityType,
      severity,
      confidence,
      'FIXED',
      { language, fixApplied }
    )
  }

  /**
   * Record that user copied fix code
   */
  recordCopiedFix(
    vulnerabilityId: string,
    vulnerabilityType: string,
    severity: string,
    confidence: number,
    fixApplied: string,
    language?: string
  ): void {
    this.recordFeedback(
      vulnerabilityId,
      vulnerabilityType,
      severity,
      confidence,
      'COPIED_FIX',
      { language, fixApplied }
    )
  }

  /**
   * Update local accuracy metrics
   */
  private updateLocalMetrics(feedback: UserFeedback): void {
    const metrics = this.getLocalMetrics()

    metrics.totalFeedback++

    switch (feedback.userAction) {
      case 'ACCEPTED':
        metrics.acceptedCount++
        break
      case 'REJECTED':
        metrics.rejectedCount++
        break
      case 'FIXED':
        metrics.fixedCount++
        metrics.acceptedCount++ // Fixed implies accepted
        break
    }

    // Update acceptance rate
    const totalDecisions = metrics.acceptedCount + metrics.rejectedCount
    metrics.acceptanceRate = totalDecisions > 0
      ? metrics.acceptedCount / totalDecisions
      : 0

    // Update by vulnerability type
    if (!metrics.byVulnerabilityType[feedback.vulnerabilityType]) {
      metrics.byVulnerabilityType[feedback.vulnerabilityType] = {
        total: 0,
        accepted: 0,
        rejected: 0,
        acceptanceRate: 0
      }
    }
    const typeMetrics = metrics.byVulnerabilityType[feedback.vulnerabilityType]
    if (typeMetrics) {
      typeMetrics.total++
      if (feedback.userAction === 'ACCEPTED' || feedback.userAction === 'FIXED') {
        typeMetrics.accepted++
      } else if (feedback.userAction === 'REJECTED') {
        typeMetrics.rejected++
      }
      typeMetrics.acceptanceRate = typeMetrics.accepted / (typeMetrics.accepted + typeMetrics.rejected) || 0
    }

    // Update by language
    if (feedback.language) {
      if (!metrics.byLanguage[feedback.language]) {
        metrics.byLanguage[feedback.language] = {
          total: 0,
          accepted: 0,
          rejected: 0
        }
      }
      const langMetrics = metrics.byLanguage[feedback.language]
      if (langMetrics) {
        langMetrics.total++
        if (feedback.userAction === 'ACCEPTED' || feedback.userAction === 'FIXED') {
          langMetrics.accepted++
        } else if (feedback.userAction === 'REJECTED') {
          langMetrics.rejected++
        }
      }
    }

    // Update by severity
    if (!metrics.bySeverity[feedback.severity]) {
      metrics.bySeverity[feedback.severity] = {
        total: 0,
        accepted: 0,
        rejected: 0
      }
    }
    const sevMetrics = metrics.bySeverity[feedback.severity]
    if (sevMetrics) {
      sevMetrics.total++
      if (feedback.userAction === 'ACCEPTED' || feedback.userAction === 'FIXED') {
        sevMetrics.accepted++
      } else if (feedback.userAction === 'REJECTED') {
        sevMetrics.rejected++
      }
    }

    this.saveMetrics(metrics)
  }

  /**
   * Get local accuracy metrics
   */
  getLocalMetrics(): AccuracyMetrics {
    if (!this.globalState) {
      return this.createEmptyMetrics()
    }

    const stored = this.globalState.get<AccuracyMetrics>(this.metricsKey)
    return stored || this.createEmptyMetrics()
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): AccuracyMetrics {
    return {
      totalFeedback: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      fixedCount: 0,
      acceptanceRate: 0,
      byVulnerabilityType: {},
      byLanguage: {},
      bySeverity: {}
    }
  }

  /**
   * Save metrics to storage
   */
  private saveMetrics(metrics: AccuracyMetrics): void {
    if (this.globalState) {
      void this.globalState.update(this.metricsKey, metrics)
    }
  }

  /**
   * Flush feedback buffer to backend (or local storage)
   */
  async flush(): Promise<void> {
    if (this.feedbackBuffer.length === 0) {
      return
    }

    const feedbackToSend = [...this.feedbackBuffer]
    this.feedbackBuffer = []

    try {
      // For now, store locally. In production, send to backend API
      await this.storeLocally(feedbackToSend)

      // Optionally send to backend if configured
      const apiUrl = vscode.workspace
        .getConfiguration('jokalala')
        .get<string>('feedbackApiUrl')

      if (apiUrl && this.telemetryEnabled) {
        await this.sendToBackend(apiUrl, feedbackToSend)
      }

      console.log(`[UserFeedback] Flushed ${feedbackToSend.length} feedback entries`)
    } catch (error) {
      console.error('[UserFeedback] Failed to flush feedback:', error)
      // Put feedback back in buffer
      this.feedbackBuffer = [...feedbackToSend, ...this.feedbackBuffer]
    }
  }

  /**
   * Store feedback locally
   */
  private async storeLocally(feedback: UserFeedback[]): Promise<void> {
    if (!this.globalState) {
      return
    }

    const existing = this.globalState.get<UserFeedback[]>(this.storageKey) || []
    const combined = [...existing, ...feedback]

    // Keep only last 1000 entries
    const trimmed = combined.slice(-1000)

    await this.globalState.update(this.storageKey, trimmed)
  }

  /**
   * Send feedback to backend API
   */
  private async sendToBackend(apiUrl: string, feedback: UserFeedback[]): Promise<void> {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          feedback,
          extensionVersion: vscode.extensions.getExtension('jokalala.code-analysis')?.packageJSON?.version,
          timestamp: Date.now()
        })
      })

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }
    } catch (error) {
      console.warn('[UserFeedback] Backend send failed:', error)
      // Don't throw - this is non-critical
    }
  }

  /**
   * Load feedback from storage
   */
  private loadFromStorage(): void {
    if (!this.globalState) {
      return
    }

    const stored = this.globalState.get<UserFeedback[]>(this.storageKey)
    if (stored) {
      console.log(`[UserFeedback] Loaded ${stored.length} historical feedback entries`)
    }
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }

    this.flushTimer = setInterval(() => {
      void this.flush()
    }, this.FLUSH_INTERVAL_MS)
  }

  /**
   * Get accuracy statistics for display
   */
  getAccuracyStats(): {
    overall: string
    byType: Array<{ type: string; rate: string; count: number }>
  } {
    const metrics = this.getLocalMetrics()

    const byType = Object.entries(metrics.byVulnerabilityType)
      .map(([type, data]) => ({
        type,
        rate: `${Math.round(data.acceptanceRate * 100)}%`,
        count: data.total
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10) // Top 10

    return {
      overall: `${Math.round(metrics.acceptanceRate * 100)}%`,
      byType
    }
  }

  /**
   * Dispose service
   */
  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    // Final flush
    void this.flush()
  }
}

/**
 * Singleton instance
 */
export const userFeedbackService = new UserFeedbackService()
