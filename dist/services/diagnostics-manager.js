"use strict";
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
exports.DiagnosticsManager = void 0;
const vscode = __importStar(require("vscode"));
const debounce_1 = require("../utils/debounce");
/**
 * Manages VS Code diagnostics for code analysis issues
 * Features:
 * - Debounced updates to prevent excessive UI redraws
 * - Batch processing of multiple diagnostic updates
 * - Location data normalization (legacy and structured formats)
 * - Code action support for quick fixes
 */
class DiagnosticsManager {
    constructor() {
        Object.defineProperty(this, "diagnosticCollection", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pendingUpdates", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "issueMetadata", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        }); // Store issue metadata for code actions
        Object.defineProperty(this, "debouncedFlush", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "DEBOUNCE_DELAY", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 300
        }); // 300ms as per requirements
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('jokalala-code-analysis');
        this.debouncedFlush = (0, debounce_1.debounce)(() => this.flushPendingUpdates(), this.DEBOUNCE_DELAY);
    }
    /**
     * Update diagnostics for a file (debounced)
     * Multiple calls within the debounce window will be batched
     */
    updateDiagnostics(uri, issues) {
        // Add to pending updates
        this.pendingUpdates.set(uri.toString(), issues);
        // Trigger debounced flush
        this.debouncedFlush();
    }
    /**
     * Update diagnostics immediately without debouncing
     * Use for critical updates that need immediate feedback
     */
    updateDiagnosticsImmediate(uri, issues) {
        const diagnostics = this.createDiagnostics(uri, issues);
        this.diagnosticCollection.set(uri, diagnostics);
    }
    /**
     * Flush all pending diagnostic updates
     * Called by the debounced function
     */
    flushPendingUpdates() {
        if (this.pendingUpdates.size === 0) {
            return;
        }
        // Process all pending updates in a batch
        for (const [uriString, issues] of this.pendingUpdates.entries()) {
            const uri = vscode.Uri.parse(uriString);
            const diagnostics = this.createDiagnostics(uri, issues);
            this.diagnosticCollection.set(uri, diagnostics);
        }
        // Clear pending updates
        this.pendingUpdates.clear();
    }
    /**
     * Create VS Code diagnostics from issues
     */
    createDiagnostics(uri, issues) {
        return issues
            .filter(issue => issue && issue.message) // Filter out invalid issues
            .map(issue => {
            // Store issue metadata for code actions
            this.storeIssueMetadata(issue);
            // Normalize location data
            const range = this.normalizeLocation(issue);
            const diagnostic = new vscode.Diagnostic(range, issue.message || 'Unknown issue', this.mapSeverity(issue.severity));
            diagnostic.source = 'Jokalala Code Analysis';
            diagnostic.code = issue.category;
            if (issue.suggestion) {
                diagnostic.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(new vscode.Location(uri, range), `Suggestion: ${issue.suggestion}`),
                ];
            }
            // Add tags for deprecated or unnecessary code
            if (issue.tags) {
                const tags = [];
                if (issue.tags.includes('deprecated')) {
                    tags.push(vscode.DiagnosticTag.Deprecated);
                }
                if (issue.tags.includes('unnecessary')) {
                    tags.push(vscode.DiagnosticTag.Unnecessary);
                }
                if (tags.length > 0) {
                    diagnostic.tags = tags;
                }
            }
            return diagnostic;
        });
    }
    /**
     * Normalize location data from various formats
     * Supports both legacy (line/column) and structured (location object) formats
     */
    normalizeLocation(issue) {
        // Try structured format first
        if (issue.location && typeof issue.location === 'object') {
            return this.createRangeFromStructured(issue.location);
        }
        // Fall back to legacy format
        if (issue.line !== undefined) {
            return this.createRangeFromLegacy(issue.line, issue.column);
        }
        // Default to first line if no location data
        return new vscode.Range(0, 0, 0, 100);
    }
    /**
     * Create range from structured location format
     */
    createRangeFromStructured(location) {
        // Validate and normalize line numbers (convert from 1-based to 0-based)
        const startLine = Math.max(0, (location.startLine || 1) - 1);
        const endLine = Math.max(0, (location.endLine || location.startLine || 1) - 1);
        // Validate and normalize column numbers (already 0-based)
        const startCol = Math.max(0, location.startColumn || 0);
        const endCol = location.endColumn !== undefined
            ? Math.max(0, location.endColumn)
            : startCol + 100;
        return new vscode.Range(startLine, startCol, endLine, endCol);
    }
    /**
     * Create range from legacy format (line/column)
     */
    createRangeFromLegacy(line, column) {
        // Convert from 1-based to 0-based line numbers
        const lineNum = Math.max(0, line - 1);
        const colNum = Math.max(0, column || 0);
        // Default to highlighting 100 characters if no end position
        return new vscode.Range(lineNum, colNum, lineNum, colNum + 100);
    }
    /**
     * Map issue severity to VS Code diagnostic severity
     */
    mapSeverity(severity) {
        switch (severity) {
            case 'critical':
            case 'high':
                return vscode.DiagnosticSeverity.Error;
            case 'medium':
                return vscode.DiagnosticSeverity.Warning;
            case 'low':
                return vscode.DiagnosticSeverity.Information;
            case 'info':
                return vscode.DiagnosticSeverity.Hint;
            default:
                return vscode.DiagnosticSeverity.Hint;
        }
    }
    /**
     * Clear all diagnostics
     */
    clear() {
        this.pendingUpdates.clear();
        this.diagnosticCollection.clear();
    }
    /**
     * Clear diagnostics for a specific file
     */
    clearFile(uri) {
        this.pendingUpdates.delete(uri.toString());
        this.diagnosticCollection.delete(uri);
    }
    /**
     * Get current diagnostics for a file
     */
    getDiagnostics(uri) {
        return this.diagnosticCollection.get(uri);
    }
    /**
     * Get issue metadata for a diagnostic
     * Used by code action providers to access full issue details
     */
    getIssueMetadata(issueId) {
        return this.issueMetadata.get(issueId);
    }
    /**
     * Store issue metadata for code actions
     */
    storeIssueMetadata(issue) {
        if (issue.id) {
            this.issueMetadata.set(issue.id, issue);
        }
    }
    /**
     * Dispose of the diagnostics manager
     */
    dispose() {
        this.pendingUpdates.clear();
        this.issueMetadata.clear();
        this.diagnosticCollection.dispose();
    }
}
exports.DiagnosticsManager = DiagnosticsManager;
//# sourceMappingURL=diagnostics-manager.js.map