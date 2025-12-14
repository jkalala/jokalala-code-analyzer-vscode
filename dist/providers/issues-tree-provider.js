"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssueTreeItem = exports.IssuesTreeProvider = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
class IssuesTreeProvider {
    constructor() {
        Object.defineProperty(this, "_onDidChangeTreeData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new vscode.EventEmitter()
        });
        Object.defineProperty(this, "onDidChangeTreeData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: this._onDidChangeTreeData.event
        });
        Object.defineProperty(this, "issues", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "fileResults", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "viewMode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'byFile'
        });
        Object.defineProperty(this, "summaryData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "isProjectAnalysis", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "v2Report", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "hasV2Report", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
    }
    /**
     * Update issues for single file analysis (legacy mode)
     */
    updateIssues(issues, v2Report) {
        this.issues = issues;
        this.fileResults = [];
        this.summaryData = null;
        this.isProjectAnalysis = false;
        this.v2Report = v2Report || null;
        this.hasV2Report = Boolean(v2Report && v2Report.vulnerabilities?.length > 0);
        this._onDidChangeTreeData.fire(undefined);
    }
    /**
     * Update with file-grouped results for project/folder analysis
     */
    updateFileResults(fileResults, summary) {
        this.fileResults = fileResults;
        this.summaryData = summary || null;
        this.isProjectAnalysis = true;
        // Also flatten issues for compatibility
        this.issues = fileResults.flatMap(fr => fr.issues.map(issue => ({
            ...issue,
            filePath: fr.filePath,
        })));
        this._onDidChangeTreeData.fire(undefined);
    }
    /**
     * Toggle between file view and severity view
     */
    setViewMode(mode) {
        this.viewMode = mode;
        this._onDidChangeTreeData.fire(undefined);
    }
    /**
     * Get current view mode
     */
    getViewMode() {
        return this.viewMode;
    }
    /**
     * Clear all issues
     */
    clear() {
        this.issues = [];
        this.fileResults = [];
        this.summaryData = null;
        this.isProjectAnalysis = false;
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            // Root level
            return Promise.resolve(this.getRootChildren());
        }
        // Children based on item type
        switch (element.itemType) {
            case 'summary':
                return Promise.resolve([]);
            case 'file':
                return Promise.resolve(this.getFileChildren(element));
            case 'severity-group':
                return Promise.resolve(this.getSeverityGroupChildren(element));
            case 'more-issues':
                return Promise.resolve([]);
            default:
                return Promise.resolve([]);
        }
    }
    getRootChildren() {
        const items = [];
        // Add V2 Enhanced header if V2 report is available
        if (this.hasV2Report && this.v2Report) {
            items.push(this.createV2SummaryNode());
            items.push(...this.getV2VulnerabilityNodes());
            return items;
        }
        // Add summary node for project analysis
        if (this.isProjectAnalysis && this.summaryData) {
            items.push(this.createSummaryNode());
        }
        if (this.viewMode === 'byFile' && this.isProjectAnalysis) {
            // Group by file
            items.push(...this.getFileNodes());
        }
        else {
            // Group by severity (default for single file or when viewing by severity)
            items.push(...this.getSeverityNodes());
        }
        return items;
    }
    /**
     * Create V2 Enhanced Summary Node
     */
    createV2SummaryNode() {
        const v2 = this.v2Report;
        const avgConfidence = Math.round(v2.summary.averageConfidence * 100);
        const label = `✨ Enhanced Analysis: ${v2.summary.totalVulnerabilities} unique issues (${avgConfidence}% confidence)`;
        const item = new IssueTreeItem(label, vscode.TreeItemCollapsibleState.None, 'summary');
        // Build detailed tooltip
        const tooltipLines = [
            `✨ V2 Enhanced Analysis`,
            `🔬 Intelligent Deduplication Active`,
            ``,
            `📝 Unique Vulnerabilities: ${v2.summary.totalVulnerabilities}`,
            `🎯 Average Confidence: ${avgConfidence}%`,
            `💻 Detected Language: ${v2.summary.detectedLanguage}`,
            ``,
            `🔴 Critical: ${v2.summary.criticalCount}`,
            `🟠 High: ${v2.summary.highCount}`,
            `🟡 Medium: ${v2.summary.mediumCount}`,
            `🟢 Low: ${v2.summary.lowCount}`,
        ];
        item.tooltip = tooltipLines.join('\n');
        item.iconPath = new vscode.ThemeIcon('sparkle', new vscode.ThemeColor('charts.green'));
        item.description = `${v2.summary.detectedLanguage} • ${avgConfidence}% avg confidence`;
        return item;
    }
    /**
     * Create V2 Vulnerability Nodes
     */
    getV2VulnerabilityNodes() {
        if (!this.v2Report) {
            return [];
        }
        // Group by severity
        const severityOrder = [
            'CRITICAL',
            'HIGH',
            'MEDIUM',
            'LOW',
        ];
        return severityOrder
            .filter(severity => this.v2Report.vulnerabilities.some(v => v.severity === severity))
            .map(severity => {
            const vulns = this.v2Report.vulnerabilities.filter(v => v.severity === severity);
            const emoji = this.getV2SeverityEmoji(severity);
            const icon = this.getV2SeverityIcon(severity);
            const item = new IssueTreeItem(`${emoji} ${severity} (${vulns.length})`, vscode.TreeItemCollapsibleState.Expanded, 'severity-group', undefined, undefined, undefined, vulns);
            item.iconPath = icon;
            return item;
        });
    }
    /**
     * Get V2 severity emoji
     */
    getV2SeverityEmoji(severity) {
        switch (severity) {
            case 'CRITICAL':
                return '🔴';
            case 'HIGH':
                return '🟠';
            case 'MEDIUM':
                return '🟡';
            case 'LOW':
                return '🟢';
        }
    }
    /**
     * Get V2 severity icon
     */
    getV2SeverityIcon(severity) {
        switch (severity) {
            case 'CRITICAL':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
            case 'HIGH':
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
            case 'MEDIUM':
                return new vscode.ThemeIcon('info', new vscode.ThemeColor('list.infoForeground'));
            case 'LOW':
                return new vscode.ThemeIcon('circle-outline');
        }
    }
    createSummaryNode() {
        const s = this.summaryData;
        const scoreText = s.overallScore !== undefined ? ` • Score: ${s.overallScore}/100` : '';
        const label = `📊 Summary: ${s.totalIssues} issues in ${s.totalFiles} files${scoreText}`;
        const item = new IssueTreeItem(label, vscode.TreeItemCollapsibleState.None, 'summary');
        // Build detailed tooltip
        const tooltipLines = [
            `📁 Files Analyzed: ${s.totalFiles}`,
            `📝 Total Issues: ${s.totalIssues}`,
            '',
            `🔴 Critical: ${s.criticalCount}`,
            `🟠 High: ${s.highCount}`,
            `🟡 Medium: ${s.mediumCount}`,
            `🟢 Low: ${s.lowCount}`,
        ];
        if (s.overallScore !== undefined) {
            tooltipLines.push('', `📈 Overall Score: ${s.overallScore}/100`);
        }
        if (s.folderPath) {
            tooltipLines.push('', `📂 Folder: ${s.folderPath}`);
        }
        item.tooltip = tooltipLines.join('\n');
        item.iconPath = new vscode.ThemeIcon('graph');
        item.description = s.folderPath || '';
        return item;
    }
    getFileNodes() {
        // Sort files by issue count (descending) for visibility of problematic files
        const sortedFiles = [...this.fileResults].sort((a, b) => b.issues.length - a.issues.length);
        return sortedFiles.map(fileResult => {
            const fileName = path.basename(fileResult.filePath);
            const issueCount = fileResult.issues.length;
            const scoreText = fileResult.score !== undefined ? `Score: ${fileResult.score}` : '';
            // Count severities for this file
            const criticalCount = fileResult.issues.filter(i => i.severity === 'critical').length;
            const highCount = fileResult.issues.filter(i => i.severity === 'high').length;
            // Determine icon based on severity
            let icon;
            if (criticalCount > 0) {
                icon = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
            }
            else if (highCount > 0) {
                icon = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
            }
            else if (issueCount > 0) {
                icon = new vscode.ThemeIcon('info', new vscode.ThemeColor('list.infoForeground'));
            }
            else {
                icon = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
            }
            const item = new IssueTreeItem(`📄 ${fileName}`, issueCount > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None, 'file', undefined, fileResult.issues, fileResult.filePath);
            item.description = `${scoreText} • ${issueCount} issues`;
            item.iconPath = icon;
            item.tooltip = this.buildFileTooltip(fileResult);
            item.resourceUri = vscode.Uri.file(fileResult.filePath);
            // Add command to open file when clicked
            item.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(fileResult.filePath)],
            };
            return item;
        });
    }
    buildFileTooltip(fileResult) {
        const lines = [
            `📄 ${fileResult.filePath}`,
            `📝 Total Issues: ${fileResult.issues.length}`,
            '',
        ];
        const severityCounts = {
            critical: fileResult.issues.filter(i => i.severity === 'critical').length,
            high: fileResult.issues.filter(i => i.severity === 'high').length,
            medium: fileResult.issues.filter(i => i.severity === 'medium').length,
            low: fileResult.issues.filter(i => i.severity === 'low').length,
        };
        if (severityCounts.critical > 0)
            lines.push(`🔴 Critical: ${severityCounts.critical}`);
        if (severityCounts.high > 0)
            lines.push(`🟠 High: ${severityCounts.high}`);
        if (severityCounts.medium > 0)
            lines.push(`🟡 Medium: ${severityCounts.medium}`);
        if (severityCounts.low > 0)
            lines.push(`🟢 Low: ${severityCounts.low}`);
        if (fileResult.score !== undefined) {
            lines.push('', `📈 Score: ${fileResult.score}/100`);
        }
        return lines.join('\n');
    }
    getFileChildren(fileNode) {
        const issues = fileNode.childIssues || [];
        const filePath = fileNode.filePath;
        // Limit displayed issues for performance, show "X more..." link
        const MAX_DISPLAYED_ISSUES = 50;
        const displayedIssues = issues.slice(0, MAX_DISPLAYED_ISSUES);
        const remainingCount = issues.length - MAX_DISPLAYED_ISSUES;
        const items = displayedIssues.map(issue => this.createIssueNode(issue, filePath));
        if (remainingCount > 0) {
            const moreItem = new IssueTreeItem(`... and ${remainingCount} more issues`, vscode.TreeItemCollapsibleState.None, 'more-issues');
            moreItem.iconPath = new vscode.ThemeIcon('ellipsis');
            moreItem.tooltip = `Click on the file to see all ${issues.length} issues in the Problems panel`;
            items.push(moreItem);
        }
        return items;
    }
    createIssueNode(issue, filePath) {
        const severityIcon = this.getSeverityIcon(issue.severity);
        const severityEmoji = this.getSeverityEmoji(issue.severity);
        const lineInfo = issue.line ? ` (Line ${issue.line})` : '';
        const item = new IssueTreeItem(`${severityEmoji} ${issue.message}`, vscode.TreeItemCollapsibleState.None, 'issue', issue);
        item.description = `${issue.category}${lineInfo}`;
        item.iconPath = severityIcon;
        item.tooltip = this.buildIssueTooltip(issue);
        // Add command to navigate to the issue location
        if (filePath && issue.line) {
            const targetUri = vscode.Uri.file(path.isAbsolute(filePath)
                ? filePath
                : path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', filePath));
            item.command = {
                command: 'jokalala-code-analysis.goToIssue',
                title: 'Go to Issue',
                arguments: [targetUri, issue.line, issue.column || 0],
            };
        }
        return item;
    }
    buildIssueTooltip(issue) {
        const lines = [
            `**${issue.category}**`,
            '',
            issue.message,
            '',
            `Severity: ${issue.severity.toUpperCase()}`,
        ];
        if (issue.line) {
            lines.push(`Location: Line ${issue.line}${issue.column ? `, Column ${issue.column}` : ''}`);
        }
        if (issue.suggestion) {
            lines.push('', '💡 Suggestion:', issue.suggestion);
        }
        if (issue.codeSnippet) {
            lines.push('', '📝 Code:', '```', issue.codeSnippet, '```');
        }
        if (issue.impact) {
            lines.push(`Impact: ${issue.impact}`);
        }
        if (issue.effortToFix) {
            lines.push(`Effort to Fix: ${issue.effortToFix}`);
        }
        return lines.join('\n');
    }
    getSeverityNodes() {
        const grouped = this.groupBySeverity();
        const severityOrder = [
            'critical',
            'high',
            'medium',
            'low',
            'info',
        ];
        return severityOrder
            .filter(severity => (grouped[severity]?.length ?? 0) > 0)
            .map(severity => {
            const issues = grouped[severity] ?? [];
            const emoji = this.getSeverityEmoji(severity);
            const icon = this.getSeverityIcon(severity);
            const item = new IssueTreeItem(`${emoji} ${severity.toUpperCase()} (${issues.length})`, vscode.TreeItemCollapsibleState.Expanded, 'severity-group', undefined, issues);
            item.iconPath = icon;
            return item;
        });
    }
    getSeverityGroupChildren(groupNode) {
        // Check if this is a V2 severity group
        const v2Vulns = groupNode.v2Vulnerabilities;
        if (v2Vulns && v2Vulns.length > 0) {
            return v2Vulns.map(vuln => this.createV2VulnerabilityNode(vuln));
        }
        const issues = groupNode.childIssues || [];
        // Group by file if in project analysis mode
        if (this.isProjectAnalysis) {
            const byFile = new Map();
            issues.forEach(issue => {
                const filePath = issue.filePath || 'Unknown File';
                if (!byFile.has(filePath)) {
                    byFile.set(filePath, []);
                }
                byFile.get(filePath).push(issue);
            });
            const items = [];
            byFile.forEach((fileIssues, filePath) => {
                fileIssues.forEach(issue => {
                    items.push(this.createIssueNode(issue, filePath));
                });
            });
            return items;
        }
        // Single file mode - just list issues
        return issues.map(issue => this.createIssueNode(issue));
    }
    /**
     * Create a V2 Vulnerability Node with enhanced details
     */
    createV2VulnerabilityNode(vuln) {
        const confidencePercent = Math.round(vuln.confidence * 100);
        const confidenceBadge = vuln.confidenceLevel === 'HIGH' ? '✅' : vuln.confidenceLevel === 'MEDIUM' ? '⚠️' : '🔍';
        const consolidatedBadge = vuln.metadata.consolidatedFrom > 1 ? ` 🔗${vuln.metadata.consolidatedFrom}` : '';
        // Intelligence indicators
        const intelligenceBadge = this.getIntelligenceBadge(vuln);
        const lineInfo = vuln.affectedCode.lines.length > 0
            ? ` (L${vuln.affectedCode.lines[0]}${vuln.affectedCode.lines.length > 1 ? `-${vuln.affectedCode.lines[vuln.affectedCode.lines.length - 1]}` : ''})`
            : '';
        const item = new IssueTreeItem(`${confidenceBadge} ${vuln.primaryIssue.title}${consolidatedBadge}${intelligenceBadge}`, vscode.TreeItemCollapsibleState.None, 'issue');
        item.description = `${confidencePercent}% confidence${lineInfo}${this.getIntelligenceDescription(vuln)}`;
        item.iconPath = this.getV2SeverityIcon(vuln.severity);
        item.tooltip = this.buildV2VulnerabilityTooltip(vuln);
        // Add command to navigate to the issue location
        if (vuln.affectedCode.lines.length > 0) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                item.command = {
                    command: 'jokalala-code-analysis.goToIssue',
                    title: 'Go to Issue',
                    arguments: [activeEditor.document.uri, vuln.affectedCode.lines[0], 0],
                };
            }
        }
        return item;
    }
    /**
     * Get intelligence badge for vulnerability
     */
    getIntelligenceBadge(vuln) {
        if (!vuln.intelligence) {
            return '';
        }
        const badges = [];
        // CISA KEV badge - most critical
        if (vuln.intelligence.cisaKEV?.knownExploited) {
            badges.push(' 🚨KEV');
        }
        // High EPSS score badge
        if (vuln.intelligence.epssScore && vuln.intelligence.epssScore >= 0.5) {
            badges.push(' ⚡');
        }
        return badges.join('');
    }
    /**
     * Get intelligence description suffix
     */
    getIntelligenceDescription(vuln) {
        if (!vuln.intelligence) {
            return '';
        }
        const parts = [];
        // EPSS score
        if (vuln.intelligence.epssScore !== undefined) {
            const epssPercent = Math.round(vuln.intelligence.epssScore * 100);
            parts.push(`EPSS ${epssPercent}%`);
        }
        return parts.length > 0 ? ` • ${parts.join(' • ')}` : '';
    }
    /**
     * Build V2 Vulnerability Tooltip
     */
    buildV2VulnerabilityTooltip(vuln) {
        const lines = [
            `**${vuln.primaryIssue.type}**`,
            ``,
            vuln.primaryIssue.description,
            ``,
            `**Confidence**: ${Math.round(vuln.confidence * 100)}% (${vuln.confidenceLevel})`,
            `**Severity**: ${vuln.severity}`,
        ];
        if (vuln.metadata.consolidatedFrom > 1) {
            lines.push(`**Consolidated**: ${vuln.metadata.consolidatedFrom} findings merged`);
        }
        if (vuln.affectedCode.lines.length > 0) {
            lines.push(`**Location**: Lines ${vuln.affectedCode.lines[0]}${vuln.affectedCode.lines.length > 1 ? `-${vuln.affectedCode.lines[vuln.affectedCode.lines.length - 1]}` : ''}`);
        }
        if (vuln.standards.cwe) {
            lines.push(`**CWE**: ${vuln.standards.cwe}`);
        }
        if (vuln.standards.owasp) {
            lines.push(`**OWASP**: ${vuln.standards.owasp}`);
        }
        if (vuln.fix) {
            lines.push(``, `**Fix (${vuln.fix.language})**:`, vuln.fix.quickSummary);
            if (vuln.fix.alternatives && vuln.fix.alternatives.length > 0) {
                lines.push(``, `**Alternatives**: ${vuln.fix.alternatives.length} approaches available`);
            }
        }
        if (vuln.impact.security) {
            lines.push(``, `**Security Impact**: ${vuln.impact.security}`);
        }
        // Intelligence Data
        if (vuln.intelligence) {
            lines.push(``, `---`, ``, `**🔬 Threat Intelligence**:`);
            // CISA KEV
            if (vuln.intelligence.cisaKEV?.knownExploited) {
                lines.push(``, `🚨 **CISA KEV**: Known Exploited Vulnerability`);
                if (vuln.intelligence.cisaKEV.dateAdded) {
                    lines.push(`   Added: ${vuln.intelligence.cisaKEV.dateAdded}`);
                }
                if (vuln.intelligence.cisaKEV.description) {
                    lines.push(`   ${vuln.intelligence.cisaKEV.description}`);
                }
            }
            // EPSS Score
            if (vuln.intelligence.epssScore !== undefined) {
                const epssPercent = Math.round(vuln.intelligence.epssScore * 100);
                const epssLevel = epssPercent >= 75 ? 'CRITICAL' : epssPercent >= 50 ? 'HIGH' : epssPercent >= 25 ? 'MEDIUM' : 'LOW';
                const epssEmoji = epssPercent >= 75 ? '🔴' : epssPercent >= 50 ? '🟠' : epssPercent >= 25 ? '🟡' : '🟢';
                lines.push(``, `${epssEmoji} **EPSS Score**: ${epssPercent}% (${epssLevel} exploitation probability)`);
            }
            // CVE/NVD Data
            if (vuln.intelligence.nvdData) {
                lines.push(``, `📋 **CVE Details**:`);
                lines.push(`   CVE ID: ${vuln.intelligence.nvdData.cveId}`);
                lines.push(`   Base Score: ${vuln.intelligence.nvdData.baseScore} (${vuln.intelligence.nvdData.severity})`);
                if (vuln.intelligence.nvdData.description) {
                    lines.push(`   ${vuln.intelligence.nvdData.description.substring(0, 150)}...`);
                }
            }
        }
        return lines.join('\n');
    }
    groupBySeverity() {
        const grouped = {
            critical: [],
            high: [],
            medium: [],
            low: [],
            info: [],
        };
        this.issues.forEach(issue => {
            const severityGroup = grouped[issue.severity];
            if (severityGroup) {
                severityGroup.push(issue);
            }
        });
        return grouped;
    }
    getSeverityIcon(severity) {
        switch (severity) {
            case 'critical':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
            case 'high':
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
            case 'medium':
                return new vscode.ThemeIcon('info', new vscode.ThemeColor('list.infoForeground'));
            case 'low':
                return new vscode.ThemeIcon('circle-outline');
            case 'info':
                return new vscode.ThemeIcon('lightbulb');
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }
    getSeverityEmoji(severity) {
        switch (severity) {
            case 'critical':
                return '🔴';
            case 'high':
                return '🟠';
            case 'medium':
                return '🟡';
            case 'low':
                return '🟢';
            case 'info':
                return '💡';
            default:
                return '⚪';
        }
    }
}
exports.IssuesTreeProvider = IssuesTreeProvider;
/**
 * Tree item for the issues tree view
 */
class IssueTreeItem extends vscode.TreeItem {
    constructor(label, collapsibleState, itemType, issue, childIssues, filePath, v2Vulnerabilities) {
        super(label, collapsibleState);
        Object.defineProperty(this, "label", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: label
        });
        Object.defineProperty(this, "collapsibleState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: collapsibleState
        });
        Object.defineProperty(this, "itemType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: itemType
        });
        Object.defineProperty(this, "issue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: issue
        });
        Object.defineProperty(this, "childIssues", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: childIssues
        });
        Object.defineProperty(this, "filePath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: filePath
        });
        Object.defineProperty(this, "v2Vulnerabilities", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: v2Vulnerabilities
        });
    }
}
exports.IssueTreeItem = IssueTreeItem;
//# sourceMappingURL=issues-tree-provider.js.map