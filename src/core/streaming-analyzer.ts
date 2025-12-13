/**
 * Result Streaming Architecture
 *
 * Real-time streaming of analysis results for improved user experience.
 * Shows results as they are found instead of waiting for complete analysis.
 *
 * Features:
 * - Progressive result delivery
 * - Priority-based streaming (critical issues first)
 * - Backpressure handling
 * - Connection resilience
 * - Real-time progress updates
 *
 * @module core/streaming-analyzer
 */

import { EventEmitter } from 'events'

/**
 * Stream event types
 */
export enum StreamEventType {
  STARTED = 'started',
  PROGRESS = 'progress',
  ISSUE = 'issue',
  BATCH = 'batch',
  METRICS = 'metrics',
  COMPLETED = 'completed',
  ERROR = 'error',
  CANCELLED = 'cancelled',
}

/**
 * Stream message
 */
export interface StreamMessage<T = unknown> {
  type: StreamEventType
  timestamp: number
  sequenceNumber: number
  payload: T
  metadata?: Record<string, unknown>
}

/**
 * Analysis progress update
 */
export interface ProgressUpdate {
  phase: AnalysisPhase
  phaseProgress: number
  overallProgress: number
  currentFile?: string
  filesProcessed: number
  totalFiles: number
  issuesFound: number
  estimatedTimeRemaining?: number
  message: string
}

/**
 * Analysis phases
 */
export enum AnalysisPhase {
  INITIALIZING = 'initializing',
  PARSING = 'parsing',
  PATTERN_MATCHING = 'pattern_matching',
  DATA_FLOW = 'data_flow',
  TAINT_ANALYSIS = 'taint_analysis',
  LLM_ENHANCEMENT = 'llm_enhancement',
  AGGREGATION = 'aggregation',
  FINALIZING = 'finalizing',
}

/**
 * Streaming issue
 */
export interface StreamingIssue {
  id: string
  ruleId: string
  severity: string
  title: string
  description: string
  file: string
  line: number
  column: number
  confidence: number
  codeSnippet?: string
  suggestion?: string
  fixAvailable?: boolean
}

/**
 * Stream configuration
 */
export interface StreamConfig {
  bufferSize: number
  batchSize: number
  batchTimeout: number
  enablePrioritization: boolean
  enableBackpressure: boolean
  maxQueueSize: number
  heartbeatInterval: number
  reconnectAttempts: number
  reconnectDelay: number
}

const DEFAULT_STREAM_CONFIG: StreamConfig = {
  bufferSize: 100,
  batchSize: 10,
  batchTimeout: 100,
  enablePrioritization: true,
  enableBackpressure: true,
  maxQueueSize: 1000,
  heartbeatInterval: 5000,
  reconnectAttempts: 3,
  reconnectDelay: 1000,
}

/**
 * Backpressure controller for flow control
 */
class BackpressureController {
  private highWaterMark: number
  private lowWaterMark: number
  private currentLevel: number = 0
  private paused: boolean = false
  private onDrain?: () => void

  constructor(highWaterMark: number, lowWaterMark: number = highWaterMark * 0.5) {
    this.highWaterMark = highWaterMark
    this.lowWaterMark = lowWaterMark
  }

  add(count: number = 1): boolean {
    this.currentLevel += count
    if (this.currentLevel >= this.highWaterMark) {
      this.paused = true
      return false
    }
    return true
  }

  remove(count: number = 1): void {
    this.currentLevel = Math.max(0, this.currentLevel - count)
    if (this.paused && this.currentLevel <= this.lowWaterMark) {
      this.paused = false
      this.onDrain?.()
    }
  }

  isPaused(): boolean {
    return this.paused
  }

  setDrainHandler(handler: () => void): void {
    this.onDrain = handler
  }

  getLevel(): number {
    return this.currentLevel
  }
}

/**
 * Priority queue for streaming issues
 */
class StreamingPriorityQueue<T extends { severity: string }> {
  private queues: Map<string, T[]> = new Map([
    ['critical', []],
    ['high', []],
    ['medium', []],
    ['low', []],
    ['info', []],
  ])

  enqueue(item: T): void {
    const queue = this.queues.get(item.severity) || this.queues.get('medium')!
    queue.push(item)
  }

  dequeue(): T | undefined {
    for (const severity of ['critical', 'high', 'medium', 'low', 'info']) {
      const queue = this.queues.get(severity)!
      if (queue.length > 0) {
        return queue.shift()
      }
    }
    return undefined
  }

  dequeueBatch(size: number): T[] {
    const batch: T[] = []
    while (batch.length < size) {
      const item = this.dequeue()
      if (!item) break
      batch.push(item)
    }
    return batch
  }

  size(): number {
    let total = 0
    for (const queue of this.queues.values()) {
      total += queue.length
    }
    return total
  }

  isEmpty(): boolean {
    return this.size() === 0
  }

  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0
    }
  }
}

/**
 * Stream subscriber interface
 */
export interface StreamSubscriber {
  onMessage(message: StreamMessage): void
  onError?(error: Error): void
  onComplete?(): void
}

/**
 * Streaming Analysis Manager
 *
 * Provides real-time streaming of analysis results with intelligent
 * prioritization and flow control.
 */
export class StreamingAnalyzer extends EventEmitter {
  private config: StreamConfig
  private issueQueue: StreamingPriorityQueue<StreamingIssue>
  private backpressure: BackpressureController
  private subscribers: Set<StreamSubscriber> = new Set()
  private sequenceNumber: number = 0
  private batchBuffer: StreamingIssue[] = []
  private batchTimer?: NodeJS.Timeout
  private heartbeatTimer?: NodeJS.Timeout
  private isRunning: boolean = false
  private currentAnalysis?: {
    id: string
    startTime: number
    phase: AnalysisPhase
    filesProcessed: number
    totalFiles: number
    issuesFound: number
  }

  constructor(config: Partial<StreamConfig> = {}) {
    super()
    this.config = { ...DEFAULT_STREAM_CONFIG, ...config }
    this.issueQueue = new StreamingPriorityQueue()
    this.backpressure = new BackpressureController(this.config.maxQueueSize)

    this.backpressure.setDrainHandler(() => {
      this.emit('drain')
      this.processQueue()
    })
  }

  /**
   * Start a streaming analysis session
   */
  async startAnalysis(options: {
    analysisId: string
    totalFiles: number
    metadata?: Record<string, unknown>
  }): Promise<void> {
    this.isRunning = true
    this.sequenceNumber = 0

    this.currentAnalysis = {
      id: options.analysisId,
      startTime: Date.now(),
      phase: AnalysisPhase.INITIALIZING,
      filesProcessed: 0,
      totalFiles: options.totalFiles,
      issuesFound: 0,
    }

    // Send start message
    this.broadcast({
      type: StreamEventType.STARTED,
      timestamp: Date.now(),
      sequenceNumber: this.nextSequence(),
      payload: {
        analysisId: options.analysisId,
        totalFiles: options.totalFiles,
        ...options.metadata,
      },
    })

    // Start heartbeat
    this.startHeartbeat()
  }

  /**
   * Subscribe to the stream
   */
  subscribe(subscriber: StreamSubscriber): () => void {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  /**
   * Stream a single issue
   */
  streamIssue(issue: StreamingIssue): boolean {
    if (!this.isRunning) return false

    // Check backpressure
    if (this.config.enableBackpressure && this.backpressure.isPaused()) {
      // Queue for later
      this.issueQueue.enqueue(issue)
      return false
    }

    if (this.config.enablePrioritization) {
      this.issueQueue.enqueue(issue)
      this.scheduleBatch()
    } else {
      this.sendIssue(issue)
    }

    if (this.currentAnalysis) {
      this.currentAnalysis.issuesFound++
    }

    return true
  }

  /**
   * Stream multiple issues as a batch
   */
  streamBatch(issues: StreamingIssue[]): void {
    if (!this.isRunning) return

    if (this.config.enablePrioritization) {
      for (const issue of issues) {
        this.issueQueue.enqueue(issue)
      }
      this.scheduleBatch()
    } else {
      this.broadcast({
        type: StreamEventType.BATCH,
        timestamp: Date.now(),
        sequenceNumber: this.nextSequence(),
        payload: { issues },
      })
    }

    if (this.currentAnalysis) {
      this.currentAnalysis.issuesFound += issues.length
    }
  }

  /**
   * Update analysis progress
   */
  updateProgress(update: Partial<ProgressUpdate>): void {
    if (!this.isRunning || !this.currentAnalysis) return

    // Update current analysis state
    if (update.phase !== undefined) {
      this.currentAnalysis.phase = update.phase
    }
    if (update.filesProcessed !== undefined) {
      this.currentAnalysis.filesProcessed = update.filesProcessed
    }

    const fullUpdate: ProgressUpdate = {
      phase: this.currentAnalysis.phase,
      phaseProgress: update.phaseProgress ?? 0,
      overallProgress: this.calculateOverallProgress(),
      currentFile: update.currentFile,
      filesProcessed: this.currentAnalysis.filesProcessed,
      totalFiles: this.currentAnalysis.totalFiles,
      issuesFound: this.currentAnalysis.issuesFound,
      estimatedTimeRemaining: this.estimateTimeRemaining(),
      message: update.message ?? this.getPhaseMessage(this.currentAnalysis.phase),
    }

    this.broadcast({
      type: StreamEventType.PROGRESS,
      timestamp: Date.now(),
      sequenceNumber: this.nextSequence(),
      payload: fullUpdate,
    })
  }

  /**
   * Stream metrics update
   */
  streamMetrics(metrics: Record<string, unknown>): void {
    if (!this.isRunning) return

    this.broadcast({
      type: StreamEventType.METRICS,
      timestamp: Date.now(),
      sequenceNumber: this.nextSequence(),
      payload: metrics,
    })
  }

  /**
   * Complete the analysis stream
   */
  completeAnalysis(summary: {
    success: boolean
    totalIssues: number
    criticalCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    analysisTime: number
    additionalData?: Record<string, unknown>
  }): void {
    // Flush remaining queue
    this.flushQueue()

    // Stop heartbeat
    this.stopHeartbeat()

    // Send completion message
    this.broadcast({
      type: StreamEventType.COMPLETED,
      timestamp: Date.now(),
      sequenceNumber: this.nextSequence(),
      payload: {
        ...summary,
        analysisId: this.currentAnalysis?.id,
      },
    })

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      subscriber.onComplete?.()
    }

    this.isRunning = false
    this.currentAnalysis = undefined
    this.issueQueue.clear()
  }

  /**
   * Cancel the analysis stream
   */
  cancelAnalysis(reason?: string): void {
    this.stopHeartbeat()

    this.broadcast({
      type: StreamEventType.CANCELLED,
      timestamp: Date.now(),
      sequenceNumber: this.nextSequence(),
      payload: {
        analysisId: this.currentAnalysis?.id,
        reason: reason ?? 'Analysis cancelled',
      },
    })

    this.isRunning = false
    this.currentAnalysis = undefined
    this.issueQueue.clear()
  }

  /**
   * Handle analysis error
   */
  handleError(error: Error): void {
    this.stopHeartbeat()

    const message: StreamMessage = {
      type: StreamEventType.ERROR,
      timestamp: Date.now(),
      sequenceNumber: this.nextSequence(),
      payload: {
        analysisId: this.currentAnalysis?.id,
        error: error.message,
        stack: error.stack,
      },
    }

    this.broadcast(message)

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      subscriber.onError?.(error)
    }

    this.isRunning = false
    this.currentAnalysis = undefined
  }

  /**
   * Get current stream status
   */
  getStatus(): {
    isRunning: boolean
    queueSize: number
    backpressureLevel: number
    subscriberCount: number
    currentPhase?: AnalysisPhase
    issuesFound: number
  } {
    return {
      isRunning: this.isRunning,
      queueSize: this.issueQueue.size(),
      backpressureLevel: this.backpressure.getLevel(),
      subscriberCount: this.subscribers.size,
      currentPhase: this.currentAnalysis?.phase,
      issuesFound: this.currentAnalysis?.issuesFound ?? 0,
    }
  }

  // Private methods

  private nextSequence(): number {
    return ++this.sequenceNumber
  }

  private broadcast(message: StreamMessage): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber.onMessage(message)
      } catch (error) {
        this.emit('subscriber-error', { subscriber, error })
      }
    }

    this.emit('message', message)
  }

  private sendIssue(issue: StreamingIssue): void {
    this.backpressure.add()

    this.broadcast({
      type: StreamEventType.ISSUE,
      timestamp: Date.now(),
      sequenceNumber: this.nextSequence(),
      payload: issue,
    })

    // Simulate async delivery
    setImmediate(() => {
      this.backpressure.remove()
    })
  }

  private scheduleBatch(): void {
    if (this.batchTimer) return

    this.batchTimer = setTimeout(() => {
      this.processBatch()
    }, this.config.batchTimeout)
  }

  private processBatch(): void {
    this.batchTimer = undefined

    const batch = this.issueQueue.dequeueBatch(this.config.batchSize)
    if (batch.length > 0) {
      this.broadcast({
        type: StreamEventType.BATCH,
        timestamp: Date.now(),
        sequenceNumber: this.nextSequence(),
        payload: { issues: batch },
      })
    }

    // Continue processing if more items in queue
    if (!this.issueQueue.isEmpty() && !this.backpressure.isPaused()) {
      this.scheduleBatch()
    }
  }

  private processQueue(): void {
    if (this.batchTimer || this.issueQueue.isEmpty()) return

    if (!this.backpressure.isPaused()) {
      this.scheduleBatch()
    }
  }

  private flushQueue(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = undefined
    }

    while (!this.issueQueue.isEmpty()) {
      const batch = this.issueQueue.dequeueBatch(this.config.batchSize)
      if (batch.length > 0) {
        this.broadcast({
          type: StreamEventType.BATCH,
          timestamp: Date.now(),
          sequenceNumber: this.nextSequence(),
          payload: { issues: batch },
        })
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isRunning && this.currentAnalysis) {
        this.broadcast({
          type: StreamEventType.PROGRESS,
          timestamp: Date.now(),
          sequenceNumber: this.nextSequence(),
          payload: {
            phase: this.currentAnalysis.phase,
            phaseProgress: 0,
            overallProgress: this.calculateOverallProgress(),
            filesProcessed: this.currentAnalysis.filesProcessed,
            totalFiles: this.currentAnalysis.totalFiles,
            issuesFound: this.currentAnalysis.issuesFound,
            message: 'Analysis in progress...',
          } as ProgressUpdate,
        })
      }
    }, this.config.heartbeatInterval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }

  private calculateOverallProgress(): number {
    if (!this.currentAnalysis) return 0

    const phaseWeights: Record<AnalysisPhase, number> = {
      [AnalysisPhase.INITIALIZING]: 0.05,
      [AnalysisPhase.PARSING]: 0.15,
      [AnalysisPhase.PATTERN_MATCHING]: 0.25,
      [AnalysisPhase.DATA_FLOW]: 0.20,
      [AnalysisPhase.TAINT_ANALYSIS]: 0.15,
      [AnalysisPhase.LLM_ENHANCEMENT]: 0.10,
      [AnalysisPhase.AGGREGATION]: 0.05,
      [AnalysisPhase.FINALIZING]: 0.05,
    }

    const phases = Object.keys(phaseWeights) as AnalysisPhase[]
    const currentIndex = phases.indexOf(this.currentAnalysis.phase)

    let progress = 0
    for (let i = 0; i < currentIndex; i++) {
      progress += phaseWeights[phases[i]] * 100
    }

    // Add progress within current phase based on files processed
    const filesRatio = this.currentAnalysis.totalFiles > 0
      ? this.currentAnalysis.filesProcessed / this.currentAnalysis.totalFiles
      : 0
    progress += phaseWeights[this.currentAnalysis.phase] * filesRatio * 100

    return Math.min(progress, 99) // Never show 100% until complete
  }

  private estimateTimeRemaining(): number | undefined {
    if (!this.currentAnalysis) return undefined

    const elapsed = Date.now() - this.currentAnalysis.startTime
    const progress = this.calculateOverallProgress()

    if (progress <= 0) return undefined

    const totalEstimated = (elapsed / progress) * 100
    return Math.max(0, totalEstimated - elapsed)
  }

  private getPhaseMessage(phase: AnalysisPhase): string {
    const messages: Record<AnalysisPhase, string> = {
      [AnalysisPhase.INITIALIZING]: 'Initializing analysis...',
      [AnalysisPhase.PARSING]: 'Parsing source code...',
      [AnalysisPhase.PATTERN_MATCHING]: 'Scanning for vulnerability patterns...',
      [AnalysisPhase.DATA_FLOW]: 'Analyzing data flow...',
      [AnalysisPhase.TAINT_ANALYSIS]: 'Tracking untrusted data paths...',
      [AnalysisPhase.LLM_ENHANCEMENT]: 'Enhancing results with AI...',
      [AnalysisPhase.AGGREGATION]: 'Aggregating results...',
      [AnalysisPhase.FINALIZING]: 'Finalizing analysis...',
    }
    return messages[phase]
  }
}

/**
 * Create a streaming analyzer instance
 */
export function createStreamingAnalyzer(config?: Partial<StreamConfig>): StreamingAnalyzer {
  return new StreamingAnalyzer(config)
}

/**
 * Stream adapter for VS Code output channel
 */
export class VSCodeStreamAdapter implements StreamSubscriber {
  private outputChannel: { appendLine: (value: string) => void }
  private progressCallback?: (progress: ProgressUpdate) => void

  constructor(
    outputChannel: { appendLine: (value: string) => void },
    progressCallback?: (progress: ProgressUpdate) => void
  ) {
    this.outputChannel = outputChannel
    this.progressCallback = progressCallback
  }

  onMessage(message: StreamMessage): void {
    switch (message.type) {
      case StreamEventType.STARTED:
        this.outputChannel.appendLine(`[Analysis Started] ${JSON.stringify(message.payload)}`)
        break

      case StreamEventType.PROGRESS:
        const progress = message.payload as ProgressUpdate
        this.progressCallback?.(progress)
        break

      case StreamEventType.ISSUE:
        const issue = message.payload as StreamingIssue
        this.outputChannel.appendLine(
          `[${issue.severity.toUpperCase()}] ${issue.title} at ${issue.file}:${issue.line}`
        )
        break

      case StreamEventType.BATCH:
        const batch = (message.payload as { issues: StreamingIssue[] }).issues
        for (const i of batch) {
          this.outputChannel.appendLine(
            `[${i.severity.toUpperCase()}] ${i.title} at ${i.file}:${i.line}`
          )
        }
        break

      case StreamEventType.COMPLETED:
        this.outputChannel.appendLine(`[Analysis Completed] ${JSON.stringify(message.payload)}`)
        break

      case StreamEventType.ERROR:
        this.outputChannel.appendLine(`[Error] ${JSON.stringify(message.payload)}`)
        break
    }
  }

  onError(error: Error): void {
    this.outputChannel.appendLine(`[Stream Error] ${error.message}`)
  }

  onComplete(): void {
    this.outputChannel.appendLine('[Stream Complete]')
  }
}
