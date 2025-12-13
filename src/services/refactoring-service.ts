/**
 * Refactoring Service
 *
 * Client for the AI Refactoring API.
 * Provides code complexity analysis and one-click refactoring.
 */

import axios from 'axios'
import * as vscode from 'vscode'
import { ConfigurationService } from './configuration-service'
import { Logger } from './logger'

// ============================================================================
// Types
// ============================================================================

export type InteractionMode = 'full_analysis' | 'quick_fix' | 'explain_only' | 'batch_refactor'
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type IssueType = 'complexity' | 'vulnerability' | 'maintainability'
export type ConfidenceCategory = 'auto_apply' | 'suggest_preview' | 'manual_review'

export interface CodeLocation {
  startLine: number
  endLine: number
  startColumn?: number
  endColumn?: number
}

export interface RefactoringStep {
  step: number
  description: string
  before?: string
  after?: string
}

export interface RefactoringIssue {
  id: string
  type: IssueType
  category: string
  severity: IssueSeverity
  location: CodeLocation
  title: string
  description: string
  impact: string
  originalCode: string
  refactoredCode: string
  refactoringSteps: RefactoringStep[]
  confidenceScore: number
  confidenceCategory?: ConfidenceCategory
  references: string[]
  autoFixable: boolean
  breakingChanges: boolean
  estimatedEffort: 'minimal' | 'moderate' | 'significant'
}

export interface RefactoringPreview {
  fullFileBefore: string
  fullFileAfter: string
  diff: string
}

export interface RefactoringAnalysisResult {
  analysis: {
    file: string
    language: string
    overallHealthScore: number
    scanTimestamp: string
  }
  issues: RefactoringIssue[]
  summary: {
    totalIssues: number
    bySeverity: Record<IssueSeverity, number>
    byType: Record<IssueType, number>
    autoFixableCount: number
  }
  refactoringPreview?: RefactoringPreview
  metadata?: {
    requestId: string
    duration: number
    mode: InteractionMode
    confidenceThresholds: {
      AUTO_APPLY: number
      SUGGEST_WITH_PREVIEW: number
      MANUAL_REVIEW: number
    }
  }
}

export interface RefactoringRequest {
  code: string
  language: string
  mode: InteractionMode
  context?: {
    fileName?: string
    projectType?: string
    framework?: string
  }
  targetIssueId?: string
  issueIds?: string[]
  includeStaticAnalysis?: boolean
  skipLLM?: boolean
}

export interface RefactoringResponse {
  success: boolean
  data?: RefactoringAnalysisResult
  error?: string
  details?: any
}

// ============================================================================
// Refactoring Service
// ============================================================================

export class RefactoringService {
  private cache: Map<string, { data: RefactoringResponse; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  constructor(
    private readonly configuration: ConfigurationService,
    private readonly logger: Logger
  ) {}

  /**
   * Analyze code and get refactoring suggestions
   */
  async analyze(request: RefactoringRequest): Promise<RefactoringResponse> {
    const cacheKey = this.generateCacheKey(request)

    // Check cache first
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.info('Refactoring cache hit')
      return cached.data
    }

    const settings = this.configuration.getSettings()
    const apiEndpoint = settings.apiEndpoint?.replace(/\/$/, '')

    if (!apiEndpoint) {
      return {
        success: false,
        error: 'API endpoint not configured',
      }
    }

    const refactorUrl = `${apiEndpoint}/refactor`

    try {
      this.logger.info(`Refactoring request to: ${refactorUrl}`)
      this.logger.info(`Mode: ${request.mode}, Language: ${request.language}`)

      const response = await axios.post<RefactoringResponse>(
        refactorUrl,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(settings.apiKey && { Authorization: `Bearer ${settings.apiKey}` }),
          },
          timeout: settings.requestTimeout || 60000,
        }
      )

      if (response.data.success) {
        this.cache.set(cacheKey, {
          data: response.data,
          timestamp: Date.now(),
        })
      }

      return response.data
    } catch (error: any) {
      this.logger.error('Refactoring request failed', error)

      if (error.response?.status === 404) {
        return {
          success: false,
          error: 'Refactoring endpoint not available. Please update the Jokalala service.',
        }
      }

      return {
        success: false,
        error: error.message || 'Refactoring request failed',
      }
    }
  }

  /**
   * Full analysis mode
   */
  async fullAnalysis(
    document: vscode.TextDocument,
    context?: { projectType?: string; framework?: string }
  ): Promise<RefactoringResponse> {
    return this.analyze({
      code: document.getText(),
      language: document.languageId,
      mode: 'full_analysis',
      context: {
        fileName: document.fileName,
        ...context,
      },
      includeStaticAnalysis: true,
    })
  }

  /**
   * Quick fix mode - analyze and fix a specific issue
   */
  async quickFix(
    document: vscode.TextDocument,
    targetIssueId?: string
  ): Promise<RefactoringResponse> {
    const request: RefactoringRequest = {
      code: document.getText(),
      language: document.languageId,
      mode: 'quick_fix',
      context: {
        fileName: document.fileName,
      },
    }
    if (targetIssueId) {
      request.targetIssueId = targetIssueId
    }
    return this.analyze(request)
  }

  /**
   * Explain only mode - get explanations without code changes
   */
  async explainOnly(document: vscode.TextDocument): Promise<RefactoringResponse> {
    return this.analyze({
      code: document.getText(),
      language: document.languageId,
      mode: 'explain_only',
      context: {
        fileName: document.fileName,
      },
    })
  }

  /**
   * Batch refactor mode - apply multiple safe fixes
   */
  async batchRefactor(
    document: vscode.TextDocument,
    issueIds?: string[]
  ): Promise<RefactoringResponse> {
    const request: RefactoringRequest = {
      code: document.getText(),
      language: document.languageId,
      mode: 'batch_refactor',
      context: {
        fileName: document.fileName,
      },
    }
    if (issueIds) {
      request.issueIds = issueIds
    }
    return this.analyze(request)
  }

  /**
   * Apply a refactoring fix to the document
   */
  async applyFix(
    document: vscode.TextDocument,
    issue: RefactoringIssue
  ): Promise<boolean> {
    if (!issue.refactoredCode || !issue.autoFixable) {
      vscode.window.showWarningMessage('This issue cannot be automatically fixed.')
      return false
    }

    try {
      const edit = new vscode.WorkspaceEdit()
      const startPos = new vscode.Position(issue.location.startLine - 1, issue.location.startColumn || 0)
      const endPos = new vscode.Position(issue.location.endLine - 1, issue.location.endColumn || 999)
      const range = new vscode.Range(startPos, endPos)

      // Try to find exact match first
      const documentText = document.getText()
      if (issue.originalCode && documentText.includes(issue.originalCode)) {
        const startIndex = documentText.indexOf(issue.originalCode)
        const exactStart = document.positionAt(startIndex)
        const exactEnd = document.positionAt(startIndex + issue.originalCode.length)
        edit.replace(document.uri, new vscode.Range(exactStart, exactEnd), issue.refactoredCode)
      } else {
        // Fall back to line-based replacement
        edit.replace(document.uri, range, issue.refactoredCode)
      }

      const success = await vscode.workspace.applyEdit(edit)

      if (success) {
        vscode.window.showInformationMessage(
          `Applied fix: ${issue.title}`
        )
      }

      return success
    } catch (error: any) {
      this.logger.error('Failed to apply refactoring fix', error)
      vscode.window.showErrorMessage(`Failed to apply fix: ${error.message}`)
      return false
    }
  }

  /**
   * Apply all auto-fixable issues with high confidence
   */
  async applyAllAutoFixes(
    document: vscode.TextDocument,
    issues: RefactoringIssue[]
  ): Promise<number> {
    const autoFixable = issues.filter(
      i => i.autoFixable && i.confidenceCategory === 'auto_apply' && !i.breakingChanges
    )

    if (autoFixable.length === 0) {
      vscode.window.showInformationMessage('No auto-fixable issues with high confidence.')
      return 0
    }

    // Sort by line number descending to apply from bottom up
    const sorted = [...autoFixable].sort(
      (a, b) => b.location.startLine - a.location.startLine
    )

    let fixedCount = 0
    for (const issue of sorted) {
      const success = await this.applyFix(document, issue)
      if (success) fixedCount++
    }

    vscode.window.showInformationMessage(
      `Applied ${fixedCount} of ${autoFixable.length} auto-fixes.`
    )

    return fixedCount
  }

  /**
   * Show refactoring preview in a diff view
   */
  async showDiffPreview(
    document: vscode.TextDocument,
    preview: RefactoringPreview
  ): Promise<void> {
    // Create temporary URIs for diff view
    const originalUri = vscode.Uri.parse(`jokalala-original:${document.fileName}`)
    const refactoredUri = vscode.Uri.parse(`jokalala-refactored:${document.fileName}`)

    // Register content providers
    const originalProvider = new (class implements vscode.TextDocumentContentProvider {
      provideTextDocumentContent(): string {
        return preview.fullFileBefore
      }
    })()

    const refactoredProvider = new (class implements vscode.TextDocumentContentProvider {
      provideTextDocumentContent(): string {
        return preview.fullFileAfter
      }
    })()

    const disposables = [
      vscode.workspace.registerTextDocumentContentProvider('jokalala-original', originalProvider),
      vscode.workspace.registerTextDocumentContentProvider('jokalala-refactored', refactoredProvider),
    ]

    try {
      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        refactoredUri,
        `Refactoring Preview: ${document.fileName}`
      )
    } finally {
      // Clean up providers after a delay
      setTimeout(() => {
        disposables.forEach(d => d.dispose())
      }, 60000)
    }
  }

  /**
   * Show issue details in a webview panel
   */
  showIssueDetails(issue: RefactoringIssue): void {
    const panel = vscode.window.createWebviewPanel(
      'refactoringDetails',
      `Issue: ${issue.title}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    )

    panel.webview.html = this.generateIssueDetailsHtml(issue)
  }

  /**
   * Generate HTML for issue details panel
   */
  private generateIssueDetailsHtml(issue: RefactoringIssue): string {
    const severityColor = {
      critical: '#dc2626',
      high: '#f97316',
      medium: '#eab308',
      low: '#22c55e',
      info: '#6b7280',
    }[issue.severity] || '#6b7280'

    const confidencePercent = Math.round(issue.confidenceScore * 100)

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
</html>`
  }

  /**
   * Escape HTML for safe display
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(request: RefactoringRequest): string {
    return `${request.mode}:${request.language}:${Buffer.from(request.code).toString('base64').substring(0, 100)}`
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
    this.logger.info('Refactoring cache cleared')
  }
}
