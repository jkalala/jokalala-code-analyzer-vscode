/**
 * Intelligence Prioritizer
 *
 * Prioritizes vulnerabilities based on threat intelligence data:
 * - CISA KEV (Known Exploited Vulnerabilities)
 * - EPSS (Exploit Prediction Scoring System)
 * - CVE/NVD data
 * - Real-world exploitation evidence
 *
 * This helps users focus on the most dangerous vulnerabilities first.
 */

import type { V2Vulnerability, V2AnalysisReport } from '../interfaces/v2-report.interface'

/**
 * Prioritized vulnerability with score
 */
export interface PrioritizedVulnerability extends V2Vulnerability {
  priorityScore: number          // 0-100 priority score
  priorityLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  priorityFactors: PriorityFactors
  urgencyReason?: string | undefined         // Why this is urgent
}

/**
 * Factors contributing to priority
 */
export interface PriorityFactors {
  severityScore: number          // Base severity contribution
  cisaKevBoost: number          // CISA KEV known exploited boost
  epssBoost: number             // EPSS exploitation probability boost
  exploitAvailableBoost: number  // Public exploit available boost
  confidenceBoost: number        // High confidence boost
  contextBoost: number          // Business context boost
  total: number
}

/**
 * Prioritization configuration
 */
export interface PrioritizationConfig {
  // Base severity weights
  criticalBaseScore: number
  highBaseScore: number
  mediumBaseScore: number
  lowBaseScore: number

  // Intelligence boost multipliers
  cisaKevMultiplier: number      // Boost for CISA KEV entries
  epssHighThreshold: number      // EPSS score considered high (0.9)
  epssHighMultiplier: number     // Multiplier for high EPSS
  epssMediumThreshold: number    // EPSS score considered medium (0.5)
  epssMediumMultiplier: number   // Multiplier for medium EPSS
  exploitAvailableMultiplier: number // Boost for public exploits
  highConfidenceMultiplier: number   // Boost for high confidence findings
}

/**
 * Default prioritization configuration
 */
const DEFAULT_CONFIG: PrioritizationConfig = {
  // Base scores by severity (0-40 range)
  criticalBaseScore: 40,
  highBaseScore: 30,
  mediumBaseScore: 20,
  lowBaseScore: 10,

  // Intelligence multipliers
  cisaKevMultiplier: 2.5,         // Known exploited = 2.5x priority
  epssHighThreshold: 0.9,
  epssHighMultiplier: 1.8,        // >90% EPSS = 1.8x priority
  epssMediumThreshold: 0.5,
  epssMediumMultiplier: 1.3,      // >50% EPSS = 1.3x priority
  exploitAvailableMultiplier: 1.5, // Public exploit = 1.5x priority
  highConfidenceMultiplier: 1.2   // High confidence = 1.2x priority
}

/**
 * Intelligence Prioritizer class
 */
export class IntelligencePrioritizer {
  private config: PrioritizationConfig

  constructor(config: Partial<PrioritizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Prioritize vulnerabilities from a V2 report
   */
  prioritizeReport(report: V2AnalysisReport): PrioritizedVulnerability[] {
    const vulnerabilities = report.vulnerabilities || []

    if (vulnerabilities.length === 0) {
      return []
    }

    // Calculate priority for each vulnerability
    const prioritized = vulnerabilities.map(vuln => this.prioritize(vuln))

    // Sort by priority score descending
    return prioritized.sort((a, b) => b.priorityScore - a.priorityScore)
  }

  /**
   * Prioritize a single vulnerability
   */
  prioritize(vuln: V2Vulnerability): PrioritizedVulnerability {
    const factors = this.calculatePriorityFactors(vuln)
    const priorityScore = Math.min(100, factors.total)
    const priorityLevel = this.getPriorityLevel(priorityScore)
    const urgencyReason = this.getUrgencyReason(vuln, factors)

    return {
      ...vuln,
      priorityScore,
      priorityLevel,
      priorityFactors: factors,
      urgencyReason
    }
  }

  /**
   * Calculate priority factors for a vulnerability
   */
  private calculatePriorityFactors(vuln: V2Vulnerability): PriorityFactors {
    // Base severity score
    const severityScore = this.getBaseSeverityScore(vuln.severity)

    // CISA KEV boost - most critical factor
    let cisaKevBoost = 0
    if (vuln.intelligence?.cisaKEV?.knownExploited) {
      cisaKevBoost = severityScore * (this.config.cisaKevMultiplier - 1)
    }

    // EPSS score boost
    let epssBoost = 0
    const epssScore = vuln.intelligence?.epssScore
    if (epssScore !== undefined) {
      if (epssScore >= this.config.epssHighThreshold) {
        epssBoost = severityScore * (this.config.epssHighMultiplier - 1)
      } else if (epssScore >= this.config.epssMediumThreshold) {
        epssBoost = severityScore * (this.config.epssMediumMultiplier - 1)
      }
    }

    // Public exploit available boost
    let exploitAvailableBoost = 0
    if (this.hasPublicExploit(vuln)) {
      exploitAvailableBoost = severityScore * (this.config.exploitAvailableMultiplier - 1)
    }

    // High confidence boost
    let confidenceBoost = 0
    if (vuln.confidence >= 0.85 || vuln.confidenceLevel === 'HIGH') {
      confidenceBoost = severityScore * (this.config.highConfidenceMultiplier - 1)
    }

    // Context boost (based on related concerns)
    let contextBoost = 0
    if (vuln.relatedConcerns?.businessLogic) {
      contextBoost += 5 // Business logic issues are important
    }
    if (vuln.relatedConcerns?.architectural) {
      contextBoost += 3 // Architectural issues compound
    }

    const total = severityScore + cisaKevBoost + epssBoost +
                  exploitAvailableBoost + confidenceBoost + contextBoost

    return {
      severityScore,
      cisaKevBoost,
      epssBoost,
      exploitAvailableBoost,
      confidenceBoost,
      contextBoost,
      total
    }
  }

  /**
   * Get base severity score
   */
  private getBaseSeverityScore(severity: V2Vulnerability['severity']): number {
    switch (severity) {
      case 'CRITICAL': return this.config.criticalBaseScore
      case 'HIGH': return this.config.highBaseScore
      case 'MEDIUM': return this.config.mediumBaseScore
      case 'LOW': return this.config.lowBaseScore
      default: return this.config.lowBaseScore
    }
  }

  /**
   * Check if vulnerability has public exploit
   */
  private hasPublicExploit(vuln: V2Vulnerability): boolean {
    // Check multiple indicators for public exploits
    if (vuln.intelligence?.nvdData?.baseScore && vuln.intelligence.nvdData.baseScore >= 9.0) {
      return true // Critical CVSSv3 often have exploits
    }

    // Check if EPSS is very high (strong indicator of exploitability)
    if (vuln.intelligence?.epssScore && vuln.intelligence.epssScore >= 0.95) {
      return true
    }

    // Check evidence indicators for exploit references
    const evidence = vuln.evidence?.indicators || []
    const exploitKeywords = ['exploit', 'poc', 'metasploit', 'nuclei', 'burp']
    if (evidence.some(e =>
      exploitKeywords.some(kw => e.toLowerCase().includes(kw))
    )) {
      return true
    }

    return false
  }

  /**
   * Get priority level from score
   */
  private getPriorityLevel(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (score >= 80) return 'CRITICAL'
    if (score >= 55) return 'HIGH'
    if (score >= 30) return 'MEDIUM'
    return 'LOW'
  }

  /**
   * Get urgency reason for display
   */
  private getUrgencyReason(vuln: V2Vulnerability, factors: PriorityFactors): string | undefined {
    const reasons: string[] = []

    if (factors.cisaKevBoost > 0) {
      const dateAdded = vuln.intelligence?.cisaKEV?.dateAdded
      reasons.push(dateAdded
        ? `CISA KEV: Active exploitation since ${dateAdded}`
        : 'CISA KEV: Actively exploited in the wild'
      )
    }

    if (factors.epssBoost > 0) {
      const epss = vuln.intelligence?.epssScore
      if (epss !== undefined) {
        const percentage = Math.round(epss * 100)
        if (epss >= 0.9) {
          reasons.push(`EPSS: ${percentage}% exploitation probability (very high)`)
        } else if (epss >= 0.5) {
          reasons.push(`EPSS: ${percentage}% exploitation probability`)
        }
      }
    }

    if (factors.exploitAvailableBoost > 0) {
      reasons.push('Public exploit likely available')
    }

    if (vuln.severity === 'CRITICAL') {
      reasons.push('Critical severity requires immediate attention')
    }

    return reasons.length > 0 ? reasons.join(' | ') : undefined
  }

  /**
   * Get summary of intelligence-boosted vulnerabilities
   */
  getIntelligenceSummary(prioritized: PrioritizedVulnerability[]): {
    totalVulns: number
    cisaKevCount: number
    highEpssCount: number
    exploitAvailableCount: number
    criticalPriorityCount: number
    highPriorityCount: number
    averagePriorityScore: number
  } {
    const cisaKevCount = prioritized.filter(v =>
      v.priorityFactors.cisaKevBoost > 0
    ).length

    const highEpssCount = prioritized.filter(v =>
      v.priorityFactors.epssBoost > 0
    ).length

    const exploitAvailableCount = prioritized.filter(v =>
      v.priorityFactors.exploitAvailableBoost > 0
    ).length

    const criticalPriorityCount = prioritized.filter(v =>
      v.priorityLevel === 'CRITICAL'
    ).length

    const highPriorityCount = prioritized.filter(v =>
      v.priorityLevel === 'HIGH'
    ).length

    const totalScore = prioritized.reduce((sum, v) => sum + v.priorityScore, 0)
    const averagePriorityScore = prioritized.length > 0
      ? Math.round(totalScore / prioritized.length)
      : 0

    return {
      totalVulns: prioritized.length,
      cisaKevCount,
      highEpssCount,
      exploitAvailableCount,
      criticalPriorityCount,
      highPriorityCount,
      averagePriorityScore
    }
  }

  /**
   * Get top N highest priority vulnerabilities
   */
  getTopPriority(prioritized: PrioritizedVulnerability[], n: number = 5): PrioritizedVulnerability[] {
    return prioritized.slice(0, n)
  }

  /**
   * Get vulnerabilities that need immediate action
   */
  getImmediateAction(prioritized: PrioritizedVulnerability[]): PrioritizedVulnerability[] {
    return prioritized.filter(v =>
      v.priorityLevel === 'CRITICAL' ||
      v.priorityFactors.cisaKevBoost > 0 ||
      (v.priorityFactors.epssBoost > 0 && v.intelligence?.epssScore && v.intelligence.epssScore >= 0.9)
    )
  }

  /**
   * Format priority score for display
   */
  formatPriorityScore(vuln: PrioritizedVulnerability): string {
    const icon = this.getPriorityIcon(vuln.priorityLevel)
    return `${icon} Priority: ${Math.round(vuln.priorityScore)}/100`
  }

  /**
   * Get priority icon
   */
  private getPriorityIcon(level: PrioritizedVulnerability['priorityLevel']): string {
    switch (level) {
      case 'CRITICAL': return '🚨'
      case 'HIGH': return '🔴'
      case 'MEDIUM': return '🟠'
      case 'LOW': return '🟢'
    }
  }

  /**
   * Get detailed priority explanation for tooltip
   */
  getPriorityExplanation(vuln: PrioritizedVulnerability): string[] {
    const lines: string[] = [
      `**Priority Score**: ${Math.round(vuln.priorityScore)}/100 (${vuln.priorityLevel})`,
      '',
      '**Score Breakdown**:',
      `- Base Severity (${vuln.severity}): +${Math.round(vuln.priorityFactors.severityScore)}`
    ]

    if (vuln.priorityFactors.cisaKevBoost > 0) {
      lines.push(`- CISA KEV (Known Exploited): +${Math.round(vuln.priorityFactors.cisaKevBoost)} 🚨`)
    }

    if (vuln.priorityFactors.epssBoost > 0) {
      const epss = vuln.intelligence?.epssScore
      const epssPercent = epss ? `${Math.round(epss * 100)}%` : 'High'
      lines.push(`- EPSS Score (${epssPercent}): +${Math.round(vuln.priorityFactors.epssBoost)} ⚡`)
    }

    if (vuln.priorityFactors.exploitAvailableBoost > 0) {
      lines.push(`- Public Exploit Available: +${Math.round(vuln.priorityFactors.exploitAvailableBoost)}`)
    }

    if (vuln.priorityFactors.confidenceBoost > 0) {
      lines.push(`- High Confidence: +${Math.round(vuln.priorityFactors.confidenceBoost)}`)
    }

    if (vuln.priorityFactors.contextBoost > 0) {
      lines.push(`- Business Context: +${Math.round(vuln.priorityFactors.contextBoost)}`)
    }

    if (vuln.urgencyReason) {
      lines.push('')
      lines.push(`**Urgency**: ${vuln.urgencyReason}`)
    }

    return lines
  }
}

/**
 * Singleton instance
 */
export const intelligencePrioritizer = new IntelligencePrioritizer()
