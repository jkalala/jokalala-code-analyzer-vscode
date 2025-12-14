"use strict";
/**
 * GitHub Tree View Provider
 *
 * Provides a tree view for GitHub integration showing:
 * - Authentication status
 * - Created issues
 * - Linked pull requests
 * - Repository information
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
exports.GitHubTreeProvider = exports.GitHubTreeItem = void 0;
exports.registerGitHubTreeView = registerGitHubTreeView;
const vscode = __importStar(require("vscode"));
class GitHubTreeItem extends vscode.TreeItem {
    constructor(label, collapsibleState, itemType, data) {
        super(label, collapsibleState);
        this.itemType = itemType;
        this.data = data;
        this.contextValue = `github-${itemType}`;
        this.setupItem();
    }
    setupItem() {
        switch (this.itemType) {
            case 'auth-status':
                this.iconPath = new vscode.ThemeIcon('account');
                this.description = this.data?.authenticated ? 'Connected' : 'Not connected';
                break;
            case 'auth-login':
                this.iconPath = new vscode.ThemeIcon('sign-in');
                this.command = {
                    command: 'jokalala.github.authenticate',
                    title: 'Sign in to GitHub'
                };
                break;
            case 'section-issues':
                this.iconPath = new vscode.ThemeIcon('issues');
                this.description = this.data?.count ? `${this.data.count}` : '';
                break;
            case 'section-prs':
                this.iconPath = new vscode.ThemeIcon('git-pull-request');
                this.description = this.data?.count ? `${this.data.count}` : '';
                break;
            case 'section-actions':
                this.iconPath = new vscode.ThemeIcon('rocket');
                break;
            case 'github-issue':
                this.setupIssueItem();
                break;
            case 'github-pr-link':
                this.setupPRLinkItem();
                break;
            case 'action-create-issues':
                this.iconPath = new vscode.ThemeIcon('issue-opened');
                this.command = {
                    command: 'jokalala.github.createIssuesFromFindings',
                    title: 'Create Issues from Findings'
                };
                break;
            case 'action-sync':
                this.iconPath = new vscode.ThemeIcon('sync');
                this.command = {
                    command: 'jokalala.github.syncStatus',
                    title: 'Sync Issue Status'
                };
                break;
            case 'empty':
                this.iconPath = new vscode.ThemeIcon('info');
                this.description = '';
                break;
        }
    }
    setupIssueItem() {
        const issue = this.data;
        if (issue.issue) {
            this.label = `#${issue.issueNumber} ${issue.issue.title}`;
            this.description = issue.issue.state;
            this.tooltip = new vscode.MarkdownString(`**Issue #${issue.issueNumber}**\n\n` +
                `State: ${issue.issue.state}\n\n` +
                `Repository: ${issue.repository}\n\n` +
                `Created: ${new Date(issue.createdAt).toLocaleDateString()}\n\n` +
                `[Open in GitHub](${issue.issueUrl})`);
            this.tooltip.isTrusted = true;
        }
        else {
            this.description = issue.status;
            this.tooltip = `Issue #${issue.issueNumber} in ${issue.repository}`;
        }
        // Icon based on status
        if (issue.status === 'closed' || issue.issue?.state === 'closed') {
            this.iconPath = new vscode.ThemeIcon('issue-closed', new vscode.ThemeColor('charts.purple'));
        }
        else {
            this.iconPath = new vscode.ThemeIcon('issue-opened', new vscode.ThemeColor('charts.green'));
        }
        // Command to open in browser
        this.command = {
            command: 'jokalala.github.openInGitHub',
            title: 'Open in GitHub',
            arguments: [issue.issueUrl]
        };
    }
    setupPRLinkItem() {
        const link = this.data;
        this.label = `PR #${link.prNumber}`;
        this.description = link.repository;
        this.iconPath = new vscode.ThemeIcon('git-pull-request');
        this.tooltip = new vscode.MarkdownString(`**Pull Request #${link.prNumber}**\n\n` +
            `Repository: ${link.repository}\n\n` +
            `Linked: ${new Date(link.linkedAt).toLocaleDateString()}\n\n` +
            `[Open in GitHub](${link.prUrl})`);
        this.tooltip.isTrusted = true;
        this.command = {
            command: 'jokalala.github.openInGitHub',
            title: 'Open in GitHub',
            arguments: [link.prUrl]
        };
    }
}
exports.GitHubTreeItem = GitHubTreeItem;
class GitHubTreeProvider {
    constructor(githubService, issueManager, prLinker) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.isAuthenticated = false;
        this.userName = '';
        this.githubService = githubService;
        this.issueManager = issueManager;
        this.prLinker = prLinker;
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    async updateAuthStatus() {
        this.isAuthenticated = await this.githubService.isAuthenticated();
        if (this.isAuthenticated) {
            const user = await this.githubService.getAuthenticatedUser();
            this.userName = user?.login || '';
        }
        this.refresh();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            return this.getRootItems();
        }
        switch (element.itemType) {
            case 'section-issues':
                return this.getIssueItems();
            case 'section-prs':
                return this.getPRLinkItems();
            case 'section-actions':
                return this.getActionItems();
            default:
                return [];
        }
    }
    async getRootItems() {
        const items = [];
        // Authentication status
        if (this.isAuthenticated) {
            items.push(new GitHubTreeItem(this.userName || 'Connected', vscode.TreeItemCollapsibleState.None, 'auth-status', { authenticated: true }));
        }
        else {
            items.push(new GitHubTreeItem('Sign in to GitHub', vscode.TreeItemCollapsibleState.None, 'auth-login'));
            return items;
        }
        // Issues section
        const mappings = await this.issueManager.getAllMappings();
        items.push(new GitHubTreeItem('Created Issues', vscode.TreeItemCollapsibleState.Expanded, 'section-issues', { count: mappings.length }));
        // PR Links section
        const links = await this.prLinker.getAllLinks();
        items.push(new GitHubTreeItem('PR Links', vscode.TreeItemCollapsibleState.Collapsed, 'section-prs', { count: links.length }));
        // Actions section
        items.push(new GitHubTreeItem('Quick Actions', vscode.TreeItemCollapsibleState.Collapsed, 'section-actions'));
        return items;
    }
    async getIssueItems() {
        const mappings = await this.issueManager.getAllMappings();
        if (mappings.length === 0) {
            return [new GitHubTreeItem('No issues created yet', vscode.TreeItemCollapsibleState.None, 'empty')];
        }
        // Sort by creation date (newest first)
        const sorted = [...mappings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return sorted.map(mapping => new GitHubTreeItem(`#${mapping.issueNumber}`, vscode.TreeItemCollapsibleState.None, 'github-issue', mapping));
    }
    async getPRLinkItems() {
        const links = await this.prLinker.getAllLinks();
        if (links.length === 0) {
            return [new GitHubTreeItem('No PR links yet', vscode.TreeItemCollapsibleState.None, 'empty')];
        }
        // Group by PR
        const grouped = new Map();
        links.forEach(link => {
            const key = `${link.repository}#${link.prNumber}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(link);
        });
        const items = [];
        grouped.forEach((prLinks, _key) => {
            const firstLink = prLinks[0];
            items.push(new GitHubTreeItem(`PR #${firstLink.prNumber} (${prLinks.length} findings)`, vscode.TreeItemCollapsibleState.None, 'github-pr-link', firstLink));
        });
        return items;
    }
    getActionItems() {
        return [
            new GitHubTreeItem('Create Issues from All Findings', vscode.TreeItemCollapsibleState.None, 'action-create-issues'),
            new GitHubTreeItem('Sync Issue Status', vscode.TreeItemCollapsibleState.None, 'action-sync')
        ];
    }
}
exports.GitHubTreeProvider = GitHubTreeProvider;
/**
 * Register the GitHub tree view
 */
function registerGitHubTreeView(context, githubService, issueManager, prLinker) {
    const treeProvider = new GitHubTreeProvider(githubService, issueManager, prLinker);
    const treeView = vscode.window.createTreeView('jokalala-github', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);
    // Update auth status on initial load
    treeProvider.updateAuthStatus();
    return treeProvider;
}
//# sourceMappingURL=github-tree-provider.js.map