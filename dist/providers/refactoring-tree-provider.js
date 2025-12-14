"use strict";
/**
 * Refactoring Tree Provider
 *
 * Displays refactoring suggestions in the VS Code sidebar.
 * Groups issues by type (Complexity, Vulnerability, Maintainability).
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
exports.RefactoringTreeProvider = void 0;
exports.registerRefactoringTreeView = registerRefactoringTreeView;
const vscode = __importStar(require("vscode"));
class RefactoringTreeProvider {
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
        Object.defineProperty(this, "result", {
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
    }
    /**
     * Update with new analysis result
     */
    updateResult(result) {
        this.result = result;
        this.errorMessage = null;
        this._onDidChangeTreeData.fire(undefined);
    }
    /**
     * Set loading state
     */
    setLoading(loading) {
        this.isLoading = loading;
        this._onDidChangeTreeData.fire(undefined);
    }
    /**
     * Set error message
     */
    setError(message) {
        this.errorMessage = message;
        this._onDidChangeTreeData.fire(undefined);
    }
    /**
     * Clear all data
     */
    clear() {
        this.result = null;
        this.errorMessage = null;
        this._onDidChangeTreeData.fire(undefined);
    }
    /**
     * Get the current result
     */
    getResult() {
        return this.result;
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return this.getRootItems();
        }
        if (element instanceof RefactoringGroupItem) {
            return element.children;
        }
        return [];
    }
    getRootItems() {
        const items = [];
        // Loading state
        if (this.isLoading) {
            items.push(new RefactoringInfoItem('$(sync~spin) Analyzing code...', 'loading'));
            return items;
        }
        // Error state
        if (this.errorMessage) {
            items.push(new RefactoringInfoItem(`$(error) ${this.errorMessage}`, 'error'));
            return items;
        }
        // No result yet
        if (!this.result) {
            items.push(new RefactoringInfoItem('$(lightbulb) Click "Analyze" to scan for issues', 'hint'));
            return items;
        }
        // Health score summary
        const score = this.result.analysis.overallHealthScore;
        const scoreIcon = score >= 80 ? '$(pass)' : score >= 50 ? '$(warning)' : '$(error)';
        items.push(new RefactoringInfoItem(`${scoreIcon} Health Score: ${score}/100`, 'health', `Code health score based on complexity and security issues`));
        // No issues found
        if (this.result.issues.length === 0) {
            items.push(new RefactoringInfoItem('$(check) No issues found!', 'success'));
            return items;
        }
        // Auto-fixable count
        const autoFixable = this.result.summary.autoFixableCount;
        if (autoFixable > 0) {
            items.push(new RefactoringInfoItem(`$(wrench) ${autoFixable} auto-fixable issue(s)`, 'autofix', 'Issues that can be automatically fixed'));
        }
        // Group by type
        const complexity = this.result.issues.filter(i => i.type === 'complexity');
        const vulnerability = this.result.issues.filter(i => i.type === 'vulnerability');
        const maintainability = this.result.issues.filter(i => i.type === 'maintainability');
        if (vulnerability.length > 0) {
            items.push(new RefactoringGroupItem(`Security (${vulnerability.length})`, vulnerability.map(i => new RefactoringIssueItem(i)), 'vulnerability'));
        }
        if (complexity.length > 0) {
            items.push(new RefactoringGroupItem(`Complexity (${complexity.length})`, complexity.map(i => new RefactoringIssueItem(i)), 'complexity'));
        }
        if (maintainability.length > 0) {
            items.push(new RefactoringGroupItem(`Maintainability (${maintainability.length})`, maintainability.map(i => new RefactoringIssueItem(i)), 'maintainability'));
        }
        return items;
    }
}
exports.RefactoringTreeProvider = RefactoringTreeProvider;
/**
 * Group item for categorizing issues by type
 */
class RefactoringGroupItem extends vscode.TreeItem {
    constructor(label, children, groupType) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        Object.defineProperty(this, "children", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: children
        });
        Object.defineProperty(this, "groupType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: groupType
        });
        const iconMap = {
            vulnerability: new vscode.ThemeIcon('shield', new vscode.ThemeColor('errorForeground')),
            complexity: new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('editorWarning.foreground')),
            maintainability: new vscode.ThemeIcon('tools', new vscode.ThemeColor('editorInfo.foreground')),
        };
        this.iconPath = iconMap[groupType];
        this.contextValue = `refactoringGroup-${groupType}`;
    }
}
/**
 * Tree item representing a refactoring issue
 */
class RefactoringIssueItem extends vscode.TreeItem {
    constructor(issue) {
        super(issue.title, vscode.TreeItemCollapsibleState.None);
        Object.defineProperty(this, "issue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: issue
        });
        this.description = `Line ${issue.location.startLine}`;
        this.tooltip = new vscode.MarkdownString(`**${issue.title}**\n\n` +
            `${issue.description}\n\n` +
            `- Severity: ${issue.severity}\n` +
            `- Confidence: ${Math.round(issue.confidenceScore * 100)}%\n` +
            `- Auto-fixable: ${issue.autoFixable ? 'Yes' : 'No'}\n` +
            `- Effort: ${issue.estimatedEffort}`);
        const severityIcon = {
            critical: new vscode.ThemeIcon('flame', new vscode.ThemeColor('errorForeground')),
            high: new vscode.ThemeIcon('alert', new vscode.ThemeColor('editorWarning.foreground')),
            medium: new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorInfo.foreground')),
            low: new vscode.ThemeIcon('info'),
            info: new vscode.ThemeIcon('lightbulb'),
        };
        this.iconPath = severityIcon[issue.severity];
        this.contextValue = issue.autoFixable ? 'refactoringIssue-fixable' : 'refactoringIssue';
        // Command to show details
        this.command = {
            command: 'jokalala.showRefactoringDetails',
            title: 'Show Details',
            arguments: [issue],
        };
    }
}
/**
 * Generic info item for status messages
 */
class RefactoringInfoItem extends vscode.TreeItem {
    constructor(label, infoType, tooltip) {
        super(label, vscode.TreeItemCollapsibleState.None);
        Object.defineProperty(this, "infoType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: infoType
        });
        if (tooltip) {
            this.tooltip = tooltip;
        }
        this.contextValue = `refactoringInfo-${infoType}`;
    }
}
/**
 * Register refactoring tree view
 */
function registerRefactoringTreeView(context, provider) {
    const treeView = vscode.window.createTreeView('jokalala-refactoring', {
        treeDataProvider: provider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);
    return treeView;
}
//# sourceMappingURL=refactoring-tree-provider.js.map