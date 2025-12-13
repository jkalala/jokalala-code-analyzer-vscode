/**
 * False Positive Detector
 *
 * Identifies and filters out known false positive patterns from vulnerability reports.
 * Uses pattern matching, context analysis, and historical data to reduce noise.
 */

import type { V2Vulnerability } from '../interfaces/v2-report.interface'

/**
 * Result of false positive detection
 */
export interface FalsePositiveResult {
  isFalsePositive: boolean
  confidence: number           // 0-1: How confident we are this is a false positive
  reason?: string             // Why it's a false positive
  correctClassification?: string // What it actually is
  suppressed?: boolean        // Whether to hide it completely
}

/**
 * Known false positive pattern definition
 */
interface FalsePositivePattern {
  id: string
  name: string
  indicator: RegExp            // Pattern in code that triggers false positive
  contextIndicator?: RegExp    // Additional context pattern
  misclassificationTypes: string[] // Vulnerability types that get misclassified
  languages: string[]          // Languages where this applies ('any' for all)
  correctClassification: string
  confidence: number           // 0-1: How confident we are when pattern matches
  shouldSuppress: boolean      // Whether to hide completely vs just warn
  description: string
}

/**
 * Comprehensive list of known false positive patterns
 */
const KNOWN_FALSE_POSITIVES: FalsePositivePattern[] = [
  // ===== SQL Injection False Positives =====
  {
    id: 'fp-sql-jdbc-template',
    name: 'JdbcTemplate Safe Query',
    indicator: /jdbcTemplate\s*\.\s*(?:query|queryForObject|update|execute)\s*\(/i,
    contextIndicator: /\?\s*[,)]/,
    misclassificationTypes: ['sql_injection', 'SQL Injection', 'A03:2021', 'CWE-89'],
    languages: ['java'],
    correctClassification: 'Spring JdbcTemplate - Uses parameterized queries',
    confidence: 0.9,
    shouldSuppress: true,
    description: 'Spring JdbcTemplate with ? placeholders is safe from SQL injection'
  },
  {
    id: 'fp-sql-prepared-statement',
    name: 'PreparedStatement',
    indicator: /PreparedStatement|prepareStatement\s*\(/i,
    contextIndicator: /setString|setInt|setLong|setParameter/i,
    misclassificationTypes: ['sql_injection', 'SQL Injection', 'CWE-89'],
    languages: ['java'],
    correctClassification: 'JDBC PreparedStatement - Safe parameterized query',
    confidence: 0.85,
    shouldSuppress: true,
    description: 'PreparedStatement with parameter binding is safe'
  },
  {
    id: 'fp-sql-python-parameterized',
    name: 'Python Parameterized Query',
    indicator: /cursor\.execute\s*\([^,]+,\s*[\(\[]/i,
    misclassificationTypes: ['sql_injection', 'SQL Injection', 'CWE-89'],
    languages: ['python'],
    correctClassification: 'Python parameterized query - Safe',
    confidence: 0.85,
    shouldSuppress: true,
    description: 'cursor.execute with tuple/list parameters is safe'
  },
  {
    id: 'fp-sql-sqlalchemy-orm',
    name: 'SQLAlchemy ORM Query',
    indicator: /session\.query\s*\(|\.filter\s*\(\s*\w+\.\w+\s*==/i,
    misclassificationTypes: ['sql_injection', 'SQL Injection', 'CWE-89'],
    languages: ['python'],
    correctClassification: 'SQLAlchemy ORM - Safe query',
    confidence: 0.8,
    shouldSuppress: true,
    description: 'SQLAlchemy ORM queries use parameterized queries internally'
  },
  {
    id: 'fp-sql-print-statement',
    name: 'SQL in Print/Log Statement',
    indicator: /(?:print|console\.log|logger\.\w+|System\.out\.print)\s*\([^)]*(?:SELECT|INSERT|UPDATE|DELETE)/i,
    misclassificationTypes: ['sql_injection', 'SQL Injection', 'CWE-89'],
    languages: ['any'],
    correctClassification: 'Logging/Debugging Statement',
    confidence: 0.95,
    shouldSuppress: true,
    description: 'SQL query strings in log statements are not vulnerabilities'
  },

  // ===== Code Injection False Positives =====
  {
    id: 'fp-eval-literal',
    name: 'ast.literal_eval',
    indicator: /ast\.literal_eval\s*\(/i,
    misclassificationTypes: ['code_injection', 'eval()', 'CWE-95'],
    languages: ['python'],
    correctClassification: 'Safe literal evaluation - Only evaluates literals',
    confidence: 0.95,
    shouldSuppress: true,
    description: 'ast.literal_eval only parses literal structures, not arbitrary code'
  },
  {
    id: 'fp-eval-json-parse',
    name: 'JSON.parse',
    indicator: /JSON\.parse\s*\(/i,
    misclassificationTypes: ['code_injection', 'eval()', 'CWE-95'],
    languages: ['javascript', 'typescript'],
    correctClassification: 'JSON parsing - Not code execution',
    confidence: 0.9,
    shouldSuppress: true,
    description: 'JSON.parse does not execute code'
  },
  {
    id: 'fp-eval-settimeout-number',
    name: 'setTimeout with function reference',
    indicator: /setTimeout\s*\(\s*\w+\s*,\s*\d+\s*\)/i,
    misclassificationTypes: ['code_injection', 'eval()', 'CWE-95'],
    languages: ['javascript', 'typescript'],
    correctClassification: 'setTimeout with function reference - Safe',
    confidence: 0.85,
    shouldSuppress: true,
    description: 'setTimeout with function reference (not string) is safe'
  },

  // ===== Command Injection False Positives =====
  {
    id: 'fp-cmd-subprocess-safe',
    name: 'Subprocess shell=False',
    indicator: /subprocess\.(?:run|Popen|call)\s*\([^)]*shell\s*=\s*False/i,
    misclassificationTypes: ['command_injection', 'CWE-78', 'OS Command Injection'],
    languages: ['python'],
    correctClassification: 'Safe subprocess call - shell disabled',
    confidence: 0.85,
    shouldSuppress: true,
    description: 'subprocess with shell=False does not use shell interpolation'
  },
  {
    id: 'fp-cmd-subprocess-list',
    name: 'Subprocess with list arguments',
    indicator: /subprocess\.(?:run|Popen|call)\s*\(\s*\[/i,
    misclassificationTypes: ['command_injection', 'CWE-78', 'OS Command Injection'],
    languages: ['python'],
    correctClassification: 'Safe subprocess call - List arguments',
    confidence: 0.75,
    shouldSuppress: false, // Still worth reviewing but lower confidence
    description: 'subprocess with list arguments avoids shell interpolation'
  },
  {
    id: 'fp-cmd-exec-static',
    name: 'Exec with static command',
    indicator: /(?:exec|system|spawn)\s*\(\s*['"][^'"$`{}]+['"]\s*\)/i,
    misclassificationTypes: ['command_injection', 'CWE-78'],
    languages: ['any'],
    correctClassification: 'Static command execution - Review recommended',
    confidence: 0.6,
    shouldSuppress: false,
    description: 'Exec with static string may be safe but review recommended'
  },

  // ===== XSS False Positives =====
  {
    id: 'fp-xss-textcontent',
    name: 'textContent assignment',
    indicator: /\.textContent\s*=/i,
    misclassificationTypes: ['xss', 'XSS', 'Cross-Site Scripting', 'CWE-79'],
    languages: ['javascript', 'typescript'],
    correctClassification: 'Safe text assignment - textContent is XSS-safe',
    confidence: 0.95,
    shouldSuppress: true,
    description: 'textContent does not interpret HTML'
  },
  {
    id: 'fp-xss-dompurify',
    name: 'DOMPurify sanitized',
    indicator: /DOMPurify\.sanitize\s*\(/i,
    misclassificationTypes: ['xss', 'XSS', 'Cross-Site Scripting', 'CWE-79'],
    languages: ['javascript', 'typescript'],
    correctClassification: 'Sanitized HTML - DOMPurify applied',
    confidence: 0.9,
    shouldSuppress: true,
    description: 'DOMPurify sanitizes HTML to prevent XSS'
  },
  {
    id: 'fp-xss-htmlspecialchars',
    name: 'htmlspecialchars escape',
    indicator: /htmlspecialchars\s*\(/i,
    misclassificationTypes: ['xss', 'XSS', 'Cross-Site Scripting', 'CWE-79'],
    languages: ['php'],
    correctClassification: 'Sanitized output - htmlspecialchars applied',
    confidence: 0.85,
    shouldSuppress: true,
    description: 'htmlspecialchars escapes HTML special characters'
  },
  {
    id: 'fp-xss-escape-function',
    name: 'Escape function used',
    indicator: /escape(?:Html|XML|JS)?\s*\(/i,
    misclassificationTypes: ['xss', 'XSS', 'Cross-Site Scripting', 'CWE-79'],
    languages: ['any'],
    correctClassification: 'Escaped output - May be safe',
    confidence: 0.7,
    shouldSuppress: false,
    description: 'Escape function used - verify it applies to the right context'
  },

  // ===== Path Traversal False Positives =====
  {
    id: 'fp-path-resolve',
    name: 'Path resolve/normalize',
    indicator: /(?:path\.resolve|os\.path\.realpath|Path\([^)]+\)\.resolve)\s*\(/i,
    misclassificationTypes: ['path_traversal', 'CWE-22', 'Directory Traversal'],
    languages: ['any'],
    correctClassification: 'Path normalization - Mitigates traversal',
    confidence: 0.7,
    shouldSuppress: false,
    description: 'Path resolution may help but complete mitigation should be verified'
  },
  {
    id: 'fp-path-static',
    name: 'Static file path',
    indicator: /(?:readFile|writeFile|open)\s*\(\s*['"][^'"$`{}]+['"]\s*[,)]/i,
    misclassificationTypes: ['path_traversal', 'CWE-22'],
    languages: ['any'],
    correctClassification: 'Static file path - No user input',
    confidence: 0.85,
    shouldSuppress: true,
    description: 'Static file path with no dynamic components is safe'
  },

  // ===== Hardcoded Credentials False Positives =====
  {
    id: 'fp-cred-test',
    name: 'Test credentials',
    indicator: /(?:password|secret|api_key)\s*[:=]\s*['"](?:test|example|dummy|changeme|placeholder)['"]/i,
    misclassificationTypes: ['hardcoded_credentials', 'CWE-798', 'Hardcoded'],
    languages: ['any'],
    correctClassification: 'Test/Example credential - Not real',
    confidence: 0.8,
    shouldSuppress: false, // Still flag as it may be checked in accidentally
    description: 'Appears to be a test/placeholder credential'
  },
  {
    id: 'fp-cred-env',
    name: 'Environment variable reference',
    indicator: /(?:process\.env|os\.environ|getenv|ENV)\[['"]\w+['"]\]/i,
    contextIndicator: /(?:password|secret|api_key|token)/i,
    misclassificationTypes: ['hardcoded_credentials', 'CWE-798'],
    languages: ['any'],
    correctClassification: 'Environment variable - Not hardcoded',
    confidence: 0.9,
    shouldSuppress: true,
    description: 'Credentials from environment variables are not hardcoded'
  }
]

/**
 * False Positive Detector class
 */
export class FalsePositiveDetector {
  private patterns: FalsePositivePattern[]
  private userSuppressions: Set<string> // User-suppressed vulnerability IDs

  constructor() {
    this.patterns = KNOWN_FALSE_POSITIVES
    this.userSuppressions = new Set()
  }

  /**
   * Detect if a vulnerability is a false positive
   */
  detect(vuln: V2Vulnerability, fullCode?: string): FalsePositiveResult {
    const vulnType = vuln.primaryIssue?.type || vuln.primaryIssue?.title || ''
    const codeSnippet = vuln.affectedCode?.snippet || ''
    const fixLanguage = vuln.fix?.language || ''
    const allCode = fullCode ? `${codeSnippet}\n${fullCode}` : codeSnippet

    // Check user suppressions first
    if (this.userSuppressions.has(vuln.id)) {
      return {
        isFalsePositive: true,
        confidence: 1.0,
        reason: 'User suppressed',
        suppressed: true
      }
    }

    // Check against known false positive patterns
    for (const pattern of this.patterns) {
      // Check if vulnerability type matches
      const typeMatch = pattern.misclassificationTypes.some(mt =>
        vulnType.toLowerCase().includes(mt.toLowerCase())
      )

      if (!typeMatch) continue

      // Check language match
      const langMatch = pattern.languages.includes('any') ||
        pattern.languages.some(l => l.toLowerCase() === fixLanguage.toLowerCase())

      if (!langMatch) continue

      // Check if code indicator matches
      if (pattern.indicator.test(allCode)) {
        // Check context indicator if present
        if (pattern.contextIndicator) {
          if (pattern.contextIndicator.test(allCode)) {
            return {
              isFalsePositive: true,
              confidence: pattern.confidence,
              reason: pattern.description,
              correctClassification: pattern.correctClassification,
              suppressed: pattern.shouldSuppress
            }
          }
        } else {
          return {
            isFalsePositive: true,
            confidence: pattern.confidence,
            reason: pattern.description,
            correctClassification: pattern.correctClassification,
            suppressed: pattern.shouldSuppress
          }
        }
      }
    }

    // Additional heuristic checks
    const heuristicResult = this.checkHeuristics(vuln, allCode)
    if (heuristicResult.isFalsePositive) {
      return heuristicResult
    }

    return {
      isFalsePositive: false,
      confidence: 0
    }
  }

  /**
   * Check additional heuristics for false positives
   */
  private checkHeuristics(vuln: V2Vulnerability, code: string): FalsePositiveResult {
    // Check for test/mock files
    const fileName = vuln.affectedCode?.file || ''
    if (/(?:test|spec|mock|stub|fake|fixture)s?\.(?:ts|js|py|java)$/i.test(fileName)) {
      return {
        isFalsePositive: false, // Not FP but lower priority
        confidence: 0.4,
        reason: 'In test file - may be intentional vulnerable example'
      }
    }

    // Check for example/documentation patterns
    if (/(?:example|sample|demo|tutorial)/i.test(code)) {
      return {
        isFalsePositive: false,
        confidence: 0.3,
        reason: 'Appears to be example/documentation code'
      }
    }

    // Check for commented code
    const codeSnippet = vuln.affectedCode?.snippet || ''
    if (/^\s*(?:\/\/|#|\/\*|\*|<!--)/m.test(codeSnippet)) {
      return {
        isFalsePositive: true,
        confidence: 0.85,
        reason: 'Vulnerability in commented code',
        suppressed: true
      }
    }

    return {
      isFalsePositive: false,
      confidence: 0
    }
  }

  /**
   * Filter vulnerabilities, removing confirmed false positives
   */
  filterVulnerabilities(vulns: V2Vulnerability[], fullCode?: string): {
    filtered: V2Vulnerability[]
    removed: Array<{ vuln: V2Vulnerability; reason: string }>
    warned: Array<{ vuln: V2Vulnerability; reason: string }>
  } {
    const filtered: V2Vulnerability[] = []
    const removed: Array<{ vuln: V2Vulnerability; reason: string }> = []
    const warned: Array<{ vuln: V2Vulnerability; reason: string }> = []

    for (const vuln of vulns) {
      const result = this.detect(vuln, fullCode)

      if (result.isFalsePositive && result.suppressed) {
        removed.push({
          vuln,
          reason: result.reason || 'Known false positive'
        })
      } else if (result.isFalsePositive && !result.suppressed) {
        // Keep but add warning
        warned.push({
          vuln,
          reason: result.reason || 'Possible false positive'
        })
        filtered.push(vuln)
      } else {
        filtered.push(vuln)
      }
    }

    return { filtered, removed, warned }
  }

  /**
   * Add user suppression
   */
  suppressVulnerability(vulnId: string): void {
    this.userSuppressions.add(vulnId)
  }

  /**
   * Remove user suppression
   */
  unsuppressVulnerability(vulnId: string): void {
    this.userSuppressions.delete(vulnId)
  }

  /**
   * Get all suppressed vulnerability IDs
   */
  getSuppressions(): string[] {
    return Array.from(this.userSuppressions)
  }

  /**
   * Load suppressions from storage
   */
  loadSuppressions(ids: string[]): void {
    this.userSuppressions = new Set(ids)
  }

  /**
   * Get pattern by ID for debugging
   */
  getPattern(id: string): FalsePositivePattern | undefined {
    return this.patterns.find(p => p.id === id)
  }

  /**
   * Get all patterns for a vulnerability type
   */
  getPatternsForType(vulnType: string): FalsePositivePattern[] {
    return this.patterns.filter(p =>
      p.misclassificationTypes.some(mt =>
        vulnType.toLowerCase().includes(mt.toLowerCase())
      )
    )
  }
}

/**
 * Singleton instance
 */
export const falsePositiveDetector = new FalsePositiveDetector()
