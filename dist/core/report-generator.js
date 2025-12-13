"use strict";
/**
 * Advanced Reporting Engine
 *
 * Enterprise-grade report generation supporting multiple formats:
 * - SARIF (Static Analysis Results Interchange Format)
 * - HTML (Interactive dashboard)
 * - JSON (Machine-readable)
 * - Markdown (Documentation)
 * - CSV (Spreadsheet)
 * - JUnit XML (CI/CD integration)
 *
 * @module core/report-generator
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportGenerator = exports.ReportFormat = void 0;
exports.createReportGenerator = createReportGenerator;
exports.getReportGenerator = getReportGenerator;
const events_1 = require("events");
/**
 * Report format types
 */
var ReportFormat;
(function (ReportFormat) {
    ReportFormat["SARIF"] = "sarif";
    ReportFormat["HTML"] = "html";
    ReportFormat["JSON"] = "json";
    ReportFormat["MARKDOWN"] = "markdown";
    ReportFormat["CSV"] = "csv";
    ReportFormat["JUNIT"] = "junit";
    ReportFormat["SONARQUBE"] = "sonarqube";
    ReportFormat["CHECKSTYLE"] = "checkstyle";
    ReportFormat["CODECLIMATE"] = "codeclimate";
})(ReportFormat || (exports.ReportFormat = ReportFormat = {}));
/**
 * SARIF Report Generator
 */
class SarifGenerator {
    generate(data, options) {
        const sarif = {
            $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
            version: '2.1.0',
            runs: [
                {
                    tool: {
                        driver: {
                            name: data.metadata.generator.name,
                            version: data.metadata.generator.version,
                            semanticVersion: data.metadata.generator.semanticVersion,
                            informationUri: 'https://jokalala.com',
                            rules: this.generateRules(data),
                        },
                    },
                    invocations: [
                        {
                            executionSuccessful: true,
                            endTimeUtc: data.metadata.generatedAt,
                        },
                    ],
                    results: this.generateResults(data.issues, options),
                    automationDetails: {
                        id: `jokalala/${data.metadata.repository?.name || 'unknown'}/${Date.now()}`,
                    },
                },
            ],
        };
        return JSON.stringify(sarif, null, 2);
    }
    generateRules(data) {
        const ruleMap = new Map();
        for (const issue of data.issues) {
            if (!ruleMap.has(issue.ruleId)) {
                ruleMap.set(issue.ruleId, {
                    id: issue.ruleId,
                    name: issue.ruleName,
                    shortDescription: {
                        text: issue.ruleName,
                    },
                    fullDescription: {
                        text: issue.description || issue.message,
                    },
                    defaultConfiguration: {
                        level: this.mapSeverityToSarif(issue.severity),
                    },
                    properties: {
                        category: issue.category,
                        tags: issue.cwe ? [...issue.cwe, ...(issue.owasp || [])] : [],
                        security_severity: issue.cvss?.toString(),
                    },
                    helpUri: `https://jokalala.com/rules/${issue.ruleId}`,
                });
            }
        }
        return Array.from(ruleMap.values());
    }
    generateResults(issues, options) {
        return issues.map((issue, index) => ({
            ruleId: issue.ruleId,
            ruleIndex: index,
            level: this.mapSeverityToSarif(issue.severity),
            message: {
                text: issue.message,
            },
            locations: [
                {
                    physicalLocation: {
                        artifactLocation: {
                            uri: issue.file,
                            uriBaseId: '%SRCROOT%',
                        },
                        region: {
                            startLine: issue.line,
                            startColumn: issue.column,
                            endLine: issue.endLine || issue.line,
                            endColumn: issue.endColumn || issue.column + 1,
                            snippet: options.includeCodeSnippets && issue.codeSnippet
                                ? { text: issue.codeSnippet }
                                : undefined,
                        },
                    },
                },
            ],
            partialFingerprints: {
                primaryLocationLineHash: this.hashLocation(issue),
            },
            fixes: options.includeFixes && issue.fixAvailable && issue.suggestion
                ? [{
                        description: { text: issue.suggestion },
                    }]
                : undefined,
            properties: {
                confidence: issue.confidence,
                category: issue.category,
                cwe: issue.cwe,
                owasp: issue.owasp,
            },
        }));
    }
    mapSeverityToSarif(severity) {
        const map = {
            critical: 'error',
            high: 'error',
            medium: 'warning',
            low: 'note',
            info: 'note',
        };
        return map[severity.toLowerCase()] || 'warning';
    }
    hashLocation(issue) {
        const str = `${issue.file}:${issue.line}:${issue.ruleId}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
}
/**
 * HTML Report Generator
 */
class HtmlGenerator {
    generate(data, options) {
        const groupedIssues = this.groupIssues(data.issues, options.groupBy || 'severity');
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(data.metadata.title)} - Security Analysis Report</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${this.escapeHtml(data.metadata.title)}</h1>
      <p class="subtitle">Generated on ${data.metadata.generatedAt}</p>
      ${data.metadata.repository?.name ? `<p class="repo">Repository: ${this.escapeHtml(data.metadata.repository.name)}</p>` : ''}
    </header>

    <section class="summary">
      <h2>Summary</h2>
      <div class="stats-grid">
        <div class="stat-card critical">
          <span class="stat-value">${data.summary.criticalCount}</span>
          <span class="stat-label">Critical</span>
        </div>
        <div class="stat-card high">
          <span class="stat-value">${data.summary.highCount}</span>
          <span class="stat-label">High</span>
        </div>
        <div class="stat-card medium">
          <span class="stat-value">${data.summary.mediumCount}</span>
          <span class="stat-label">Medium</span>
        </div>
        <div class="stat-card low">
          <span class="stat-value">${data.summary.lowCount}</span>
          <span class="stat-label">Low</span>
        </div>
        <div class="stat-card info">
          <span class="stat-value">${data.summary.infoCount}</span>
          <span class="stat-label">Info</span>
        </div>
        <div class="stat-card total">
          <span class="stat-value">${data.summary.totalIssues}</span>
          <span class="stat-label">Total</span>
        </div>
      </div>
      ${data.summary.score !== undefined ? `
      <div class="score-section">
        <div class="score-circle ${this.getScoreClass(data.summary.score)}">
          <span class="score-value">${data.summary.score}</span>
          <span class="score-label">Security Score</span>
        </div>
        ${data.summary.grade ? `<span class="grade">${data.summary.grade}</span>` : ''}
      </div>
      ` : ''}
    </section>

    <section class="issues">
      <h2>Issues (${data.summary.totalIssues})</h2>
      ${this.renderGroupedIssues(groupedIssues, options)}
    </section>

    <footer>
      <p>Generated by ${data.metadata.generator.name} v${data.metadata.generator.version}</p>
      <p>Analysis time: ${(data.summary.analysisTime / 1000).toFixed(2)}s</p>
    </footer>
  </div>

  <script>
    ${this.getScripts()}
  </script>
</body>
</html>`;
    }
    getStyles() {
        return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; background: #f5f5f5; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 10px; margin-bottom: 30px; }
    header h1 { font-size: 2.5em; margin-bottom: 10px; }
    .subtitle { opacity: 0.9; font-size: 1.1em; }
    .repo { opacity: 0.8; margin-top: 10px; }
    .summary { background: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .summary h2 { margin-bottom: 20px; color: #333; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
    .stat-card { padding: 20px; border-radius: 8px; text-align: center; }
    .stat-card.critical { background: linear-gradient(135deg, #ff6b6b, #ee5a5a); color: white; }
    .stat-card.high { background: linear-gradient(135deg, #ffa94d, #ff922b); color: white; }
    .stat-card.medium { background: linear-gradient(135deg, #ffd43b, #fab005); color: #333; }
    .stat-card.low { background: linear-gradient(135deg, #69db7c, #51cf66); color: white; }
    .stat-card.info { background: linear-gradient(135deg, #74c0fc, #4dabf7); color: white; }
    .stat-card.total { background: linear-gradient(135deg, #868e96, #495057); color: white; }
    .stat-value { display: block; font-size: 2.5em; font-weight: bold; }
    .stat-label { font-size: 0.9em; opacity: 0.9; }
    .score-section { margin-top: 30px; text-align: center; }
    .score-circle { display: inline-block; width: 120px; height: 120px; border-radius: 50%; text-align: center; padding-top: 30px; }
    .score-circle.excellent { background: linear-gradient(135deg, #69db7c, #51cf66); color: white; }
    .score-circle.good { background: linear-gradient(135deg, #ffd43b, #fab005); color: #333; }
    .score-circle.fair { background: linear-gradient(135deg, #ffa94d, #ff922b); color: white; }
    .score-circle.poor { background: linear-gradient(135deg, #ff6b6b, #ee5a5a); color: white; }
    .score-value { display: block; font-size: 2em; font-weight: bold; }
    .score-label { font-size: 0.8em; }
    .grade { font-size: 3em; font-weight: bold; margin-left: 20px; vertical-align: middle; }
    .issues { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .issues h2 { margin-bottom: 20px; }
    .issue-group { margin-bottom: 30px; }
    .issue-group h3 { padding: 10px 15px; background: #f8f9fa; border-radius: 5px; margin-bottom: 15px; cursor: pointer; }
    .issue-group h3:hover { background: #e9ecef; }
    .issue { border: 1px solid #e9ecef; border-radius: 8px; margin-bottom: 15px; overflow: hidden; }
    .issue-header { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #f8f9fa; cursor: pointer; }
    .issue-title { font-weight: 600; }
    .issue-badges { display: flex; gap: 8px; }
    .badge { padding: 4px 10px; border-radius: 20px; font-size: 0.75em; font-weight: 600; text-transform: uppercase; }
    .badge.critical { background: #ff6b6b; color: white; }
    .badge.high { background: #ffa94d; color: white; }
    .badge.medium { background: #ffd43b; color: #333; }
    .badge.low { background: #69db7c; color: white; }
    .badge.info { background: #74c0fc; color: white; }
    .issue-body { padding: 15px; display: none; }
    .issue.expanded .issue-body { display: block; }
    .issue-location { color: #868e96; font-size: 0.9em; margin-bottom: 10px; }
    .issue-message { margin-bottom: 15px; }
    .issue-code { background: #2d2d2d; color: #ccc; padding: 15px; border-radius: 5px; overflow-x: auto; font-family: 'Fira Code', monospace; font-size: 0.9em; margin-bottom: 15px; }
    .issue-suggestion { background: #e8f5e9; padding: 15px; border-radius: 5px; border-left: 4px solid #4caf50; }
    .issue-meta { display: flex; gap: 20px; font-size: 0.85em; color: #868e96; margin-top: 15px; }
    footer { text-align: center; padding: 30px; color: #868e96; font-size: 0.9em; }
    `;
    }
    getScripts() {
        return `
    document.querySelectorAll('.issue-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('expanded');
      });
    });
    document.querySelectorAll('.issue-group h3').forEach(groupHeader => {
      groupHeader.addEventListener('click', () => {
        const content = groupHeader.nextElementSibling;
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
      });
    });
    `;
    }
    groupIssues(issues, groupBy) {
        const groups = new Map();
        for (const issue of issues) {
            let key;
            switch (groupBy) {
                case 'file':
                    key = issue.file;
                    break;
                case 'category':
                    key = issue.category;
                    break;
                case 'rule':
                    key = issue.ruleId;
                    break;
                case 'severity':
                default:
                    key = issue.severity;
                    break;
            }
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(issue);
        }
        return groups;
    }
    renderGroupedIssues(groups, options) {
        let html = '';
        for (const [groupName, issues] of groups) {
            html += `
      <div class="issue-group">
        <h3>${this.escapeHtml(groupName)} (${issues.length})</h3>
        <div class="group-content">
          ${issues.map(issue => this.renderIssue(issue, options)).join('')}
        </div>
      </div>
      `;
        }
        return html;
    }
    renderIssue(issue, options) {
        return `
    <div class="issue">
      <div class="issue-header">
        <span class="issue-title">${this.escapeHtml(issue.ruleName)}</span>
        <div class="issue-badges">
          <span class="badge ${issue.severity.toLowerCase()}">${issue.severity}</span>
          <span class="badge">${issue.category}</span>
        </div>
      </div>
      <div class="issue-body">
        <div class="issue-location">
          📁 ${this.escapeHtml(issue.file)}:${issue.line}:${issue.column}
        </div>
        <div class="issue-message">${this.escapeHtml(issue.message)}</div>
        ${options.includeCodeSnippets && issue.codeSnippet ? `
        <pre class="issue-code"><code>${this.escapeHtml(issue.codeSnippet)}</code></pre>
        ` : ''}
        ${issue.suggestion ? `
        <div class="issue-suggestion">
          💡 <strong>Suggestion:</strong> ${this.escapeHtml(issue.suggestion)}
        </div>
        ` : ''}
        <div class="issue-meta">
          <span>🎯 Confidence: ${Math.round(issue.confidence * 100)}%</span>
          ${issue.cwe?.length ? `<span>🔒 CWE: ${issue.cwe.join(', ')}</span>` : ''}
          ${issue.fixAvailable ? '<span>🔧 Fix available</span>' : ''}
        </div>
      </div>
    </div>
    `;
    }
    getScoreClass(score) {
        if (score >= 80)
            return 'excellent';
        if (score >= 60)
            return 'good';
        if (score >= 40)
            return 'fair';
        return 'poor';
    }
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}
/**
 * Markdown Report Generator
 */
class MarkdownGenerator {
    generate(data, options) {
        const lines = [];
        // Header
        lines.push(`# ${data.metadata.title}`);
        lines.push('');
        lines.push(`> Generated on ${data.metadata.generatedAt}`);
        lines.push('');
        if (data.metadata.repository?.name) {
            lines.push(`**Repository:** ${data.metadata.repository.name}`);
            if (data.metadata.repository.branch) {
                lines.push(`**Branch:** ${data.metadata.repository.branch}`);
            }
            lines.push('');
        }
        // Summary
        lines.push('## Summary');
        lines.push('');
        lines.push('| Severity | Count |');
        lines.push('|----------|-------|');
        lines.push(`| 🔴 Critical | ${data.summary.criticalCount} |`);
        lines.push(`| 🟠 High | ${data.summary.highCount} |`);
        lines.push(`| 🟡 Medium | ${data.summary.mediumCount} |`);
        lines.push(`| 🟢 Low | ${data.summary.lowCount} |`);
        lines.push(`| ℹ️ Info | ${data.summary.infoCount} |`);
        lines.push(`| **Total** | **${data.summary.totalIssues}** |`);
        lines.push('');
        if (data.summary.score !== undefined) {
            lines.push(`**Security Score:** ${data.summary.score}/100 ${data.summary.grade ? `(${data.summary.grade})` : ''}`);
            lines.push('');
        }
        // Issues by severity
        const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
        for (const severity of severityOrder) {
            const issues = data.issues.filter(i => i.severity.toLowerCase() === severity);
            if (issues.length === 0)
                continue;
            const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: 'ℹ️' }[severity];
            lines.push(`## ${emoji} ${severity.charAt(0).toUpperCase() + severity.slice(1)} Issues (${issues.length})`);
            lines.push('');
            for (const issue of issues) {
                lines.push(`### ${issue.ruleName}`);
                lines.push('');
                lines.push(`**File:** \`${issue.file}:${issue.line}:${issue.column}\``);
                lines.push('');
                lines.push(issue.message);
                lines.push('');
                if (options.includeCodeSnippets && issue.codeSnippet) {
                    lines.push('```');
                    lines.push(issue.codeSnippet);
                    lines.push('```');
                    lines.push('');
                }
                if (issue.suggestion) {
                    lines.push(`**💡 Suggestion:** ${issue.suggestion}`);
                    lines.push('');
                }
                if (issue.cwe?.length) {
                    lines.push(`**CWE:** ${issue.cwe.join(', ')}`);
                }
                if (issue.owasp?.length) {
                    lines.push(`**OWASP:** ${issue.owasp.join(', ')}`);
                }
                lines.push('');
                lines.push('---');
                lines.push('');
            }
        }
        // Footer
        lines.push(`*Generated by ${data.metadata.generator.name} v${data.metadata.generator.version}*`);
        return lines.join('\n');
    }
}
/**
 * CSV Report Generator
 */
class CsvGenerator {
    generate(data, _options) {
        const headers = [
            'ID',
            'Rule ID',
            'Rule Name',
            'Severity',
            'Category',
            'Message',
            'File',
            'Line',
            'Column',
            'Confidence',
            'CWE',
            'OWASP',
            'Fix Available',
        ];
        const rows = data.issues.map(issue => [
            issue.id,
            issue.ruleId,
            this.escapeCsv(issue.ruleName),
            issue.severity,
            issue.category,
            this.escapeCsv(issue.message),
            this.escapeCsv(issue.file),
            issue.line.toString(),
            issue.column.toString(),
            issue.confidence.toString(),
            issue.cwe?.join(';') || '',
            issue.owasp?.join(';') || '',
            issue.fixAvailable ? 'Yes' : 'No',
        ]);
        return [
            headers.join(','),
            ...rows.map(row => row.join(',')),
        ].join('\n');
    }
    escapeCsv(value) {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }
}
/**
 * JUnit XML Generator for CI/CD
 */
class JunitGenerator {
    generate(data, _options) {
        const lines = [];
        lines.push('<?xml version="1.0" encoding="UTF-8"?>');
        lines.push(`<testsuites name="Security Analysis" tests="${data.summary.totalIssues}" failures="${data.summary.criticalCount + data.summary.highCount}" errors="0" time="${data.summary.analysisTime / 1000}">`);
        // Group by file
        const byFile = new Map();
        for (const issue of data.issues) {
            if (!byFile.has(issue.file)) {
                byFile.set(issue.file, []);
            }
            byFile.get(issue.file).push(issue);
        }
        for (const [file, issues] of byFile) {
            const failures = issues.filter(i => ['critical', 'high'].includes(i.severity.toLowerCase())).length;
            lines.push(`  <testsuite name="${this.escapeXml(file)}" tests="${issues.length}" failures="${failures}" errors="0">`);
            for (const issue of issues) {
                const isFailure = ['critical', 'high'].includes(issue.severity.toLowerCase());
                lines.push(`    <testcase name="${this.escapeXml(issue.ruleName)}" classname="${this.escapeXml(file)}">`);
                if (isFailure) {
                    lines.push(`      <failure message="${this.escapeXml(issue.message)}" type="${issue.severity}">`);
                    lines.push(`Location: ${file}:${issue.line}:${issue.column}`);
                    if (issue.codeSnippet) {
                        lines.push('');
                        lines.push(this.escapeXml(issue.codeSnippet));
                    }
                    lines.push(`      </failure>`);
                }
                lines.push(`    </testcase>`);
            }
            lines.push(`  </testsuite>`);
        }
        lines.push('</testsuites>');
        return lines.join('\n');
    }
    escapeXml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&apos;',
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}
/**
 * Code Climate JSON Generator
 */
class CodeClimateGenerator {
    generate(data, _options) {
        const issues = data.issues.map(issue => ({
            type: 'issue',
            check_name: issue.ruleId,
            description: issue.message,
            content: {
                body: issue.description || issue.message,
            },
            categories: [issue.category === 'security' ? 'Security' : 'Bug Risk'],
            severity: this.mapSeverity(issue.severity),
            fingerprint: this.generateFingerprint(issue),
            location: {
                path: issue.file,
                lines: {
                    begin: issue.line,
                    end: issue.endLine || issue.line,
                },
            },
        }));
        return JSON.stringify(issues, null, 2);
    }
    mapSeverity(severity) {
        const map = {
            critical: 'blocker',
            high: 'critical',
            medium: 'major',
            low: 'minor',
            info: 'info',
        };
        return map[severity.toLowerCase()] || 'minor';
    }
    generateFingerprint(issue) {
        const str = `${issue.ruleId}:${issue.file}:${issue.line}:${issue.message}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(32, '0');
    }
}
/**
 * Report Generator Factory
 */
class ReportGenerator extends events_1.EventEmitter {
    constructor() {
        super();
        Object.defineProperty(this, "generators", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        this.generators.set(ReportFormat.SARIF, new SarifGenerator());
        this.generators.set(ReportFormat.HTML, new HtmlGenerator());
        this.generators.set(ReportFormat.MARKDOWN, new MarkdownGenerator());
        this.generators.set(ReportFormat.CSV, new CsvGenerator());
        this.generators.set(ReportFormat.JUNIT, new JunitGenerator());
        this.generators.set(ReportFormat.CODECLIMATE, new CodeClimateGenerator());
    }
    /**
     * Generate a report in the specified format
     */
    generate(data, options) {
        const generator = this.generators.get(options.format);
        if (!generator) {
            if (options.format === ReportFormat.JSON) {
                return JSON.stringify(data, null, 2);
            }
            throw new Error(`Unsupported report format: ${options.format}`);
        }
        const startTime = performance.now();
        const report = generator.generate(data, options);
        const duration = performance.now() - startTime;
        this.emit('report-generated', {
            format: options.format,
            size: report.length,
            duration,
        });
        return report;
    }
    /**
     * Get supported formats
     */
    getSupportedFormats() {
        return [...this.generators.keys(), ReportFormat.JSON];
    }
    /**
     * Get file extension for format
     */
    getFileExtension(format) {
        const extensions = {
            [ReportFormat.SARIF]: 'sarif',
            [ReportFormat.HTML]: 'html',
            [ReportFormat.JSON]: 'json',
            [ReportFormat.MARKDOWN]: 'md',
            [ReportFormat.CSV]: 'csv',
            [ReportFormat.JUNIT]: 'xml',
            [ReportFormat.SONARQUBE]: 'json',
            [ReportFormat.CHECKSTYLE]: 'xml',
            [ReportFormat.CODECLIMATE]: 'json',
        };
        return extensions[format] || 'txt';
    }
    /**
     * Get MIME type for format
     */
    getMimeType(format) {
        const mimeTypes = {
            [ReportFormat.SARIF]: 'application/json',
            [ReportFormat.HTML]: 'text/html',
            [ReportFormat.JSON]: 'application/json',
            [ReportFormat.MARKDOWN]: 'text/markdown',
            [ReportFormat.CSV]: 'text/csv',
            [ReportFormat.JUNIT]: 'application/xml',
            [ReportFormat.SONARQUBE]: 'application/json',
            [ReportFormat.CHECKSTYLE]: 'application/xml',
            [ReportFormat.CODECLIMATE]: 'application/json',
        };
        return mimeTypes[format] || 'text/plain';
    }
}
exports.ReportGenerator = ReportGenerator;
/**
 * Create a report generator instance
 */
function createReportGenerator() {
    return new ReportGenerator();
}
/**
 * Singleton instance
 */
let reportGenerator = null;
function getReportGenerator() {
    if (!reportGenerator) {
        reportGenerator = new ReportGenerator();
    }
    return reportGenerator;
}
//# sourceMappingURL=report-generator.js.map