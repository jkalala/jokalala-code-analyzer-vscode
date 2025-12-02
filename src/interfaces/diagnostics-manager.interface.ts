/**
 * Enhanced Diagnostics Manager Interface
 * Manages VS Code diagnostics with debouncing and code actions
 */

import * as vscode from 'vscode'
import { Issue } from './code-analysis-service.interface'

export interface IDiagnosticsManager {
  /**
   * Update diagnostics for a document
   * @param uri The document URI
   * @param issues Array of issues to display as diagnostics
   */
  updateDiagnostics(uri: vscode.Uri, issues: Issue[]): void

  /**
   * Clear diagnostics for a document
   * @param uri The document URI
   */
  clearDiagnostics(uri: vscode.Uri): void

  /**
   * Clear all diagnostics
   */
  clearAllDiagnostics(): void

  /**
   * Get diagnostics for a document
   * @param uri The document URI
   * @returns Array of diagnostics
   */
  getDiagnostics(uri: vscode.Uri): readonly vscode.Diagnostic[]

  /**
   * Register a code action provider for quick fixes
   * @param provider The code action provider
   * @returns Disposable to unregister the provider
   */
  registerCodeActionProvider(
    provider: vscode.CodeActionProvider
  ): vscode.Disposable

  /**
   * Dispose of the diagnostics manager and release resources
   */
  dispose(): void
}

export interface DiagnosticOptions {
  /** Whether to debounce diagnostic updates */
  debounce?: boolean
  /** Debounce delay in milliseconds */
  debounceDelay?: number
  /** Whether to include related information */
  includeRelatedInfo?: boolean
  /** Custom severity mapping */
  severityMapping?: SeverityMapping
}

export interface SeverityMapping {
  critical: vscode.DiagnosticSeverity
  high: vscode.DiagnosticSeverity
  medium: vscode.DiagnosticSeverity
  low: vscode.DiagnosticSeverity
  info: vscode.DiagnosticSeverity
}
