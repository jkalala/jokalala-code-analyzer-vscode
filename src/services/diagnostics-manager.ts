import * as vscode from 'vscode'
import {
  CodeLocation,
  Issue,
} from '../interfaces/code-analysis-service.interface'
import { debounce } from '../utils/debounce'

/**
 * Manages VS Code diagnostics for code analysis issues
 * Features:
 * - Debounced updates to prevent excessive UI redraws
 * - Batch processing of multiple diagnostic updates
 * - Location data normalization (legacy and structured formats)
 * - Code action support for quick fixes
 */
export class DiagnosticsManager {
  private diagnosticCollection: vscode.DiagnosticCollection
  private pendingUpdates: Map<string, Issue[]> = new Map()
  private issueMetadata: Map<string, Issue> = new Map() // Store issue metadata for code actions
  private debouncedFlush: () => void
  private readonly DEBOUNCE_DELAY = 300 // 300ms as per requirements

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(
      'jokalala-code-analysis'
    )
    this.debouncedFlush = debounce(
      () => this.flushPendingUpdates(),
      this.DEBOUNCE_DELAY
    )
  }

  /**
   * Update diagnostics for a file (debounced)
   * Multiple calls within the debounce window will be batched
   */
  updateDiagnostics(uri: vscode.Uri, issues: Issue[]): void {
    // Add to pending updates
    this.pendingUpdates.set(uri.toString(), issues)

    // Trigger debounced flush
    this.debouncedFlush()
  }

  /**
   * Update diagnostics immediately without debouncing
   * Use for critical updates that need immediate feedback
   */
  updateDiagnosticsImmediate(uri: vscode.Uri, issues: Issue[]): void {
    const diagnostics = this.createDiagnostics(uri, issues)
    this.diagnosticCollection.set(uri, diagnostics)
  }

  /**
   * Flush all pending diagnostic updates
   * Called by the debounced function
   */
  private flushPendingUpdates(): void {
    if (this.pendingUpdates.size === 0) {
      return
    }

    // Process all pending updates in a batch
    for (const [uriString, issues] of this.pendingUpdates.entries()) {
      const uri = vscode.Uri.parse(uriString)
      const diagnostics = this.createDiagnostics(uri, issues)
      this.diagnosticCollection.set(uri, diagnostics)
    }

    // Clear pending updates
    this.pendingUpdates.clear()
  }

  /**
   * Create VS Code diagnostics from issues
   */
  private createDiagnostics(
    uri: vscode.Uri,
    issues: Issue[]
  ): vscode.Diagnostic[] {
    return issues
      .filter(issue => issue && issue.message) // Filter out invalid issues
      .map(issue => {
        // Store issue metadata for code actions
        this.storeIssueMetadata(issue)

        // Normalize location data
        const range = this.normalizeLocation(issue)

        const diagnostic = new vscode.Diagnostic(
          range,
          issue.message || 'Unknown issue',
          this.mapSeverity(issue.severity)
        )

        diagnostic.source = 'Jokalala Code Analysis'
        diagnostic.code = issue.category

        if (issue.suggestion) {
          diagnostic.relatedInformation = [
            new vscode.DiagnosticRelatedInformation(
              new vscode.Location(uri, range),
              `Suggestion: ${issue.suggestion}`
            ),
          ]
        }

        // Add tags for deprecated or unnecessary code
        if (issue.tags) {
          const tags: vscode.DiagnosticTag[] = []
          if (issue.tags.includes('deprecated')) {
            tags.push(vscode.DiagnosticTag.Deprecated)
          }
          if (issue.tags.includes('unnecessary')) {
            tags.push(vscode.DiagnosticTag.Unnecessary)
          }
          if (tags.length > 0) {
            diagnostic.tags = tags
          }
        }

        return diagnostic
      })
  }

  /**
   * Normalize location data from various formats
   * Supports both legacy (line/column) and structured (location object) formats
   */
  private normalizeLocation(issue: Issue): vscode.Range {
    // Try structured format first
    if (issue.location && typeof issue.location === 'object') {
      return this.createRangeFromStructured(issue.location)
    }

    // Fall back to legacy format
    if (issue.line !== undefined) {
      return this.createRangeFromLegacy(issue.line, issue.column)
    }

    // Default to first line if no location data
    return new vscode.Range(0, 0, 0, 100)
  }

  /**
   * Create range from structured location format
   */
  private createRangeFromStructured(location: CodeLocation): vscode.Range {
    // Validate and normalize line numbers (convert from 1-based to 0-based)
    const startLine = Math.max(0, (location.startLine || 1) - 1)
    const endLine = Math.max(
      0,
      (location.endLine || location.startLine || 1) - 1
    )

    // Validate and normalize column numbers (already 0-based)
    const startCol = Math.max(0, location.startColumn || 0)
    const endCol =
      location.endColumn !== undefined
        ? Math.max(0, location.endColumn)
        : startCol + 100

    return new vscode.Range(startLine, startCol, endLine, endCol)
  }

  /**
   * Create range from legacy format (line/column)
   */
  private createRangeFromLegacy(line: number, column?: number): vscode.Range {
    // Convert from 1-based to 0-based line numbers
    const lineNum = Math.max(0, line - 1)
    const colNum = Math.max(0, column || 0)

    // Default to highlighting 100 characters if no end position
    return new vscode.Range(lineNum, colNum, lineNum, colNum + 100)
  }

  /**
   * Map issue severity to VS Code diagnostic severity
   */
  private mapSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'critical':
      case 'high':
        return vscode.DiagnosticSeverity.Error
      case 'medium':
        return vscode.DiagnosticSeverity.Warning
      case 'low':
        return vscode.DiagnosticSeverity.Information
      case 'info':
        return vscode.DiagnosticSeverity.Hint
      default:
        return vscode.DiagnosticSeverity.Hint
    }
  }

  /**
   * Clear all diagnostics
   */
  clear(): void {
    this.pendingUpdates.clear()
    this.diagnosticCollection.clear()
  }

  /**
   * Clear diagnostics for a specific file
   */
  clearFile(uri: vscode.Uri): void {
    this.pendingUpdates.delete(uri.toString())
    this.diagnosticCollection.delete(uri)
  }

  /**
   * Get current diagnostics for a file
   */
  getDiagnostics(uri: vscode.Uri): readonly vscode.Diagnostic[] | undefined {
    return this.diagnosticCollection.get(uri)
  }

  /**
   * Get issue metadata for a diagnostic
   * Used by code action providers to access full issue details
   */
  getIssueMetadata(issueId: string): Issue | undefined {
    return this.issueMetadata.get(issueId)
  }

  /**
   * Store issue metadata for code actions
   */
  private storeIssueMetadata(issue: Issue): void {
    if (issue.id) {
      this.issueMetadata.set(issue.id, issue)
    }
  }

  /**
   * Dispose of the diagnostics manager
   */
  dispose(): void {
    this.pendingUpdates.clear()
    this.issueMetadata.clear()
    this.diagnosticCollection.dispose()
  }
}
