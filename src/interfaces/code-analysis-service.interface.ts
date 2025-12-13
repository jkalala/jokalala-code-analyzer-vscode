/**
 * Enhanced Code Analysis Service Interface
 * Provides code analysis with queue management, retry logic, and cancellation support
 */

import * as vscode from 'vscode'
import { V2AnalysisReport } from './v2-report.interface'

export interface ICodeAnalysisService {
  /**
   * Analyze a code snippet
   * @param code The code to analyze
   * @param language The programming language
   * @param options Analysis options
   * @param cancellationToken Optional cancellation token
   * @returns Analysis result
   */
  analyzeCode(
    code: string,
    language: string,
    options?: AnalysisOptions,
    cancellationToken?: vscode.CancellationToken
  ): Promise<AnalysisResult>

  /**
   * Analyze multiple files in a project
   * @param files Array of project files to analyze
   * @param options Project analysis options
   * @param cancellationToken Optional cancellation token
   * @returns Project analysis result
   */
  analyzeProject(
    files: ProjectFile[],
    options?: ProjectAnalysisOptions,
    cancellationToken?: vscode.CancellationToken
  ): Promise<ProjectAnalysisResult>

  /**
   * Clear the analysis cache
   */
  clearCache(): Promise<void>

  /**
   * Test connection to the analysis service
   * @returns Health check result
   */
  testConnection(): Promise<HealthCheckResult>

  /**
   * Cancel an in-progress analysis request
   * @param requestId The request ID to cancel
   */
  cancelAnalysis(requestId: string): void

  /**
   * Get the current status of the request queue
   * @returns Queue status information
   */
  getQueueStatus(): QueueStatus

  /**
   * Retry a failed request
   * @param requestId The request ID to retry
   */
  retryFailedRequest(requestId: string): Promise<void>
}

export interface AnalysisOptions {
  /** Analysis mode: quick (static only), deep (LLM only), full (both) */
  mode?: 'quick' | 'deep' | 'full'
  /** Request priority */
  priority?: 'low' | 'normal' | 'high'
  /** Request timeout in milliseconds */
  timeout?: number
  /** Whether to use cached results if available */
  useCache?: boolean
}

export interface ProjectAnalysisOptions extends AnalysisOptions {
  /** Maximum number of files to analyze */
  maxFiles?: number
  /** Maximum file size in characters */
  maxFileSize?: number
}

export interface ProjectFile {
  path: string
  content: string
  language: string
}

export interface AnalysisResult {
  prioritizedIssues: Issue[]
  recommendations: Recommendation[]
  summary: AnalysisSummary
  requestId?: string
  cached?: boolean
  // V2 Enhanced Report (deduplicated, language-specific fixes)
  v2Report?: V2AnalysisReport
  metadata?: {
    hasV2Report?: boolean
    v2AnalyzerVersion?: string
  }
}

export interface ProjectAnalysisResult extends AnalysisResult {
  filesAnalyzed: number
  filesSkipped: number
  /** Per-file analysis results for detailed drill-down */
  fileResults?: FileAnalysisResult[]
}

export interface FileAnalysisResult {
  /** Relative path to the file */
  filePath: string
  /** Issues found in this file */
  issues: Issue[]
  /** Score for this file (0-100) */
  score?: number
  /** Language of the file */
  language?: string
}

export interface Issue {
  id?: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: string
  message: string
  location?: CodeLocation
  suggestion?: string
  source: 'static' | 'llm'
  priorityScore?: number
  impact?: 'low' | 'medium' | 'high'
  exploitability?: 'low' | 'medium' | 'high'
  effortToFix?: 'low' | 'medium' | 'high'
  correlatedWith?: string[]
  codeSnippet?: string
  fixAvailable?: boolean
  documentationUrl?: string
  tags?: string[]
  line?: number
  column?: number
  /** File path where the issue was found (for project analysis) */
  filePath?: string
}

export interface CodeLocation {
  startLine: number
  endLine?: number
  startColumn?: number
  endColumn?: number
  filePath?: string
}

export interface Recommendation {
  title: string
  description: string
  category: string
  priority?: 'low' | 'medium' | 'high'
  actionable?: boolean
}

export interface AnalysisSummary {
  totalIssues: number
  criticalIssues: number
  highIssues: number
  mediumIssues: number
  lowIssues: number
  overallScore?: number
  analysisTime?: number
}

export interface HealthCheckResult {
  healthy: boolean
  message: string
  responseTime?: number
  version?: string
}

export interface QueueStatus {
  /** Number of requests waiting to be processed */
  pending: number
  /** Number of requests currently being processed */
  active: number
  /** Number of successfully completed requests */
  completed: number
  /** Number of failed requests */
  failed: number
}

export interface QueuedRequest {
  id: string
  type: 'file' | 'selection' | 'project'
  priority: 'low' | 'normal' | 'high'
  payload: any
  createdAt: Date
  attempts: number
  status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled'
  cancellationToken?: vscode.CancellationToken | undefined
  error?: Error | undefined
}
