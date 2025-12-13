"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.intelligencePrioritizer = exports.IntelligencePrioritizer = void 0;
/**
 * Default prioritization configuration
 */
const DEFAULT_CONFIG = {
    // Base scores by severity (0-40 range)
    criticalBaseScore: 40,
    highBaseScore: 30,
    mediumBaseScore: 20,
    lowBaseScore: 10,
    // Intelligence multipliers
    cisaKevMultiplier: 2.5, // Known exploited = 2.5x priority
    epssHighThreshold: 0.9,
    epssHighMultiplier: 1.8, // >90% EPSS = 1.8x priority
    epssMediumThreshold: 0.5,
    epssMediumMultiplier: 1.3, // >50% EPSS = 1.3x priority
    exploitAvailableMultiplier: 1.5, // Public exploit = 1.5x priority
    highConfidenceMultiplier: 1.2 // High confidence = 1.2x priority
};
/**
 * Intelligence Prioritizer class
 */
class IntelligencePrioritizer {
    constructor(config = {}) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Prioritize vulnerabilities from a V2 report
     */
    prioritizeReport(report) {
        const vulnerabilities = report.vulnerabilities || [];
        if (vulnerabilities.length === 0) {
            return [];
        }
        // Calculate priority for each vulnerability
        const prioritized = vulnerabilities.map(vuln => this.prioritize(vuln));
        // Sort by priority score descending
        return prioritized.sort((a, b) => b.priorityScore - a.priorityScore);
    }
    /**
     * Prioritize a single vulnerability
     */
    prioritize(vuln) {
        const factors = this.calculatePriorityFactors(vuln);
        const priorityScore = Math.min(100, factors.total);
        const priorityLevel = this.getPriorityLevel(priorityScore);
        const urgencyReason = this.getUrgencyReason(vuln, factors);
        return {
            ...vuln,
            priorityScore,
            priorityLevel,
            priorityFactors: factors,
            urgencyReason
        };
    }
    /**
     * Calculate priority factors for a vulnerability
     */
    calculatePriorityFactors(vuln) {
        // Base severity score
        const severityScore = this.getBaseSeverityScore(vuln.severity);
        // CISA KEV boost - most critical factor
        let cisaKevBoost = 0;
        if (vuln.intelligence?.cisaKEV?.knownExploited) {
            cisaKevBoost = severityScore * (this.config.cisaKevMultiplier - 1);
        }
        // EPSS score boost
        let epssBoost = 0;
        const epssScore = vuln.intelligence?.epssScore;
        if (epssScore !== undefined) {
            if (epssScore >= this.config.epssHighThreshold) {
                epssBoost = severityScore * (this.config.epssHighMultiplier - 1);
            }
            else if (epssScore >= this.config.epssMediumThreshold) {
                epssBoost = severityScore * (this.config.epssMediumMultiplier - 1);
            }
        }
        // Public exploit available boost
        let exploitAvailableBoost = 0;
        if (this.hasPublicExploit(vuln)) {
            exploitAvailableBoost = severityScore * (this.config.exploitAvailableMultiplier - 1);
        }
        // High confidence boost
        let confidenceBoost = 0;
        if (vuln.confidence >= 0.85 || vuln.confidenceLevel === 'HIGH') {
            confidenceBoost = severityScore * (this.config.highConfidenceMultiplier - 1);
        }
        // Context boost (based on related concerns)
        let contextBoost = 0;
        if (vuln.relatedConcerns?.businessLogic) {
            contextBoost += 5; // Business logic issues are important
        }
        if (vuln.relatedConcerns?.architectural) {
            contextBoost += 3; // Architectural issues compound
        }
        const total = severityScore + cisaKevBoost + epssBoost +
            exploitAvailableBoost + confidenceBoost + contextBoost;
        return {
            severityScore,
            cisaKevBoost,
            epssBoost,
            exploitAvailableBoost,
            confidenceBoost,
            contextBoost,
            total
        };
    }
    /**
     * Get base severity score
     */
    getBaseSeverityScore(severity) {
        switch (severity) {
            case 'CRITICAL': return this.config.criticalBaseScore;
            case 'HIGH': return this.config.highBaseScore;
            case 'MEDIUM': return this.config.mediumBaseScore;
            case 'LOW': return this.config.lowBaseScore;
            default: return this.config.lowBaseScore;
        }
    }
    /**
     * Check if vulnerability has public exploit
     */
    hasPublicExploit(vuln) {
        // Check multiple indicators for public exploits
        if (vuln.intelligence?.nvdData?.baseScore && vuln.intelligence.nvdData.baseScore >= 9.0) {
            return true; // Critical CVSSv3 often have exploits
        }
        // Check if EPSS is very high (strong indicator of exploitability)
        if (vuln.intelligence?.epssScore && vuln.intelligence.epssScore >= 0.95) {
            return true;
        }
        // Check evidence indicators for exploit references
        const evidence = vuln.evidence?.indicators || [];
        const exploitKeywords = ['exploit', 'poc', 'metasploit', 'nuclei', 'burp'];
        if (evidence.some(e => exploitKeywords.some(kw => e.toLowerCase().includes(kw)))) {
            return true;
        }
        return false;
    }
    /**
     * Get priority level from score
     */
    getPriorityLevel(score) {
        if (score >= 80)
            return 'CRITICAL';
        if (score >= 55)
            return 'HIGH';
        if (score >= 30)
            return 'MEDIUM';
        return 'LOW';
    }
    /**
     * Get urgency reason for display
     */
    getUrgencyReason(vuln, factors) {
        const reasons = [];
        if (factors.cisaKevBoost > 0) {
            const dateAdded = vuln.intelligence?.cisaKEV?.dateAdded;
            reasons.push(dateAdded
                ? `CISA KEV: Active exploitation since ${dateAdded}`
                : 'CISA KEV: Actively exploited in the wild');
        }
        if (factors.epssBoost > 0) {
            const epss = vuln.intelligence?.epssScore;
            if (epss !== undefined) {
                const percentage = Math.round(epss * 100);
                if (epss >= 0.9) {
                    reasons.push(`EPSS: ${percentage}% exploitation probability (very high)`);
                }
                else if (epss >= 0.5) {
                    reasons.push(`EPSS: ${percentage}% exploitation probability`);
                }
            }
        }
        if (factors.exploitAvailableBoost > 0) {
            reasons.push('Public exploit likely available');
        }
        if (vuln.severity === 'CRITICAL') {
            reasons.push('Critical severity requires immediate attention');
        }
        return reasons.length > 0 ? reasons.join(' | ') : undefined;
    }
    /**
     * Get summary of intelligence-boosted vulnerabilities
     */
    getIntelligenceSummary(prioritized) {
        const cisaKevCount = prioritized.filter(v => v.priorityFactors.cisaKevBoost > 0).length;
        const highEpssCount = prioritized.filter(v => v.priorityFactors.epssBoost > 0).length;
        const exploitAvailableCount = prioritized.filter(v => v.priorityFactors.exploitAvailableBoost > 0).length;
        const criticalPriorityCount = prioritized.filter(v => v.priorityLevel === 'CRITICAL').length;
        const highPriorityCount = prioritized.filter(v => v.priorityLevel === 'HIGH').length;
        const totalScore = prioritized.reduce((sum, v) => sum + v.priorityScore, 0);
        const averagePriorityScore = prioritized.length > 0
            ? Math.round(totalScore / prioritized.length)
            : 0;
        return {
            totalVulns: prioritized.length,
            cisaKevCount,
            highEpssCount,
            exploitAvailableCount,
            criticalPriorityCount,
            highPriorityCount,
            averagePriorityScore
        };
    }
    /**
     * Get top N highest priority vulnerabilities
     */
    getTopPriority(prioritized, n = 5) {
        return prioritized.slice(0, n);
    }
    /**
     * Get vulnerabilities that need immediate action
     */
    getImmediateAction(prioritized) {
        return prioritized.filter(v => v.priorityLevel === 'CRITICAL' ||
            v.priorityFactors.cisaKevBoost > 0 ||
            (v.priorityFactors.epssBoost > 0 && v.intelligence?.epssScore && v.intelligence.epssScore >= 0.9));
    }
    /**
     * Format priority score for display
     */
    formatPriorityScore(vuln) {
        const icon = this.getPriorityIcon(vuln.priorityLevel);
        return `${icon} Priority: ${Math.round(vuln.priorityScore)}/100`;
    }
    /**
     * Get priority icon
     */
    getPriorityIcon(level) {
        switch (level) {
            case 'CRITICAL': return '🚨';
            case 'HIGH': return '🔴';
            case 'MEDIUM': return '🟠';
            case 'LOW': return '🟢';
        }
    }
    /**
     * Get detailed priority explanation for tooltip
     */
    getPriorityExplanation(vuln) {
        const lines = [
            `**Priority Score**: ${Math.round(vuln.priorityScore)}/100 (${vuln.priorityLevel})`,
            '',
            '**Score Breakdown**:',
            `- Base Severity (${vuln.severity}): +${Math.round(vuln.priorityFactors.severityScore)}`
        ];
        if (vuln.priorityFactors.cisaKevBoost > 0) {
            lines.push(`- CISA KEV (Known Exploited): +${Math.round(vuln.priorityFactors.cisaKevBoost)} 🚨`);
        }
        if (vuln.priorityFactors.epssBoost > 0) {
            const epss = vuln.intelligence?.epssScore;
            const epssPercent = epss ? `${Math.round(epss * 100)}%` : 'High';
            lines.push(`- EPSS Score (${epssPercent}): +${Math.round(vuln.priorityFactors.epssBoost)} ⚡`);
        }
        if (vuln.priorityFactors.exploitAvailableBoost > 0) {
            lines.push(`- Public Exploit Available: +${Math.round(vuln.priorityFactors.exploitAvailableBoost)}`);
        }
        if (vuln.priorityFactors.confidenceBoost > 0) {
            lines.push(`- High Confidence: +${Math.round(vuln.priorityFactors.confidenceBoost)}`);
        }
        if (vuln.priorityFactors.contextBoost > 0) {
            lines.push(`- Business Context: +${Math.round(vuln.priorityFactors.contextBoost)}`);
        }
        if (vuln.urgencyReason) {
            lines.push('');
            lines.push(`**Urgency**: ${vuln.urgencyReason}`);
        }
        return lines;
    }
}
exports.IntelligencePrioritizer = IntelligencePrioritizer;
/**
 * Singleton instance
 */
exports.intelligencePrioritizer = new IntelligencePrioritizer();
//# sourceMappingURL=intelligence-prioritizer.js.map