"use strict";
/**
 * Quality Gate for V2 Analysis Reports
 *
 * Implements validation to ensure V2 reports meet minimum quality standards
 * before displaying to users. This prevents showing unreliable analysis
 * results that could mislead developers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.qualityGate = exports.QualityGate = void 0;
/**
 * Default quality gate configuration
 */
const DEFAULT_CONFIG = {
    minOverallAccuracy: 0.65, // 65% minimum accuracy to show V2
    minLanguageConfidence: 0.5, // 50% minimum language confidence
    maxMisclassificationRisk: 0.35, // 35% max misclassification risk
    minVulnerabilityCount: 1 // At least 1 vulnerability
};
/**
 * Known false positive patterns - vulnerabilities that are commonly misclassified
 */
const KNOWN_FALSE_POSITIVE_PATTERNS = [
    {
        // SQL Injection reported on Java JdbcTemplate (safe method)
        indicator: /jdbcTemplate\s*\.\s*(?:query|update|execute)/i,
        misclassificationTypes: ['sql_injection', 'SQL Injection'],
        language: 'java',
        correctClassification: 'JDBC Template Usage (Parameterized)',
        confidenceReduction: 0.8
    },
    {
        // SQL Injection reported on print/log statements
        indicator: /(?:print|console\.log|logger\.|System\.out\.print)/i,
        misclassificationTypes: ['sql_injection', 'SQL Injection'],
        language: 'any',
        correctClassification: 'Logging Statement',
        confidenceReduction: 0.9
    },
    {
        // eval() on Python's ast.literal_eval (safe function)
        indicator: /ast\.literal_eval/i,
        misclassificationTypes: ['code_injection', 'eval()', 'Code Injection'],
        language: 'python',
        correctClassification: 'Safe Literal Evaluation',
        confidenceReduction: 0.95
    },
    {
        // Command injection on Python subprocess with shell=False
        indicator: /subprocess\.(?:run|Popen|call)\s*\([^)]*shell\s*=\s*False/i,
        misclassificationTypes: ['command_injection', 'Command Injection'],
        language: 'python',
        correctClassification: 'Safe Subprocess Call',
        confidenceReduction: 0.85
    },
    {
        // XSS on React's textContent (safe method)
        indicator: /\.textContent\s*=/i,
        misclassificationTypes: ['xss', 'XSS', 'Cross-Site Scripting'],
        language: 'javascript',
        correctClassification: 'Safe Text Content Assignment',
        confidenceReduction: 0.9
    },
    {
        // SQL Injection on Python parameterized queries
        indicator: /cursor\.execute\s*\([^,]+,\s*[\(\[]/i,
        misclassificationTypes: ['sql_injection', 'SQL Injection'],
        language: 'python',
        correctClassification: 'Parameterized Query',
        confidenceReduction: 0.85
    },
    {
        // Path traversal on pathlib.Path (validates automatically)
        indicator: /Path\s*\([^)]+\)\.resolve\(\)/i,
        misclassificationTypes: ['path_traversal', 'Path Traversal'],
        language: 'python',
        correctClassification: 'Safe Path Resolution',
        confidenceReduction: 0.8
    }
];
/**
 * Quality Gate class for validating V2 reports
 */
class QualityGate {
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
     * Determine if V2 report should be displayed to the user
     */
    shouldDisplayV2(v2Report) {
        if (!v2Report) {
            return false;
        }
        // Quick checks first
        if (!v2Report.vulnerabilities || v2Report.vulnerabilities.length < this.config.minVulnerabilityCount) {
            console.log('[QualityGate] V2 report rejected: insufficient vulnerabilities');
            return false;
        }
        // Calculate quality metrics
        const metrics = this.calculateReportQuality(v2Report);
        // Check against thresholds
        if (metrics.overallAccuracy < this.config.minOverallAccuracy) {
            console.log(`[QualityGate] V2 report rejected: accuracy ${(metrics.overallAccuracy * 100).toFixed(1)}% < ${(this.config.minOverallAccuracy * 100).toFixed(1)}% threshold`);
            return false;
        }
        if (metrics.languageDetectionScore < this.config.minLanguageConfidence) {
            console.log(`[QualityGate] V2 report rejected: language detection ${(metrics.languageDetectionScore * 100).toFixed(1)}% < ${(this.config.minLanguageConfidence * 100).toFixed(1)}% threshold`);
            return false;
        }
        if (metrics.misclassificationRisk > this.config.maxMisclassificationRisk) {
            console.log(`[QualityGate] V2 report rejected: misclassification risk ${(metrics.misclassificationRisk * 100).toFixed(1)}% > ${(this.config.maxMisclassificationRisk * 100).toFixed(1)}% threshold`);
            return false;
        }
        console.log(`[QualityGate] V2 report accepted: accuracy ${(metrics.overallAccuracy * 100).toFixed(1)}%`);
        return true;
    }
    /**
     * Calculate comprehensive quality metrics for a V2 report
     */
    calculateReportQuality(report) {
        const vulns = report.vulnerabilities || [];
        if (vulns.length === 0) {
            return {
                overallAccuracy: 0,
                languageDetectionScore: 0,
                confidenceConsistency: 0,
                misclassificationRisk: 1,
                lineAccuracyScore: 0,
                patternQuality: 0
            };
        }
        // Calculate language detection score
        const languageDetectionScore = this.calculateLanguageDetectionScore(report);
        // Calculate confidence consistency (variance in confidence scores)
        const confidenceConsistency = this.calculateConfidenceConsistency(vulns);
        // Calculate misclassification risk
        const misclassificationRisk = this.calculateMisclassificationRisk(vulns);
        // Calculate line accuracy score
        const lineAccuracyScore = this.calculateLineAccuracyScore(vulns);
        // Calculate pattern quality
        const patternQuality = this.calculatePatternQuality(vulns);
        // Weight and combine metrics
        const overallAccuracy = (languageDetectionScore * 0.2) +
            (confidenceConsistency * 0.15) +
            ((1 - misclassificationRisk) * 0.3) + // Inverted - lower risk is better
            (lineAccuracyScore * 0.15) +
            (patternQuality * 0.2);
        return {
            overallAccuracy: Math.max(0, Math.min(1, overallAccuracy)),
            languageDetectionScore,
            confidenceConsistency,
            misclassificationRisk,
            lineAccuracyScore,
            patternQuality
        };
    }
    /**
     * Calculate language detection reliability
     */
    calculateLanguageDetectionScore(report) {
        // Check summary language detection
        const summaryLang = report.summary?.detectedLanguage;
        if (!summaryLang || summaryLang === 'unknown') {
            return 0.2; // Low score for unknown language
        }
        // Check individual vulnerability fix language confidence
        const vulns = report.vulnerabilities || [];
        if (vulns.length === 0) {
            return 0.5;
        }
        const langConfidences = vulns
            .filter(v => v.fix?.languageConfidence !== undefined)
            .map(v => v.fix.languageConfidence);
        if (langConfidences.length === 0) {
            return 0.5;
        }
        // Average language confidence
        const avgLangConfidence = langConfidences.reduce((a, b) => a + b, 0) / langConfidences.length;
        // Penalize if languages are inconsistent
        const uniqueLanguages = new Set(vulns.map(v => v.fix?.language).filter(Boolean));
        const consistencyPenalty = uniqueLanguages.size > 2 ? 0.2 : 0;
        return Math.max(0, avgLangConfidence - consistencyPenalty);
    }
    /**
     * Calculate confidence score consistency
     */
    calculateConfidenceConsistency(vulns) {
        const confidences = vulns.map(v => v.confidence).filter(c => c !== undefined);
        if (confidences.length < 2) {
            return 0.7; // Default for single vuln
        }
        // Calculate variance
        const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        const variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
        // Low variance = high consistency
        // Variance of 0.1 (std dev ~0.32) is considered acceptable
        const consistencyScore = 1 - Math.min(1, variance / 0.1);
        return consistencyScore;
    }
    /**
     * Calculate risk of misclassification in the report
     */
    calculateMisclassificationRisk(vulns) {
        if (vulns.length === 0) {
            return 0;
        }
        let suspiciousCount = 0;
        for (const vuln of vulns) {
            // Check for known misclassification patterns
            const codeSnippet = vuln.affectedCode?.snippet || '';
            const vulnType = vuln.primaryIssue?.type || vuln.primaryIssue?.title || '';
            const fixLanguage = vuln.fix?.language || '';
            for (const pattern of KNOWN_FALSE_POSITIVE_PATTERNS) {
                // Check if code matches a false positive pattern
                if (pattern.indicator.test(codeSnippet)) {
                    // Check if the vulnerability type matches the misclassification
                    const typeMatch = pattern.misclassificationTypes.some(mt => vulnType.toLowerCase().includes(mt.toLowerCase()));
                    // Check language match
                    const langMatch = pattern.language === 'any' ||
                        fixLanguage.toLowerCase() === pattern.language.toLowerCase();
                    if (typeMatch && langMatch) {
                        suspiciousCount++;
                        break; // Don't count same vuln multiple times
                    }
                }
            }
            // Also flag vulnerabilities with very high confidence but suspicious indicators
            if (vuln.confidence >= 0.9) {
                // High confidence + common false positive keywords
                const suspiciousKeywords = [
                    /print\s*\(/i,
                    /console\.\w+/i,
                    /logger\./i,
                    /log\s*\(/i,
                    /\.textContent/i,
                    /literal_eval/i,
                    /shell\s*=\s*False/i
                ];
                if (suspiciousKeywords.some(kw => kw.test(codeSnippet))) {
                    suspiciousCount += 0.5; // Partial suspicion
                }
            }
        }
        return Math.min(1, suspiciousCount / vulns.length);
    }
    /**
     * Calculate line number accuracy
     */
    calculateLineAccuracyScore(vulns) {
        const vulnsWithLines = vulns.filter(v => v.affectedCode?.lines && v.affectedCode.lines.length > 0);
        if (vulnsWithLines.length === 0) {
            return 0.3; // Low score if no line info
        }
        // Check for suspicious patterns in line numbers
        let validLines = 0;
        for (const vuln of vulnsWithLines) {
            const lines = vuln.affectedCode.lines;
            // Check lines are positive and reasonable
            const allValidLines = lines.every(l => l > 0 && l < 100000);
            // Check lines are contiguous or close (not scattered across file)
            const maxSpread = Math.max(...lines) - Math.min(...lines);
            const reasonableSpread = maxSpread < 50; // Most vulnerabilities span < 50 lines
            if (allValidLines && reasonableSpread) {
                validLines++;
            }
        }
        return validLines / vulnsWithLines.length;
    }
    /**
     * Calculate pattern matching quality
     */
    calculatePatternQuality(vulns) {
        if (vulns.length === 0) {
            return 0;
        }
        let qualitySum = 0;
        for (const vuln of vulns) {
            let vulnQuality = 0.5; // Base quality
            // Has evidence patterns
            if (vuln.evidence?.patterns && vuln.evidence.patterns.length > 0) {
                vulnQuality += 0.15;
            }
            // Has CWE reference
            if (vuln.standards?.cwe) {
                vulnQuality += 0.1;
            }
            // Has OWASP reference
            if (vuln.standards?.owasp) {
                vulnQuality += 0.1;
            }
            // Has proper fix information
            if (vuln.fix?.vulnerableCode && vuln.fix?.secureCode) {
                vulnQuality += 0.15;
            }
            // Has security impact description
            if (vuln.impact?.security && vuln.impact.security.length > 20) {
                vulnQuality += 0.1;
            }
            qualitySum += Math.min(1, vulnQuality);
        }
        return qualitySum / vulns.length;
    }
    /**
     * Get detailed quality report for debugging
     */
    getQualityReport(report) {
        const metrics = this.calculateReportQuality(report);
        const issues = [];
        if (metrics.overallAccuracy < this.config.minOverallAccuracy) {
            issues.push(`Overall accuracy (${(metrics.overallAccuracy * 100).toFixed(1)}%) below threshold (${(this.config.minOverallAccuracy * 100).toFixed(1)}%)`);
        }
        if (metrics.languageDetectionScore < this.config.minLanguageConfidence) {
            issues.push(`Language detection confidence (${(metrics.languageDetectionScore * 100).toFixed(1)}%) below threshold`);
        }
        if (metrics.misclassificationRisk > this.config.maxMisclassificationRisk) {
            issues.push(`High misclassification risk (${(metrics.misclassificationRisk * 100).toFixed(1)}%)`);
        }
        if (metrics.lineAccuracyScore < 0.5) {
            issues.push(`Line accuracy issues detected (${(metrics.lineAccuracyScore * 100).toFixed(1)}%)`);
        }
        return {
            metrics,
            passed: issues.length === 0,
            issues
        };
    }
}
exports.QualityGate = QualityGate;
/**
 * Singleton instance with default configuration
 */
exports.qualityGate = new QualityGate();
//# sourceMappingURL=quality-gate.js.map