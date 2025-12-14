"use strict";
/**
 * Refactoring Service
 *
 * Client for the AI Refactoring API.
 * Provides code complexity analysis and one-click refactoring.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefactoringService = void 0;
const axios_1 = __importDefault(require("axios"));
const vscode = __importStar(require("vscode"));
// ============================================================================
// Refactoring Service
// ============================================================================
class RefactoringService {
    constructor(configuration, logger) {
        Object.defineProperty(this, "configuration", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: configuration
        });
        Object.defineProperty(this, "logger", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: logger
        });
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "CACHE_TTL", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 5 * 60 * 1000
        }); // 5 minutes
    }
    /**
     * Analyze code and get refactoring suggestions
     */
    async analyze(request) {
        const cacheKey = this.generateCacheKey(request);
        // Check cache first
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            this.logger.info('Refactoring cache hit');
            return cached.data;
        }
        const settings = this.configuration.getSettings();
        const apiEndpoint = settings.apiEndpoint?.replace(/\/$/, '');
        if (!apiEndpoint) {
            return {
                success: false,
                error: 'API endpoint not configured',
            };
        }
        const refactorUrl = `${apiEndpoint}/refactor`;
        try {
            this.logger.info(`Refactoring request to: ${refactorUrl}`);
            this.logger.info(`Mode: ${request.mode}, Language: ${request.language}`);
            const response = await axios_1.default.post(refactorUrl, request, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(settings.apiKey && { Authorization: `Bearer ${settings.apiKey}` }),
                },
                timeout: settings.requestTimeout || 60000,
            });
            if (response.data.success) {
                this.cache.set(cacheKey, {
                    data: response.data,
                    timestamp: Date.now(),
                });
            }
            return response.data;
        }
        catch (error) {
            this.logger.error('Refactoring request failed', error);
            if (error.response?.status === 404) {
                return {
                    success: false,
                    error: 'Refactoring endpoint not available. Please update the Jokalala service.',
                };
            }
            return {
                success: false,
                error: error.message || 'Refactoring request failed',
            };
        }
    }
    /**
     * Full analysis mode
     */
    async fullAnalysis(document, context) {
        return this.analyze({
            code: document.getText(),
            language: document.languageId,
            mode: 'full_analysis',
            context: {
                fileName: document.fileName,
                ...context,
            },
            includeStaticAnalysis: true,
        });
    }
    /**
     * Quick fix mode - analyze and fix a specific issue
     */
    async quickFix(document, targetIssueId) {
        const request = {
            code: document.getText(),
            language: document.languageId,
            mode: 'quick_fix',
            context: {
                fileName: document.fileName,
            },
        };
        if (targetIssueId) {
            request.targetIssueId = targetIssueId;
        }
        return this.analyze(request);
    }
    /**
     * Explain only mode - get explanations without code changes
     */
    async explainOnly(document) {
        return this.analyze({
            code: document.getText(),
            language: document.languageId,
            mode: 'explain_only',
            context: {
                fileName: document.fileName,
            },
        });
    }
    /**
     * Batch refactor mode - apply multiple safe fixes
     */
    async batchRefactor(document, issueIds) {
        const request = {
            code: document.getText(),
            language: document.languageId,
            mode: 'batch_refactor',
            context: {
                fileName: document.fileName,
            },
        };
        if (issueIds) {
            request.issueIds = issueIds;
        }
        return this.analyze(request);
    }
    /**
     * Apply a refactoring fix to the document
     */
    async applyFix(document, issue) {
        if (!issue.refactoredCode || !issue.autoFixable) {
            vscode.window.showWarningMessage('This issue cannot be automatically fixed.');
            return false;
        }
        try {
            const edit = new vscode.WorkspaceEdit();
            const startPos = new vscode.Position(issue.location.startLine - 1, issue.location.startColumn || 0);
            const endPos = new vscode.Position(issue.location.endLine - 1, issue.location.endColumn || 999);
            const range = new vscode.Range(startPos, endPos);
            // Try to find exact match first
            const documentText = document.getText();
            if (issue.originalCode && documentText.includes(issue.originalCode)) {
                const startIndex = documentText.indexOf(issue.originalCode);
                const exactStart = document.positionAt(startIndex);
                const exactEnd = document.positionAt(startIndex + issue.originalCode.length);
                edit.replace(document.uri, new vscode.Range(exactStart, exactEnd), issue.refactoredCode);
            }
            else {
                // Fall back to line-based replacement
                edit.replace(document.uri, range, issue.refactoredCode);
            }
            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                vscode.window.showInformationMessage(`Applied fix: ${issue.title}`);
            }
            return success;
        }
        catch (error) {
            this.logger.error('Failed to apply refactoring fix', error);
            vscode.window.showErrorMessage(`Failed to apply fix: ${error.message}`);
            return false;
        }
    }
    /**
     * Apply all auto-fixable issues with high confidence
     */
    async applyAllAutoFixes(document, issues) {
        const autoFixable = issues.filter(i => i.autoFixable && i.confidenceCategory === 'auto_apply' && !i.breakingChanges);
        if (autoFixable.length === 0) {
            vscode.window.showInformationMessage('No auto-fixable issues with high confidence.');
            return 0;
        }
        // Sort by line number descending to apply from bottom up
        const sorted = [...autoFixable].sort((a, b) => b.location.startLine - a.location.startLine);
        let fixedCount = 0;
        for (const issue of sorted) {
            const success = await this.applyFix(document, issue);
            if (success)
                fixedCount++;
        }
        vscode.window.showInformationMessage(`Applied ${fixedCount} of ${autoFixable.length} auto-fixes.`);
        return fixedCount;
    }
    /**
     * Show refactoring preview in a diff view
     */
    async showDiffPreview(document, preview) {
        // Create temporary URIs for diff view
        const originalUri = vscode.Uri.parse(`jokalala-original:${document.fileName}`);
        const refactoredUri = vscode.Uri.parse(`jokalala-refactored:${document.fileName}`);
        // Register content providers
        const originalProvider = new (class {
            provideTextDocumentContent() {
                return preview.fullFileBefore;
            }
        })();
        const refactoredProvider = new (class {
            provideTextDocumentContent() {
                return preview.fullFileAfter;
            }
        })();
        const disposables = [
            vscode.workspace.registerTextDocumentContentProvider('jokalala-original', originalProvider),
            vscode.workspace.registerTextDocumentContentProvider('jokalala-refactored', refactoredProvider),
        ];
        try {
            await vscode.commands.executeCommand('vscode.diff', originalUri, refactoredUri, `Refactoring Preview: ${document.fileName}`);
        }
        finally {
            // Clean up providers after a delay
            setTimeout(() => {
                disposables.forEach(d => d.dispose());
            }, 60000);
        }
    }
    /**
     * Show issue details in a webview panel
     */
    showIssueDetails(issue) {
        const panel = vscode.window.createWebviewPanel('refactoringDetails', `Issue: ${issue.title}`, vscode.ViewColumn.Beside, { enableScripts: true });
        panel.webview.html = this.generateIssueDetailsHtml(issue);
    }
    /**
     * Generate HTML for issue details panel
     */
    generateIssueDetailsHtml(issue) {
        const severityColor = {
            critical: '#dc2626',
            high: '#f97316',
            medium: '#eab308',
            low: '#22c55e',
            info: '#6b7280',
        }[issue.severity] || '#6b7280';
        const confidencePercent = Math.round(issue.confidenceScore * 100);
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }
    h1 { margin-top: 0; font-size: 1.4em; }
    h2 { font-size: 1.1em; margin-top: 1.5em; color: var(--vscode-descriptionForeground); }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.85em;
      margin-right: 8px;
    }
    .severity { background: ${severityColor}; color: white; }
    .type { background: #3b82f6; color: white; }
    .confidence { background: #8b5cf6; color: white; }
    .effort { background: #6b7280; color: white; }
    .section {
      margin: 15px 0;
      padding: 15px;
      background: var(--vscode-textBlockQuote-background);
      border-radius: 8px;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 13px;
    }
    .code-original { border-left: 4px solid #dc2626; }
    .code-refactored { border-left: 4px solid #22c55e; }
    .steps {
      counter-reset: step;
      list-style: none;
      padding: 0;
    }
    .steps li {
      counter-increment: step;
      padding: 10px 0 10px 40px;
      position: relative;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .steps li::before {
      content: counter(step);
      position: absolute;
      left: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      text-align: center;
      line-height: 28px;
      font-weight: bold;
    }
    .references a {
      color: var(--vscode-textLink-foreground);
      display: block;
      padding: 4px 0;
    }
    button {
      padding: 10px 20px;
      margin-right: 10px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .warning {
      background: #fef3c7;
      color: #92400e;
      padding: 10px;
      border-radius: 4px;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <h1>${issue.id}: ${issue.title}</h1>

  <div style="margin: 15px 0;">
    <span class="badge severity">${issue.severity.toUpperCase()}</span>
    <span class="badge type">${issue.type}</span>
    <span class="badge confidence">${confidencePercent}% Confidence</span>
    <span class="badge effort">${issue.estimatedEffort} effort</span>
  </div>

  <div class="section">
    <strong>Description:</strong>
    <p>${issue.description}</p>
  </div>

  <div class="section">
    <strong>Impact:</strong>
    <p>${issue.impact}</p>
  </div>

  ${issue.breakingChanges ? '<div class="warning">⚠️ This fix may introduce breaking changes. Review carefully before applying.</div>' : ''}

  <h2>❌ Original Code</h2>
  <pre class="code-original"><code>${this.escapeHtml(issue.originalCode || 'N/A')}</code></pre>

  <h2>✅ Refactored Code</h2>
  <pre class="code-refactored"><code>${this.escapeHtml(issue.refactoredCode || 'N/A')}</code></pre>

  ${issue.refactoringSteps.length > 0 ? `
  <h2>📋 Refactoring Steps</h2>
  <ol class="steps">
    ${issue.refactoringSteps.map(s => `<li>${this.escapeHtml(s.description)}</li>`).join('')}
  </ol>
  ` : ''}

  ${issue.references.length > 0 ? `
  <h2>📚 References</h2>
  <div class="references">
    ${issue.references.map(ref => `<a href="${ref}" target="_blank">${ref}</a>`).join('')}
  </div>
  ` : ''}
</body>
</html>`;
    }
    /**
     * Escape HTML for safe display
     */
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    /**
     * Generate cache key
     */
    generateCacheKey(request) {
        return `${request.mode}:${request.language}:${Buffer.from(request.code).toString('base64').substring(0, 100)}`;
    }
    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        this.logger.info('Refactoring cache cleared');
    }
}
exports.RefactoringService = RefactoringService;
//# sourceMappingURL=refactoring-service.js.map