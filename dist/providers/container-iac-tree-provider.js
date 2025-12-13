"use strict";
/**
 * Container and IaC Security Tree Provider
 *
 * Displays container and infrastructure-as-code security scan results
 * in a tree view organized by file type and severity.
 */
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
exports.ContainerIaCTreeProvider = void 0;
exports.registerContainerIaCTreeView = registerContainerIaCTreeView;
const vscode = __importStar(require("vscode"));
// =============================================================================
// Icons and Labels
// =============================================================================
const SCAN_TYPE_ICONS = {
    'dockerfile': '$(file-code)',
    'docker-compose': '$(layers)',
    'kubernetes': '$(server)',
    'terraform': '$(cloud)',
    'cloudformation': '$(cloud-upload)',
    'helm': '$(package)'
};
const SCAN_TYPE_LABELS = {
    'dockerfile': 'Dockerfiles',
    'docker-compose': 'Docker Compose',
    'kubernetes': 'Kubernetes',
    'terraform': 'Terraform',
    'cloudformation': 'CloudFormation',
    'helm': 'Helm Charts'
};
const SEVERITY_ICONS = {
    'critical': '$(error)',
    'high': '$(warning)',
    'medium': '$(info)',
    'low': '$(question)',
    'info': '$(lightbulb)'
};
// =============================================================================
// Tree Data Provider
// =============================================================================
class ContainerIaCTreeProvider {
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
        Object.defineProperty(this, "scanResult", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "isLoading", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "errorMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "viewMode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'byType'
        });
    }
    // ===========================================================================
    // Public Methods
    // ===========================================================================
    /**
     * Update the tree view with new scan results
     */
    updateResult(result) {
        this.scanResult = result;
        this.isLoading = false;
        this.errorMessage = result.success ? null : result.error || 'Scan failed';
        this._onDidChangeTreeData.fire();
    }
    /**
     * Set loading state
     */
    setLoading(loading) {
        this.isLoading = loading;
        if (loading) {
            this.scanResult = null;
            this.errorMessage = null;
        }
        this._onDidChangeTreeData.fire();
    }
    /**
     * Set error state
     */
    setError(message) {
        this.isLoading = false;
        this.errorMessage = message;
        this._onDidChangeTreeData.fire();
    }
    /**
     * Clear all results
     */
    clear() {
        this.scanResult = null;
        this.isLoading = false;
        this.errorMessage = null;
        this._onDidChangeTreeData.fire();
    }
    /**
     * Toggle view mode between by type and by severity
     */
    toggleViewMode() {
        this.viewMode = this.viewMode === 'byType' ? 'bySeverity' : 'byType';
        this._onDidChangeTreeData.fire();
    }
    /**
     * Get the current view mode
     */
    getViewMode() {
        return this.viewMode;
    }
    /**
     * Get current scan result
     */
    getResult() {
        return this.scanResult;
    }
    // ===========================================================================
    // Tree Data Provider Implementation
    // ===========================================================================
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (this.isLoading) {
            return Promise.resolve([this.createLoadingItem()]);
        }
        if (this.errorMessage) {
            return Promise.resolve([this.createErrorItem(this.errorMessage)]);
        }
        if (!this.scanResult) {
            return Promise.resolve([this.createEmptyItem()]);
        }
        if (!element) {
            // Root level - show summary and categories
            return Promise.resolve(this.getRootItems());
        }
        // Get children based on element type
        if (element.type === 'category' && element.children) {
            return Promise.resolve(element.children);
        }
        if (element.type === 'file' && element.children) {
            return Promise.resolve(element.children);
        }
        return Promise.resolve([]);
    }
    // ===========================================================================
    // Private Methods
    // ===========================================================================
    getRootItems() {
        if (!this.scanResult)
            return [];
        const items = [];
        // Add summary item
        items.push(this.createSummaryItem());
        // Group by view mode
        if (this.viewMode === 'byType') {
            items.push(...this.groupByType());
        }
        else {
            items.push(...this.groupBySeverity());
        }
        return items;
    }
    groupByType() {
        if (!this.scanResult)
            return [];
        const groups = new Map();
        for (const issue of this.scanResult.issues) {
            const existing = groups.get(issue.type) || [];
            existing.push(issue);
            groups.set(issue.type, existing);
        }
        const items = [];
        for (const [type, issues] of groups) {
            const category = this.createCategoryItem(type, issues);
            items.push(category);
        }
        // Sort by issue count (descending)
        items.sort((a, b) => {
            const countA = (a.children?.length || 0);
            const countB = (b.children?.length || 0);
            return countB - countA;
        });
        return items;
    }
    groupBySeverity() {
        if (!this.scanResult)
            return [];
        const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
        const groups = new Map();
        for (const issue of this.scanResult.issues) {
            const existing = groups.get(issue.severity) || [];
            existing.push(issue);
            groups.set(issue.severity, existing);
        }
        const items = [];
        for (const severity of severityOrder) {
            const issues = groups.get(severity);
            if (issues && issues.length > 0) {
                items.push(this.createSeverityCategoryItem(severity, issues));
            }
        }
        return items;
    }
    createSummaryItem() {
        if (!this.scanResult) {
            return this.createEmptyItem();
        }
        const { summary, scannedFiles, duration } = this.scanResult;
        const label = `${summary.total} issues in ${scannedFiles} files (${duration}ms)`;
        const item = {
            type: 'summary',
            label,
            iconPath: new vscode.ThemeIcon('shield'),
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            tooltip: new vscode.MarkdownString(`**Container/IaC Security Scan**\n\n` +
                `- Critical: ${summary.critical}\n` +
                `- High: ${summary.high}\n` +
                `- Medium: ${summary.medium}\n` +
                `- Low: ${summary.low}\n` +
                `- Info: ${summary.info}\n\n` +
                `*Scanned ${scannedFiles} files in ${duration}ms*`),
            description: `C:${summary.critical} H:${summary.high} M:${summary.medium} L:${summary.low}`
        };
        return item;
    }
    createCategoryItem(type, issues) {
        const critical = issues.filter(i => i.severity === 'critical').length;
        const high = issues.filter(i => i.severity === 'high').length;
        // Group issues by file
        const fileGroups = new Map();
        for (const issue of issues) {
            const existing = fileGroups.get(issue.filePath) || [];
            existing.push(issue);
            fileGroups.set(issue.filePath, existing);
        }
        const children = [];
        for (const [filePath, fileIssues] of fileGroups) {
            children.push(this.createFileItem(filePath, fileIssues));
        }
        const item = {
            type: 'category',
            scanType: type,
            label: SCAN_TYPE_LABELS[type] || type,
            iconPath: new vscode.ThemeIcon(SCAN_TYPE_ICONS[type]?.replace('$(', '').replace(')', '') || 'file'),
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            description: `${issues.length} issues`,
            tooltip: `${issues.length} issues found in ${SCAN_TYPE_LABELS[type]}`,
            children
        };
        // Highlight if critical or high issues
        if (critical > 0) {
            item.description = `${issues.length} issues (${critical} critical)`;
        }
        else if (high > 0) {
            item.description = `${issues.length} issues (${high} high)`;
        }
        return item;
    }
    createSeverityCategoryItem(severity, issues) {
        const children = issues.map(issue => this.createIssueItem(issue));
        const item = {
            type: 'category',
            label: severity.charAt(0).toUpperCase() + severity.slice(1),
            iconPath: new vscode.ThemeIcon(SEVERITY_ICONS[severity]?.replace('$(', '').replace(')', '') || 'circle-outline'),
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            description: `${issues.length} issues`,
            children
        };
        return item;
    }
    createFileItem(filePath, issues) {
        const children = issues.map(issue => this.createIssueItem(issue));
        const item = {
            type: 'file',
            filePath,
            label: filePath.split('/').pop() || filePath,
            iconPath: new vscode.ThemeIcon('file'),
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            description: `${issues.length} issues`,
            tooltip: filePath,
            resourceUri: vscode.Uri.file(filePath),
            children
        };
        return item;
    }
    createIssueItem(issue) {
        const item = {
            type: 'issue',
            issue,
            label: issue.title,
            iconPath: new vscode.ThemeIcon(SEVERITY_ICONS[issue.severity]?.replace('$(', '').replace(')', '') || 'circle-outline'),
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            description: `Line ${issue.line}`,
            tooltip: new vscode.MarkdownString(`**${issue.title}** (${issue.severity.toUpperCase()})\n\n` +
                `${issue.description}\n\n` +
                `**Location:** ${issue.filePath}:${issue.line}\n\n` +
                (issue.fix ? `**Fix:** ${issue.fix}\n\n` : '') +
                (issue.cwe ? `**CWE:** ${issue.cwe}` : '')),
            command: {
                command: 'jokalala.goToContainerIaCIssue',
                title: 'Go to Issue',
                arguments: [issue]
            }
        };
        return item;
    }
    createLoadingItem() {
        return {
            type: 'loading',
            label: 'Scanning container and IaC files...',
            iconPath: new vscode.ThemeIcon('sync~spin'),
            collapsibleState: vscode.TreeItemCollapsibleState.None
        };
    }
    createErrorItem(message) {
        return {
            type: 'error',
            label: 'Scan failed',
            description: message,
            iconPath: new vscode.ThemeIcon('error'),
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            tooltip: message
        };
    }
    createEmptyItem() {
        return {
            type: 'empty',
            label: 'No container/IaC scan results',
            description: 'Run "Scan Container/IaC" to analyze',
            iconPath: new vscode.ThemeIcon('shield'),
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            command: {
                command: 'jokalala.scanContainerIaC',
                title: 'Scan Container/IaC'
            }
        };
    }
}
exports.ContainerIaCTreeProvider = ContainerIaCTreeProvider;
// =============================================================================
// Registration Helper
// =============================================================================
function registerContainerIaCTreeView(context, treeProvider) {
    const treeView = vscode.window.createTreeView('jokalala-container-iac', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);
    return treeView;
}
//# sourceMappingURL=container-iac-tree-provider.js.map