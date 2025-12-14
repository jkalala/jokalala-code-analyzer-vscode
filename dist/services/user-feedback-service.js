"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.userFeedbackService = exports.UserFeedbackService = void 0;
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("crypto"));
/**
 * User Feedback Service class
 */
class UserFeedbackService {
    constructor() {
        Object.defineProperty(this, "feedbackBuffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "viewTimestamps", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "userIdHash", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sessionId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "BUFFER_SIZE", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 50
        });
        Object.defineProperty(this, "FLUSH_INTERVAL_MS", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 300000
        }); // 5 minutes
        Object.defineProperty(this, "flushTimer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "storageKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'jokalala.userFeedback'
        });
        Object.defineProperty(this, "metricsKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'jokalala.accuracyMetrics'
        });
        Object.defineProperty(this, "globalState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "telemetryEnabled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        // Generate anonymous user ID hash
        this.userIdHash = this.generateUserIdHash();
        this.sessionId = crypto.randomUUID();
    }
    /**
     * Initialize with VSCode extension context
     */
    initialize(context) {
        this.globalState = context.globalState;
        // Load existing feedback from storage
        this.loadFromStorage();
        // Check telemetry opt-out
        const config = vscode.workspace.getConfiguration('jokalala');
        this.telemetryEnabled = config.get('enableTelemetry', true);
        // Start periodic flush
        this.startFlushTimer();
        // Register for configuration changes
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('jokalala.enableTelemetry')) {
                this.telemetryEnabled = vscode.workspace
                    .getConfiguration('jokalala')
                    .get('enableTelemetry', true);
            }
        }));
        console.log('[UserFeedback] Service initialized');
    }
    /**
     * Generate anonymous user ID hash
     */
    generateUserIdHash() {
        try {
            // Use machine ID if available for consistency across sessions
            const machineId = vscode.env.machineId || crypto.randomUUID();
            return crypto
                .createHash('sha256')
                .update(machineId)
                .digest('hex')
                .substring(0, 16);
        }
        catch {
            return crypto.randomUUID().substring(0, 16);
        }
    }
    /**
     * Record when a vulnerability is viewed
     */
    recordView(vulnerabilityId) {
        this.viewTimestamps.set(vulnerabilityId, Date.now());
    }
    /**
     * Record user feedback on a vulnerability
     */
    recordFeedback(vulnerabilityId, vulnerabilityType, severity, confidence, action, options) {
        if (!this.telemetryEnabled) {
            console.log('[UserFeedback] Telemetry disabled, skipping feedback');
            return;
        }
        // Calculate time to action
        const viewTime = this.viewTimestamps.get(vulnerabilityId);
        const timeToAction = viewTime ? Date.now() - viewTime : undefined;
        // Anonymize file name (keep only extension)
        const anonymizedFileName = options?.fileName
            ? `.${options.fileName.split('.').pop()}`
            : undefined;
        const feedback = {
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
        };
        this.feedbackBuffer.push(feedback);
        this.updateLocalMetrics(feedback);
        console.log(`[UserFeedback] Recorded ${action} for ${vulnerabilityType}`);
        // Flush if buffer is full
        if (this.feedbackBuffer.length >= this.BUFFER_SIZE) {
            void this.flush();
        }
    }
    /**
     * Record that user accepted a vulnerability as real
     */
    recordAccepted(vulnerabilityId, vulnerabilityType, severity, confidence, language) {
        this.recordFeedback(vulnerabilityId, vulnerabilityType, severity, confidence, 'ACCEPTED', { language });
    }
    /**
     * Record that user rejected a vulnerability as false positive
     */
    recordRejected(vulnerabilityId, vulnerabilityType, severity, confidence, language, reason) {
        this.recordFeedback(vulnerabilityId, vulnerabilityType, severity, confidence, 'REJECTED', { language, metadata: { reason } });
    }
    /**
     * Record that user fixed a vulnerability
     */
    recordFixed(vulnerabilityId, vulnerabilityType, severity, confidence, fixApplied, language) {
        this.recordFeedback(vulnerabilityId, vulnerabilityType, severity, confidence, 'FIXED', { language, fixApplied });
    }
    /**
     * Record that user copied fix code
     */
    recordCopiedFix(vulnerabilityId, vulnerabilityType, severity, confidence, fixApplied, language) {
        this.recordFeedback(vulnerabilityId, vulnerabilityType, severity, confidence, 'COPIED_FIX', { language, fixApplied });
    }
    /**
     * Update local accuracy metrics
     */
    updateLocalMetrics(feedback) {
        const metrics = this.getLocalMetrics();
        metrics.totalFeedback++;
        switch (feedback.userAction) {
            case 'ACCEPTED':
                metrics.acceptedCount++;
                break;
            case 'REJECTED':
                metrics.rejectedCount++;
                break;
            case 'FIXED':
                metrics.fixedCount++;
                metrics.acceptedCount++; // Fixed implies accepted
                break;
        }
        // Update acceptance rate
        const totalDecisions = metrics.acceptedCount + metrics.rejectedCount;
        metrics.acceptanceRate = totalDecisions > 0
            ? metrics.acceptedCount / totalDecisions
            : 0;
        // Update by vulnerability type
        if (!metrics.byVulnerabilityType[feedback.vulnerabilityType]) {
            metrics.byVulnerabilityType[feedback.vulnerabilityType] = {
                total: 0,
                accepted: 0,
                rejected: 0,
                acceptanceRate: 0
            };
        }
        const typeMetrics = metrics.byVulnerabilityType[feedback.vulnerabilityType];
        if (typeMetrics) {
            typeMetrics.total++;
            if (feedback.userAction === 'ACCEPTED' || feedback.userAction === 'FIXED') {
                typeMetrics.accepted++;
            }
            else if (feedback.userAction === 'REJECTED') {
                typeMetrics.rejected++;
            }
            typeMetrics.acceptanceRate = typeMetrics.accepted / (typeMetrics.accepted + typeMetrics.rejected) || 0;
        }
        // Update by language
        if (feedback.language) {
            if (!metrics.byLanguage[feedback.language]) {
                metrics.byLanguage[feedback.language] = {
                    total: 0,
                    accepted: 0,
                    rejected: 0
                };
            }
            const langMetrics = metrics.byLanguage[feedback.language];
            if (langMetrics) {
                langMetrics.total++;
                if (feedback.userAction === 'ACCEPTED' || feedback.userAction === 'FIXED') {
                    langMetrics.accepted++;
                }
                else if (feedback.userAction === 'REJECTED') {
                    langMetrics.rejected++;
                }
            }
        }
        // Update by severity
        if (!metrics.bySeverity[feedback.severity]) {
            metrics.bySeverity[feedback.severity] = {
                total: 0,
                accepted: 0,
                rejected: 0
            };
        }
        const sevMetrics = metrics.bySeverity[feedback.severity];
        if (sevMetrics) {
            sevMetrics.total++;
            if (feedback.userAction === 'ACCEPTED' || feedback.userAction === 'FIXED') {
                sevMetrics.accepted++;
            }
            else if (feedback.userAction === 'REJECTED') {
                sevMetrics.rejected++;
            }
        }
        this.saveMetrics(metrics);
    }
    /**
     * Get local accuracy metrics
     */
    getLocalMetrics() {
        if (!this.globalState) {
            return this.createEmptyMetrics();
        }
        const stored = this.globalState.get(this.metricsKey);
        return stored || this.createEmptyMetrics();
    }
    /**
     * Create empty metrics object
     */
    createEmptyMetrics() {
        return {
            totalFeedback: 0,
            acceptedCount: 0,
            rejectedCount: 0,
            fixedCount: 0,
            acceptanceRate: 0,
            byVulnerabilityType: {},
            byLanguage: {},
            bySeverity: {}
        };
    }
    /**
     * Save metrics to storage
     */
    saveMetrics(metrics) {
        if (this.globalState) {
            void this.globalState.update(this.metricsKey, metrics);
        }
    }
    /**
     * Flush feedback buffer to backend (or local storage)
     */
    async flush() {
        if (this.feedbackBuffer.length === 0) {
            return;
        }
        const feedbackToSend = [...this.feedbackBuffer];
        this.feedbackBuffer = [];
        try {
            // For now, store locally. In production, send to backend API
            await this.storeLocally(feedbackToSend);
            // Optionally send to backend if configured
            const apiUrl = vscode.workspace
                .getConfiguration('jokalala')
                .get('feedbackApiUrl');
            if (apiUrl && this.telemetryEnabled) {
                await this.sendToBackend(apiUrl, feedbackToSend);
            }
            console.log(`[UserFeedback] Flushed ${feedbackToSend.length} feedback entries`);
        }
        catch (error) {
            console.error('[UserFeedback] Failed to flush feedback:', error);
            // Put feedback back in buffer
            this.feedbackBuffer = [...feedbackToSend, ...this.feedbackBuffer];
        }
    }
    /**
     * Store feedback locally
     */
    async storeLocally(feedback) {
        if (!this.globalState) {
            return;
        }
        const existing = this.globalState.get(this.storageKey) || [];
        const combined = [...existing, ...feedback];
        // Keep only last 1000 entries
        const trimmed = combined.slice(-1000);
        await this.globalState.update(this.storageKey, trimmed);
    }
    /**
     * Send feedback to backend API
     */
    async sendToBackend(apiUrl, feedback) {
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
            });
            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }
        }
        catch (error) {
            console.warn('[UserFeedback] Backend send failed:', error);
            // Don't throw - this is non-critical
        }
    }
    /**
     * Load feedback from storage
     */
    loadFromStorage() {
        if (!this.globalState) {
            return;
        }
        const stored = this.globalState.get(this.storageKey);
        if (stored) {
            console.log(`[UserFeedback] Loaded ${stored.length} historical feedback entries`);
        }
    }
    /**
     * Start periodic flush timer
     */
    startFlushTimer() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        this.flushTimer = setInterval(() => {
            void this.flush();
        }, this.FLUSH_INTERVAL_MS);
    }
    /**
     * Get accuracy statistics for display
     */
    getAccuracyStats() {
        const metrics = this.getLocalMetrics();
        const byType = Object.entries(metrics.byVulnerabilityType)
            .map(([type, data]) => ({
            type,
            rate: `${Math.round(data.acceptanceRate * 100)}%`,
            count: data.total
        }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // Top 10
        return {
            overall: `${Math.round(metrics.acceptanceRate * 100)}%`,
            byType
        };
    }
    /**
     * Dispose service
     */
    dispose() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        // Final flush
        void this.flush();
    }
}
exports.UserFeedbackService = UserFeedbackService;
/**
 * Singleton instance
 */
exports.userFeedbackService = new UserFeedbackService();
//# sourceMappingURL=user-feedback-service.js.map