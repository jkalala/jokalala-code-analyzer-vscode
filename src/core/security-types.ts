/**
 * Shared security analysis result types (Tier-1 + offline wrapper).
 */

export enum Severity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

export interface SecurityIssue {
  id: string
  ruleId: string
  title: string
  description: string
  severity: Severity
  category: string
  cwe?: string[]
  owasp?: string[]
  line: number
  column: number
  endLine?: number
  endColumn?: number
  codeSnippet: string
  suggestion: string
  fixCode?: string
  confidence: number
  falsePositiveLikelihood: number
  references: string[]
  message?: string
  metadata?: Record<string, unknown>
}

export interface OfflineAnalysisOptions {
  enabledCategories?: string[]
  disabledRules?: string[]
  minSeverity?: Severity
  maxIssues?: number
  includeInfoIssues?: boolean
  enableAutoFix?: boolean
  language?: string
  packProfile?: 'precision' | 'full'
  filePathHint?: string
  /** Intraprocedural source→sink taint tracking for JS/TS (default true). */
  enableTaintAnalysis?: boolean
  /** Honor inline `// jokalala-ignore` / nosec directives (default true). */
  respectInlineSuppressions?: boolean
  /** Fingerprints of accepted findings to exclude (see core/baseline.ts). */
  baseline?: ReadonlySet<string>
}

export interface OfflineAnalysisResult {
  issues: SecurityIssue[]
  summary: {
    totalIssues: number
    criticalCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    infoCount: number
    rulesTriggered: number
    analysisTime: number
    linesAnalyzed: number
    coverage: number
    /** Findings hidden by inline `// jokalala-ignore` / nosec directives. */
    suppressedCount?: number
    /** Findings excluded because they match the accepted baseline. */
    baselinedCount?: number
  }
  metadata: {
    version: string
    rulesVersion: string
    language: string
    isOffline: boolean
    timestamp: number
  }
}
