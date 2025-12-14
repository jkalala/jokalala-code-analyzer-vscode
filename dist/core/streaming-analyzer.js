"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VSCodeStreamAdapter = exports.StreamingAnalyzer = exports.AnalysisPhase = exports.StreamEventType = void 0;
exports.createStreamingAnalyzer = createStreamingAnalyzer;
const events_1 = require("events");
/**
 * Stream event types
 */
var StreamEventType;
(function (StreamEventType) {
    StreamEventType["STARTED"] = "started";
    StreamEventType["PROGRESS"] = "progress";
    StreamEventType["ISSUE"] = "issue";
    StreamEventType["BATCH"] = "batch";
    StreamEventType["METRICS"] = "metrics";
    StreamEventType["COMPLETED"] = "completed";
    StreamEventType["ERROR"] = "error";
    StreamEventType["CANCELLED"] = "cancelled";
})(StreamEventType || (exports.StreamEventType = StreamEventType = {}));
/**
 * Analysis phases
 */
var AnalysisPhase;
(function (AnalysisPhase) {
    AnalysisPhase["INITIALIZING"] = "initializing";
    AnalysisPhase["PARSING"] = "parsing";
    AnalysisPhase["PATTERN_MATCHING"] = "pattern_matching";
    AnalysisPhase["DATA_FLOW"] = "data_flow";
    AnalysisPhase["TAINT_ANALYSIS"] = "taint_analysis";
    AnalysisPhase["LLM_ENHANCEMENT"] = "llm_enhancement";
    AnalysisPhase["AGGREGATION"] = "aggregation";
    AnalysisPhase["FINALIZING"] = "finalizing";
})(AnalysisPhase || (exports.AnalysisPhase = AnalysisPhase = {}));
const DEFAULT_STREAM_CONFIG = {
    bufferSize: 100,
    batchSize: 10,
    batchTimeout: 100,
    enablePrioritization: true,
    enableBackpressure: true,
    maxQueueSize: 1000,
    heartbeatInterval: 5000,
    reconnectAttempts: 3,
    reconnectDelay: 1000,
};
/**
 * Backpressure controller for flow control
 */
class BackpressureController {
    constructor(highWaterMark, lowWaterMark = highWaterMark * 0.5) {
        Object.defineProperty(this, "highWaterMark", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lowWaterMark", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "currentLevel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "paused", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "onDrain", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.highWaterMark = highWaterMark;
        this.lowWaterMark = lowWaterMark;
    }
    add(count = 1) {
        this.currentLevel += count;
        if (this.currentLevel >= this.highWaterMark) {
            this.paused = true;
            return false;
        }
        return true;
    }
    remove(count = 1) {
        this.currentLevel = Math.max(0, this.currentLevel - count);
        if (this.paused && this.currentLevel <= this.lowWaterMark) {
            this.paused = false;
            this.onDrain?.();
        }
    }
    isPaused() {
        return this.paused;
    }
    setDrainHandler(handler) {
        this.onDrain = handler;
    }
    getLevel() {
        return this.currentLevel;
    }
}
/**
 * Priority queue for streaming issues
 */
class StreamingPriorityQueue {
    constructor() {
        Object.defineProperty(this, "queues", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map([
                ['critical', []],
                ['high', []],
                ['medium', []],
                ['low', []],
                ['info', []],
            ])
        });
    }
    enqueue(item) {
        const queue = this.queues.get(item.severity) || this.queues.get('medium');
        queue.push(item);
    }
    dequeue() {
        for (const severity of ['critical', 'high', 'medium', 'low', 'info']) {
            const queue = this.queues.get(severity);
            if (queue.length > 0) {
                return queue.shift();
            }
        }
        return undefined;
    }
    dequeueBatch(size) {
        const batch = [];
        while (batch.length < size) {
            const item = this.dequeue();
            if (!item)
                break;
            batch.push(item);
        }
        return batch;
    }
    size() {
        let total = 0;
        for (const queue of this.queues.values()) {
            total += queue.length;
        }
        return total;
    }
    isEmpty() {
        return this.size() === 0;
    }
    clear() {
        for (const queue of this.queues.values()) {
            queue.length = 0;
        }
    }
}
/**
 * Streaming Analysis Manager
 *
 * Provides real-time streaming of analysis results with intelligent
 * prioritization and flow control.
 */
class StreamingAnalyzer extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "issueQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "backpressure", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "subscribers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "sequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "batchBuffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "batchTimer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "heartbeatTimer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "isRunning", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "currentAnalysis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.config = { ...DEFAULT_STREAM_CONFIG, ...config };
        this.issueQueue = new StreamingPriorityQueue();
        this.backpressure = new BackpressureController(this.config.maxQueueSize);
        this.backpressure.setDrainHandler(() => {
            this.emit('drain');
            this.processQueue();
        });
    }
    /**
     * Start a streaming analysis session
     */
    async startAnalysis(options) {
        this.isRunning = true;
        this.sequenceNumber = 0;
        this.currentAnalysis = {
            id: options.analysisId,
            startTime: Date.now(),
            phase: AnalysisPhase.INITIALIZING,
            filesProcessed: 0,
            totalFiles: options.totalFiles,
            issuesFound: 0,
        };
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
        });
        // Start heartbeat
        this.startHeartbeat();
    }
    /**
     * Subscribe to the stream
     */
    subscribe(subscriber) {
        this.subscribers.add(subscriber);
        return () => this.subscribers.delete(subscriber);
    }
    /**
     * Stream a single issue
     */
    streamIssue(issue) {
        if (!this.isRunning)
            return false;
        // Check backpressure
        if (this.config.enableBackpressure && this.backpressure.isPaused()) {
            // Queue for later
            this.issueQueue.enqueue(issue);
            return false;
        }
        if (this.config.enablePrioritization) {
            this.issueQueue.enqueue(issue);
            this.scheduleBatch();
        }
        else {
            this.sendIssue(issue);
        }
        if (this.currentAnalysis) {
            this.currentAnalysis.issuesFound++;
        }
        return true;
    }
    /**
     * Stream multiple issues as a batch
     */
    streamBatch(issues) {
        if (!this.isRunning)
            return;
        if (this.config.enablePrioritization) {
            for (const issue of issues) {
                this.issueQueue.enqueue(issue);
            }
            this.scheduleBatch();
        }
        else {
            this.broadcast({
                type: StreamEventType.BATCH,
                timestamp: Date.now(),
                sequenceNumber: this.nextSequence(),
                payload: { issues },
            });
        }
        if (this.currentAnalysis) {
            this.currentAnalysis.issuesFound += issues.length;
        }
    }
    /**
     * Update analysis progress
     */
    updateProgress(update) {
        if (!this.isRunning || !this.currentAnalysis)
            return;
        // Update current analysis state
        if (update.phase !== undefined) {
            this.currentAnalysis.phase = update.phase;
        }
        if (update.filesProcessed !== undefined) {
            this.currentAnalysis.filesProcessed = update.filesProcessed;
        }
        const fullUpdate = {
            phase: this.currentAnalysis.phase,
            phaseProgress: update.phaseProgress ?? 0,
            overallProgress: this.calculateOverallProgress(),
            currentFile: update.currentFile,
            filesProcessed: this.currentAnalysis.filesProcessed,
            totalFiles: this.currentAnalysis.totalFiles,
            issuesFound: this.currentAnalysis.issuesFound,
            estimatedTimeRemaining: this.estimateTimeRemaining(),
            message: update.message ?? this.getPhaseMessage(this.currentAnalysis.phase),
        };
        this.broadcast({
            type: StreamEventType.PROGRESS,
            timestamp: Date.now(),
            sequenceNumber: this.nextSequence(),
            payload: fullUpdate,
        });
    }
    /**
     * Stream metrics update
     */
    streamMetrics(metrics) {
        if (!this.isRunning)
            return;
        this.broadcast({
            type: StreamEventType.METRICS,
            timestamp: Date.now(),
            sequenceNumber: this.nextSequence(),
            payload: metrics,
        });
    }
    /**
     * Complete the analysis stream
     */
    completeAnalysis(summary) {
        // Flush remaining queue
        this.flushQueue();
        // Stop heartbeat
        this.stopHeartbeat();
        // Send completion message
        this.broadcast({
            type: StreamEventType.COMPLETED,
            timestamp: Date.now(),
            sequenceNumber: this.nextSequence(),
            payload: {
                ...summary,
                analysisId: this.currentAnalysis?.id,
            },
        });
        // Notify subscribers
        for (const subscriber of this.subscribers) {
            subscriber.onComplete?.();
        }
        this.isRunning = false;
        this.currentAnalysis = undefined;
        this.issueQueue.clear();
    }
    /**
     * Cancel the analysis stream
     */
    cancelAnalysis(reason) {
        this.stopHeartbeat();
        this.broadcast({
            type: StreamEventType.CANCELLED,
            timestamp: Date.now(),
            sequenceNumber: this.nextSequence(),
            payload: {
                analysisId: this.currentAnalysis?.id,
                reason: reason ?? 'Analysis cancelled',
            },
        });
        this.isRunning = false;
        this.currentAnalysis = undefined;
        this.issueQueue.clear();
    }
    /**
     * Handle analysis error
     */
    handleError(error) {
        this.stopHeartbeat();
        const message = {
            type: StreamEventType.ERROR,
            timestamp: Date.now(),
            sequenceNumber: this.nextSequence(),
            payload: {
                analysisId: this.currentAnalysis?.id,
                error: error.message,
                stack: error.stack,
            },
        };
        this.broadcast(message);
        // Notify subscribers
        for (const subscriber of this.subscribers) {
            subscriber.onError?.(error);
        }
        this.isRunning = false;
        this.currentAnalysis = undefined;
    }
    /**
     * Get current stream status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            queueSize: this.issueQueue.size(),
            backpressureLevel: this.backpressure.getLevel(),
            subscriberCount: this.subscribers.size,
            currentPhase: this.currentAnalysis?.phase,
            issuesFound: this.currentAnalysis?.issuesFound ?? 0,
        };
    }
    // Private methods
    nextSequence() {
        return ++this.sequenceNumber;
    }
    broadcast(message) {
        for (const subscriber of this.subscribers) {
            try {
                subscriber.onMessage(message);
            }
            catch (error) {
                this.emit('subscriber-error', { subscriber, error });
            }
        }
        this.emit('message', message);
    }
    sendIssue(issue) {
        this.backpressure.add();
        this.broadcast({
            type: StreamEventType.ISSUE,
            timestamp: Date.now(),
            sequenceNumber: this.nextSequence(),
            payload: issue,
        });
        // Simulate async delivery
        setImmediate(() => {
            this.backpressure.remove();
        });
    }
    scheduleBatch() {
        if (this.batchTimer)
            return;
        this.batchTimer = setTimeout(() => {
            this.processBatch();
        }, this.config.batchTimeout);
    }
    processBatch() {
        this.batchTimer = undefined;
        const batch = this.issueQueue.dequeueBatch(this.config.batchSize);
        if (batch.length > 0) {
            this.broadcast({
                type: StreamEventType.BATCH,
                timestamp: Date.now(),
                sequenceNumber: this.nextSequence(),
                payload: { issues: batch },
            });
        }
        // Continue processing if more items in queue
        if (!this.issueQueue.isEmpty() && !this.backpressure.isPaused()) {
            this.scheduleBatch();
        }
    }
    processQueue() {
        if (this.batchTimer || this.issueQueue.isEmpty())
            return;
        if (!this.backpressure.isPaused()) {
            this.scheduleBatch();
        }
    }
    flushQueue() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = undefined;
        }
        while (!this.issueQueue.isEmpty()) {
            const batch = this.issueQueue.dequeueBatch(this.config.batchSize);
            if (batch.length > 0) {
                this.broadcast({
                    type: StreamEventType.BATCH,
                    timestamp: Date.now(),
                    sequenceNumber: this.nextSequence(),
                    payload: { issues: batch },
                });
            }
        }
    }
    startHeartbeat() {
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
                    },
                });
            }
        }, this.config.heartbeatInterval);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    }
    calculateOverallProgress() {
        if (!this.currentAnalysis)
            return 0;
        const phaseWeights = {
            [AnalysisPhase.INITIALIZING]: 0.05,
            [AnalysisPhase.PARSING]: 0.15,
            [AnalysisPhase.PATTERN_MATCHING]: 0.25,
            [AnalysisPhase.DATA_FLOW]: 0.20,
            [AnalysisPhase.TAINT_ANALYSIS]: 0.15,
            [AnalysisPhase.LLM_ENHANCEMENT]: 0.10,
            [AnalysisPhase.AGGREGATION]: 0.05,
            [AnalysisPhase.FINALIZING]: 0.05,
        };
        const phases = Object.keys(phaseWeights);
        const currentIndex = phases.indexOf(this.currentAnalysis.phase);
        let progress = 0;
        for (let i = 0; i < currentIndex; i++) {
            progress += phaseWeights[phases[i]] * 100;
        }
        // Add progress within current phase based on files processed
        const filesRatio = this.currentAnalysis.totalFiles > 0
            ? this.currentAnalysis.filesProcessed / this.currentAnalysis.totalFiles
            : 0;
        progress += phaseWeights[this.currentAnalysis.phase] * filesRatio * 100;
        return Math.min(progress, 99); // Never show 100% until complete
    }
    estimateTimeRemaining() {
        if (!this.currentAnalysis)
            return undefined;
        const elapsed = Date.now() - this.currentAnalysis.startTime;
        const progress = this.calculateOverallProgress();
        if (progress <= 0)
            return undefined;
        const totalEstimated = (elapsed / progress) * 100;
        return Math.max(0, totalEstimated - elapsed);
    }
    getPhaseMessage(phase) {
        const messages = {
            [AnalysisPhase.INITIALIZING]: 'Initializing analysis...',
            [AnalysisPhase.PARSING]: 'Parsing source code...',
            [AnalysisPhase.PATTERN_MATCHING]: 'Scanning for vulnerability patterns...',
            [AnalysisPhase.DATA_FLOW]: 'Analyzing data flow...',
            [AnalysisPhase.TAINT_ANALYSIS]: 'Tracking untrusted data paths...',
            [AnalysisPhase.LLM_ENHANCEMENT]: 'Enhancing results with AI...',
            [AnalysisPhase.AGGREGATION]: 'Aggregating results...',
            [AnalysisPhase.FINALIZING]: 'Finalizing analysis...',
        };
        return messages[phase];
    }
}
exports.StreamingAnalyzer = StreamingAnalyzer;
/**
 * Create a streaming analyzer instance
 */
function createStreamingAnalyzer(config) {
    return new StreamingAnalyzer(config);
}
/**
 * Stream adapter for VS Code output channel
 */
class VSCodeStreamAdapter {
    constructor(outputChannel, progressCallback) {
        Object.defineProperty(this, "outputChannel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "progressCallback", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.outputChannel = outputChannel;
        this.progressCallback = progressCallback;
    }
    onMessage(message) {
        switch (message.type) {
            case StreamEventType.STARTED:
                this.outputChannel.appendLine(`[Analysis Started] ${JSON.stringify(message.payload)}`);
                break;
            case StreamEventType.PROGRESS:
                const progress = message.payload;
                this.progressCallback?.(progress);
                break;
            case StreamEventType.ISSUE:
                const issue = message.payload;
                this.outputChannel.appendLine(`[${issue.severity.toUpperCase()}] ${issue.title} at ${issue.file}:${issue.line}`);
                break;
            case StreamEventType.BATCH:
                const batch = message.payload.issues;
                for (const i of batch) {
                    this.outputChannel.appendLine(`[${i.severity.toUpperCase()}] ${i.title} at ${i.file}:${i.line}`);
                }
                break;
            case StreamEventType.COMPLETED:
                this.outputChannel.appendLine(`[Analysis Completed] ${JSON.stringify(message.payload)}`);
                break;
            case StreamEventType.ERROR:
                this.outputChannel.appendLine(`[Error] ${JSON.stringify(message.payload)}`);
                break;
        }
    }
    onError(error) {
        this.outputChannel.appendLine(`[Stream Error] ${error.message}`);
    }
    onComplete() {
        this.outputChannel.appendLine('[Stream Complete]');
    }
}
exports.VSCodeStreamAdapter = VSCodeStreamAdapter;
//# sourceMappingURL=streaming-analyzer.js.map