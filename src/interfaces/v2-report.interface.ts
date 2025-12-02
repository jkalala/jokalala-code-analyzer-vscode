/**
 * V2 Enhanced Report Interfaces
 *
 * Represents the intelligent deduplication and enhanced analysis results
 * from the V2 analyzer with language-specific fixes, confidence scores,
 * and consolidated vulnerabilities.
 */

export interface V2AnalysisReport {
  summary: V2Summary
  vulnerabilities: V2Vulnerability[]
  complianceImpact: ComplianceImpact
  recommendations: V2Recommendations
  metadata: V2Metadata
}

export interface V2Summary {
  totalVulnerabilities: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  averageConfidence: number
  detectedLanguage: string
}

export interface V2Vulnerability {
  // Identification
  id: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  confidence: number
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW'

  // Classification
  primaryIssue: {
    type: string
    title: string
    description: string
  }

  relatedConcerns: {
    architectural?: string
    performance?: string
    businessLogic?: string
    bestPractices?: string
  }

  // Location
  affectedCode: {
    lines: number[]
    snippet: string
    file?: string
  }

  // Evidence
  evidence: {
    patterns: string[]
    indicators: string[]
  }

  // Standards & Compliance
  standards: {
    cwe?: string
    owasp?: string
    cvss?: string
  }

  // Language-Specific Fix
  fix: V2Fix

  // Impact
  impact: {
    security: string
    business?: string
  }

  // Metadata
  metadata: {
    uniqueInstances: number
    consolidatedFrom: number
  }

  // Optional Intelligence Data
  intelligence?: {
    cisaKEV?: {
      knownExploited: boolean
      dateAdded?: string
      description?: string
    }
    epssScore?: number
    nvdData?: {
      cveId: string
      description: string
      baseScore: number
      severity: string
    }
  }
}

export interface V2Fix {
  language: string
  languageConfidence: number

  quickSummary: string
  detailedExplanation: string[]

  vulnerableCode: string
  secureCode: string

  dependencies?: string[]
  frameworks?: string[]

  alternatives?: Array<{
    approach: string
    code: string
    pros: string[]
    cons: string[]
  }>
}

export interface ComplianceImpact {
  owasp: string[]
  cwe: string[]
  affectedStandards: string[]
}

export interface V2Recommendations {
  immediate: string[]
  shortTerm: string[]
  longTerm: string[]
}

export interface V2Metadata {
  analysisDate: string
  analyzerVersion: string
  processingTime?: number
}

/**
 * Enhanced AnalysisResult that includes V2 report
 */
export interface EnhancedAnalysisResult {
  // Original V1 fields
  prioritizedIssues: any[]
  recommendations: any[]
  summary: any
  requestId?: string
  cached?: boolean

  // V2 Enhanced Fields
  metadata?: {
    hasV2Report?: boolean
    v2AnalyzerVersion?: string
  }
  v2Report?: V2AnalysisReport
}
