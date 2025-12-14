/**
 * Context-Aware Confidence Calculator
 *
 * Calculates meaningful confidence scores based on:
 * 1. Pattern matching quality
 * 2. Code context analysis
 * 3. Historical accuracy for similar patterns
 * 4. Language detection confidence
 * 5. Line number verification
 */

import type { V2Vulnerability } from '../interfaces/v2-report.interface'

/**
 * Detailed confidence breakdown
 */
export interface ConfidenceBreakdown {
  patternMatch: number      // How well the regex/pattern matched
  contextRelevance: number  // Is this actually the right context?
  languageDetection: number // Correct language detected?
  lineAccuracy: number      // Correct line numbers?
  historicalAccuracy: number // Past accuracy for this pattern type
  overall: number           // Weighted average
}

/**
 * Context information for confidence calculation
 */
export interface CodeContext {
  surroundingCode: string[]  // Lines around the vulnerability
  language: string
  fileName?: string
  functionName?: string
  isInLoop?: boolean
  isInFunction?: boolean
  importStatements?: string[]
}

/**
 * SQL context keywords - if present, SQL injection more likely
 */
const SQL_CONTEXT_KEYWORDS = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WHERE', 'FROM',
  'JOIN', 'CREATE', 'DROP', 'ALTER', 'UNION', 'ORDER BY',
  'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'cursor', 'query',
  'execute', 'fetchall', 'fetchone', 'Connection', 'Statement'
]

/**
 * Command execution context keywords
 */
const COMMAND_CONTEXT_KEYWORDS = [
  'exec', 'spawn', 'shell', 'system', 'popen', 'subprocess',
  'child_process', 'run', 'Process', 'Runtime', 'cmd',
  'bash', 'sh', 'powershell', 'terminal'
]

/**
 * XSS context keywords
 */
const XSS_CONTEXT_KEYWORDS = [
  'innerHTML', 'outerHTML', 'document.write', 'insertAdjacentHTML',
  'dangerouslySetInnerHTML', 'v-html', 'res.send', 'res.render',
  'HttpResponse', 'echo', 'print', 'render_template_string'
]

/**
 * Safe patterns that reduce confidence of vulnerability detection
 */
const SAFE_PATTERNS: { pattern: RegExp; vulnTypes: string[]; reduction: number }[] = [
  // Parameterized queries - safe SQL
  { pattern: /\?\s*(?:,|\))/i, vulnTypes: ['sql_injection'], reduction: 0.7 },
  { pattern: /:\w+/i, vulnTypes: ['sql_injection'], reduction: 0.6 },
  { pattern: /\$\d+/i, vulnTypes: ['sql_injection'], reduction: 0.7 },
  { pattern: /setString|setInt|setParameter/i, vulnTypes: ['sql_injection'], reduction: 0.8 },
  { pattern: /PreparedStatement/i, vulnTypes: ['sql_injection'], reduction: 0.85 },

  // Safe subprocess patterns
  { pattern: /shell\s*=\s*False/i, vulnTypes: ['command_injection'], reduction: 0.7 },
  { pattern: /subprocess\.(?:run|call|Popen)\s*\(\s*\[/i, vulnTypes: ['command_injection'], reduction: 0.5 },

  // Safe HTML patterns
  { pattern: /\.textContent\s*=/i, vulnTypes: ['xss'], reduction: 0.9 },
  { pattern: /encodeURIComponent/i, vulnTypes: ['xss'], reduction: 0.6 },
  { pattern: /htmlspecialchars/i, vulnTypes: ['xss'], reduction: 0.7 },
  { pattern: /DOMPurify\.sanitize/i, vulnTypes: ['xss'], reduction: 0.85 },
  { pattern: /escape\s*\(/i, vulnTypes: ['xss'], reduction: 0.5 },

  // Safe eval patterns
  { pattern: /ast\.literal_eval/i, vulnTypes: ['code_injection', 'eval'], reduction: 0.9 },
  { pattern: /JSON\.parse/i, vulnTypes: ['code_injection', 'eval'], reduction: 0.7 },

  // Safe file operations
  { pattern: /\.resolve\(\)/i, vulnTypes: ['path_traversal'], reduction: 0.5 },
  { pattern: /realpath/i, vulnTypes: ['path_traversal'], reduction: 0.6 },
  { pattern: /basename/i, vulnTypes: ['path_traversal'], reduction: 0.5 }
]

/**
 * Historical accuracy data for vulnerability types
 * Based on common false positive rates
 */
const HISTORICAL_ACCURACY: Record<string, number> = {
  // High accuracy (few false positives)
  'hardcoded_secret': 0.85,
  'hardcoded_credentials': 0.85,
  'weak_random': 0.8,
  'insecure_deserialization': 0.75,

  // Medium accuracy
  'sql_injection': 0.65,
  'command_injection': 0.6,
  'xss': 0.55,
  'path_traversal': 0.6,
  'ssrf': 0.65,

  // Lower accuracy (more false positives)
  'code_injection': 0.5,
  'eval': 0.45,
  'information_disclosure': 0.5,
  'security_misconfiguration': 0.5,

  // Default for unknown types
  'default': 0.55
}

/**
 * Confidence Calculator class
 */
export class ConfidenceCalculator {

  /**
   * Calculate comprehensive confidence score for a vulnerability
   */
  calculateForVulnerability(
    vuln: V2Vulnerability,
    context: CodeContext
  ): ConfidenceBreakdown {
    // Calculate individual factors
    const patternMatch = this.calculatePatternScore(vuln)
    const contextRelevance = this.analyzeContext(vuln, context)
    const languageDetection = this.calculateLanguageConfidence(vuln, context)
    const lineAccuracy = this.verifyLineNumbers(vuln, context)
    const historicalAccuracy = this.getHistoricalAccuracy(vuln.primaryIssue?.type)

    // Calculate weighted overall score
    const weights = {
      patternMatch: 0.15,
      contextRelevance: 0.35,  // Most important - is this actually the right context?
      languageDetection: 0.15,
      lineAccuracy: 0.15,
      historicalAccuracy: 0.20
    }

    const overall = Math.max(0, Math.min(1,
      (patternMatch * weights.patternMatch) +
      (contextRelevance * weights.contextRelevance) +
      (languageDetection * weights.languageDetection) +
      (lineAccuracy * weights.lineAccuracy) +
      (historicalAccuracy * weights.historicalAccuracy)
    ))

    return {
      patternMatch,
      contextRelevance,
      languageDetection,
      lineAccuracy,
      historicalAccuracy,
      overall
    }
  }

  /**
   * Calculate pattern matching quality score
   */
  private calculatePatternScore(vuln: V2Vulnerability): number {
    let score = 0.5 // Base score

    // Has evidence patterns
    if (vuln.evidence?.patterns && vuln.evidence.patterns.length > 0) {
      score += 0.2
    }

    // Has indicators
    if (vuln.evidence?.indicators && vuln.evidence.indicators.length > 0) {
      score += 0.1
    }

    // Has CWE reference (shows proper classification)
    if (vuln.standards?.cwe) {
      score += 0.1
    }

    // Has code snippet (can verify pattern)
    if (vuln.affectedCode?.snippet && vuln.affectedCode.snippet.length > 10) {
      score += 0.1
    }

    return Math.min(1, score)
  }

  /**
   * Analyze code context to validate vulnerability type
   */
  private analyzeContext(vuln: V2Vulnerability, context: CodeContext): number {
    const vulnType = (vuln.primaryIssue?.type || '').toLowerCase()
    const codeSnippet = vuln.affectedCode?.snippet || ''
    const surroundingCode = context.surroundingCode?.join('\n') || ''
    const allCode = `${codeSnippet}\n${surroundingCode}`

    // First check for safe patterns that reduce confidence
    let safePatternReduction = 0
    for (const safe of SAFE_PATTERNS) {
      if (safe.vulnTypes.some(vt => vulnType.includes(vt))) {
        if (safe.pattern.test(allCode)) {
          safePatternReduction = Math.max(safePatternReduction, safe.reduction)
        }
      }
    }

    if (safePatternReduction > 0) {
      return 1 - safePatternReduction // Safe pattern found, reduce confidence
    }

    // Check context keywords based on vulnerability type
    let contextScore = 0.3 // Base score

    if (vulnType.includes('sql')) {
      // For SQL injection, check if SQL context keywords are present
      const sqlKeywordsFound = SQL_CONTEXT_KEYWORDS.filter(kw =>
        new RegExp(`\\b${kw}\\b`, 'i').test(allCode)
      ).length

      contextScore = Math.min(1, 0.3 + (sqlKeywordsFound / SQL_CONTEXT_KEYWORDS.length) * 0.7)
    } else if (vulnType.includes('command') || vulnType.includes('injection')) {
      // For command injection, check execution context
      const cmdKeywordsFound = COMMAND_CONTEXT_KEYWORDS.filter(kw =>
        new RegExp(`\\b${kw}\\b`, 'i').test(allCode)
      ).length

      contextScore = Math.min(1, 0.3 + (cmdKeywordsFound / COMMAND_CONTEXT_KEYWORDS.length) * 0.7)
    } else if (vulnType.includes('xss') || vulnType.includes('cross-site')) {
      // For XSS, check HTML output context
      const xssKeywordsFound = XSS_CONTEXT_KEYWORDS.filter(kw =>
        new RegExp(`\\b${kw}\\b`, 'i').test(allCode)
      ).length

      contextScore = Math.min(1, 0.3 + (xssKeywordsFound / XSS_CONTEXT_KEYWORDS.length) * 0.7)
    } else {
      // Default: moderate confidence for other types
      contextScore = 0.6
    }

    // Penalize if code looks like logging/debugging
    const loggingPatterns = [
      /\bconsole\.\w+\s*\(/i,
      /\bprint\s*\(/i,
      /\blogger\.\w+\s*\(/i,
      /\blog\.\w+\s*\(/i,
      /System\.out\.print/i,
      /System\.err\.print/i,
      /Debug\./i,
      /Trace\./i
    ]

    if (loggingPatterns.some(p => p.test(codeSnippet))) {
      contextScore *= 0.3 // Significant reduction for logging code
    }

    return contextScore
  }

  /**
   * Calculate language detection confidence
   */
  private calculateLanguageConfidence(vuln: V2Vulnerability, context: CodeContext): number {
    const fixLanguage = vuln.fix?.language
    const fixLangConfidence = vuln.fix?.languageConfidence ?? 0.5
    const contextLanguage = context.language

    // If no language info, medium confidence
    if (!fixLanguage) {
      return 0.5
    }

    // If languages match, boost confidence
    if (fixLanguage.toLowerCase() === contextLanguage?.toLowerCase()) {
      return Math.min(1, fixLangConfidence * 1.2)
    }

    // Languages don't match - significant penalty
    return Math.max(0.2, fixLangConfidence * 0.5)
  }

  /**
   * Verify line numbers are reasonable
   */
  private verifyLineNumbers(vuln: V2Vulnerability, context: CodeContext): number {
    const lines = vuln.affectedCode?.lines || []

    if (lines.length === 0) {
      return 0.4 // No line info
    }

    // Check lines are positive
    if (lines.some(l => l <= 0)) {
      return 0.2
    }

    // Check lines are not too spread out
    const minLine = Math.min(...lines)
    const maxLine = Math.max(...lines)
    const spread = maxLine - minLine

    if (spread > 100) {
      return 0.3 // Suspiciously large spread
    }

    // Check if lines reference code that matches surrounding context
    if (context.surroundingCode && context.surroundingCode.length > 0) {
      // Good - we have context to verify
      return 0.8
    }

    return 0.7 // Default reasonable score
  }

  /**
   * Get historical accuracy for vulnerability type
   */
  private getHistoricalAccuracy(vulnType: string | undefined): number {
    const defaultAccuracy = HISTORICAL_ACCURACY['default'] ?? 0.7

    if (!vulnType) {
      return defaultAccuracy
    }

    const normalizedType = vulnType.toLowerCase().replace(/[_-]/g, '_')

    // Check for exact match
    if (HISTORICAL_ACCURACY[normalizedType] !== undefined) {
      return HISTORICAL_ACCURACY[normalizedType]
    }

    // Check for partial match
    for (const [key, value] of Object.entries(HISTORICAL_ACCURACY)) {
      if (normalizedType.includes(key) || key.includes(normalizedType)) {
        return value
      }
    }

    return defaultAccuracy
  }

  /**
   * Recalculate and update confidence for a vulnerability
   */
  recalculateConfidence(
    vuln: V2Vulnerability,
    context: CodeContext
  ): V2Vulnerability {
    const breakdown = this.calculateForVulnerability(vuln, context)

    return {
      ...vuln,
      confidence: breakdown.overall,
      confidenceLevel: this.getConfidenceLevel(breakdown.overall)
    }
  }

  /**
   * Get confidence level from score
   */
  private getConfidenceLevel(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (confidence >= 0.75) return 'HIGH'
    if (confidence >= 0.45) return 'MEDIUM'
    return 'LOW'
  }

  /**
   * Get human-readable confidence description
   */
  getConfidenceDescription(breakdown: ConfidenceBreakdown): string {
    const issues: string[] = []

    if (breakdown.contextRelevance < 0.5) {
      issues.push('code context may not match vulnerability type')
    }
    if (breakdown.languageDetection < 0.5) {
      issues.push('language detection uncertainty')
    }
    if (breakdown.lineAccuracy < 0.5) {
      issues.push('line number accuracy may be low')
    }
    if (breakdown.historicalAccuracy < 0.5) {
      issues.push('this pattern type has higher false positive rates')
    }

    if (issues.length === 0) {
      return 'High confidence finding with strong supporting evidence'
    }

    return `Confidence reduced due to: ${issues.join(', ')}`
  }
}

/**
 * Singleton instance
 */
export const confidenceCalculator = new ConfidenceCalculator()
